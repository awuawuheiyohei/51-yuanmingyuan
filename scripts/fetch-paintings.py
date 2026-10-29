#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""下载《圆明园四十景图咏》四十幅图页的高清原图。

来源
----
搜狐图文《石高堂款〈圆明园四十景图〉》(2024-10-21)
    https://www.sohu.com/a/818637054_121992472
该文把整套四十景图页拼成两张 5 列 x 4 行的"整册图"发布在搜狐 CDN 上，
原始像素尺寸均为 5907 x 4725（单幅图页约占 1181 x 1181）。
本脚本用 curl 把这两张整册图下载到 data/raw/paintings/_source/，
再按 5x4 网格裁出每一幅图页，逐张落盘到 data/raw/paintings/。

取图页题名
----------
每一幅图页左上角（少数在右上角）有石高堂本人手书题名与"乙亥年五月 高堂绘"
款识。LEAVES 里登记的 `title` 就是逐幅人工核读出来的题名（繁体），
`scene` 是本项目使用的简体景名（见下表）。

注意
----
这批图页是石高堂（高堂）1995 年（乙亥年）摹绘的《圆明园四十景图》设色本，
不是乾隆朝沈源/唐岱绢本原迹（原迹藏法国国家图书馆，境内不可达）。
题名与画面与乾隆原刊《御制圆明园四十景图咏》四十景一一对应，
可直接用于圆明园场景还原参考。

用法
----
    python3 scripts/fetch-paintings.py
