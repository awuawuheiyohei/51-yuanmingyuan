#!/usr/bin/env python3
"""
用本机 GPU（MPS）生成"真正的石头网格"，供 src/scene/nature.js 使用。

为什么不用程序化多面体
----------------------
旧版假山是 `IcosahedronGeometry` + 噪声位移 —— 出来的东西本质是"削过的球"，
远看就是一堆球（AGENTS.md §4.1.1 记的「假山像叠饼」）。
真正的太湖石/叠石有：瘦（竖长）、皱（表面褶皱）、漏（滴水孔）、透（贯穿孔），
而且要有**断裂面**——石头是被劈开的，不是被磨圆的。

管线
----
    MPS 上算 SDF 体素场  →  CPU 上跑 marching cubes  →  QEM 抽面  →  GLB
    （噪声/距离场是重计算，放 GPU；等值面提取是 CPU 密集但天生串行，留 CPU）

SDF 的构造
----------
    形体：若干带旋转的盒体 / 椭球 / 胶囊，用多项式 smooth-min 融合
          —— 盒体带来断裂面和棱角，椭球带来浑圆的鼓包
    洞  ：胶囊做"贯穿隧道"（透），球做"凹坑"（漏），用 smooth-max 挖掉
    皱  ：fBm + ridged 噪声叠加（Perlin 梯度噪声，MPS 批量算）
    瘦  ：最终各向异性缩放（Y 拉长、水平压窄）

用法
----
    .venv-ai/bin/python scripts/gen-rock.py                 # 生成全部
    .venv-ai/bin/python scripts/gen-rock.py --preview        # 额外出预览 PNG
    .venv-ai/bin/python scripts/gen-rock.py --res 128 --faces 1400

固定随机种子，产出可复现。
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch
from skimage import measure

# 断口数的回退覆盖（None = 不干预）。build_field 发现 SDF 内部为空时
# 逐次减小断口数重试，见 build_field()。
_FRACTURE_OVERRIDE = [None]

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "public" / "rocks"

# 六种石型。名字即"这一块石头长什么样"的语义标签。
ARCHETYPES = ["spire", "strata", "cavern", "reclining", "shoot", "cluster"]

ARCHETYPE_CN = {
    "spire": "瘦峰",
    "strata": "层叠",
    "cavern": "洞穴",
    "reclining": "卧牛",
    "shoot": "笋状",
    "cluster": "群峰",
}


# ---------------------------------------------------------------- 噪声（MPS）

def _hash(ix, iy, iz, seed: int, salt: int):
    """整数格点 → 32bit 伪随机。torch 张量运算，整条链路留在 GPU 上。"""
    n = (ix * 1619 + iy * 31337 + iz * 6971 + seed * 1013 + salt * 7919)
    n = n & 0x7FFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0x7FFFFFFF
    n = n ^ (n >> 16)
    return n


def _grad(ix, iy, iz, seed: int):
    """Perlin 梯度：每个格点一个随机单位向量。"""
    g = torch.empty(ix.shape[0], 3, device=ix.device, dtype=torch.float32)
    for c in range(3):
        h = _hash(ix, iy, iz, seed, c).to(torch.float32)
        g[:, c] = h / 2147483647.0
    theta = g[:, 0] * 6.283185307179586
    z = g[:, 1] * 2.0 - 1.0
    r = torch.sqrt(torch.clamp(1.0 - z * z, min=0.0))
    return torch.stack([r * torch.cos(theta), r * torch.sin(theta), z], dim=1)


def _fade(t):
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


def perlin3(p: torch.Tensor, seed: int) -> torch.Tensor:
    """3D Perlin 梯度噪声，p 为 (N,3)。"""
    X = torch.floor(p[:, 0]).to(torch.int32)
    Y = torch.floor(p[:, 1]).to(torch.int32)
    Z = torch.floor(p[:, 2]).to(torch.int32)
    fx = p[:, 0] - X.to(torch.float32)
    fy = p[:, 1] - Y.to(torch.float32)
    fz = p[:, 2] - Z.to(torch.float32)
    u = _fade(fx)
    v = _fade(fy)
    w = _fade(fz)

    def corner(dx, dy, dz, ox, oy, oz):
        g = _grad(X + dx, Y + dy, Z + dz, seed)
        d = torch.stack([ox, oy, oz], dim=1)
        return (g * d).sum(dim=1)

    n000 = corner(0, 0, 0, fx, fy, fz)
    n100 = corner(1, 0, 0, fx - 1, fy, fz)
    n010 = corner(0, 1, 0, fx, fy - 1, fz)
    n110 = corner(1, 1, 0, fx - 1, fy - 1, fz)
    n001 = corner(0, 0, 1, fx, fy, fz - 1)
    n101 = corner(1, 0, 1, fx - 1, fy, fz - 1)
    n011 = corner(0, 1, 1, fx, fy - 1, fz - 1)
    n111 = corner(1, 1, 1, fx - 1, fy - 1, fz - 1)

    x00 = n000 + u * (n100 - n000)
    x10 = n010 + u * (n110 - n010)
    x01 = n001 + u * (n101 - n001)
    x11 = n011 + u * (n111 - n011)
    y0 = x00 + v * (x10 - x00)
    y1 = x01 + v * (x11 - x01)
    return y0 + w * (y1 - y0)


def fbm(p: torch.Tensor, seed: int, octaves: int = 5, lac: float = 2.03, gain: float = 0.5):
    """分形 Brownian 运动（多倍频 Perlin）。"""
    total = torch.zeros(p.shape[0], device=p.device, dtype=torch.float32)
    amp = 1.0
    norm = 0.0
    freq = 1.0
    for o in range(octaves):
        total = total + perlin3(p * freq, seed + o * 7919) * amp
        norm += amp
        amp *= gain
        freq *= lac
    return total / norm


def ridged(p: torch.Tensor, seed: int, octaves: int = 4, lac: float = 2.11, gain: float = 0.55):
    """脊状噪声：|n| 取反，产生锐利的褶皱棱线（石头的"皱"）。"""
    total = torch.zeros(p.shape[0], device=p.device, dtype=torch.float32)
    amp = 1.0
    norm = 0.0
    freq = 1.0
    for o in range(octaves):
        n = perlin3(p * freq, seed + o * 6151)
        total = total + (1.0 - torch.abs(n)) * amp
        norm += amp
        amp *= gain
        freq *= lac
    return total / norm


# ---------------------------------------------------------------- SDF 基元

def sd_ellipsoid(p, c, r):
    q = (p - c) / r
    k0 = q.norm(dim=1)
    k1 = (q / r).norm(dim=1)
    return k0 * (k0 - 1.0) / torch.clamp(k1, min=1e-6)


def sd_box(p, c, half, yaw: float, pitch: float = 0.0):
    """带旋转的盒体 —— 盒面就是石头的**断裂面**。"""
    q = p - c
    if pitch:
        cp, sp = math.cos(pitch), math.sin(pitch)
        q = torch.stack([q[:, 0], cp * q[:, 1] + sp * q[:, 2], -sp * q[:, 1] + cp * q[:, 2]], dim=1)
    cy, sy = math.cos(yaw), math.sin(yaw)
    q = torch.stack([cy * q[:, 0] + sy * q[:, 2], q[:, 1], -sy * q[:, 0] + cy * q[:, 2]], dim=1)
    d = torch.abs(q) - half
    outside = torch.clamp(d, min=0.0).norm(dim=1)
    inside = torch.clamp(d.max(dim=1).values, max=0.0)
    return outside + inside


def sd_capsule(p, a, b, r):
    pa = p - a
    ba = b - a
    h = torch.clamp((pa * ba).sum(dim=1) / (ba * ba).sum(), 0.0, 1.0)
    return (pa - ba * h[:, None]).norm(dim=1) - r


def smin(a, b, k):
    """多项式 smooth-min：融合处不出现硬接缝。"""
    h = torch.clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


# ---------------------------------------------------------------- 六种石型

def _spire(p, rng):
    """瘦峰：沿一条歪斜的竖脊叠 4~5 段，底粗顶细。

    太湖石的"瘦"是**有骨有肉**：上下比例约 1:3.5~4.5，
    顶端仍留一点肉（不能收成一根针），侧影要有起伏。
    之前半径收到 0.07、高度 1.5，出来是根针——那不是石头，是根棍子。
    """
    n = 4 + int(rng.integers(0, 2))
    lean_x = float(rng.uniform(-0.18, 0.18))
    lean_z = float(rng.uniform(-0.18, 0.18))
    d = None
    for i in range(n):
        t = i / (n - 1)
        y = -0.72 + 1.5 * t
        cx = lean_x * t + float(rng.uniform(-0.05, 0.05))
        cz = lean_z * t + float(rng.uniform(-0.05, 0.05))
        # 半径：底 0.52 → 顶 0.18（不收到 0），中途有起伏
        r = (0.52 * (1.0 - t) ** 0.62 + 0.18) * float(rng.uniform(0.9, 1.1))
        e = sd_ellipsoid(
            p,
            torch.tensor([cx, y, cz], device=p.device),
            torch.tensor([r * float(rng.uniform(0.85, 1.15)),
                          r * float(rng.uniform(1.1, 1.9)),
                          r * float(rng.uniform(0.85, 1.15))], device=p.device),
        )
        d = e if d is None else smin(d, e, 0.10)
    # 侧挂一两块"肉瘤"，打破光滑的旋转体轮廓
    for _ in range(int(rng.integers(2, 4))):
        t = float(rng.uniform(0.15, 0.8))
        b = sd_ellipsoid(
            p,
            torch.tensor([lean_x * t + float(rng.uniform(-0.3, 0.3)),
                          -0.72 + 1.5 * t,
                          lean_z * t + float(rng.uniform(-0.3, 0.3))], device=p.device),
            torch.tensor([float(rng.uniform(0.10, 0.19)),
                          float(rng.uniform(0.14, 0.26)),
                          float(rng.uniform(0.10, 0.19))], device=p.device),
        )
        d = smin(d, b, 0.06)
    return d


def _strata(p, rng):
    """层叠：几层扁石错位叠起，像人工码放的条石。"""
    n = 3 + int(rng.integers(0, 3))
    d = None
    for i in range(n):
        t = i / max(1, n - 1)
        y = -0.55 + 1.05 * t
        cx = float(rng.uniform(-0.14, 0.14))
        cz = float(rng.uniform(-0.14, 0.14))
        rx = 0.62 * (1.0 - 0.22 * t) * float(rng.uniform(0.85, 1.12))
        rz = 0.50 * (1.0 - 0.22 * t) * float(rng.uniform(0.85, 1.12))
        ry = 0.19 * float(rng.uniform(0.8, 1.25))
        e = sd_ellipsoid(
            p,
            torch.tensor([cx, y, cz], device=p.device),
            torch.tensor([rx, ry, rz], device=p.device),
        )
        d = e if d is None else smin(d, e, 0.05)
    # 加两块断裂面盒子，让层与层之间有棱
    for _ in range(int(rng.integers(1, 3))):
        b = sd_box(
            p,
            torch.tensor([float(rng.uniform(-0.2, 0.2)), float(rng.uniform(-0.5, 0.5)),
                          float(rng.uniform(-0.2, 0.2))], device=p.device),
            torch.tensor([float(rng.uniform(0.25, 0.5)), float(rng.uniform(0.12, 0.28)),
                          float(rng.uniform(0.25, 0.48))], device=p.device),
            yaw=float(rng.uniform(0, math.pi)),
            pitch=float(rng.uniform(-0.5, 0.5)),
        )
        d = smin(d, b, 0.045)
    return d


def _cavern(p, rng):
    """洞穴：厚墩子上开一个贯穿的拱洞。"""
    dev = p.device
    d = sd_ellipsoid(p, torch.tensor([0.0, 0.0, 0.0], device=dev),
                     torch.tensor([0.60, 0.56, 0.54], device=dev))
    d = smin(d, sd_ellipsoid(
        p,
        torch.tensor([float(rng.uniform(-0.25, 0.25)), float(rng.uniform(0.25, 0.5)),
                      float(rng.uniform(-0.25, 0.25))], device=dev),
        torch.tensor([0.30, 0.26, 0.28], device=dev)), 0.11)
    # 贯穿隧道：横向胶囊，从一侧捅到另一侧 → "透"
    ang = float(rng.uniform(0, math.pi))
    dx, dz = math.cos(ang), math.sin(ang)
    yy = float(rng.uniform(-0.12, 0.18))
    a = torch.tensor([-dx * 1.5, yy, -dz * 1.5], device=dev)
    b = torch.tensor([dx * 1.5, yy, dz * 1.5], device=dev)
    d = smax(d, -sd_capsule(p, a, b, float(rng.uniform(0.15, 0.23))), 0.045)
    return d


def _reclining(p, rng):
    """卧牛：低矮宽厚的大石墩，背上带几块鼓包。"""
    dev = p.device
    d = sd_ellipsoid(p, torch.tensor([0.0, -0.10, 0.0], device=dev),
                     torch.tensor([0.72, 0.34, 0.55], device=dev))
    for _ in range(int(rng.integers(1, 3))):
        d = smin(d, sd_ellipsoid(
            p,
            torch.tensor([float(rng.uniform(-0.35, 0.35)), float(rng.uniform(0.05, 0.3)),
                          float(rng.uniform(-0.3, 0.3))], device=dev),
            torch.tensor([float(rng.uniform(0.18, 0.34)), float(rng.uniform(0.14, 0.26)),
                          float(rng.uniform(0.16, 0.32))], device=dev)), 0.10)
    return d


def _shoot(p, rng):
    """笋状：下粗上尖，竖直方向带明显的纵向棱线。"""
    dev = p.device
    d = None
    n = 3 + int(rng.integers(0, 2))
    lean_x = float(rng.uniform(-0.1, 0.1))
    for i in range(n):
        t = i / (n - 1)
        y = -0.6 + 1.35 * t
        r = 0.42 * (1.0 - t) ** 0.6 + 0.045
        e = sd_ellipsoid(
            p,
            torch.tensor([lean_x * t, y, float(rng.uniform(-0.04, 0.04))], device=dev),
            torch.tensor([r, r * 1.25, r], device=dev),
        )
        d = e if d is None else smin(d, e, 0.05)
    return d


def _cluster(p, rng):
    """群峰：三根不等高的瘦柱在根部融成一堆。"""
    dev = p.device
    d = None
    for i in range(3):
        ang = float(rng.uniform(0, 2 * math.pi))
        dist = float(rng.uniform(0.0, 0.28))
        h = float(rng.uniform(0.5, 1.0))
        r = float(rng.uniform(0.16, 0.28))
        cx = math.cos(ang) * dist
        cz = math.sin(ang) * dist
        e = sd_capsule(
            p,
            torch.tensor([cx, -0.65, cz], device=dev),
            torch.tensor([cx + float(rng.uniform(-0.12, 0.12)), -0.65 + h * 1.25, cz], device=dev),
            r,
        )
        d = e if d is None else smin(d, e, 0.10)
    # 底座把它们焊在一起
    d = smin(d, sd_ellipsoid(p, torch.tensor([0.0, -0.6, 0.0], device=dev),
                             torch.tensor([0.5, 0.22, 0.45], device=dev)), 0.12)
    return d


SHAPE_FN = {
    "spire": _spire,
    "strata": _strata,
    "cavern": _cavern,
    "reclining": _reclining,
    "shoot": _shoot,
    "cluster": _cluster,
}


def _anisotropy(kind, rng) -> np.ndarray:
    """最终各向异性缩放（shape 空间 → 世界比例）。"""
    base = {
        # 瘦峰：太湖石的"瘦"是**有骨有肉**，宽高比约 1:2.6~3.2。
        # 之前 0.52:1.42 = 1:2.7 但形体本身太窄，实际出来像根针。
        # 这里加宽到 0.72:1.42 = 1:2.0，再靠形体内部的收分做出瘦感。
        "spire": [0.72, 1.42, 0.70],
        "strata": [1.05, 0.72, 0.92],
        "cavern": [0.88, 0.95, 0.82],
        "reclining": [1.20, 0.62, 0.95],
        "shoot": [0.70, 1.50, 0.68],
        "cluster": [0.78, 1.18, 0.74],
    }[kind]
    return np.array(base, dtype=np.float32) * rng.uniform(0.9, 1.12, size=3).astype(np.float32)


def make_sdf(kind: str, rng, seed: int, device):
    """构造一个 (q) -> d 的闭包：形体 + 洞 + 皱 + 纵向棱线。

    q 是"形体空间"坐标，最终世界比例靠各向异性缩放 S 施加（p = q * S）。
    """
    dev = device
    shape = SHAPE_FN[kind]

    # 洞：胶囊做贯穿隧道（透），球做凹坑（漏）
    n_holes = int(rng.integers(1, 4))
    holes = []
    for _ in range(n_holes):
        if rng.random() < 0.6:
            ang = float(rng.uniform(0, 2 * math.pi))
            dx, dz = math.cos(ang), math.sin(ang)
            yy = float(rng.uniform(-0.45, 0.6))
            rr = float(rng.uniform(0.10, 0.19))
            holes.append(("tube", torch.tensor([-dx * 1.6, yy, -dz * 1.6], device=dev),
                          torch.tensor([dx * 1.6, yy, dz * 1.6], device=dev), rr))
        else:
            c = torch.tensor([float(rng.uniform(-0.45, 0.45)), float(rng.uniform(-0.5, 0.7)),
                              float(rng.uniform(-0.45, 0.45))], device=dev)
            holes.append(("pocket", c, None, 0.18))

    f1 = float(rng.uniform(5.0, 8.0))
    f2 = float(rng.uniform(13.0, 19.0))
    ridge_n = float(rng.integers(5, 10))
    ridge_amp = float(rng.uniform(0.012, 0.026))
    ridge_k = float(rng.uniform(2.0, 5.0))
    ridge_ph = float(rng.uniform(0, 6.28))
    use_ridge = kind in ("spire", "shoot", "cluster")
    # 断口数：真实石头总有被劈开的平面。
    # 但断口是**硬切**，切多了会把石头整个切空（SDF 内部为空）。
    # `_FRACTURE_OVERRIDE` 由 build_field 的回退逻辑设置（逐次减少断口）。
    n_fracture = int(rng.integers(1, 4))
    if _FRACTURE_OVERRIDE[0] is not None:
        n_fracture = min(n_fracture, _FRACTURE_OVERRIDE[0])
    margin = 0.055 + 0.030 + ridge_amp + 0.13  # 噪声+断口能把表面往外推的量

    def f(q):
        d = shape(q, rng)
        for h in holes:
            if h[0] == "tube":
                d = smax(d, -sd_capsule(q, h[1], h[2], h[3]), 0.035)
            else:
                d = smax(d, -sd_ellipsoid(q, h[1],
                                          torch.tensor([h[3], h[3], h[3]], device=dev)), 0.035)

        # 断口：真实石头是被**劈开/崩口**的，断面是平的（多边形面）。
        # 只靠噪声做出来的表面永远是"鹅卵石"——光滑、没有骨。
        # 这里用若干个半空间把形体切出平面，保留硬边。
        # 偏移量取在**形体内部**（靠近重心），只削掉边缘，
        # 免得硬切把石头整个切空。
        for _ in range(n_fracture):
            nrm = torch.randn(3, device=dev)
            nrm = nrm / (nrm.norm() + 1e-8)
            # 沿法向的形体半径（保守估计），偏移取其 0.55~0.9 倍
            reach = float(rng.uniform(0.30, 0.62))
            off = reach * float(rng.uniform(0.55, 0.92))
            # 半空间与原形体求交：d = max(d, dot(q,n) - off)
            d = torch.maximum(d, (q * nrm).sum(dim=1) - off)

        # 皱：fBm + 脊状噪声
        # 幅度要**相对石块尺寸**够大才看得出起伏：
        # 之前 0.055/0.030 相对半径 0.6 只有 5%，出来是光滑的蛋。
        d = d + fbm(q * f1, seed + 101, octaves=5) * 0.115
        d = d + (ridged(q * f2, seed + 202, octaves=3) - 0.5) * 0.075
        # 纵向棱线（太湖石的"瘦"+"皱"）
        if use_ridge:
            theta = torch.atan2(q[:, 2], q[:, 0])
            d = d + torch.sin(theta * ridge_n + q[:, 1] * ridge_k + ridge_ph) * ridge_amp
        return d

    meta = {
        "scale": None,
        "holes": n_holes,
        "n_fracture": n_fracture,
        "noise_f1": round(f1, 3),
        "noise_f2": round(f2, 3),
        "margin": round(margin, 4),
    }
    return f, meta


def build_field(kind: str, seed: int, res: int, device):
    """在 MPS 上算出一个体素 SDF 场，返回 (volume, meta)。

    体素盒是**贴着形体**放的（先粗采样求包围盒，再按各向异性缩放换算到
    世界比例），否则形体会被盒壁切掉——切出来的石头是"半个"，看着像浮雕。

    断口是硬切，切狠了会把石头整个切空（SDF 内部为空）。
    所以这里做**回退**：内部为空就少切一个断口重试，
    最多退到 0 个断口（纯噪声形态也接受，总比崩掉好）。
    """
    last_err = None
    for attempt in range(4):
        rng = np.random.default_rng(seed + attempt * 977)
        S = _anisotropy(kind, rng)
        St = torch.tensor(S, device=device)
        f, meta = make_sdf(kind, rng, seed, device)
        if attempt > 0:
            meta["fracture_retry"] = attempt

        # --- 粗采样求形体在 q 空间的包围盒 ---
        cn = 40
        cq = torch.linspace(-1.9, 1.9, cn, device=device)
        gx, gy, gz = torch.meshgrid(cq, cq, cq, indexing="ij")
        cpts = torch.stack([gx, gy, gz], dim=-1).reshape(-1, 3)
        cd = f(cpts).reshape(cn, cn, cn)
        inside = (cd < 0).cpu().numpy()
        if not inside.any():
            last_err = RuntimeError(f"{kind}/{seed}: SDF 内部为空")
            # 断口切太多 → 减少断口数重建
            meta["n_fracture"] = max(0, meta.get("n_fracture", 1) - 1)
            if meta["n_fracture"] <= 0:
                # 已经没断口了还空 → 换种子重来
                continue
            _FRACTURE_OVERRIDE[0] = meta["n_fracture"]
            continue
        _FRACTURE_OVERRIDE[0] = None
        idx = np.argwhere(inside)
        qmin = cq.min().item() + idx.min(axis=0) * (cq.max().item() - cq.min().item()) / (cn - 1)
        qmax = cq.max().item() - (cq.max().item() - cq.min().item()) * (cn - 1 - idx.max(axis=0)) / (cn - 1)
        m = meta["margin"] + 0.02
        qmin = qmin - m
        qmax = qmax + m

        # --- 细网格：贴着形体，覆盖 q ∈ [qmin, qmax] ---
        n = res
        axes = []
        for ax in range(3):
            lo = float(qmin[ax]) * float(S[ax])
            hi = float(qmax[ax]) * float(S[ax])
            axes.append(torch.linspace(lo, hi, n, device=device))
        gx, gy, gz = torch.meshgrid(axes[0], axes[1], axes[2], indexing="ij")
        p = torch.stack([gx, gy, gz], dim=-1).reshape(-1, 3)
        q = p / St
        d = f(q)

        vol = d.reshape(n, n, n).cpu().numpy().astype(np.float32)
        meta["scale"] = [round(float(x), 4) for x in S]
        meta["grid"] = [[round(float(a), 4) for a in ax] for ax in axes]
        return vol, meta
    raise last_err or RuntimeError(f"{kind}/{seed}: SDF 内部为空")


# ---------------------------------------------------------------- 网格化

def marching_cubes_mesh(vol: np.ndarray, axes):
    """CPU 上跑 marching cubes（等值面提取天生串行，留 CPU 更划算）。

    axes 是每个轴的物理坐标数组（长度 res），网格不一定等距，
    所以 spacing 要逐轴给，坐标还要加回轴的起点。
    """
    spacing = tuple(float((ax[-1] - ax[0]) / (len(ax) - 1)) for ax in axes)
    verts, faces, _, _ = measure.marching_cubes(vol, level=0.0, spacing=spacing,
                                                 allow_degenerate=False)
    origin = np.array([float(ax[0]) for ax in axes], dtype=np.float32)
    return (verts + origin).astype(np.float32), faces.astype(np.uint32)


def decimate(verts: np.ndarray, faces: np.ndarray, target: int):
    """QEM 抽面（fast-simplification）。失败则原样返回。"""
    if len(faces) <= target:
        return verts, faces, False
    try:
        import fast_simplification

        v, f = fast_simplification.simplify(verts, faces, target_count=int(target))
        if len(f) > 0 and len(v) > 0:
            return np.asarray(v, np.float32), np.asarray(f, np.uint32), True
    except Exception as exc:  # pragma: no cover - 环境缺包时如实报告
        print(f"  ! 抽面失败（{exc}），保留原网格", file=sys.stderr)
    return verts, faces, False


def vertex_normals(verts: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """面积加权顶点法线。"""
    a = verts[faces[:, 0]]
    b = verts[faces[:, 1]]
    c = verts[faces[:, 2]]
    fn = np.cross(b - a, c - a)
    n = np.zeros_like(verts)
    for i in range(3):
        np.add.at(n, faces[:, i], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    return (n / np.maximum(ln, 1e-9)).astype(np.float32)


def planar_uv(verts: np.ndarray, normals: np.ndarray, scale: float) -> np.ndarray:
    """主轴平面投影 UV —— 避免球面 UV 在石头上绕成"年轮"。"""
    ax = np.abs(normals)
    u = np.where(ax[:, 1] >= np.maximum(ax[:, 0], ax[:, 2]), verts[:, 0], 0.0)
    v = np.where(ax[:, 1] >= np.maximum(ax[:, 0], ax[:, 2]), verts[:, 2], 0.0)
    m = ax[:, 1] >= np.maximum(ax[:, 0], ax[:, 2])
    m2 = ~m & (ax[:, 0] >= ax[:, 2])
    u = np.where(m, verts[:, 0], np.where(m2, verts[:, 2], verts[:, 0]))
    v = np.where(m, verts[:, 2], np.where(m2, verts[:, 1], verts[:, 1]))
    return np.stack([u * scale, v * scale], axis=1).astype(np.float32)


def topology(faces: np.ndarray) -> dict:
    """网格拓扑：连通块数 / 边界环 / 亏格。

    marching cubes 出来的面片只有在形体完全落在体素盒内部时才是闭合流形；
    此时 χ = 2 - 2g，可以反推"洞"（g = 亏格 = 穿孔个数）。
    """
    f = faces.astype(np.int64)
    edges = np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]], axis=0)
    sorted_e = np.sort(edges, axis=1)
    _, inv, counts = np.unique(sorted_e, axis=0, return_inverse=True, return_counts=True)
    boundary = int((counts == 1).sum())
    v = len(np.unique(f))
    e = len(inv)
    chi = int(v - e + len(f))
    # 连通块（按顶点连通性，粗略用 union-find）
    parent = {int(x): int(x) for x in np.unique(f)}

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for a, b in edges:
        ra, rb = find(int(a)), find(int(b))
        if ra != rb:
            parent[ra] = rb
    comps = len({find(k) for k in parent})
    closed = boundary == 0
    genus = (2 - chi) // 2 if closed else None
    return {
        "components": comps,
        "boundaryEdges": boundary,
        "closed": closed,
        "euler": chi,
        "genus": genus,
    }


# ---------------------------------------------------------------- 导出

def export_glb(path: Path, verts: np.ndarray, faces: np.ndarray, normals: np.ndarray,
               uv: np.ndarray) -> int:
    import trimesh

    mesh = trimesh.Trimesh(vertices=verts, faces=faces, vertex_normals=normals, process=False)
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv)
    mesh.export(path, file_type="glb")
    return path.stat().st_size


def normalize(verts: np.ndarray) -> tuple[np.ndarray, dict]:
    """归一化：高度 = 1，底面贴 y=0，XZ 居中。场景里按目标高度缩放即可。"""
    lo = verts.min(axis=0)
    hi = verts.max(axis=0)
    size = hi - lo
    h = max(size[1], 1e-6)
    v = (verts - lo) / h
    v[:, 0] -= (v[:, 0].max() + v[:, 0].min()) / 2
    v[:, 2] -= (v[:, 2].max() + v[:, 2].min()) / 2
    meta = {
        "width": round(float(size[0] / h), 4),
        "height": round(float(size[1] / h), 4),
        "depth": round(float(size[2] / h), 4),
    }
    return v.astype(np.float32), meta


# ---------------------------------------------------------------- 预览

def preview_png(verts: np.ndarray, faces: np.ndarray, path: Path, size=320):
    """极简软件光栅（numpy z-buffer + 头灯），用来快速看轮廓对不对。"""
    from PIL import Image

    v = verts.astype(np.float64).copy()
    v[:, 0] -= (v[:, 0].max() + v[:, 0].min()) / 2
    v[:, 2] -= (v[:, 2].max() + v[:, 2].min()) / 2
    v[:, 1] -= v[:, 1].min()
    span = max(float(v[:, 1].max()), 1e-6)
    v = v / span  # 归一到单位高

    # 相机：绕 Y 转 35°，正交投影
    ang = math.radians(35)
    ca, sa = math.cos(ang), math.sin(ang)
    sx = ca * v[:, 0] + sa * v[:, 2]
    sz = -sa * v[:, 0] + ca * v[:, 2]
    sy = v[:, 1] - 0.5  # 竖直居中

    depth = -sz  # 越近越大
    px = ((sx + 1.15) / 2.3 * (size - 1)).astype(np.int64)
    py = ((0.95 - sy) / 1.25 * (size - 1)).astype(np.int64)

    tri = faces.astype(np.int64)
    zbuf = np.full((size, size), -1e18, dtype=np.float64)
    shade = np.zeros((size, size), dtype=np.float64)

    a = verts[faces[:, 0]].astype(np.float64)
    b = verts[faces[:, 1]].astype(np.float64)
    c = verts[faces[:, 2]].astype(np.float64)
    fn = np.cross(b - a, c - a)
    fn = fn / np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-9)
    light = fn @ np.array([-0.42, 0.70, 0.58])
    light = np.clip(light, 0, 1) * 0.8 + 0.2

    X0, Y0, Z0 = px[tri[:, 0]], py[tri[:, 0]], depth[tri[:, 0]]
    X1, Y1, Z1 = px[tri[:, 1]], py[tri[:, 1]], depth[tri[:, 1]]
    X2, Y2, Z2 = px[tri[:, 2]], py[tri[:, 2]], depth[tri[:, 2]]

    for t in range(len(tri)):
        x0 = max(0, int(min(X0[t], X1[t], X2[t])))
        x1 = min(size - 1, int(max(X0[t], X1[t], X2[t])))
        y0 = max(0, int(min(Y0[t], Y1[t], Y2[t])))
        y1 = min(size - 1, int(max(Y0[t], Y1[t], Y2[t])))
        if x1 < x0 or y1 < y0:
            continue
        det = (Y1[t] - Y2[t]) * (X0[t] - X2[t]) + (X2[t] - X1[t]) * (Y0[t] - Y2[t])
        if abs(det) < 1e-9:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((Y1[t] - Y2[t]) * (gx - X2[t]) + (X2[t] - X1[t]) * (gy - Y2[t])) / det
        w1 = ((Y2[t] - Y0[t]) * (gx - X2[t]) + (X0[t] - X2[t]) * (gy - Y2[t])) / det
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not inside.any():
            continue
        zz = w0 * Z0[t] + w1 * Z1[t] + w2 * Z2[t]
        sub = zbuf[y0:y1 + 1, x0:x1 + 1]
        upd = inside & (zz > sub)
        sub[upd] = zz[upd]
        shade[y0:y1 + 1, x0:x1 + 1][upd] = light[t]

    img = (shade * 240).astype(np.uint8)
    rgb = np.stack([img, (img * 0.97).astype(np.uint8), (img * 0.87).astype(np.uint8)], axis=-1)
    Image.fromarray(rgb).save(path)


# ---------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser(description="用 MPS 生成石头网格（GLB）")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="输出目录")
    ap.add_argument("--res", type=int, default=104, help="SDF 体素分辨率")
    ap.add_argument("--faces", type=int, default=1000, help="每块石头的目标三角面数")
    ap.add_argument("--variants", type=int, default=4, help="每种石型的变体数")
    ap.add_argument("--seed", type=int, default=20261030, help="全局随机种子")
    ap.add_argument("--preview", action="store_true", help="额外输出预览 PNG")
    ap.add_argument("--cpu", action="store_true", help="强制用 CPU（MPS 不可用时的诊断用）")
    args = ap.parse_args()

    if torch.backends.mps.is_available() and not args.cpu:
        device = torch.device("mps")
        backend = "MPS (Apple GPU)"
    else:
        device = torch.device("cpu")
        backend = "CPU"
    print(f"· 设备：{backend}   分辨率：{args.res}³   目标面数：{args.faces}")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    manifest = {
        "generator": "scripts/gen-rock.py",
        "seed": args.seed,
        "resolution": args.res,
        "targetFaces": args.faces,
        "device": backend,
        "archetypes": ARCHETYPE_CN,
        "stones": [],
    }

    t_all = time.time()
    for kind in ARCHETYPES:
        for vi in range(args.variants):
            # 固定哈希（不能用内置 hash()，它带进程盐，会破坏可复现性）
            h = 0
            for ch in f"{kind}:{vi}":
                h = (h * 131 + ord(ch)) & 0xFFFFFFFF
            seed = args.seed + h % 100000
            t0 = time.time()
            vol, fmeta = build_field(kind, seed, args.res, device)
            t_field = time.time() - t0

            t0 = time.time()
            verts, faces = marching_cubes_mesh(vol, fmeta["grid"])
            t_mc = time.time() - t0

            raw_tris = len(faces)
            t0 = time.time()
            verts, faces, dec = decimate(verts, faces, args.faces)
            t_dec = time.time() - t0

            verts, nmeta = normalize(verts)
            normals = vertex_normals(verts, faces)
            uv = planar_uv(verts, normals, 1.0)
            topo = topology(faces)

            fname = f"{kind}-{vi}.glb"
            size = export_glb(out / fname, verts, faces, normals, uv)

            manifest["stones"].append({
                "file": fname,
                "kind": kind,
                "kindCN": ARCHETYPE_CN[kind],
                "seed": int(seed),
                "variant": vi,
                "triangles": int(len(faces)),
                "rawTriangles": int(raw_tris),
                "decimated": bool(dec),
                "bbox": nmeta,
                "holes": fmeta["holes"],
                "topology": topo,
                "bytes": int(size),
                "genSeconds": {"field": round(t_field, 3), "marchingCubes": round(t_mc, 3),
                               "decimate": round(t_dec, 3)},
            })
            print(f"  ✓ {fname:16s} {ARCHETYPE_CN[kind]}  面 {len(faces):5d} "
                  f"(原始 {raw_tris:6d})  洞 {fmeta['holes']}  "
                  f"亏格 {topo['genus']}  组件 {topo['components']}  "
                  f"{size/1024:6.1f} KB  field {t_field:.2f}s mc {t_mc:.2f}s dec {t_dec:.2f}s")

            if args.preview:
                preview_png(verts, faces, out / f"_preview-{fname[:-4]}.png")

    manifest["totalSeconds"] = round(time.time() - t_all, 2)
    with open(out / "manifest.json", "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
    total_bytes = sum(s["bytes"] for s in manifest["stones"])
    print(f"· 共 {len(manifest['stones'])} 块石头 / {total_bytes/1024:.1f} KB / "
          f"耗时 {manifest['totalSeconds']}s → {out}")


if __name__ == "__main__":
    main()
