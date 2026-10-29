#!/usr/bin/env python3
"""
用本机 GPU（MPS）跑扩散模型，生成圆明园所需的写实材质贴图。

模型来自 hf-mirror.com（huggingface.co 在本机网络不可达）。
生成后做"偏移混合"处理让贴图可无缝平铺，再落到 public/textures/。

用法：
  .venv-ai/bin/python scripts/gen-textures.py            # 生成全部
  .venv-ai/bin/python scripts/gen-textures.py brick tile  # 只生成指定几项
"""
import os
import sys
import json
import math
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "textures"
RAW = ROOT / "data" / "raw" / "ai-tex"
OUT.mkdir(parents=True, exist_ok=True)
RAW.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

# 优先用 scripts/fetch-model.py 下到本地的模型（hf-mirror 直连单线程太慢，
# 本地分片下载快 10 倍）；没有再用仓库 id。
LOCAL_MODEL = ROOT / "data" / "hf-local" / "sd15"
MODEL_ID = os.environ.get(
    "SD_MODEL",
    str(LOCAL_MODEL) if (LOCAL_MODEL / "model_index.json").exists()
    else "segmind/tiny-sd",
)

# ---------------------------------------------------------------- 材质规格
# prompt 用英文：SD 1.5 对英文 prompt 的响应远好于中文
MATERIALS = {
    "brick": {
        "prompt": (
            "seamless texture of an ancient Chinese imperial palace wall, "
            "grey-blue fired brick masonry, fine mortar joints, weathered surface, "
            "moss in the joints, flat even lighting, top-down orthographic, "
            "photorealistic architectural material, no shadows, high detail"
        ),
        "negative": "people, plants, window, door, perspective, vignette, blur, text, watermark",
        "steps": 32,
    },
    "tile": {
        "prompt": (
            "seamless texture of traditional Chinese grey clay barrel roof tiles, "
            "rows of half-round tiles on a dark roof, moss between tiles, "
            "weathered ceramic, flat even lighting, top-down orthographic, "
            "photorealistic architectural material, no shadows, high detail"
        ),
        "negative": "people, trees, sky, perspective, vignette, blur, text, watermark",
        "steps": 32,
    },
    "wood": {
        "prompt": (
            "seamless texture of dark red lacquered Chinese temple woodwork, "
            "carved wooden door frame, aged vermilion paint, fine wood grain, "
            "slight wear, flat even lighting, top-down orthographic, "
            "photorealistic architectural material, no shadows, high detail"
        ),
        "negative": "people, metal, glass, perspective, vignette, blur, text, watermark",
        "steps": 32,
    },
    "stone": {
        "prompt": (
            "seamless texture of white marble Chinese palace balustrade stone, "
            "fine crystalline grain, soft weathering, cool white, "
            "flat even lighting, top-down orthographic, "
            "photorealistic architectural material, no shadows, high detail"
        ),
        "negative": "people, plants, cracks, perspective, vignette, blur, text, watermark",
        "steps": 32,
    },
    "moss": {
        "prompt": (
            "seamless texture of weathered garden rock surface, "
            "grey limestone with green moss patches, lichen, rough pitted stone, "
            "flat even lighting, top-down orthographic, "
            "photorealistic material, no shadows, high detail"
        ),
        "negative": "people, sky, perspective, vignette, blur, text, watermark",
        "steps": 32,
    },
    "grass": {
        "prompt": (
            "seamless texture of an old imperial Chinese garden lawn, "
            "mixed green and dry yellow grass, clover, moss patches, bare soil, "
            "flat even lighting, top-down orthographic, "
            "photorealistic ground material, no shadows, high detail"
        ),
        "negative": "people, buildings, sky, perspective, vignette, blur, text, watermark",
        "steps": 32,
    },
}