"""

import json
import os
import shutil
import struct
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUTDIR = os.path.join(ROOT, "data", "raw", "paintings")
SRCDIR = os.path.join(OUTDIR, "_source")
MANIFEST = os.path.join(OUTDIR, "manifest.json")

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

# 两张整册图（5 列 x 4 行 = 每张 20 幅）
ALBUMS = [
    ("album_1.jpg",
     "https://q8.itc.cn/q_100/images01/20241021/"
     "7b5f35f375a64f26ab57364f47fd0d39.jpeg"),
    ("album_2.jpg",
     "https://q9.itc.cn/q_100/images01/20241021/"
     "f4d0142ac85242e39db255b847410f65.jpeg"),
]

COLS, ROWS = 5, 4
CELL = 1181  # 5907 / 5 = 1181.4, 4725 / 4 = 1181.25

# (景名, 图页题名, 整册图序号(0/1), 行, 列)
LEAVES = [
    ("镂月开云", "鏤月開雲", 0, 0, 0),
    ("日光琳宇", "日天琳宇", 0, 0, 1),
    ("汇芳书院", "匯芳書院", 0, 0, 2),
    ("月地云居", "月地雲居", 0, 0, 3),
    ("映水兰香", "映水蘭香", 0, 0, 4),
    ("涵虚朗鉴", "涵虛朗鑑", 0, 1, 0),
    ("坐石临流", "坐石臨流", 0, 1, 1),
    ("夹镜鸣琴", "夾鏡鳴琴", 0, 1, 2),
    ("廓然大公", "廓然大公", 0, 1, 3),
    ("上下天光", "上下天光", 0, 1, 4),
    ("慈云普护", "慈雲普護", 0, 2, 0),
    ("九州清晏", "九洲清晏", 0, 2, 1),
    ("北远山村", "北遠山村", 0, 2, 2),
    ("茹古涵今", "茹古涵今", 0, 2, 3),
    ("勤政亲贤", "勤政親賢", 0, 2, 4),
    ("坦坦荡荡", "坦坦蕩蕩", 0, 3, 0),
    ("水木明瑟", "水木明瑟", 0, 3, 1),
    ("澹泊宁静", "澹泊寧靜", 0, 3, 2),
    ("武陵春色", "武陵春色", 0, 3, 3),
    ("同天深处", "洞天深處", 0, 3, 4),
    ("鸿慈永祜", "鴻慈永祜", 1, 0, 0),
    ("跃鸾飞", "魚躍鳶飛", 1, 0, 1),
    ("西峰秀", "西峰秀色", 1, 0, 2),
    ("长春仙馆", "長春仙館", 1, 0, 3),
    ("多稼如云", "多稼如雲", 1, 0, 4),
    ("蓬岛瑶台", "蓬島瑤臺", 1, 1, 0),
    ("碧桐书院", "碧桐書院", 1, 1, 1),
    ("正大光明", "正大光明", 1, 1, 2),
    ("别有洞天", "別有洞天", 1, 1, 3),
    ("平湖秋月", "平湖秋月", 1, 1, 4),
    ("曲院风荷", "曲院風荷", 1, 2, 0),
    ("杏花春馆", "杏花春館", 1, 2, 1),
    ("宜书房", "四宜書屋", 1, 2, 2),
    ("万方安和", "萬方安和", 1, 2, 3),
    ("方壶胜境", "方壺勝境", 1, 2, 4),
    ("接秀山房", "接秀山房", 1, 3, 0),
    ("濂溪乐处", "濂溪樂處", 1, 3, 1),
    ("洁身浴德", "澡身浴德", 1, 3, 2),
    ("山高水长", "山高水長", 1, 3, 3),
    ("天然图画", "天然圖畫", 1, 3, 4),
]

# 本项目使用的四十景排序（用于文件名前缀编号）；谐奇趣属西洋楼三十景，
# 不在这套四十景图咏册页里，未收录 -> 记为 missing。
ORDER = [
    "正大光明", "勤政亲贤", "九州清晏", "镂月开云", "天然图画",
    "碧桐书院", "慈云普护", "上下天光", "杏花春馆", "坦坦荡荡",
    "茹古涵今", "长春仙馆", "山高水长", "万方安和", "月地云居",
    "鸿慈永祜", "武陵春色", "映水兰香", "澹泊宁静", "水木明瑟",
    "濂溪乐处", "日光琳宇", "汇芳书院", "多稼如云", "跃鸾飞",
    "西峰秀", "坐石临流", "曲院风荷", "同天深处", "蓬岛瑶台",
    "平湖秋月", "宜书房", "北远山村", "廓然大公", "洁身浴德",
    "夹镜鸣琴", "别有洞天", "接秀山房", "涵虚朗鉴", "方壶胜境",
    "谐奇趣",
]


# ---------------------------------------------------------------- JPEG 尺寸
def jpeg_size(data):
    """从 JPEG 字节流读出 (宽, 高)，只用标准库。"""
    if len(data) < 4 or data[0] != 0xFF or data[1] != 0xD8:
        return None
    i, n = 2, len(data)
    while i < n - 1:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xD8, 0xD9, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        if i + 4 > n:
            return None
        seglen = struct.unpack(">H", data[i + 2:i + 4])[0]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                      0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            if i + 9 > n:
                return None
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return w, h
        i += 2 + seglen
    return None


def png_size(data):
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    w, h = struct.unpack(">II", data[16:24])
    return w, h


def image_size(path):
    with open(path, "rb") as fh:
        head = fh.read(65536)
    return jpeg_size(head) or png_size(head)


# ------------------------------------------------------------------ 下载
def curl(url, dest, referer=None):
    cmd = ["curl", "-s", "-L", "--http1.1", "--max-time", "120",
           "-A", UA, "-o", dest]
    if referer:
        cmd += ["-e", referer]
    cmd.append(url)
    rc = subprocess.run(cmd).returncode
    if rc != 0 or not os.path.exists(dest):
        raise RuntimeError("curl failed (%s): %s" % (rc, url))
    return os.path.getsize(dest)


def crop(src, dst, x, y, w, h):
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("需要 ffmpeg 来裁切图页")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
           "-vf", "crop=%d:%d:%d:%d" % (w, h, x, y), "-q:v", "2", dst]
    rc = subprocess.run(cmd).returncode
    if rc != 0 or not os.path.exists(dst):
        raise RuntimeError("ffmpeg crop failed: %s" % dst)
    return dst


# ------------------------------------------------------------------ 主流程
def main():
    os.makedirs(SRCDIR, exist_ok=True)

    print("== 下载整册图 ==")
    albums = {}
    for name, url in ALBUMS:
        path = os.path.join(SRCDIR, name)
        size = curl(url, path)          # 不带 Referer，模拟普通浏览器 UA
        dims = image_size(path)
        print("  %-14s %s  %d bytes  %sx%s" % (name, dims and "OK", size,
                                               dims[0] if dims else "?",
                                               dims[1] if dims else "?"))
        if not dims:
            print("  !! %s 读不出尺寸" % name)
            continue
        albums[name] = (path, dims)

    print("== 裁出单幅图页 ==")
    records = []
    for scene, title, album_idx, row, col in LEAVES:
        name = ALBUMS[album_idx][0]
        src = os.path.join(SRCDIR, name)
        if name not in albums:
            print("  %-6s MISS (整册图缺失)" % scene)
            continue
        idx = ORDER.index(scene) + 1
        fname = "%02d_%s.jpg" % (idx, scene)
        dst = os.path.join(OUTDIR, fname)
        x, y = col * CELL, row * CELL
        try:
            crop(src, dst, x, y, CELL, CELL)
        except RuntimeError as exc:
            print("  %-6s FAIL %s" % (scene, exc))
            continue
        dims = image_size(dst)
        nbytes = os.path.getsize(dst)
        if not dims:
            print("  %-6s FAIL 读不出尺寸" % scene)
            os.remove(dst)
            continue
        records.append({
            "filename": fname,
            "scene": scene,
            "source_url": ALBUMS[album_idx][1],
            "width": dims[0],
            "height": dims[1],
            "bytes": nbytes,
            "inscription_title": title,
            "album": name,
            "crop": {"x": x, "y": y, "w": CELL, "h": CELL},
        })
        print("  %-22s %4dx%-4d %8d bytes  (题名 %s)" % (fname, dims[0],
                                                          dims[1], nbytes, title))

    got = {r["scene"] for r in records}
    missing = [s for s in ORDER if s not in got]
    if missing:
        print("== 缺失 ==")
        for s in missing:
            print("  -", s)

    manifest = {
        "work": "《圆明园四十景图咏》图页",
        "source": {
            "article": "https://www.sohu.com/a/818637054_121992472",
            "article_title": "石高堂款《圆明园四十景图》",
            "publisher": "搜狐网",
            "published": "2024-10-21",
            "note": ("整册图 2 张（5x4 拼版，原始 5907x4725）；"
                     "单幅图页由脚本按网格裁出。"),
            "edition": ("石高堂 1995 年（乙亥年）摹绘设色本，"
                        "题名与画面对应乾隆《御制圆明园四十景图咏》四十景。"),
        },
        "images": records,
        "missing": missing,
    }
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
    print("\n共 %d / %d 幅，缺失 %d 景" % (len(records), len(ORDER), len(missing)))
    print("manifest:", os.path.relpath(MANIFEST, ROOT))
    return 0 if len(records) == 40 else 1


if __name__ == "__main__":
    sys.exit(main())
