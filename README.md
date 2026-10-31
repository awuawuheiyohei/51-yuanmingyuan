# 51-yuanmingyuan —— 本地 3D 圆明园复原

> 依据真实地理骨架（OpenStreetMap 轮廓 + DEM 高程 + 四十景实测坐标）
> 与参数化明清官式建筑，复原乾隆盛世的圆明园全貌。
> 纯本地运行，无 API Key，无外部素材依赖。

## 快速开始

```bash
npm install       # 安装依赖（three / vite）
npm run fetch     # 拉取 OSM 要素 + DEM 高程瓦片 + 官方导览图（只需跑一次，之后可离线）
npm run scene     # 合成 scene.json
npm run dev       # 打开 http://127.0.0.1:5180
```

### 透视：焦距与两点透视

右栏「透视」区有两个控件：

- **焦距（14~120mm，35mm 等效）**：默认 35mm。建筑摄影的常规广角。
  之前的 52° 垂直视场约等于 21mm，太广——画面边缘被拉变形、地平线压到画面下缘。
- **两点透视**：相机光轴保持水平，用**移轴**（`camera.setViewOffset`）把成像框上下平移。
  建筑摄影就是这么拍的：水平机位 + 移轴镜头，**建筑的竖线保持竖直**，
  不会像"相机一歪、楼就躺下"。俯视超过 55° 时自动退回普通透视。

也可以用 URL 直接指定：`?focal=24`、`?focal=50`。

### 本机 GPU 材质生成（可选）

用 Apple MPS 跑 Stable Diffusion 1.5 生成写实材质，替换程序化贴图：

```bash
python3 -m venv .venv-ai
.venv-ai/bin/pip install torch diffusers transformers accelerate safetensors pillow \
  -i https://pypi.tuna.tsinghua.edu.cn/simple
python scripts/fetch-model.py AI-ModelScope/stable-diffusion-v1-5 data/hf-local/sd15
HF_HUB_DISABLE_XET=1 .venv-ai/bin/python scripts/gen-textures.py
```

生成结果落在 `public/textures/`，应用启动时自动载入；
没生成过就静默回落到程序化贴图。

> **模型源**：ModelScope（国内实测 22MB/s）比 hf-mirror（500KB/s）快 45 倍。
> `huggingface.co` 本机不可达；`hf-mirror.com` 的 xet 后端会 401，
> 必须 `HF_HUB_DISABLE_XET=1`。
> ModelScope 上的 `.bin` 是 torch zip 格式，**不能改名成 `.safetensors`**。

首次拉取后，`data/raw/` 已缓存全部原始数据，之后 `npm run scene && npm run dev` 即可离线重建。

调试视角：

| 视角 | 用途 |
|---|---|
| `?view=top` | 全园俯视（查平面关系） |
| `?view=scene` | 正大光明正面 |
| `?view=scene&name=<景名>` | 换成其它景（四十景名，见 `scenes-program.js`） |
| `?view=close&name=<景名>` | 该景近景（查构件细节） |
| `?view=plan&name=<景名>` | 该景正俯视（查平面形制，如卍字/田字） |
| `?view=garden` | 福海西岸望对岸 |
| `?view=west` / `west2` / `west3` / `west4` | 西洋楼：大水法全景 / 海晏堂生肖 / 远瀛观 / 整片西洋楼 |
| `?focal=<mm>` | 指定焦距（35mm 等效），便于对比 |

俯视诊断图：`python3 scripts/plan-view.py && ffmpeg -i public/scene/plan.ppm public/scene/plan.png`。

## 目录