def trim_white_border(arr, tol=0.90):
    """SD 生成的图常带一圈白边（像装裱好的照片）。不裁掉的话，
    平移混合时这道白边会在中心交叉成十字。先把边框裁干净。"""
    import numpy as np

    white = arr.min(axis=2) > tol

    def edge(mask, axis):
        n = 0
        while n < mask.shape[0] and mask[n].mean() > 0.4:
            n += 1
        return n

    top = edge(white, 0)
    bottom = edge(white[::-1], 0)
    left = edge(white.T, 1)
    right = edge(white.T[::-1], 1)
    h, w = arr.shape[:2]
    t, b = min(top, h // 4), min(bottom, h // 4)
    l, r = min(left, w // 4), min(right, w // 4)
    if t + b >= h - 8 or l + r >= w - 8:
        return arr
    return arr[t : h - b, l : w - r]


def has_internal_seam(arr, ratio=1.8):
    """检测原图内部是否有"十字分格缝"（SD 常把 texture 提示画成 2×2 分格）。"""
    import numpy as np

    h, w, _ = arr.shape
    base = np.abs(arr[:, :-1] - arr[:, 1:]).mean()
    if base < 1e-6:
        return False
    dcol = np.abs(arr[:, w // 2 - 1] - arr[:, w // 2]).mean()
    drow = np.abs(arr[h // 2 - 1] - arr[h // 2]).mean()
    return max(dcol, drow) > ratio * base


def crop_quadrant(arr):
    """裁掉一半，避开内部十字缝。"""
    h, w, _ = arr.shape
    return arr[: h // 2, : w // 2]


def make_seamless(img):
    """把生成图变成可无缝平铺的贴图。

    关键：混合掩膜必须**同时在 x 和 y 上周期**。
    早前用对角线性渐变，掩膜不周期，结果在象限交界处留下一道十字硬缝。
    这里改用正弦掩膜 m = 0.5 + 0.5·sin(2π(x/w + y/h))，
    它在两个方向都满足 m(0,y)=m(w,y)、m(x,0)=m(x,h)，
    再配合 roll 半幅，就能保证四边完全对接。
    """
    import numpy as np

    h, w = img.shape[:2]
    rolled = np.roll(img, (h // 2, w // 2), axis=(0, 1))

    # 掩膜方向：原图 A 在**边界**有缝、滚动图 B 在**中心**有缝。
    # 所以中心用 A、边界用 B：
    #   m = sin²(πx/w)·sin²(πy/h)  —— 中心 m=1（取 A），四边 m=0（取 B）
    # 这样 A 的接缝处权重为 0、B 的接缝处权重为 1，两者的缝都被消掉。
    # 掩膜要带**平台区**：中心一大片完全取 A，中央以外完全取 B，
    # 只在过渡带里混。否则 B 的"中心十字缝"会被混进画面中央成十字。
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fx = xx / w
    fy = yy / h
    tx = np.minimum(fx, 1 - fx) / 0.5   # 0=贴边, 1=正中
    ty = np.minimum(fy, 1 - fy) / 0.5
    sx = np.clip((tx - 0.10) / 0.35, 0, 1)
    sy = np.clip((ty - 0.10) / 0.35, 0, 1)
    sx = sx * sx * (3 - 2 * sx)
    sy = sy * sy * (3 - 2 * sy)
    t = (sx * sy)[..., None]

    out = rolled * (1 - t) + img * t
    # 轻微对比恢复（混合会压一点动态）
    out = np.clip((out - 0.5) * 1.06 + 0.5, 0, 1)
    return out


def main():
    import numpy as np
    import torch
    from PIL import Image  # noqa: F401  (可能没装，用纯 numpy 兜底)
    from diffusers import StableDiffusionPipeline

    print(f"· torch {torch.__version__}  MPS={torch.backends.mps.is_available()}")
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    if device == "cpu":
        print("! 无 MPS，退回 CPU，生成会很慢")

    print(f"· 加载模型 {MODEL_ID} …")
    pipe = StableDiffusionPipeline.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float32,
        safety_checker=None,
        requires_safety_checker=False,
        cache_dir=str(ROOT / "data" / "hf-cache"),
        local_files_only=Path(MODEL_ID).exists(),
    )
    pipe = pipe.to(device)
    pipe.set_progress_bar_config(disable=True)

    wanted = sys.argv[1:] or list(MATERIALS)
    manifest = {}

    for name in wanted:
        if name not in MATERIALS:
            print(f"! 未知材质 {name}")
            continue
        spec = MATERIALS[name]
        raw_path = RAW / f"{name}.png"
        out_path = OUT / f"{name}.png"

        if raw_path.exists() and not os.environ.get("FORCE_REGEN"):
            print(f"· {name}: 已有原始图，跳过生成")
        else:
            t0 = time.time()
            generator = torch.Generator(device=device).manual_seed(
                abs(hash(name)) % (2**31)
            )
            img = pipe(
                prompt=spec["prompt"],
                negative_prompt=spec["negative"],
                num_inference_steps=spec["steps"],
                guidance_scale=7.5,
                height=512,
                width=512,
                generator=generator,
            ).images[0]
            img.save(raw_path)
            print(f"· {name}: 生成 {time.time() - t0:.1f}s → {raw_path.name}")

        # 读入并做无缝化
        try:
            from PIL import Image
            im = Image.open(raw_path).convert("RGB")
            a0 = np.asarray(im, dtype=np.float32) / 255.0
            a0 = trim_white_border(a0)
            if has_internal_seam(a0):
                a0 = crop_quadrant(a0)
            if a0.shape[0] != 512 or a0.shape[1] != 512:
                im = Image.fromarray((a0 * 255).astype("uint8")).resize((512, 512), Image.LANCZOS)
            arr = np.asarray(im, dtype=np.float32) / 255.0
        except Exception:
            import zlib, struct

            def read_png(path):
                data = open(path, "rb").read()
                pos = 8
                w = h = None
                idat = b""
                while pos < len(data):
                    ln = struct.unpack(">I", data[pos : pos + 4])[0]
                    typ = data[pos + 4 : pos + 8]
                    chunk = data[pos + 8 : pos + 8 + ln]
                    if typ == b"IHDR":
                        w, h = struct.unpack(">II", chunk[:8])
                    elif typ == b"IDAT":
                        idat += chunk
                    pos += 12 + ln
                raw = zlib.decompress(idat)
                stride = w * 3
                out = bytearray(h * stride)
                prev = bytearray(stride)
                p = 0
                for y in range(h):
                    ft = raw[p]
                    p += 1
                    line = bytearray(raw[p : p + stride])
                    p += stride
                    for i in range(stride):
                        a = line[i - 3] if i >= 3 else 0
                        b = prev[i]
                        c = prev[i - 3] if i >= 3 else 0
                        x = line[i]
                        if ft == 1:
                            x = (x + a) & 255
                        elif ft == 2:
                            x = (x + b) & 255
                        elif ft == 3:
                            x = (x + (a + b) // 2) & 255
                        elif ft == 4:
                            pp = a + b - c
                            pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - c)
                            pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                            x = (x + pr) & 255
                        line[i] = x
                    out[y * stride : (y + 1) * stride] = line
                    prev = line
                return np.frombuffer(bytes(out), dtype=np.uint8).reshape(h, w, 3)

            arr = read_png(raw_path).astype(np.float32) / 255.0

        seam = make_seamless(arr)

        try:
            from PIL import Image

            Image.fromarray((seam * 255).astype("uint8")).save(out_path)
        except Exception:
            import zlib, struct

            def write_png(path, a):
                h, w, _ = a.shape
                raw = b"".join(b"\x00" + a[y].tobytes() for y in range(h))

                def chunk(t, d):
                    c = t + d
                    return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c))

                png = b"\x89PNG\r\n\x1a\n"
                png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                png += chunk(b"IDAT", zlib.compress(raw, 6))
                png += chunk(b"IEND", b"")
                open(path, "wb").write(png)

            write_png(out_path, (seam * 255).astype("uint8"))

        manifest[name] = {"file": f"{name}.png", "size": out_path.stat().st_size}
        print(f"  ✓ {name} → public/textures/{name}.png ({out_path.stat().st_size // 1024} KB)")

    # 合并 manifest（分批生成时不覆盖已有的）
    mf = OUT / "manifest.json"
    allm = {}
    if mf.exists():
        try:
            allm = json.loads(mf.read_text(encoding="utf-8"))
        except Exception:
            allm = {}
    allm.update(manifest)
    mf.write_text(json.dumps(allm, indent=2, ensure_ascii=False), encoding="utf-8")
    print("\n✓ 完成")


if __name__ == "__main__":
    main()
