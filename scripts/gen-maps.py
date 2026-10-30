#!/usr/bin/env python3
"""
由反照率生成 **法线贴图** 与 **粗糙度贴图**，并为每种材质生成**多个变体**。

为什么需要这两样：

1. **法线/粗糙度** —— 只有反照率的表面看着像"刷了一层漆"。
   把反照率的明暗当成高度场做 Sobel，得到的法线贴图会让砖缝、石纹、
   木纹真的凸起来；粗糙度由明暗反推（暗处更粗糙），污渍处就不反光。
   ⚠ 这是"从颜色推高度"的近似，不是真法线捕获，但比纯 albedo 强得多。

2. **多个变体** —— 一张 512px 贴图平铺到全园，一眼就看出"在复制粘贴"。
   同一种材质生成 3~4 个变体（不同种子），每座建筑按哈希挑一个，
   重复感立刻消失。因为几何是**按景合并**的，每个景用自己的材质实例，
   **draw call 完全不变**。

用法：
    .venv-ai/bin/python scripts/gen-maps.py            # 只做法线/粗糙度
    .venv-ai/bin/python scripts/gen-maps.py --variants # 连变体一起生成（要跑 SD，较慢）
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TEX = ROOT / "public" / "textures"

# 要做变体的材质。grass/moss 不做（远看无差别，生成太慢）
VARIANT_MATERIALS = ["brick", "stone", "tile", "wood"]
VARIANTS = 3
NORMAL_STRENGTH = 2.4


def to_luma(arr: np.ndarray) -> np.ndarray:
    return arr[..., 0] * 0.2126 + arr[..., 1] * 0.7152 + arr[..., 2] * 0.0722


def sobel_normal(luma: np.ndarray, strength: float = NORMAL_STRENGTH) -> np.ndarray:
    """由明暗推法线。差分用 np.pad(wrap) 环绕 ⇒ 贴图仍然无缝。"""
    h, w = luma.shape
    pad = np.pad(luma, 1, mode="wrap")
    kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
    ky = kx.T.copy()
    dx = np.zeros_like(luma)
    dy = np.zeros_like(luma)
    for i in range(3):
        for j in range(3):
            win = pad[i : i + h, j : j + w]
            dx += kx[i, j] * win
            dy += ky[i, j] * win
    nx = -dx * strength
    ny = -dy * strength
    nz = np.ones_like(luma)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx /= ln
    ny /= ln
    nz /= ln
    return np.stack([nx, ny, nz], axis=-1)


def make_roughness(luma: np.ndarray) -> np.ndarray:
    """暗处更粗糙（积灰、积污），亮处稍光。"""
    r = 0.94 - luma * 0.30
    r = np.clip(r, 0.35, 1.0)
    return np.repeat(r[:, :, None], 3, axis=2)


def save_normal(nrm: np.ndarray, path: Path):
    img = (nrm * 0.5 + 0.5) * 255.0
    Image.fromarray(img.astype(np.uint8)).save(path)


def save_roughness(r: np.ndarray, path: Path):
    Image.fromarray((r * 255).astype(np.uint8)).save(path)


def process(name: str, src: Path):
    arr = np.asarray(Image.open(src).convert("RGB"), dtype=np.float32) / 255.0
    luma = to_luma(arr)
    nrm = sobel_normal(luma)
    save_normal(nrm, TEX / f"{name}_n.png")
    save_roughness(make_roughness(luma), TEX / f"{name}_r.png")


def gen_variants():
    """用 SD 生成同材质的多个变体（不同种子）。"""
    import importlib.util

    spec_path = ROOT / "scripts" / "gen-textures.py"
    gspec = importlib.util.spec_from_file_location("gen_textures", spec_path)
    gen_textures = importlib.util.module_from_spec(gspec)
    gspec.loader.exec_module(gen_textures)

    import torch
    from diffusers import StableDiffusionPipeline

    model_dir = ROOT / "data" / "hf-local" / "sd15"
    pipe = StableDiffusionPipeline.from_pretrained(
        model_dir,
        torch_dtype=torch.float32,
        safety_checker=None,
        requires_safety_checker=False,
        cache_dir=str(ROOT / "data" / "hf-cache"),
    )
    pipe = pipe.to("mps")
    pipe.set_progress_bar_config(disable=True)

    for name in VARIANT_MATERIALS:
        spec = gen_textures.MATERIALS.get(name)
        if not spec:
            print(f"! 未知材质 {name}")
            continue
        for v in range(VARIANTS):
            out = TEX / f"{name}_v{v}.png"
            if out.exists():
                print(f"· {name}_v{v} 已存在，跳过")
                continue
            g = torch.Generator(device="mps").manual_seed(1000 + v * 97 + abs(hash(name)) % 5000)
            img = pipe(
                prompt=spec["prompt"],
                negative_prompt=spec["negative"],
                num_inference_steps=spec["steps"],
                guidance_scale=7.5,
                height=512,
                width=512,
                generator=g,
            ).images[0]
            img.save(out)
            print(f"· {name}_v{v} 生成完成")


def main():
    TEX.mkdir(parents=True, exist_ok=True)
    if "--variants" in sys.argv:
        gen_variants()

    manifest = {}
    for p in sorted(TEX.glob("*.png")):
        name = p.stem
        if name.endswith("_n") or name.endswith("_r"):
            continue
        if "_v" in name:
            # 变体：brick_v0 → 键 `brick#v0`
            base, _, vn = name.rpartition("_v")
            if not base or not vn.isdigit():
                continue
            key = f"{base}#v{vn}"
            manifest[key] = p.name
            if (TEX / f"{name}_n.png").exists():
                manifest[f"{key}#normal"] = f"{name}_n.png"
            if (TEX / f"{name}_r.png").exists():
                manifest[f"{key}#rough"] = f"{name}_r.png"
            continue
        manifest[name] = p.name
        if (TEX / f"{name}_n.png").exists():
            manifest[f"{name}#normal"] = f"{name}_n.png"
        if (TEX / f"{name}_r.png").exists():
            manifest[f"{name}#rough"] = f"{name}_r.png"

    (TEX / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"✓ manifest {len(manifest)} 项 → {TEX / 'manifest.json'}")

    # 基础材质（没有对应源图的就不生成法线）
    for p in sorted(TEX.glob("*.png")):
        name = p.stem
        if name.endswith("_n") or name.endswith("_r"):
            continue
        if not (TEX / f"{name}_n.png").exists():
            process(name, p)
            print(f"· {name} → 法线 + 粗糙度")


if __name__ == "__main__":
    main()