```
scripts/          构建期（Node ESM，无框架）
  config.mjs      取数范围与局部坐标系原点（唯一真源）
  fetch-osm.mjs   Overpass 分片拉取：建筑/水系/园界/步道/景点
  fetch-dem.mjs   AWS Terrain Tiles (Terrarium) 高程瓦片
  fetch-guide.mjs 圆明园管理处官方《圆明园导览图》原图
  fetch-model.py  并行分片下载 SD 权重（ModelScope，8 线程）
  gen-textures.py 本机 MPS 跑扩散模型生成写实材质（青砖/筒瓦/木/石/苔/草）
  build-scene.mjs OSM + DEM → public/scene/scene.json
  plan-view.py    俯视诊断图（核对布局用）
data/
  guide-georef.json  官方导览图 → 经纬度的配准参数与控制点
  research/
    architecture-notes.md  ★ 建筑形制考据摘录（每景开间/屋顶/瓦色/附属建筑）
src/
  main.js         应用入口：渲染器/天空/光照/相机循环
  scene/
    terrain.js    高程网格 + 顶点着色
    water.js      水面（福海、诸池、逐景补池）
    nature.js     假山叠山（层叠石块 + 太湖石瘦峰）
    aquatic.js    水生植物：荷叶（福海荷塘）/ 芦苇 / 菖蒲
    figures.js    尺度参照物与生活痕迹：人·马·轿·仪仗·货郎·小船
    trees.js      树木：递归枝干 + alpha 贴图树冠，按树种×变体实例化
    ground.js     草土地面贴图 + OSM 步道 + 水岸驳岸
    layout.js     装配：现状建筑 + 四十景聚落 + 西洋楼
    western.js    西洋楼总装（按考据重做的巴洛克石构建筑群）
    western-parts/ 西洋楼构件库：materials 材质表 / kit 通用构件 /
                   fountain 池与喷泉 / hall 殿宇框架 + 每处建筑一文件
    scenes-program.js  ★ 逐景考证配置表（含瓦色制度与特殊平面）
    buildings/merge.js  按材质整景合并几何（控制 draw call）
    camera-tour.js 一镜到底巡游样条
    buildings/    明清官式建筑参数化生成器
      parts/roof.js      举折曲面 / 翼角起翘 / 各式屋顶 / **真瓦作**（筒瓦·瓦当·滴水·椽头）
      parts/lattice.js   隔扇与槛窗（框料·绦环板·步步锦格心·裙板）
      parts/details.js   柱础(覆盆式)·望柱·栏板·壸门·地霞·御路
      parts/structure.js 台基柱网额枋斗栱墙体
      textures.js        程序化贴图（瓦垄/彩画/砖石/棂心）
      materials.js       材质库
      index.js           总装
  ui/hud.js       景点列表 / 镜头控制 / 时段 / 截图
```

## 数据来源与可信度

| 内容 | 来源 | 可信度 |
|---|---|---|
| **四十景坐标（44 处）** | **圆明园管理处官方《圆明园导览图》像素配准反算** | **高**（官方图 + OSM 交叉校核，残差中位 50m） |
| **西洋楼各建筑位置** | 同上（大水法 / 远瀛观 / 海晏堂 / 谐奇趣 / 方外观 / 线法山 等 8 处） | **高** |
| 园界 | OSM `leisure=park` 圆明园遗址公园 | 高（实测多边形） |
| 水面（138 公顷） | OSM `natural=water` + relation | 高 |
| 现状建筑轮廓 | OSM `building` | 高（限三园核心范围内） |
| 高程 | AWS Terrain Tiles z=14 | 中（10m 级，园内本为平地） |
| **各景开间 / 屋顶 / 瓦色 / 有名附属建筑** | **维基百科「圆明园」条目「圆明园四十景」「西洋楼园林规划」两节**（摘录见 `data/research/architecture-notes.md`） | **中高**（逐条实记，含"正大光明用灰瓦""鸿慈永祜黄琉璃瓦重檐歇山顶"等） |
| 四十景解说词 | 参考视频《圆明园…一镜到底数字复原》画面内文字 | 二手（视频自述参照四十景图与西洋楼透视图） |
| **正大光明殿的尺寸** | **实测**：明间一丈六尺五寸、次间一丈五尺五寸、再次尽间一丈三尺五寸、檐柱高一丈五尺、径一尺五寸、斗口二寸五分（见 `data/research/architecture-notes.md`） | **高**（实测；本项目模数推导链的**校验基准**） |
| **各景建筑尺寸（斗口制推导）** | 考据只给开间数不给尺寸。尺寸按清工部《工程做法则例》**斗口制**推导：檐柱径 = 6 斗口、檐柱高 = 60 斗口、攒当 = 11 斗口、斗栱每跳 3 斗口；面阔按**明间 > 次间 > 稍间 > 尽间**递减的攒当法定。推导结果与正大光明殿实测**逐项吻合到毫米** | **参考级，非测绘**（模数制度有据，绝对尺度除正大光明殿外均为推定） |
| 各景建筑**数量**与**平面形状** | 考据只点名了部分建筑；卍字/田字等特殊平面的体量划分为推定 | **参考级，非测绘** |
| **假山群（446 座）** | 逐景按"叠山强度"参数程序化生成；单座位置/半径/高度均为**推定** | **参考级，非测绘**（形态本身为 GPU 生成的太湖石 SDF 网格，属艺术化复原） |
| 游廊（15 条，约 8.5km） | 由景点间距离自动连线生成路径 | **参考级**（走向为推定，构件做法按清式小式） |
| 树木 | 逐景按考证表里的树种程序化散布，位置非实测；殿前庭院与御道按**建筑实际尺寸**留空 | **参考级**（树种有据，位置推定） |

### 尺寸是怎么定出来的（斗口制）

