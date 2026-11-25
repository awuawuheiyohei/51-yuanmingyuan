# 圆明园 3D 复原 —— 白模几何体检（第二轮）交接

> 生成时间：2026-11-26
> 交接自：session `mvs_1f820c46894947e3a4d665f8ae99e52a`
> 仓库：`/Users/jiangwenrui/Downloads/mass/51-yuanmingyuan`
> master 起点：`11463ca`

---

## 0. 一句话现状

**上一轮的 5 景手工白模体检已扩展为「全园 42 景自动化几何体检」**，
并因此抓到 **1 组（4 个）此前从未被任何自检覆盖的真几何 bug：重檐歇山构造全错**（全园 2 景受影响）——已修复并补上自检。

---

## 1. 本轮做了什么

| 事项 | 结果 |
|---|---|
| **建白模多视图体检管线** | `scripts/white.html` + `shoot-white-scenes.sh` + `make-white-sheet.mjs` |
| **42 景白模联表全部出图** | 每景 4 正交视图（等轴测/正视/右视/俯视），按材质类别着色 |
| **写 4 个新自检** | 几何不变量 / 重檐专项 / 穿屋面 / 悬空台基构件 / 全园屋面覆盖 |
| **抓到的真 bug** | **2 组共 6 个**（见 §2）——已修 |
| **性能** | **57,853,621 三角面 / 624 draw calls**（基线 57,915,973 / 624 ⇒ **面数略降、draw call 不变**） |

### 3.7 全园白模审图结论（42 景）

- **重檐两景**（鸿慈永祜 / 方壶胜境）：修复后呈标准上下两重檐 + 楼身 ✓
- **41 座小建筑**：踏跺/勾栏修复后全部正常 ✓
- **九洲清晏**：审查 agent 报「山墙端敞开、露出檩架」⇒ **经射线检测证伪**
  （全园屋面连续封闭；看到的褐色斑块是**筒瓦垄之间的板瓦底色**，属正常）
- **汇芳书院**：俯视里 4 座建筑平面转 25°~50° ⇒ `scenes-program.js` 显式 `rot`
  （眉月形布局），**非 bug**
- **其余各景**：屋面无破洞/穿插、斗栱方向、步步锦、左右对称全过

⚠ 审查 agent 报的两条**误报**也记在这里：判据写错比模型错更常见
（AGENTS.md §4.1.38 的老教训）。

---

## 2. 抓到的真 bug：2 组共 6 个

### 2.1 第一组：重檐歇山的构造全错（4 个）

#### 为什么一直没被发现

**全园 5 个自检脚本都把 `doubleEave` 写死成 `false`**：

```
scripts/check-roof-built.mjs:75      doubleEave: false
scripts/check-dougong-direction.mjs:74
scripts/check-doors-all-sides.mjs:88
scripts/check-ridge-purlin.mjs:71
scripts/check-geometry-invariants.mjs（第一版）
```

⇒ **重檐这条代码路径从未被任何自检覆盖过**，而全园有 2 景用它：
- **鸿慈永祜**（安佑宫，九楹重檐歇山 + 黄琉璃）
- **方壶胜境**（哕鸾殿，三层重檐）

#### 四个 bug

| # | bug | 症状 |
|---|---|---|
| ① | **上檐斗栱悬空** | 坐高用「下层柱网的额枋尺度」算（`eaveY - fangH - …`），斗栱坐到 12.005m、顶 12.83m，而上檐檐口才 12.93m ⇒ 斗栱顶离檐口只剩 10cm，几乎戳出檐口 |
| ② | **没有雷公柱** | 柱网只建到腰檐（柱顶 7.49m），上檐斗栱在 12.0m ⇒ **悬空 4.5m**，腰檐与上檐之间是**一段没有柱的空楼身** |
| ③ | **上檐封檐板从未生成** | `addBan(eaveY - fangH, eaveY - 0.24)` **参数顺序反了**（top > bot）⇒ `if (h <= 0.05) return` **静默跳过** ⇒ 上檐檐下是空的，能直接看穿屋架 |
| ④ | **三层高度各算各的** | `roof.js` 与 `structure.js` 分别算上檐檐口，两边对不上（结构层比屋面低一个坡高） |

#### 修法（清式重檐歇山制度）

```
① 台基 → 下层柱网 → 腰檐斗栱（挑在下层柱头）→ 腰檐屋面（外檐口 → 内圈）
② 楼身：腰檐内圈 → 上檐檐口   ← 雷公柱从这里升起
③ 雷公柱 → 上檐斗栱 → 上檐屋面
```

