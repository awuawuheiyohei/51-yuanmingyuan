# 圆明园 3D 复原 —— 3D设计 白模精细化 交接

> 生成时间：2026-11-25
> 交接自：session `mvs_15c9bae70f5749c09a13232689ba2199`
> 仓库：`/Users/jiangwenrui/Downloads/mass/51-yuanmingyuan`
> master 起点：`b8f0012`（工作区干净，无未提交改动）

---

## 0. 一句话现状

项目已能跑、已过验收线；**下一阶段的活是"用 3D设计（cq-viewer）白模做构件级体检"**，
上一轮已用它抓到 2 个渲染里**完全看不出来**的真几何 bug（斗栱出挑方向错 90°、
步步锦横棂跑格）+ 1 个（分段方向写反 ⇒ 翼状竖板）。

**继续的方向**：把剩下的 42 景逐景白模扫一遍，把「渲染里看不出来」的几何错误清干净。

---

## 1. 必须先读的三个文件

| 文件 | 作用 |
|---|---|
| `AGENTS.md` | **项目规约全文**。特别是 §4.1（视觉保真度）、§4.1.29~§4.1.40（本轮新增的几何体检方法论） |
| `data/research/architecture-notes.md` | **考据源头**。改任何形制前必须先在这里找到依据 |
| `src/scene/scenes-program.js` | 41+1 景的形制配置（开间/屋顶/瓦色/配建筑），**每个字段都有出处** |

---

## 2. 环境与常用命令

```bash
cd /Users/jiangwenrui/Downloads/mass/51-yuanmingyuan

npm run dev          # vite → http://localhost:5180
npm run scene        # 重生成 public/scene/scene.json（改 scenes-program.js 后必须跑）
npm run check        # 全量自检（13 个脚本），EXIT=0 才算过

# 3D设计（cq-viewer）查看器： http://127.0.0.1:58505/viewer
#   ⚠ 查看器是 Z 轴向上（CAD 约定），本项目 Y 向上
#     ⇒ 导出 STL 必须绕 X 轴转 −90°（脚本里已处理）

# 单座建筑白模（硬编码 case）
node scripts/export-part-stl.mjs --case=daxie --bucket=dougong \
     --x0=-2.2 --x1=2.2 --y0=7.2 --y1=8.8 --z0=10 --z1=13.6

# 整景白模（主殿 + 全部配建筑）★ 白模体检首选
node scripts/export-scene-stl.mjs --scene=鱼跃鸢飞
node scripts/export-scene-stl.mjs --scene=西峰秀色 --bucket=wall,lattice
node scripts/export-scene-stl.mjs --all

# 送进 3D设计（cq-viewer MCP 工具）
mcp__cq-viewer__add_model_file(path="/tmp/scene-XXX.stl", copy_to_scene=true,
                                name="yy-XXX", workspace="/Users/jiangwenrui/Downloads/mass/51-yuanmingyuan")

# 截图（无头 Chrome，真实渲染）
Q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "鱼跃鸢飞")
./scripts/shot.sh /tmp/x.png "view=close&name=$Q"

# 逐景出图（真 1.70m 眼高，两个距离）
./scripts/shoot-all-scenes.sh /tmp/scene-final

# 推送（⚠ 必须走 SSH，HTTPS 会 Empty reply from server）
git -c core.sshCommand="ssh -i /Users/jiangwenrui/.ssh/id_ed25519 -o IdentitiesOnly=yes -o ConnectTimeout=20" \
    push origin master
```

---

## 3. 白模体检工作流（已验证有效）

1. `export-scene-stl.mjs` 导出整景白模 → `add_model_file` 送进 3D设计
2. 在 3D设计 里切 **等轴测 / 前 / 右 / 顶** 四个视角看
   - ⚠ 3D设计 里每个模型有独立可见性开关（「已打开的模型」面板），**先把其它模型关掉**，
     否则叠在一起看不清
   - ⚠ 模型多时 `run_script` 里的 `page.evaluate` 点 checkbox 经常不生效
     ⇒ 直接 `find ~/.cqview/scene -name '*.stl' ! -name '目标.stl' -delete` 再刷新页面，最干净
3. 发现疑点 ⇒ **用几何脚本定位**（别靠看图猜）：
   ```bash
   node -e "import('./src/scene/buildings/parts/structure.js').then(async M=>{
     const THREE=await import('three');
     // 造 buildStructure(...) → 遍历 geoms（Map！）打印每个几何的 bbox
   })"
   ```
   - ⚠ `geoms` 是 **Map**，`Object.entries` 取不到东西
   - ⚠ 桶里可能混着 **Group**（不是 BufferGeometry），要按 `g.isBufferGeometry` 过滤
4. 修 ⇒ **写自检** ⇒ **反向验证**（装回 bug 版，判据必须失败）
5. `npm run scene && npm run check` ⇒ 截图复看 ⇒ 提交推送

---

## 4. ⚠ 本轮踩过的坑（判据写错比模型错更常见）

