import time
import torch

dev = torch.device('mps')
N = 96**3
print('points', N)

def hashf(ix, iy, iz, seed, salt):
    n = (ix * 1619 + iy * 31337 + iz * 6971 + seed * 1013 + salt * 7919)
    n = n & 0x7FFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0x7FFFFFFF
    n = n ^ (n >> 16)
    return n

def grad(ix, iy, iz, seed):
    g = torch.empty(ix.shape[0], 3, device=ix.device)
    for c in range(3):
        h = hashf(ix, iy, iz, seed, c).to(torch.float32)
        g[:, c] = h / 2147483647.0
    theta = g[:, 0] * 6.2831853
    z = g[:, 1] * 2.0 - 1.0
    r = torch.sqrt(torch.clamp(1.0 - z * z, min=0.0))
    return torch.stack([r * torch.cos(theta), r * torch.sin(theta), z], dim=1)

def fade(t):
    return t * t * t * (t * (t * 6 - 15) + 10)

def perlin3(p, seed):
    X = torch.floor(p[:, 0]).to(torch.int32)
    Y = torch.floor(p[:, 1]).to(torch.int32)
    Z = torch.floor(p[:, 2]).to(torch.int32)
    fx = (p[:, 0] - X.to(torch.float32))
    fy = (p[:, 1] - Y.to(torch.float32))
    fz = (p[:, 2] - Z.to(torch.float32))
    u = fade(fx); v = fade(fy); w = fade(fz)

    def corner(dx, dy, dz, ox, oy, oz):
        g = grad(X + dx, Y + dy, Z + dz, seed)
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

pts = torch.rand(N, 3, device=dev) * 2 - 1
t0 = time.time()
v = perlin3(pts, 7)
vc = v.cpu()
print('perlin3 1 octave:', time.time() - t0, 's   range', vc.min().item(), vc.max().item())

t0 = time.time()
for o in range(5):
    v = perlin3(pts * (2 ** o), 7 + o * 17)
vc = v.cpu()
print('perlin3 5 octaves:', time.time() - t0, 's')

# SDF-ish work
t0 = time.time()
d = (pts * pts).sum(dim=1)
d = d - 0.5
d = torch.tanh(d * 3.0)
print('sdf-ish:', time.time() - t0, 's')
print(d.cpu()[:4])
