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

MODEL_ID = os.environ.get("SD_MODEL", "stable-diffusion-v1-5/stable-diffusion-v1-5")

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


def make_seamless(img):
    """偏移混合法把生成图变成可无缝平铺的贴图。img: HxWx3 float [0,1]"""
    import numpy as np

    h, w = img.shape[:2]
    rolled = np.roll(img, (h // 2, w // 2), axis=(0, 1))

    # 对角渐变权重：左上为 0，右下为 1
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = (xx / (w - 1) + yy / (h - 1)) / 2.0
    # 用平滑的钟形曲线，让中缝处的混合权重快速过渡，避免整体发虚
    t = 0.5 - 0.5 * np.cos(np.clip(t, 0, 1) * math.pi)
    t = t[..., None]

    out = rolled * (1 - t) + img * t
    # 边缘做一次轻微对比恢复
    out = np.clip((out - 0.5) * 1.04 + 0.5, 0, 1)
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
            arr = np.asarray(Image.open(raw_path).convert("RGB"), dtype=np.float32) / 255.0
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

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("\n✓ 完成")


if __name__ == "__main__":
    main()