改动（`src/scene/buildings/`）：
- `parts/roof.js` → 把 `lowerRise` 拆成 **腰檐坡高 + 楼身高** 两段；
  `meta` 新增 `lowerInnerY` / `upperEaveY`
- `index.js` → structure 的 `eaveY` **直接取 `roof.meta.upperEaveY`**（两边同源，不再各算各的）
- `parts/structure.js` → ① 上檐斗栱坐高改为**与单檐同源**（`DG_TOP_TO_EAVE = 0.624`）
  ② 新增**雷公柱**（`addUpperColumn`）③ `addBan` 改为**参数顺序反了就抛错**（不再静默跳过）

**修前 vs 修后**（正视白模）：`docs/screenshots/white-model/重檐-修复前-鸿慈永祜-正视.png`
↔ `docs/screenshots/white-model/重檐-修复后-鸿慈永祜-正视.png`
⇒ 修前只有一道扁平屋檐、楼身缺失；修后是标准的**上下两重檐 + 中间楼身**。

#### 附带发现（判据本身的坑）

- **`addBan` 的 `if (h <= 0.05) return` 是静默失败**：参数顺序反了也不报错 ⇒ 改为**指名道姓地抛错**。
  但「**没有斗栱**」（小式建筑，如 `rank:'corridor'` 的穿堂）不是错误 ⇒ 单独放行。
- **垫栱板区间薄是真实构造**：清式里垫栱板就在斗栱顶与檐檩之间，斗栱本来就直接承檐檩
  ⇒ 实测单檐 hall 板厚 0.12m、side/tower/gate 等级只有 0.03m ⇒ 不能拿「薄」当错误。

### 2.2 第二组：小建筑台基的**踏跺超宽 + 勾栏悬空**（2 个）

白模审图抓到：**每座小建筑（亭/牌楼/钟鼓楼/小匡庐…）台基两侧浮着一段望柱+华板勾栏，
落在台基边外、半空无承托；旁边一条踏跺比建筑本身还宽、与台基脱开。**

根因在 `structure.js`：

```js
const sw = Math.min(bayW * 2.8, 9.5);          // ❌ 完全不看建筑多宽
const rw = Math.max(2, (width - sw) / 2 - 0.4); // ❌ 把负数兜成 2
```

- 单间小建筑（面阔 2.60m）⇒ `sw = 7.28m`，比建筑**宽 4.68m**
- `rw` 用 `Math.max(2, …)` 把**负数兜成 2** ⇒ 本该「不建」的栏杆反而被造出来，
  而且被放在离建筑 3.6m 的地方 ⇒ **半空悬空的勾栏**

⇒ 修：① `sw` 加 `width - 0.8` 的上限；② `rw` **去掉 `Math.max(2, …)` 兜底**，为负就不建。

**影响面：全园 41 座小建筑**（237 座里）。

**修前 vs 修后**（真实渲染）：曲院风荷的金鳌牌楼，
修前两侧各有一段**悬空的灰白勾栏** + 一条脱开的台阶；修后两者都消失。

---

## 3. 新增的自检

### 3.1 `scripts/check-double-eave.mjs` —— 重檐专项

判据（几何级）：
1. 上檐斗栱**不得悬空**（坐高 ≤ 雷公柱柱头，容差 5cm）
2. 上檐斗栱**不得顶穿檐口**（净空 ≥ 0.3m）
3. **上檐封檐板必须存在**
4. 腰檐必须有斗栱承托
5. 三层高度必须自洽（腰檐内圈 = 腰檐檐口+坡高；上檐檐口 = 腰檐内圈+楼身）

**反向验证**：装回 HEAD 的 bug 版 ⇒ **8 项违例**（无雷公柱 / 斗栱悬空 / 斗栱几乎戳出檐口 / 封檐板缺失 / 高度不同源），EXIT=1 ✓

### 3.2 `scripts/check-geometry-invariants.mjs` —— 全园几何不变量

判据：
1. **左右对称性**（构件级镜像配对）：结构层各桶左/右构件数必须配得上
2. **墙身类构件不得越出建筑轮廓**（容差 = 半个柱径 + 5cm）
3. **柱网完整**：柱数 = 周边柱 `2×(mian+1) + 2×(jin−1)` + 金柱（jin≥5 时 `(mian−1)×2`）

