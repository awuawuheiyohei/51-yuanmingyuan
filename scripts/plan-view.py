#!/usr/bin/env python3
"""
俯视诊断图：把 scene.json 渲染成一张俯视彩色图，用于核对布局与水陆关系。
  绿 = 陆地    青 = 水面    灰 = 建筑    橙 = 假山    红点 = 四十景锚点
输出 public/scene/plan.ppm（再由 ffmpeg 转 png）
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
scene = json.load(open(os.path.join(ROOT, 'public/scene/scene.json'), encoding='utf-8'))

t = scene['terrain']
COLS, ROWS = t['cols'], t['rows']
minX, minZ, sizeX, sizeZ = t['minX'], t['minZ'], t['sizeX'], t['sizeZ']
heights = t['heights']

W, H = 1100, 820
buf = bytearray(W * H * 3)

# 初始化：按高程着色
for r in range(ROWS):
    for c in range(COLS):
        h = heights[r * COLS + c]
        px = int((c / (COLS - 1)) * (W - 1))
        py = int((r / (ROWS - 1)) * (H - 1))
        if 40 <= h <= 55:
            g = int(120 + (h - 40) * 4)
            col = (90, g, 70)
        else:
            col = (150, 140, 120)
        i = (py * W + px) * 3
        buf[i:i + 3] = bytes(col)


def to_px(x, z):
    return int((x - minX) / sizeX * (W - 1)), int((z - minZ) / sizeZ * (H - 1))


def plot(x, z, col, alpha=1.0):
    px, py = to_px(x, z)
    if 0 <= px < W and 0 <= py < H:
        i = (py * W + px) * 3
        buf[i] = int(buf[i] * (1 - alpha) + col[0] * alpha)
        buf[i + 1] = int(buf[i + 1] * (1 - alpha) + col[1] * alpha)
        buf[i + 2] = int(buf[i + 2] * (1 - alpha) + col[2] * alpha)


def fill_ring(ring, col, alpha=1.0):
    if not ring:
        return
    ys = [p[1] for p in ring]
    xs = [p[0] for p in ring]
    y0 = int((min(ys) - minZ) / sizeZ * (H - 1))
    y1 = int((max(ys) - minZ) / sizeZ * (H - 1))
    x0 = int((min(xs) - minX) / sizeX * (W - 1))
    x1 = int((max(xs) - minX) / sizeX * (W - 1))
    n = len(ring)
    for py in range(max(0, y0), min(H, y1 + 1)):
        for px in range(max(0, x0), min(W, x1 + 1)):
            x = minX + (px / (W - 1)) * sizeX
            z = minZ + (py / (H - 1)) * sizeZ
            inside = False
            j = n - 1
            for i in range(n):
                xi, zi = ring[i]
                xj, zj = ring[j]
                if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
                    inside = not inside
                j = i
            if inside:
                plot(x, z, col, alpha)


# 园界
if scene.get('park'):
    for i in range(len(scene['park'])):
        a = scene['park'][i]
        b = scene['park'][(i + 1) % len(scene['park'])]
        steps = int(max(abs(b[0] - a[0]), abs(b[1] - a[1])) / 6) + 1
        for k in range(steps + 1):
            plot(a[0] + (b[0] - a[0]) * k / steps, a[1] + (b[1] - a[1]) * k / steps, (250, 250, 240))

# 水面
for w in scene.get('water', []):
    fill_ring(w['ring'], (40, 150, 165), 0.85)

# 建筑
for b in scene.get('buildings', []):
    fill_ring(b['ring'], (215, 210, 200), 1.0)

# 假山
for r in scene.get('rockery', []):
    px, py = to_px(r['x'], r['z'])
    rad = max(1, int(r['r'] / sizeX * W))
    for dy in range(-rad, rad + 1):
        for dx in range(-rad, rad + 1):
            if dx * dx + dy * dy <= rad * rad:
                plot(r['x'] + dx * sizeX / W, r['z'] + dy * sizeZ / H, (200, 130, 70), 0.8)

# 四十景
for s in scene.get('scenes', []):
    px, py = to_px(s['x'], s['z'])
    for dy in range(-5, 6):
        for dx in range(-5, 6):
            if abs(dx) + abs(dy) <= 5:
                plot(s['x'] + dx * sizeX / W, s['z'] + dy * sizeZ / H, (230, 40, 30), 1.0)

# 西洋楼锚点
wa = scene.get('westAnchor')
if wa:
    px, py = to_px(wa['x'], wa['z'])
    for dy in range(-7, 8):
        for dx in range(-7, 8):
            if abs(dx) + abs(dy) <= 7:
                plot(wa['x'] + dx * sizeX / W, wa['z'] + dy * sizeZ / H, (20, 30, 220), 1.0)

out = os.path.join(ROOT, 'public/scene/plan.ppm')
with open(out, 'wb') as f:
    f.write(f'P6\n{W} {H}\n255\n'.encode())
    f.write(bytes(buf))
print('→', out)