建筑尺寸**不是**"面阔 3.6m/间"这种手填常数，而是走一条**闭合的整数推导链**：

```
开间数（考据） + 等级（考据）
   → 斗口绝对值（十一等材，半寸刻度）
   → 各开间斗口数（明 66 / 次 62 / 稍 54 / 尽 48）
   → 通面阔 = Σ斗口数 × 斗口
   → 柱径 = 6 斗口 · 柱高 = 60 斗口 · 台基 = 柱高 × 等级比例
   → 檐高 = 台基 + 柱高 + 额枋 + 斗栱(10 斗口)
```

`node scripts/check-proportions.mjs` 会跑一遍：
1. 41 景逐项校验比例（柱高/柱径按开间数分档，小体量不套大殿区间）；
2. **回归测试**——用正大光明殿的实测值校验推导链。

当前结果：**41 景全部通过**；正大光明殿的斗口、柱径、柱高、通面阔、台基高、明间/次间/稍间面阔
**8 项全部与实测吻合（误差 0mm）**。


### 官方导览图配准

`data/guide-georef.json` 固化了配准参数与全部控制点：

- 原图 10016×5197，北向上
- 在原图上人工读取景区标注文字的像素位置
- 与 OpenStreetMap 的 24 个实测坐标做最小二乘仿射配准
- 残差中位 **50m**、最大 105m（主要来自文字标注与实际景点中心的偏移）

坐标取用见 `scripts/build-scene.mjs` 的 `SCENES` 表（`source: 'guide'`）。

### 三园关系（配准后确证）

初版曾把三园位置弄反，配准后修正：

```
                  长春园（东北）        ← 西洋楼遗址在此
              ┌────────────────┐
              │  福海 · 蓬岛瑶台 │      方壶胜境
              │  方壶胜境      │
   圆明园本部  │  接秀山房      │      绮春园（东南）
    （西部）  │  平湖秋月      │
              └────────────────┘
                 四十景主轴在西
```

- **圆明园本部**在西，**长春园**在东北，**绮春园**在东南
- **西洋楼遗址**在长春园一带，**大水法**在中轴核心
- 中轴自西南向东北：谐奇趣 → 方外观 → 海晏堂 → 大水法 → 线法山；
  远瀛观在大水法正北，泽兰堂、转湘帆在大水法东南
- 三园核心范围实测 **东西 2361m × 南北 1672m**

### 建筑形制的考据边界

- **开间数、屋顶形式、瓦色、有名附属建筑**：来自维基百科条目逐条实记，
  逐条摘录在 `data/research/architecture-notes.md`，场景里每个字段都能对回去。
- **尺寸**：考据只给开间数不给尺寸，尺寸按清式模数推定（面阔 3.6m/间等），
  推定规则登记在 research 文件第四节。
- **建筑数量**：考据只点名了部分建筑，其余数量仍是推定。
- **特殊平面**：万方安和"卍"字、澹泊宁静"田"字为考据实记；
  拆分方式（各体量的开间分配）为推定。

⚠ 官方"数字圆明园"项目（2009 年起，2000+ 建筑模型）不开源，
本项目的官式建筑全部由参数化生成器按清式做法重建，不等同样式雷图复原。

## 约定

1. **坐标**：局部 ENU，原点在 `scripts/config.mjs` 定义。X 向东，**Z 向南**，Y 向上。
   建筑默认**面南**（正面朝 +Z）。
2. **改动建筑生成器**后不需要重跑 `npm run fetch`，但需要 `npm run scene`
   （场景数据含逐景配置与假山/树木布局）。
3. **贴图全部程序化生成**（`textures.js`），不要引入外部素材文件。
4. **建筑几何按材质合并**（`mergeGeometries`），保持每建筑 6~8 个 draw call；
   **整景再合并一次**（`buildings/merge.js`），使一景只出 6~8 个 draw call。
   新增构件时放进对应的材质桶，不要单独建 Mesh。
5. **假山与树木一次性合并/实例化**，不要为每座假山单独建 Mesh。
6. 新增景点：在 `src/scene/scenes-program.js` 加配置，
   再在 `scripts/build-scene.mjs` 的 `SCENES` 表补坐标。

## 已知的取舍

- 园内地面本就是人工挖出的平地，真实 DEM 无凹陷，因此由 `build-scene.mjs`
  按水位**自行开凿**湖池，并沿池边起护岸。
- 水位取岸线**最低**高程而非中位数——园内地面平，取中位数会让部分岸线低于水面而漫出。
- 树木为程序化散布，非实测；逐景林相按考证表里的树种补种。
- 相机巡游的镜头顺序对齐参考视频的章节顺序。