**反向验证**（关键，两次才做对）：
- 装回上一轮的「**翼状竖板**」bug（侧墙按面阔分间）⇒ 抓到 4 件墙段超出 0.42m，EXIT=1 ✓
- ⚠ **判据必须先在「已知正确」的样本上验证通过**：
  第一版在**已人工确认无错的 5 景**（鱼跃鸢飞/日天琳宇/西峰秀色/澡身浴德/坐石临流）上误报 1113 项
  ⇒ 三次修正才收敛：
  ① 顶点哈希配对 → **构件级 bbox 配对**（`Math.round` 在 ±0.5 边界上不对称）
  ② 判据含屋面 → **只查结构层**（屋面**瓦垄数左右不等是真实构造**：垄从檐口一端起铺）
  ③ 越界按中心判 → 漏检「翼状竖板」⇒ 改为**按边界判 + 半个柱径豁免**

### 3.3 `scripts/check-roof-coverage-all.mjs` —— 全园屋面覆盖

现有的 `check-roof-coverage.mjs` **只测了 3 个硬编码 case**（九洲清晏主殿/奉三无私殿/圆明园殿）
⇒ 其余 39 景、以及**所有配殿/楼/轩/亭**的屋面从未被测过。

本脚本对全园 42 景的每座建筑向上打射线（0.45m 网格），
命中**任何屋面构件**（tile/shanhua/wall/ridge/finial）算覆盖，
**命中 board（望板）或无命中**才算破洞。

⚠ 判据演进（三次才收敛）：
1. 只认 `tile` ⇒ 正脊（`ridge`）被误判（采样网格必然打中骑在中轴上的脊）
2. 山花区要求命中 `shanhua` ⇒ **歇山的山花上方还有坡面** ⇒ 射线先打到 tile ⇒ 误判
3. ⇒ 最终：命中任一屋面构件即算覆盖

**反向验证**：要求必须命中 `tile` ⇒ 8 景全报错，EXIT=1 ✓

### 3.4 `scripts/check-roof-penetration.mjs` —— 构件穿屋面

通用检测：任何结构层构件的顶点**高过该点屋面**就是穿模。

⚠ 判据要排除四处合法的高出：
- **正脊轴线附近**（屋面高度场在脊处是**尖峰**：中轴 6.62 / z=−0.12 处只有 6.30，
  而脊檩骑在脊上、顶 6.51 ⇒ 比坡面高但**没穿出**）
- **角部**（角柱/角斗栱/角部彩画都在戗脊斜收的轮廓之外，高度场在那里无意义）
- **出檐范围**（踏跺伸出檐外）
- **重檐的雷公柱**（在腰檐与上檐之间的楼身里）

**反向验证**：注入一根 40m 高的柱 ⇒ 抓到 4 项，EXIT=1 ✓

### 3.5 `scripts/check-platform-railings.mjs` —— 悬空台基构件

判据：① **望柱/勾栏必须坐在台基上**（位置落在台基水平范围外 ⇒ 悬空）
② **踏跺不得宽过台基**

⚠ **基准要对**：拿「面阔」比会误报（踏跺 2.97m vs 面阔 2.60m 看似超，
但台基宽 = 面阔 + 1.9 = 4.50m ⇒ 合法）⇒ 基准取**该构件真正依附的东西**。

**反向验证**：bug 版 **117 项违例**（覆盖 41 座受影响建筑），修复版 0 项 ✓

### 3.6 合并层加桶标记与建筑名（纯增量）

`src/scene/buildings/merge.js`：合并后 mesh 只留一个名字 ⇒ 构件类别与建筑名都丢失。
⇒ 合并时把**源桶键集合**记进 `mesh.userData.bucketKeys`，
把**源建筑名集合**记进 `mesh.userData.ownerNames`。
**不影响渲染、不影响 draw call**（纯 userData 字段）。
白模页靠它按类别着色、按建筑聚焦（`?focus=名字`）。

---

## 4. 白模体检管线（交接文档 §6④ 的待办，已完成）

### 4.1 用法