| 坑 | 正确做法 |
|---|---|
| 判据查墙身**中心**是否超平面 | 斗栱/出檐/台基本来就超 ⇒ 误报 171 个。只查**墙身桶**，出檐余量作容差 |
| 判据查墙段**段数** == 开间数 | 正中那间是**门洞、没有实墙** ⇒ 实墙段数 = 开间数 − 1 |
| 判据查墙段**中心**是否超进深 | bug 版中心 ±6.0 不超、**边界** ±7.9 超 ⇒ 查边界 |
| 自检**手填** width/depth | 必须用 `deriveDimensions()` 的**真实推导尺寸**。手填 20×20 正方形会掩盖「面阔≫进深」的误差 ⇒ **装回 bug 版判据仍全过** |
| 批量改名脚本二次替换 | `西峰秀` → `西峰秀色` 时，已是 `西峰秀色` 的会变成 **`西峰秀色色`** ⇒ 改完必须 grep 一遍 |
| 3D设计 白模里的彩色细线 | 那是**坐标轴指示器**（Z 蓝 / Y 黄），不是穿模。饱和色=坐标轴，同色=几何 |
| `?pick=` 探针 | `init()` 里同步取值 ⇒ 相机矩阵还没更新 ⇒ 射线方向是错的。**别信它** |
| 中文景名 URL 编码 | 必须用 `python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))"` 生成，手写百分号编码会解成另一个字 |

---

## 5. 本轮已完成（都已推送）

| commit | 内容 |
|---|---|
| `f2202ff` | **四十景正名**（6 处御题原字）+ 4 景形制订正 + 四面为门几何 |
| `2e0277f` | 修「翼状竖板」：分段方向写反 + 判据重写 |
| `115ded3` | 4 处空锚点真相查清：正名舍卫城 / 上下天光主殿=涵月楼 / 新建思永斋 / `host` 机制 |
| `b8f0012` | 记录整景白模复查结论 + 坐标轴非缺陷的判别法 |

**关键结论**：
- 四十景**一个不缺**；6 处是抄错的 ⇒ 已按乾隆御题原字改名
  （九洲清晏/日天琳宇/鱼跃鸢飞/西峰秀色/四宜书屋/澡身浴德）
- 「含卫城」是「**舍卫城**」的误写（坐石临流之北）；「紫碧山房」本来就已经建了；
  「涵月楼」是上下天光的主体 ⇒ 41 景 → **42 景**（新增思永斋）
- 「四面为门」是鱼跃鸢飞的考据实记（《日下旧闻考》「四面为门，各五楹」）⇒
  `main.doorsAllSides = true`；背墙按**面阔**分间、侧墙按**进深**分间
- **性能**：57,915,973 三角面 / 624 draw calls（底线 62M）

---

## 6. 尚未做（留给下一轮）

### ① 剩余景的白模体检（主任务）
42 景里已扫过：鱼跃鸢飞、日天琳宇、西峰秀色、澡身浴德、坐石临流。
**其余约 37 景还没扫**。建议优先级（改动多、几何复杂 ⇒ 越可能藏 bug）：

| 优先级 | 景 | 为什么 |
|---|---|---|
| 高 | 鸿慈永祜 | 规制最高（九楹重檐歇山 + 黄琉璃 + 琉璃牌坊） |
| 高 | 蓬岛瑶台 | 三岛 + 11 座桥 + 大量配建筑 |
| 高 | 廓然大公 | 八景 + 双鹤斋 + 大水面 |
| 高 | 曲院风荷 | 九孔石桥 + 金鳌玉蝀牌楼 |
| 中 | 正大光明 / 九洲清晏 | 三进殿群，已知易重叠 |
| 中 | 方壶胜境 / 洞天深处 / 天然图画 / 碧桐书院 | 多进院落 |

### ② 两处「考据问题」没动（**不是几何问题，别擅自动**）
- **照壁**（殿前影壁）—— 全项目未建（`grep 照壁 src/` 为空）
- **襜间**（檐柱与廊柱之间的凹间）—— 全项目未建

⇒ 属"要不要建、建成什么样"，要先补考据（参考 `data/research/architecture-notes.md`）。

### ③ 涵月楼取景只能到 14m
临湖 ⇒ 38m 处全落水被「水面禁入」判掉。**地理现实，不是 bug**，
但 14m + 35mm 装不下 23m 面阔 ⇒ 看全貌要人工机位或改取景策略。

### ④ 全园「白模扫一遍」的通用化
现在 `export-scene-stl.mjs` 只能手工逐景跑。可以写一个脚本：
批量导出 → 逐景在 3D设计 里渲染多视角 → 产出联表 sheet → 人眼过一遍。

---

## 7. 硬约束（别踩）

- **几何优先**：有立体特征的构件必须实体几何；「换更好的贴图 ≠ 精细化」
- **不编造复原结论**：无据坐标不摆；推定必须显式标注并写清依据
- **诊断优先于猜测**：先截图/探针确认现状再改；探针用完必删
- **验收两个距离**：13m 看构造、30m 看整体；人眼高度 **1.70m**，禁止仰角机位
- **性能底线**：全园 ≤ 62M 三角面；draw call 尽量不增（涨了先查合并，别急着减面）
- **坐标**：局部 ENU，X 东 / Z 南 / Y 上；建筑正面朝 **+Z**
- **git 推送必须走 SSH**（见 §2）
- **worker 规矩**：文件所有权不重叠；worker 不许 commit/push/`git add -A`
- macOS 自带 bash 3.2 ⇒ **没有** `mapfile`/`readarray`
