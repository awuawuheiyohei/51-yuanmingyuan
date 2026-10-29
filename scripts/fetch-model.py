#!/usr/bin/env python3
"""
并行分片下载 HF 模型（hf-mirror 直连单线程只有 ~500KB/s）。

用法：python scripts/fetch-model.py <repo_id> <dest_dir> [文件...]
不带文件参数时按下方清单下载 SD1.5 的 fp16 权重。
"""
import os
import sys
import subprocess
import concurrent.futures as cf
from pathlib import Path

# 源：modelscope.cn 国内实测 22MB/s；hf-mirror.com 只有 ~500KB/s
MIRROR = os.environ.get("MODEL_MIRROR", "https://modelscope.cn/models")
REPO = sys.argv[1] if len(sys.argv) > 1 else "AI-ModelScope/stable-diffusion-v1-5"
DEST = Path(sys.argv[2] if len(sys.argv) > 2 else "data/hf-local/sd15")
CHUNKS = 8

DEFAULT_FILES = [
    ("unet/diffusion_pytorch_model.bin", "unet/diffusion_pytorch_model.safetensors"),
    ("unet/config.json", "unet/config.json"),
    ("text_encoder/pytorch_model.bin", "text_encoder/model.safetensors"),
    ("text_encoder/config.json", "text_encoder/config.json"),
    ("vae/diffusion_pytorch_model.bin", "vae/diffusion_pytorch_model.safetensors"),
    ("vae/config.json", "vae/config.json"),
    ("model_index.json", "model_index.json"),
    ("configuration.json", "configuration.json"),
    ("scheduler/scheduler_config.json", "scheduler/scheduler_config.json"),
    ("tokenizer/merges.txt", "tokenizer/merges.txt"),
    ("tokenizer/vocab.json", "tokenizer/vocab.json"),
    ("tokenizer/tokenizer_config.json", "tokenizer/tokenizer_config.json"),
    ("tokenizer/special_tokens_map.json", "tokenizer/special_tokens_map.json"),
]


def size_of(url):
    """注意：镜像会 302 到 xet-bridge，响应里有多个 content-length，
    必须取最后一个（真实文件大小），第一个是重定向体的大小。"""
    out = subprocess.run(
        ["curl", "-sIL", "-H", "User-Agent: Mozilla/5.0", url],
        capture_output=True,
        text=True,
    ).stdout
    sizes = [
        int(line.split(":", 1)[1].strip())
        for line in out.splitlines()
        if line.lower().startswith("content-length:")
    ]
    return max(sizes) if sizes else None


def fetch_part(url, path, start, end):
    cmd = [
        "curl", "-sL", "--fail", "--retry", "5", "--retry-delay", "2",
        "-H", "User-Agent: Mozilla/5.0",
        "-r", f"{start}-{end}", "-o", str(path), url,
    ]
    subprocess.run(cmd, check=True)
    return path


def download(repo, remote, local):
    dest = DEST / local
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  · {local} 已存在")
        return
    url = f"{MIRROR}/{repo}/resolve/main/{remote}"
    total = size_of(url)
    if not total:
        print(f"  ! 拿不到大小，直接下 {remote}")
        subprocess.run(["curl", "-sL", "--retry", "5", "-o", str(dest), url], check=True)
        return
    print(f"  · {local}  {total/1e6:.0f} MB")
    tmp = dest.with_suffix(dest.suffix + ".part")
    step = total // CHUNKS
    jobs = []
    with cf.ThreadPoolExecutor(max_workers=CHUNKS) as ex:
        for i in range(CHUNKS):
            s = i * step
            e = total - 1 if i == CHUNKS - 1 else (i + 1) * step - 1
            part = tmp.with_suffix(f".p{i}")
            jobs.append(ex.submit(fetch_part, url, part, s, e))
        for j in jobs:
            j.result()
    with open(tmp, "wb") as out:
        for i in range(CHUNKS):
            p = tmp.with_suffix(f".p{i}")
            with open(p, "rb") as f:
                while True:
                    b = f.read(1 << 20)
                    if not b:
                        break
                    out.write(b)
            p.unlink()
    got = tmp.stat().st_size
    if total and got != total:
        raise RuntimeError(f"{local} 大小不符 {got} != {total}")
    tmp.rename(dest)
    print(f"    ✓ {local}")


def main():
    files = DEFAULT_FILES
    if len(sys.argv) > 3:
        files = [(f, f) for f in sys.argv[3:]]
    print(f"· 从 {MIRROR}/{REPO} 并行下载（{CHUNKS} 线程）")
    for remote, local in files:
        try:
            download(REPO, remote, local)
        except Exception as e:
            print(f"  ! {remote}: {e}")
    print("✓ 完成 →", DEST)


if __name__ == "__main__":
    main()