```bash
# 批量出图（42 景，每景一张四视图联表）
./scripts/shoot-white-scenes.sh /tmp/white-scenes            # 全园
./scripts/shoot-white-scenes.sh /tmp/w 鸿慈永祜 方壶胜境        # 指定景

# 单景单视图大图（细查用）
Q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "鸿慈永祜")
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --use-angle=metal \
  --enable-gpu --hide-scrollbars --window-size=1000,900 --virtual-time-budget=90000 \
  --screenshot=/tmp/z.png "http://127.0.0.1:5180/scripts/white.html?scene=$Q&cell=880&views=top"
#   ?scene=景名   ?views=iso,front,right,top   ?cell=格宽
```

### 4.2 为什么这样设计

| 设计 | 理由 |
|---|---|
| 走 `buildLayout()` **真实构建路径** | `export-scene-stl.mjs` 那套「手搓 spec」与真实布局（斗口制推导 + `separateFootprints` 分离）**不同源** ⇒ 检出来的不是真问题 |
| **正交**相机（CAD 惯例） | 看清真实比例与正立面，不受透视畸变干扰 |
| 按**材质类别**着色 | 出问题时能一眼看出「哪一档构件」坏了（墙/柱/槅扇/格心/斗栱各一色） |
| 只渲染**建筑本体**（剔除铺地/院墙） | 否则俯视图被院墙主导，殿宇缩成一小块 |
| 光照克制（ambient 0.55 + dir 1.05） | 第一版 ambient 1.45 ⇒ **所有构件曝成一片白**，什么颜色都看不见 |

⚠ **彩色细线不是穿模** —— 那是坐标轴指示器（沿 X 的蓝线 = 正脊投影）。

---

## 5. 本轮已推送的 commit

见 `git log`。主要内容：

| 文件 | 改动 |
|---|---|
| `src/scene/buildings/parts/roof.js` | 重檐三层高度拆分；`meta` 导出 `lowerInnerY`/`upperEaveY` |
| `src/scene/buildings/parts/structure.js` | 雷公柱；上檐斗栱坐高与单檐同源；`addBan` 参数反了抛错 |
| `src/scene/buildings/index.js` | structure 的 `eaveY` 取 `roof.meta.upperEaveY` |
| `src/scene/buildings/merge.js` | 合并后记 `userData.bucketKeys`（纯增量） |
| `scripts/check-double-eave.mjs` | 新增：重檐专项自检 |
| `scripts/check-geometry-invariants.mjs` | 新增：全园几何不变量自检 |
| `scripts/white.html` / `shoot-white-scenes.sh` / `make-white-sheet.mjs` | 新增：白模多视图体检管线 |
| `package.json` | `npm run check` 加两个新自检 |
| `AGENTS.md` | 记本轮的坑与判据 |

---

## 6. 尚未做（留给下一轮）

1. **西洋楼（谐奇趣/大水法/海晏堂…）的白模体检** —— 本轮白模页只覆盖了
   `western` 组（西洋楼整体），**没做逐处**（8 处西洋楼各构件）。
   西洋楼有独立的材质体系（`western-parts/`），要另做。
2. **游廊/牌楼/桥的白模体检** —— 本轮只查了建筑群（`scenes` 组）。
   `park-wall` / `corridor` / `bridges` 尚未系统体检。
3. **人物层与假山** —— `figures` / `rockery` 不在本轮范围。
4. **照壁 / 襜间** —— 仍是**考据问题**（无据可依，不擅自动）。
5. **`make-white-sheet.mjs` 的取格坐标** —— 拼图脚本目前取格有偏移（单张原图更可靠）；
   下轮修。

---

## 7. 硬约束（不变）

- **几何优先**：有立体特征的构件必须实体几何；「换更好的贴图 ≠ 精细化」
- **不编造复原结论**：无据坐标不摆；推定必须显式标注并写清依据
- **诊断优先于猜测**：先截图/探针确认现状再改；探针用完必删
- **判据必须先在「已知正确」的样本上验证**，再拿去判别别的景；
  且**必须做反向验证**（装回 bug 版，判据必须失败）
- **验收两个距离**：13m 看构造、30m 看整体；人眼高度 **1.70m**，禁止仰角机位
- **性能底线**：全园 ≤ 62M 三角面；draw call 尽量不增
- **坐标**：局部 ENU，X 东 / Z 南 / Y 上；建筑正面朝 **+Z**
- **git 推送必须走 SSH**（见下）
- **worker 规矩**：文件所有权不重叠；worker 不许 commit/push/`git add -A`

```bash
git -c core.sshCommand="ssh -i /Users/jiangwenrui/.ssh/id_ed25519 -o IdentitiesOnly=yes -o ConnectTimeout=20" \
    push origin master
```
