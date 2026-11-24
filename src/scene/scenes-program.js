/**
 * 逐景考证配置表
 *
 * ## 依据
 *
 * - **形制**（开间 / 进深 / 屋顶 / 附属建筑名 / 瓦色）：维基百科「圆明园」条目
 *   「圆明园四十景」与「西洋楼园林规划」两节。完整摘录见
 *   `data/research/architecture-notes.md`（该文件即本表的出处索引）。
 * - **解说词**（`note` 字段）：参考视频《圆明园，它的规模可能超出你的想象，一镜到底数字复原》
 *   （UP 主：见筑师）画面内的四十景解说词。
 * - **坐标**：`data/guide-georef.json`（圆明园管理处官方导览图像素配准）。
 *
 * ## 字段
 *
 *   note   考证解说词（原文）
 *   rank   主建筑等级（grand/hall/side/house/xuan/pavilion/tower/gate）
 *   main   主建筑形制：开间、进深、屋顶、彩画、台基、檐高、瓦色
 *   aux    配建筑群：形制 + 相对主建筑的方位（米）+ 可选的实考名与开间
 *   named  景内有名建筑（解说词明确提到的）
 *   water  水景：'lake' 大湖 / 'pond' 池 / 'river' 河渠 / null
 *   rock   假山强度 0~1（决定叠山体量与范围）
 *   grove  林相：主栽树种
 *
 * ## 瓦色（tile）
 *
 * 见 `data/research/architecture-notes.md` 第一节。等级推定规则：
 * 和玺彩画 → 黄琉璃（正大光明为考据实记的**灰瓦**）；
 * 旋子彩画 → 绿琉璃；苏式彩画 → 灰瓦（青瓦）。
 * 考据实记的瓦色（镂月开云金碧二色、方壶胜境/蓬岛瑶台彩色琉璃、
 * 西洋楼各色）直接采用实记值。
 *
 * ⚠ **开间数是考证值；尺寸是推定值**（清式模数，见 research 文件第四节）。
 * ⚠ 建筑数量仍为推定——考据只给有名建筑，未给全部建筑的数量。
 */

/** 瓦色键 → 材质参数 */
export const TILE_COLORS = {
  // ⚠⚠ 2026-11-16：灰瓦色由 '#9aa2a8' 压到 **'#6e7176'**，与中式青瓦
  //   （`buildings/materials.js → roofMaterial` 里硬编码的 0x6e7176）**统一**。
  //   原色 linear≈0.31，在本场景 ~3.4 倍照度下渲成 sRGB≈0.87 的**惨白**，
  //   谐奇趣东西两侧的**抄手游廊屋面**因此读作两块**白铁皮**（"瓦楞铁皮墙"）。
  hui:   { glazed: false, color: '#6e7176' }, // 灰瓦（青瓦）
  huang: { glazed: true,  color: '#d9a419' }, // 黄琉璃
  lv:    { glazed: true,  color: '#2f7a4a' }, // 绿琉璃
  keque: { glazed: true,  color: '#1d8b81' }, // 孔雀绿琉璃
  lan:   { glazed: true,  color: '#2b5588' }, // 蓝琉璃（钴蓝釉，沉一点才不像塑料）
  // 紫色圆光琉璃（谐奇趣用）。⚠ 依据**存疑**：记载称"颜色现已无法确定，
  //   据说为紫色圆光琉璃瓦"，故取紫；不标为定论。
  zi:    { glazed: true,  color: '#6f5f96' }, // 紫琉璃（存疑）
  hong:  { glazed: true,  color: '#a83a2e' }, // 红琉璃
  jin:   { glazed: true,  color: '#c8a02a' }, // 金（鱼鳞金瓦）
  jinbi: { glazed: true,  color: '#c09a2c' }, // 金碧二色琉璃
  // 五色琉璃（红紫孔雀蓝粉天青）：整片屋顶做成单色会失真，
  // 取其中最中性的孔雀蓝作主体，宝顶用金色，五色感由脊饰与斗栱彩画承担。
  wuse:  { glazed: true,  color: '#256a72' },
};

/** ⚠ 非四十景：官方导览图上有名，但**不在**乾隆《四十景图》之列（见下方 EXTRA_SCENES 说明） */
export const EXTRA_SCENES = {
  思永斋: {
    // ⚠ 考据（维基百科「长春园」条引《日下旧闻考》）：「含经堂西为**思永斋**，
    //   **建工字殿十七楹**。思永斋东侧建**小有天园**。」
    //   「思永斋以北为**海岳开襟**，是湖面上建造的**双层圆形石台，上有殿宇三层**。
    //   思永斋以南为**茜园**，以石取胜，建有茜园八景。」
    // ⇒ 主体 = **工字殿十七楹**（"工"字形 = 前后两殿 + 中间连接，形成"工"字）。
    //   十七楹的分配原文未细分 ⇒ 下面前后两殿的开间数**为推定**（9 + 5 = 14，
    //   余 3 楹归中部的连接殿），已在注释中标明。
    note: '含经堂西的小园。主体为工字殿十七楹——前后两殿与中间连接殿组成"工"字形；东侧建小有天园，北为海岳开襟，南为茜园',
    rank: 'hall',
    // 前殿（工字之上横）：推定九楹
    main: { mian: 9, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9.5, tile: 'lv' },
    aux: [
      // 工字之下竖：后殿（推定五楹）+ 中部连接殿（推定三楹）
      { rank: 'house', x: 0, z: 34, name: '思永斋后殿', mian: 5 },
      { rank: 'xuan', x: 0, z: 18, name: '思永斋中殿', mian: 3 },
      // 东侧小有天园
      { rank: 'xuan', x: 32, z: 4, name: '小有天园' },
      // 北：海岳开襟（湖面上的双层圆形石台，殿宇三层）
      { rank: 'pavilion', x: 0, z: -40, name: '海岳开襟' },
      // 南：茜园（以石取胜）
      { rank: 'pavilion', x: -22, z: 52, name: '茜园' },
    ],
    named: ['思永斋', '小有天园', '海岳开襟', '茜园'],
    water: 'lake',
    rock: 0.45,
    grove: 'maple',
  },};

export const SCENE_PROGRAM = {
  正大光明: {
    note: '圆明园四十景之首。为清代帝王举行朝会、接见外使的正殿，功能类似紫禁城太和殿',
    rank: 'hall',
    // 考据：面阔七间、进深五间，前后有出廊，灰瓦，卷棚歇山顶
    main: { mian: 7, jin: 5, roof: 'juanpengxieshan', caihua: 'hexi', platform: 'xumizuo', eave: 10.5, tile: 'hui' },
    // 匾额题字（考据实记）
    plaque: '正大光明',
    // 御书楹联（雍正帝手书）
    couplet: ['心天之心而宵衣旰食', '乐民之乐以和性怡情'],

    aux: [
      { rank: 'gate', x: 0, z: 46, name: '出入贤良门', mian: 5 },
      { rank: 'side', x: -32, z: -18, name: '茶膳房' },
      { rank: 'side', x: 32, z: -18, name: '御书房' },
      { rank: 'xuan', x: -32, z: 18, name: '清茶房' },
      { rank: 'xuan', x: 32, z: 18, name: '军机处' },
    ],
    named: ['正大光明殿'],
    water: null,
    rock: 0.12,
    grove: 'pine',
  },

  九洲清晏: {
    note: '清代帝后的寝宫核心区。三进南向大殿：圆明园殿—奉三无私殿—九洲清晏殿',
    rank: 'grand',
    main: { mian: 7, jin: 5, roof: 'xieshan', caihua: 'hexi', platform: 'xumizuo', eave: 11, tile: 'huang' },
    // 匾额题字（考据实记）
    plaque: '九洲清晏',

    aux: [
      // 考据：三进大殿，最前圆明园殿五楹 → 奉三无私殿七楹 → 九洲清晏殿七楹
      { rank: 'hall', x: 0, z: 46, name: '圆明园殿', mian: 5, jin: 3, eave: 8.5 },
      { rank: 'hall', x: 0, z: 18, name: '奉三无私殿', mian: 7, jin: 5, eave: 9.5 },
      { rank: 'side', x: -36, z: 0, name: '天地一家春' },
      { rank: 'side', x: 36, z: 0, name: '乐安和' },
      { rank: 'tower', x: -52, z: -8, name: '清晖阁' },
      { rank: 'xuan', x: -52, z: 16, name: '露香斋' },
      { rank: 'xuan', x: 52, z: 14, name: '怡情书史' },
    ],
    named: ['圆明园殿', '奉三无私殿', '九洲清晏殿'],
    water: 'lake',
    rock: 0.1,
    grove: 'willow',
  },

  勤政亲贤: {
    note: '清代帝王在园内处理政务的核心区域，功能类似紫禁城养心殿',
    rank: 'hall',
    // 考据：殿为五楹
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'hexi', platform: 'xumizuo', eave: 9, tile: 'hui' },
    // 匾额题字（考据实记）
    plaque: '勤政殿',

    aux: [
      { rank: 'xuan', x: -28, z: 4, name: '飞云轩' },
      { rank: 'tower', x: -28, z: -18, name: '静鉴阁' },
      { rank: 'xuan', x: -30, z: 22, name: '怀清芬' },
      { rank: 'xuan', x: 0, z: 26, name: '秀木佳荫' },
      { rank: 'xuan', x: 30, z: 26, name: '生秋庭' },
      { rank: 'side', x: 30, z: -8, name: '保合太和' },
      { rank: 'side', x: 44, z: 6, name: '富春楼' },
      { rank: 'xuan', x: 44, z: 26, name: '竹林清响' },
    ],
    named: ['勤政殿', '静鉴阁'],
    water: null,
    rock: 0.18,
    grove: 'pine',
  },

  镂月开云: {
    note: '殿宇与山峦相叠，云影镂月。雍正时称牡丹台，主体建筑为纪恩堂',
    rank: 'hall',
    // 考据：殿以楠木为材，上覆金碧二色琉璃瓦
    main: { mian: 7, jin: 5, roof: 'xieshan', caihua: 'hexi', platform: 'xumizuo', eave: 9.5, tile: 'jinbi' },
    // 匾额题字（考据实记）
    plaque: '纪恩堂',

    aux: [
      { rank: 'xuan', x: -26, z: 18, name: '御兰芬' },
      { rank: 'pavilion', x: 26, z: 20, name: '牡丹台' },
    ],
    named: ['纪恩堂'],
    water: 'pond',
    rock: 0.8,
    grove: 'pine',
  },

  天然图画: {
    note: '近西峰，天然图画楼',
    rank: 'hall',
    // 考据：主体建筑为一方楼
    main: { mian: 7, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9, tile: 'lv' },
    // 匾额题字（考据实记）
    plaque: '一方楼',

    aux: [
      { rank: 'tower', x: 0, z: -26, name: '朗吟阁' },
      { rank: 'side', x: -26, z: -18, name: '竹萿楼' },
      { rank: 'side', x: 26, z: -18, name: '五福堂' },
      { rank: 'xuan', x: -26, z: 14, name: '竹深荷静' },
      { rank: 'xuan', x: 26, z: 14, name: '静知春事佳' },
      { rank: 'pavilion', x: 0, z: 28, name: '苏堤春晓' },
    ],
    named: ['天然图画楼', '朗吟阁', '五福堂'],
    water: 'pond',
    rock: 0.62,
    grove: 'pine',
  },

  碧桐书院: {
    note: '为清代皇家书房建筑群，四面环山，遍植梧桐，形成清凉庭园空间',
    rank: 'house',
    // 考据：前殿三楹，中殿、后殿各五楹
    main: { mian: 5, jin: 3, roof: 'yingshan', caihua: 'su', platform: 'simple', eave: 6.2, tile: 'hui' },
    aux: [
      { rank: 'xuan', x: 0, z: 24, name: '前殿', mian: 3 },
      { rank: 'house', x: 0, z: -26, name: '后殿', mian: 5 },
      { rank: 'pavilion', x: -18, z: -8, name: '云岑亭' },
    ],
    named: ['碧桐书院'],
    water: 'pond',
    rock: 0.35,
    grove: 'maple',
  },

  慈云普护: {
    note: '佛堂香火，阁楼对峙',
    rank: 'hall',
    // 考据：前殿临后湖三楹（欢喜佛场），北为楼宇三楹，东为龙王殿
    main: { mian: 3, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 8, tile: 'lv' },
    aux: [
      { rank: 'tower', x: 0, z: -26, name: '欢喜佛场', mian: 3 },
      { rank: 'side', x: 28, z: -4, name: '龙王殿' },
      { rank: 'pavilion', x: -22, z: 18, name: '大士阁' },
    ],
    named: ['慈云普护殿'],
    water: 'pond',
    rock: 0.3,
    grove: 'pine',
  },

  上下天光: {
    // ⚠ 2026-11-23 考据订正：主殿**不是**"上下天光楼"，而是**涵月楼**。
    //   人民日报/北京晚报《"三山五园"赏月有佳境》：「圆明园始建于清康熙四十六年(1707年)，
    //   其后湖北岸有"**上下天光**"之景，为"圆明园四十景"之一，其中的"**涵月楼**"
    //   是一组临水的建筑，**其前半部分延伸入水中，左右两侧各有一组水亭和水榭，
    //   用九曲桥连接在一起**。置身楼上，凭栏俯瞰，上下水天一色……
    //   中秋佳节之夜，道光皇帝便在此楼侍奉皇太后赏月，祭祀兔儿爷。」
    //   ⇒ 主体 = 涵月楼（**两层**临水敞阁）；左右各一组**水亭 + 水榭**，以**九曲桥**相接。
    note: '为中秋赏月场所，得名于范仲淹《岳阳楼记》中的"上下天光"。主体建筑为涵月楼——两层临水敞阁，前部延伸入水中，左右各一组水亭、水榭，以九曲桥相连；道光七年中秋道光帝曾在此侍皇太后赏月',
    rank: 'tower',
    // 考据：涵月楼为**两层**临水敞阁（"两层"是考据实记；敞阁的柱网做法未考据 ⇒
    //   本模型按两层歇山楼处理，开间数**推定**为五间）。
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9, tile: 'hui' },
    // 匾额题字（考据实记）：主体建筑即涵月楼
    plaque: '涵月楼',

    aux: [
      // 左右各一组水亭与水榭（考据实记）
      { rank: 'pavilion', x: -24, z: 14, name: '水亭' },
      { rank: 'xuan', x: -24, z: -12, name: '水榭' },
      { rank: 'pavilion', x: 24, z: 14, name: '水亭' },
      { rank: 'xuan', x: 24, z: -12, name: '水榭' },
      { rank: 'house', x: 0, z: -30, name: '平安院' },
    ],
    named: ['涵月楼', '水亭', '水榭', '平安院'],
    // 九曲桥：主殿 → 左右水亭/水榭（考据实记「用九曲桥连接在一起」）
    bridges: [
      { from: [-12, 8], to: [-24, 14], bow: 2.0, rise: 1.4, overWater: true, name: '九曲桥·西' },
      { from: [-12, -8], to: [-24, -12], bow: 2.0, rise: 1.4, overWater: true, name: '九曲桥·西北' },
      { from: [12, 8], to: [24, 14], bow: -2.0, rise: 1.4, overWater: true, name: '九曲桥·东' },
      { from: [12, -8], to: [24, -12], bow: -2.0, rise: 1.4, overWater: true, name: '九曲桥·东北' },
    ],
    water: 'lake',
    rock: 0.22,
    grove: 'willow',
  },

  杏花春馆: {
    note: '杏花村舍',
    rank: 'house',
    // 考据：初为矮屋疏篱，仿乡村景色
    main: { mian: 3, jin: 3, roof: 'yingshan', caihua: 'su', platform: 'simple', eave: 5.6, tile: 'hui' },
    aux: [
      { rank: 'xuan', x: -20, z: 14, name: '茅舍' },
      { rank: 'pavilion', x: 20, z: 10, name: '杏花村' },
      { rank: 'house', x: 4, z: -22, name: '学堂' },
    ],
    named: ['杏花春馆'],
    water: 'pond',
    rock: 0.18,
    grove: 'blossom',
  },

  坦坦荡荡: {
    note: '初名"金鱼池"，以凿池观鱼为主题，仿杭州西湖"玉泉鱼跃"景观建造',
    rank: 'xuan',
    // 考据：三楹，前为素心堂，后为光风霁月，东北为知鱼亭
    main: { mian: 3, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 5.6, tile: 'hui' },
    // 匾额题字（考据实记）
    plaque: '素心堂',

    aux: [
      { rank: 'xuan', x: 0, z: 20, name: '素心堂' },
      { rank: 'xuan', x: 0, z: -20, name: '光风霁月' },
      { rank: 'pavilion', x: 20, z: -12, name: '知鱼亭' },
    ],
    named: ['金鱼池'],
    water: 'lake',
    rock: 0.05,
    grove: 'willow',
  },

  茹古涵今: {
    note: '为清朝皇帝冬日读书场所，命名出自唐《韩文公墓志铭》，取"博学通晓古今"',
    rank: 'house',
    // 考据：正殿五楹，后为韶景轩、茂育斋、竹香斋
    main: { mian: 5, jin: 3, roof: 'yingshan', caihua: 'su', platform: 'simple', eave: 6.2, tile: 'hui' },
    aux: [
      { rank: 'xuan', x: 0, z: 24, name: '韶景轩' },
      { rank: 'xuan', x: -22, z: -6, name: '茂育斋' },
      { rank: 'xuan', x: 22, z: -6, name: '竹香斋' },
    ],
    named: ['茹古涵今斋'],
    water: 'pond',
    rock: 0.2,
    grove: 'pine',
  },

  长春仙馆: {
    note: '四周山水环绕，初名"莲花馆"，雍正十年，开始作为皇子弘历（乾隆）的居所',
    rank: 'house',
    // 考据：门三楹，殿五楹，殿后有绿荫轩、丽景轩，西有含碧堂、林虚桂静
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'simple', eave: 6.8, tile: 'lv' },
    aux: [
      { rank: 'gate', x: 0, z: 34, name: '门', mian: 3 },
      { rank: 'xuan', x: -20, z: -14, name: '绿荫轩' },
      { rank: 'xuan', x: 20, z: -14, name: '丽景轩' },
      { rank: 'side', x: -32, z: 6, name: '含碧堂' },
      { rank: 'xuan', x: -32, z: 24, name: '林虚桂静' },
      { rank: 'xuan', x: 32, z: 20, name: '藻园' },
    ],
    named: ['长春仙馆'],
    water: 'lake',
    rock: 0.28,
    grove: 'poplar',
  },

  山高水长: {
    note: '俗称"西园"或"西苑"，兼具皇家禁军操练与骑射比赛功能',
    rank: 'hall',
    // 考据：两层五楹楼房
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9, tile: 'lv' },
    aux: [
      { rank: 'pavilion', x: -30, z: 22, name: '十三所' },
      { rank: 'pavilion', x: 30, z: 22, name: '碑亭' },
    ],
    named: ['山高水长楼', '碑亭'],
    water: null,
    rock: 0.3,
    grove: 'pine',
  },

  万方安和: {
    note: '万方安和，禅意小景',
    rank: 'house',
    // 考据：平面呈"卍"字型，共三十三间，基础筑在水底；南有文昌阁
    main: { mian: 5, jin: 3, roof: 'juanpeng', caihua: 'su', platform: 'simple', eave: 6, tile: 'hui', plan: 'wan' },
    aux: [
      { rank: 'xuan', x: 0, z: 26, name: '文昌阁' },
    ],
    named: ['万方安和殿'],
    water: 'pond',
    rock: 0.18,
    grove: 'maple',
  },

  月地云居: {
    note: '佛寺园林建筑群，俗称"清净地"，其名与"日天琳宇"呼应体现阴阳融合意境',
    rank: 'hall',
    // 考据：正殿五楹，前有方殿，后楼七楹，东为法源楼
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9, tile: 'lv' },
    aux: [
      { rank: 'pavilion', x: 0, z: 22, name: '方殿' },
      { rank: 'tower', x: 0, z: -26, name: '后楼', mian: 7 },
      { rank: 'side', x: 28, z: -6, name: '法源楼' },
      { rank: 'xuan', x: 34, z: 10, name: '静室' },
      { rank: 'pavilion', x: -26, z: -18, name: '刘猛将军庙' },
    ],
    named: ['月地云居'],
    water: 'pond',
    rock: 0.32,
    grove: 'pine',
  },

  鸿慈永祜: {
    note: '安佑宫，位于园内西北隅的皇家祖祠，主体建筑为园内规制最高的建筑',
    rank: 'grand',
    // 考据：园内规格最高，黄色琉璃瓦重檐歇山顶，九楹
    main: { mian: 9, jin: 5, roof: 'xieshan', caihua: 'hexi', platform: 'xumizuo', eave: 12.5, tile: 'huang', doubleEave: true },
    // 匾额题字（考据实记）
    plaque: '安佑宫',

    aux: [
      { rank: 'gate', x: 0, z: 44, name: '琉璃牌坊', mian: 3 },
      { rank: 'side', x: -36, z: -22, name: '配殿' },
      { rank: 'side', x: 36, z: -22, name: '配殿' },
      { rank: 'side', x: 0, z: -34, name: '紫碧山房' },
    ],
    named: ['安佑宫'],
    water: null,
    rock: 0.2,
    grove: 'pine',
  },

  武陵春色: {
    note: '桃花源景，渔家村舍',
    rank: 'house',
    // 考据：池北为五楹敞轩，东为天然佳妙，南为洞天日月多佳景
    main: { mian: 5, jin: 3, roof: 'yingshan', caihua: 'su', platform: 'simple', eave: 5.8, tile: 'hui' },
    aux: [
      { rank: 'side', x: 26, z: 0, name: '天然佳妙' },
      { rank: 'xuan', x: 0, z: -22, name: '洞天日月多佳景' },
      { rank: 'xuan', x: -24, z: -18, name: '桃花坞' },
      { rank: 'house', x: -24, z: 6, name: '绾春轩' },
    ],
    named: ['壶中日月长', '品诗堂'],
    water: 'river',
    rock: 0.35,
    grove: 'blossom',
  },

  映水兰香: {
    note: '水榭临流，兰香映水',
    rank: 'xuan',
    // 考据：正殿五楹，西向；东南为钓鱼矶，北为印月池
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 5.8, tile: 'hui' },
    aux: [
      { rank: 'pavilion', x: 18, z: 16, name: '钓鱼矶' },
      { rank: 'xuan', x: -18, z: -16, name: '印月池' },
      { rank: 'xuan', x: -22, z: 12, name: '知耕织' },
    ],
    named: ['映水兰香'],
    water: 'lake',
    rock: 0.16,
    grove: 'willow',
  },

  澹泊宁静: {
    note: '其名取自诸葛亮《诫子书》"非淡泊无以明志，非宁静无以致远"，主体建筑为"田"字形土殿',
    rank: 'house',
    // 考据：主体建筑为"田"字形殿，东为曙光楼，北为翠扶楼
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 6, tile: 'hui', plan: 'tian' },
    aux: [
      { rank: 'tower', x: 30, z: -6, name: '曙光楼' },
      { rank: 'tower', x: 0, z: -28, name: '翠扶楼' },
      { rank: 'xuan', x: -30, z: 8, name: '多稼轩' },
      { rank: 'xuan', x: 30, z: 16, name: '观稼轩' },
      { rank: 'pavilion', x: 42, z: 22, name: '稻香亭' },
      { rank: 'xuan', x: -24, z: -18, name: '水精域' },
    ],
    named: ['澹泊宁静殿'],
    water: 'pond',
    rock: 0.4,
    grove: 'pine',
  },

  水木明瑟: {
    note: '仿扬州水竹居，室内用西洋式水力机械驱动风扇',
    rank: 'house',
    // 考据：北为文源阁（藏书楼）
    main: { mian: 5, jin: 3, roof: 'juanpeng', caihua: 'su', platform: 'simple', eave: 6.2, tile: 'hui' },
    aux: [
      { rank: 'tower', x: 0, z: -26, name: '文源阁' },
      { rank: 'xuan', x: -18, z: 14, name: '水木明瑟' },
    ],
    named: ['水木明瑟', '文源阁'],
    water: 'lake',
    rock: 0.18,
    grove: 'willow',
  },

  濂溪乐处: {
    note: '园内最大的园中之园，其以湖心岛为核心，山水环绕',
    rank: 'hall',
    // 考据：正殿九楹，后为云香清胜，东为香雪廊、云霞舒卷
    main: { mian: 9, jin: 5, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9.5, tile: 'lv' },
    aux: [
      { rank: 'side', x: 0, z: -26, name: '云香清胜' },
      { rank: 'side', x: 30, z: 0, name: '香雪廊' },
      { rank: 'xuan', x: 30, z: 18, name: '云霞舒卷' },
      { rank: 'pavilion', x: 0, z: 28, name: '汇万总春之庙' },
    ],
    named: ['濂溪乐处'],
    water: 'lake',
    rock: 0.5,
    grove: 'poplar',
  },

  日天琳宇: {
    // ⚠ 2026-11-23 考据补全：原 aux 只有 中后楼/西前楼/西后楼/楞严坛/瑞应宫，
    //   缺《宸垣识略》所记的「各有穿堂」「中前楼南有天桥，与楼相属，天桥东为灯亭」
    //   「西前楼南为东转角楼、西转角楼」。
    //   《宸垣识略》原文：「日天琳宇在汇芳书院之南，西前楼下之正宇也。其制有
    //   中前楼、中后楼、西前楼、西后楼，**各有穿堂**。中前楼南有**天桥**，与楼相属，
    //   **天桥东为灯亭**。西前楼南为**东转角楼、西转角楼**。」
    //   百度百科补充：偏西佛楼楼下殿悬乾隆御书"日天琳宇"；偏东佛楼外檐悬
    //   雍正御书"极乐世界"；东面建龙王庙（瑞应宫），山门悬雍正御书"瑞应宫"匾。
    note: '属皇家寺院建筑景观，初名佛楼，为御园内最大皇家寺院，其名与月地云居呼应',
    rank: 'hall',
    // 考据：中前楼、中后楼、西前楼、西后楼，前后楼间有穿堂，各楼之间以天桥相连
    // 主殿 = 中前楼（楼下的正宇，悬乾隆御书"日天琳宇"）
    main: {
      mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi',
      platform: 'xumizuo', eave: 9.5, tile: 'lv',
      // 主殿为佛楼：悬乾隆御书"日天琳宇"（考据实记）
      plaque: '日天琳宇',
    },
    aux: [
      { rank: 'side', x: 0, z: -26, name: '中后楼' },
      { rank: 'side', x: -30, z: -14, name: '西前楼' },
      { rank: 'side', x: -30, z: -36, name: '西后楼' },
      // 各有穿堂：前后楼之间的连接体。
      //   ⚠ 用 `corridor`（一间廊）而不是 `xuan`（三间轩）——
      //     穿堂在制度上就是**连接两楼的廊**，体量小、无独立台基；
      //     用 xuan 会变成一座小屋，与前后楼的屋面互相插进去。
      { rank: 'corridor', x: 0, z: -14, name: '中楼穿堂' },
      { rank: 'corridor', x: -30, z: -25, name: '西楼穿堂' },      // 中前楼南有天桥，与楼相属；天桥东为灯亭
      { rank: 'xuan', x: 0, z: 22, name: '天桥', plaque: '天桥' },
      { rank: 'pavilion', x: 16, z: 26, name: '灯亭' },
      // 西前楼南为东转角楼、西转角楼
      { rank: 'xuan', x: -22, z: 4, name: '东转角楼' },
      { rank: 'xuan', x: -44, z: 4, name: '西转角楼' },
      { rank: 'pavilion', x: 0, z: 34, name: '楞严坛' },
      // 瑞应宫（龙王庙），山门悬雍正御书"瑞应宫"匾
      { rank: 'xuan', x: 32, z: 14, name: '瑞应宫', plaque: '瑞应宫' },
    ],
    named: ['日天琳宇', '中前楼', '中后楼', '西前楼', '西后楼', '楞严坛', '瑞应宫', '灯亭'],
    water: 'pond',
    rock: 0.3,
    grove: 'pine',
  },

  汇芳书院: {
    note: '汇芳书院，建筑群呈眉月形布局，三面临水，功能兼具文化教育与休憩观景',
    rank: 'house',
    // 考据：平面为眉月形，内有抒藻轩、涵远楼、随安室
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'simple', eave: 6.4, tile: 'lv' },
    aux: [
      { rank: 'xuan', x: -26, z: 4, rot: 0.5, name: '抒藻轩' },
      { rank: 'tower', x: -14, z: 24, rot: 0.9, name: '涵远楼' },
      { rank: 'xuan', x: 14, z: 24, rot: 2.3, name: '随安室' },
      { rank: 'xuan', x: 26, z: 4, rot: -0.5, name: '随安室' },
      { rank: 'side', x: 0, z: -26, name: '书舍' },
    ],
    named: ['汇芳书院'],
    water: 'lake',
    rock: 0.2,
    grove: 'maple',
  },

  多稼如云: {
    note: '初名"观稼轩"，供帝后赏荷，其名取自陆游诗句，以稻田环绕，荷景为胜',
    rank: 'house',
    // 考据：正殿五楹，周围为稻田
    main: { mian: 5, jin: 3, roof: 'yingshan', caihua: 'su', platform: 'simple', eave: 6, tile: 'hui' },
    aux: [
      { rank: 'xuan', x: -20, z: 16, name: '观稼轩' },
      { rank: 'pavilion', x: 20, z: 14, name: '稻亭' },
    ],
    named: ['观稼轩'],
    water: 'pond',
    rock: 0.12,
    grove: 'blossom',
  },

  鱼跃鸢飞: {
    // ⚠ 2026-11-23 考据订正：原 note 只写"楼阁"、配殿只放了一个无名"亭"，
    //   与《日下旧闻考》原文对不上。现按原文补全：
    //   「多稼如云东北为鱼跃鸢飞，**四面为门，各五楹**。东厢为**畅观轩**，
    //     西南为**铺翠环流**，楼南有室为**传妙**，又南出山口为**多子亭**。」
    //   （《宸垣识略》：「鱼跃鸢飞东门额曰岚光曙色，南曰绮疏文……
    //     铺翠环流之北额曰溪山，曰曲径泉声与传妙，多子亭诸额皆世宗御书。」）
    note: '五楹方殿，四面为门。东厢为畅观轩，西南为铺翠环流，楼南有室为传妙，又南出山口为多子亭',
    rank: 'hall',
    // 考据实记：各五楹（面阔五间、进深五间 = "各五楹"），四面为门
    main: {
      mian: 5, jin: 5, roof: 'xieshan', caihua: 'xuanzi',
      platform: 'xumizuo', eave: 9.5, tile: 'lv',
      // ⚠ 四面为门（《日下旧闻考》实记）—— 见 structure.js 的 doorsAllSides
      doorsAllSides: true,
    },
    // 匾额题字（考据实记）：鱼跃鸢飞，额为世宗御书
    plaque: '鱼跃鸢飞',
    aux: [
      // 东厢为畅观轩
      { rank: 'xuan', x: 30, z: 0, name: '畅观轩' },
      // 西南为铺翠环流
      { rank: 'xuan', x: -26, z: 22, name: '铺翠环流' },
      // 楼南有室为传妙
      { rank: 'xuan', x: 0, z: 34, name: '传妙' },
      // 又南出山口为多子亭
      { rank: 'pavilion', x: 0, z: 52, name: '多子亭' },
    ],
    named: ['鱼跃鸢飞', '畅观轩', '铺翠环流', '传妙', '多子亭'],
    water: 'pond',
    rock: 0.45,
    grove: 'pine',
  },

  西峰秀色: {
    // ⚠ 2026-11-23 考据订正：原 mian:7 是错的。
    //   《日下旧闻考》卷五：「北远山村西南有室临河西向为西峰秀色，河西松峦峻峙，
    //   为小匡庐，后有龙王庙。**西峰秀色之东为含韵斋**，又东为一堂和气，
    //   又东南为自得轩。后垣东为岚镜舫，西为花港观鱼。」
    //   搜狗百科：「西峰秀色正殿为**五间三卷大殿**，外檐悬挂雍正御书"**含韵斋**"；
    //   含韵斋四周修有回廊。含韵斋西是一座临河敞厅，外檐悬雍正御笔"**西峰秀色**"。」
    //   ⇒ 主殿 = 含韵斋（**五间**，进深三卷），不是七间；
    //     「西峰秀色」是**含韵斋西临河敞厅**的额，不是主殿的额。
    note: '原为雍正年间建造的帝王寝宫区，四周环水，为园内赏花胜境',
    rank: 'hall',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9, tile: 'lv' },
    // 匾额题字（考据实记）：主殿含韵斋，雍正御书
    plaque: '含韵斋',

    aux: [
      // 含韵斋西的临河敞厅 —— 悬"西峰秀色"御笔（这一处才是"西峰秀色"的本名）
      { rank: 'xuan', x: -26, z: 10, name: '西峰秀色敞厅', plaque: '西峰秀色' },
      // 又东为一堂和气
      { rank: 'xuan', x: 26, z: 8, name: '一堂和气' },
      // 又东南为自得轩
      { rank: 'xuan', x: 26, z: 26, name: '自得轩' },
      // 后垣东为岚镜舫
      { rank: 'xuan', x: -26, z: 30, name: '岚镜舫' },
      // 河西松峦峻峙为小匡庐，后有龙王庙
      { rank: 'pavilion', x: -46, z: -8, name: '小匡庐' },
      { rank: 'pavilion', x: 0, z: -30, name: '龙王庙' },
    ],
    named: ['含韵斋', '西峰秀色', '一堂和气', '自得轩', '岚镜舫', '小匡庐', '龙王庙'],
    water: 'lake',
    rock: 0.4,
    grove: 'blossom',
  },

  坐石临流: {
    // ⚠ 2026-11-23 考据订正：原 note 里的「垂卫城」是「**舍卫城**」的误写。
    //   《日下旧闻考》卷五：「坐石临流轩宇三楹，西向……**再往北为舍卫城**。
    //   城系长方形，南北与东西之比为三比二，甃以砖壁，前树坊楔三。
    //   次多宝阁，祀关羽。阁北钟、鼓二楼，分立左右。次山门，门内正殿曰"寿国寿民"，
    //   后为仁慈殿，再后为普福宫。自正殿至此，各有东西配殿五间。最后曰景胜间。
    //   舍卫城之殿宇、房间、游廊、牌楼共为三百二十六间。」
    //   搜狗百科：「舍卫城是座典型的佛教建筑，俗称**佛城**。供奉城隍爷、关帝君、
    //   三世佛、弥勒佛等……逢皇帝、皇太后寿诞，王公大臣进奉各种精美佛像也存放于此。」
    //   ⇒ 坐石临流景内北侧有**舍卫城**（佛城），我们此前**整座漏建**。
    note: '该景由兰亭、把杯草堂、舍卫城、同乐园及……融合园林建筑与市井文化元素',
    rank: 'xuan',
    main: { mian: 5, jin: 3, roof: 'juanpeng', caihua: 'su', platform: 'simple', eave: 5.8, tile: 'hui' },
    aux: [
      { rank: 'house', x: -24, z: 8, name: '把杯草堂' },
      { rank: 'xuan', x: 24, z: 6, name: '兰亭' },
      { rank: 'side', x: -34, z: -20, name: '同乐园' },
      { rank: 'pavilion', x: 0, z: 28, name: '亭' },
      // ---- 舍卫城（佛城）：坐石临流之北 ----
      // 城系长方形（南北 : 东西 = 3 : 2），甃以砖壁，前树坊楔三。
      // 城内中轴：坊楔三 → 多宝阁 → 钟/鼓楼 → 山门 → 寿国寿民 → 仁慈殿 → 普福宫 → 景胜间
      { rank: 'gate', x: 0, z: -46, name: '舍卫城坊楔', mian: 3 },
      { rank: 'tower', x: 0, z: -56, name: '多宝阁', mian: 3 },
      { rank: 'pavilion', x: -12, z: -66, name: '钟楼' },
      { rank: 'pavilion', x: 12, z: -66, name: '鼓楼' },
      { rank: 'gate', x: 0, z: -74, name: '舍卫城门' },
      { rank: 'house', x: 0, z: -86, name: '寿国寿民殿', mian: 5 },
      { rank: 'house', x: 0, z: -100, name: '仁慈殿', mian: 5 },
      { rank: 'house', x: 0, z: -114, name: '普福宫', mian: 5 },
      { rank: 'house', x: 0, z: -128, name: '景胜间', mian: 5 },
      // 自正殿（寿国寿民）至此，各有东西配殿五间
      { rank: 'xuan', x: -24, z: -86, name: '配殿' },
      { rank: 'xuan', x: 24, z: -86, name: '配殿' },
      { rank: 'xuan', x: -24, z: -100, name: '配殿' },
      { rank: 'xuan', x: 24, z: -100, name: '配殿' },
      { rank: 'xuan', x: -24, z: -114, name: '配殿' },
      { rank: 'xuan', x: 24, z: -114, name: '配殿' },
    ],
    named: ['兰亭', '同乐园', '舍卫城', '多宝阁', '寿国寿民殿', '仁慈殿', '普福宫', '景胜间'],
    water: 'pond',
    rock: 0.55,
    grove: 'poplar',
  },

  曲院风荷: {
    note: '该景以九孔石桥为核心建筑，南北向贯穿荷花池，形成"日"字形布局',
    rank: 'xuan',
    // 考据：主要建筑为九孔石桥（金鳌玉蝀桥），北有麴院
    main: { mian: 3, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 5.2, tile: 'hui' },
    aux: [
      { rank: 'pavilion', x: -20, z: 18, name: '金鳌牌楼' },
      { rank: 'pavilion', x: 20, z: 18, name: '玉蝀牌楼' },
      { rank: 'xuan', x: 0, z: -22, name: '麴院' },
    ],
    named: ['九孔石桥', '金鳌玉蝀桥'],
    water: 'lake',
    rock: 0.15,
    grove: 'blossom',
  },

  /**
   * ⚠ 2026-11-11 **正名**：原来这条叫「同天深处」，是把**蓬岛瑶台**的注记整段抄了过来
   *   （note 一字不差）——「初名蓬莱洲…位于福海中央…三座山峦」说的其实是蓬岛瑶台。
   *   四十景里没有「同天深处」，有的是「**洞天深处**」。
   *   考据：「**洞天深处**，位于勤政亲贤以东，有**四座方形院落**，为皇子读书居住之所。
   *   东北为皇家画馆**如意馆**」；「本景主要为**东西二所**及**西部南北二岛**的上书房」。
   */
  洞天深处: {
    note: '位于勤政亲贤以东，有四座方形院落，为皇子读书居住之所；东北为皇家画馆如意馆。',
    rank: 'house',
    // ⚠ 屋面/瓦色**未载** ⇒ 按"上书房"（学宫书屋）的苏式彩画 + 灰瓦推定。
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 7.0, tile: 'hui' },
    aux: [
      { rank: 'side', x: 24, z: 0, name: '上书房（西所）' },
      { rank: 'side', x: -24, z: 26, name: '上书房（南岛）' },
      { rank: 'side', x: -24, z: -26, name: '上书房（北岛）' },
      { rank: 'xuan', x: 30, z: -30, name: '如意馆' },
    ],
    named: ['洞天深处'],
    // 四座方形院落分散在勤政亲贤以东 ⇒ 院子不宜过大
    yard: 26,
    rock: 0.12,
    grove: 'pine',
  },

  /**
   * 蓬岛瑶台 —— **福海中央的三岛（一大二小）**，大岛称"蓬莱洲"。
   *
   * 考据（北京旅游网《圆明园中这些"仙气"十足的地方》引乾隆《蓬岛瑶台》诗序
   *   与复原研究；《日下旧闻考》「园之东有东池…**蓬岛瑶台在海中央，内外周遭为桥者十一**」）：
   * - 三岛**一大二小**，象征**蓬莱、方丈、瀛洲**；**大岛坐中，形似正方，四周叠石成岸**；
   * - 岛上建筑**围合成方整的四合院**：
   *   **北为两卷七间正殿，前出五间抱厦**（清帝游岛常在此休息传膳）；
   *   **院南镜中阁、东畅襟楼、西神洲三岛殿**三面均为楼阁；
   * - 东西二小岛规模较小，**各有三座高台重檐亭子**，
   *   三岛间以**石拱桥、爬山廊、复廊**相连；
   * - 屋顶均用**五色斑斓的琉璃瓦**；乾隆诗序称"**金堂五所，玉楼十二**"。
   */
  蓬岛瑶台: {
    note:
      '福海中央三岛（一大二小），大岛称"蓬莱洲"，形似正方、四周叠石成岸；' +
      '岛上建筑围合成方整四合院：北为两卷七间正殿、前出五间抱厦，' +
      '院南镜中阁、东畅襟楼、西神洲三岛殿；东西二小岛各三座高台重檐亭子，' +
      '岛间以曲桥相连。屋顶用五色琉璃瓦。',
    rank: 'tower',
    main: { mian: 7, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9, tile: 'wuse' },
    aux: [
      // 《日下旧闻考》卷五：「门三楹，**南向**。正殿七楹。**殿前东为畅襟楼，
      // 西为神洲三岛，东偏为随安室，西偏为日日平安报好音**。」
      // ⇒ 门额曰「**镜中阁**」（御书），故"镜中阁"就是这座门，不是另有一阁。
      { rank: 'gate', x: 0, z: 16, name: '镜中阁（门三楹）', mian: 3 },
      { rank: 'xuan', x: 17, z: 12, name: '畅襟楼' }, // 殿前东
      { rank: 'side', x: -17, z: 12, name: '神洲三岛殿' }, // 殿前西
      { rank: 'xuan', x: 21, z: -7, name: '随安室' }, // 东偏
      { rank: 'pavilion', x: -21, z: -7, name: '日日平安报好音' }, // 西偏方亭
      // **东岛**（东南度桥过去）：「有亭为**瀛海仙山**」
      //   偏移按 OSM 实测东岛中心 (197,-291) 相对中岛 (137,-302) = (+60,+11)
      { rank: 'pavilion', x: 60, z: 11, name: '瀛海仙山' },
      // **北岛**（西北度桥过去）：「**正宇三楹**」
      //   偏移按 OSM 实测北岛中心 (94,-322) 相对中岛 = (-43,-20)
      { rank: 'side', x: -43, z: -20, name: '北岛正宇三楹' },
    ],
    named: ['蓬岛瑶台'],
    // 院落只圈**中岛上的四合院**（岛半径 28 m）；
    // 东西二小岛的建筑各自落在小岛上，不并进大院的墁砖地。
    yard: 21,
    /**
     * **曲桥十一座**（《日下尊闻录》「蓬岛瑶台在海中央，**内外周遭为桥者十一**」）。
     *
     * ⚠ **有据的只有两座**：东南度桥（→东岛，瀛海仙山）、西北度桥（→北岛，正宇三楹）
     *   —— 《日下旧闻考》《日下尊闻录》《宸垣识略》三处互证。
     * ⚠ **其余九座**：史料只给**总数十一**，未逐一记载桥名与位置
     *   （《日下旧闻考》《宸垣识略》《道咸以来朝野杂记》等均只记总数）。
     *   ⇒ 下面九座的**布局属推定**：按"周遭"环绕三岛外缘布置
     *   （大岛四段 + 东岛两段 + 北岛两段），另加一座**岛内天桥**（门↔正殿）。
     *
     * 坐标为**景的局部坐标**（原点＝中岛中心，+X 东、+Z 南）：
     *   大岛 (0,0) r=26 ｜ 东岛 (+60,+11) r=15 ｜ 北岛 (-43,-20) r=13
     */
    bridges: [
      // ① 有据：东南度桥 → 东岛
      { from: [27, 5], to: [46, 8.5], bow: 2.2, rise: 2.0, name: '东南度桥' },
      // ② 有据：西北度桥 → 北岛
      { from: [-23.5, -11], to: [-33.5, -16], bow: -1.6, rise: 1.3, name: '西北度桥' },
      // ③～⑥ 推定：大岛周遭四段（东→北→西→南，环岛外缘；端点落在岸上，
      //        桥跨过水面时由中段起拱 ⇒ 不能落在水里，否则整座桥沉到湖底）
      { from: [30, 0], to: [0, 30], bow: 3.0, rise: 0.9, overWater: true, name: '大岛周遭桥·东' },
      { from: [0, 30], to: [-30, 0], bow: 3.0, rise: 0.9, overWater: true, name: '大岛周遭桥·北' },
      { from: [-30, 0], to: [0, -30], bow: 3.0, rise: 0.9, overWater: true, name: '大岛周遭桥·西' },
      { from: [0, -30], to: [30, 0], bow: 3.0, rise: 0.9, overWater: true, name: '大岛周遭桥·南' },
      // ⑦～⑧ 推定：东岛周遭两段
      { from: [76, 11], to: [60, 27], bow: 2.0, rise: 0.8, overWater: true, name: '东岛周遭桥·北' },
      { from: [60, 27], to: [44, 11], bow: 2.0, rise: 0.8, overWater: true, name: '东岛周遭桥·南' },
      // ⑨～⑩ 推定：北岛周遭两段
      { from: [-55, -20], to: [-43, -32], bow: -1.8, rise: 0.7, overWater: true, name: '北岛周遭桥·西' },
      { from: [-43, -32], to: [-31, -20], bow: -1.8, rise: 0.7, overWater: true, name: '北岛周遭桥·东' },
      // ⑪ 推定：岛内天桥（门 ↔ 正殿，跨过前院；抬升 2.2 m 成"天桥"）
      { from: [0, 16], to: [0, 6], bow: 0, rise: 0, width: 2.4, lift: 2.2, name: '岛内天桥' },
    ],
    water: 'lake',
    rock: 0.55,
    grove: 'pine',
  },

  平湖秋月: {
    note: '仿杭州西湖同名景观而建，清代帝王常于中秋在此赏月，临水敞厅可观全湖',
    rank: 'xuan',
    // 考据：正殿三楹，后为流水音
    main: { mian: 3, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 5.6, tile: 'hui' },
    aux: [
      { rank: 'xuan', x: 0, z: -20, name: '流水音' },
      { rank: 'pavilion', x: -20, z: 18, name: '花屿兰皋' },
      { rank: 'xuan', x: 22, z: 16, name: '两峰插云' },
      { rank: 'xuan', x: 22, z: -14, name: '藏密楼' },
    ],
    named: ['平湖秋月'],
    water: 'lake',
    rock: 0.16,
    grove: 'willow',
  },

  四宜书屋: {
    note: '清帝的藏书读书处，收藏有《重刻淳化阁帖》，取"春宜花、夏宜风、秋宜月、冬宜雪"之意',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 6.4, tile: 'hui' },
    aux: [
      { rank: 'xuan', x: -20, z: 12, name: '书房' },
      { rank: 'pavilion', x: 20, z: 14, name: '亭' },
    ],
    named: ['四宜书屋'],
    water: 'pond',
    rock: 0.22,
    grove: 'maple',
  },

  北远山村: {
    note: '模仿渔村农舍的田野园景，建筑分布在河的两岸',
    rank: 'house',
    // 考据：兰野、绘雨精舍、水村图、稻凉楼、涉趣楼、湛虚书屋
    main: { mian: 5, jin: 3, roof: 'yingshan', caihua: 'su', platform: 'simple', eave: 5.6, tile: 'hui' },
    aux: [
      { rank: 'house', x: -22, z: 14, name: '兰野' },
      { rank: 'house', x: 22, z: -12, name: '绘雨精舍' },
      { rank: 'house', x: 10, z: 26, name: '水村图' },
      { rank: 'house', x: -12, z: -22, name: '稻凉楼' },
      { rank: 'xuan', x: 26, z: 20, name: '涉趣楼' },
      { rank: 'xuan', x: -28, z: 2, name: '湛虚书屋' },
    ],
    named: [],
    water: 'river',
    rock: 0.3,
    grove: 'poplar',
  },

  廓然大公: {
    note: '仿无锡惠山寄畅园而建',
    rank: 'hall',
    // 考据：正殿为双鹤斋，七楹；北为采芝径、峭茜居，西为环秀山房、临河画
    main: { mian: 7, jin: 5, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9.5, tile: 'lv' },
    aux: [
      { rank: 'xuan', x: -20, z: -30, name: '采芝径' },
      { rank: 'xuan', x: 20, z: -30, name: '峭茜居' },
      { rank: 'side', x: -34, z: 0, name: '环秀山房' },
      { rank: 'xuan', x: -34, z: 22, name: '临河画' },
    ],
    named: ['双鹤斋'],
    water: 'pond',
    rock: 0.95,
    grove: 'pine',
  },

  澡身浴德: {
    // ⚠ 2026-11-23 考据订正：原 note 是从百度百科摘的，但截断在"……"处、
    //   且"福海干北"方位有误（考据是**福海西南/西岸南侧**，非干北）。
    //   《日下旧闻考》与百度百科均记：本景由三组建筑构成 ——
    //   ① 澄虚榭（正殿，三楹，南向含清晖、北向含妙识、西南静香书馆）
    //   ② 望瀛洲（澄虚榭北面高台方亭，乾隆/道光/咸丰朝端午观龙舟处）
    //   ③ 深柳读书堂（望瀛洲西北土山环抱中，康熙时已有）
    note: '名源自儒家经典《礼记·儒行》"澡身而浴德"，寓指修身养德。原名涵虚朗鉴，乾隆九年定名；正殿澄虚榭三楹，北有望瀛洲方亭，端午于此观福海龙舟竞渡',
    rank: 'xuan',
    // 考据：正殿澄虚榭，三楹；南为含清晖，北为含妙识
    main: { mian: 3, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'simple', eave: 5.6, tile: 'lv' },
    // 匾额题字（考据实记）
    plaque: '澄虚榭',

    aux: [
      { rank: 'xuan', x: 0, z: 20, name: '含清晖' },
      { rank: 'xuan', x: 0, z: -20, name: '含妙识' },
      { rank: 'xuan', x: -26, z: -6, name: '静香书馆' },
      // 澄虚榭北面、建于高台上的方亭：望瀛洲（乾隆/道光/咸丰朝端午观龙舟处）
      { rank: 'pavilion', x: 0, z: -38, name: '望瀛洲' },
      // 望瀛洲西北、土山环抱中的深柳读书堂（康熙时已有）
      { rank: 'house', x: -30, z: -52, name: '深柳读书堂' },
    ],
    named: ['澄虚榭', '含清晖', '含妙识', '静香书馆', '望瀛洲', '深柳读书堂'],
    water: 'lake',
    rock: 0.2,
    grove: 'pine',
  },

  夹镜鸣琴: {
    note: '水中镜亭，以水为镜',
    rank: 'pavilion',
    // 考据：横跨水上的桥亭
    main: { mian: 1, jin: 1, roof: 'zanjiandian', caihua: 'su', platform: 'simple', eave: 5, circular: true, tile: 'hui' },
    aux: [
      { rank: 'pavilion', x: 20, z: 16, name: '南屏晚钟' },
      { rank: 'xuan', x: -20, z: 16, name: '湖山在望' },
    ],
    named: ['夹镜鸣琴'],
    water: 'lake',
    rock: 0.25,
    grove: 'willow',
  },

  别有洞天: {
    note: '初名秀清村，该景观为道教建筑群，雍正时期曾作为炼丹场所',
    rank: 'house',
    // 考据：纳翠楼、水木清华之阁、时赏斋、石舫
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 6.6, tile: 'lv' },
    aux: [
      { rank: 'tower', x: 24, z: -16, name: '纳翠楼' },
      { rank: 'side', x: -22, z: 16, name: '水木清华之阁' },
      { rank: 'xuan', x: 0, z: 30, name: '时赏斋' },
      { rank: 'pavilion', x: -14, z: -24, name: '石舫' },
    ],
    named: ['别有洞天'],
    water: 'pond',
    rock: 0.72,
    grove: 'pine',
  },

  接秀山房: {
    note: '前临后湖澄碧，远望西山秀色',
    rank: 'house',
    // 考据：正殿三楹，旁有琴趣轩、寻云楼、澄练楼、怡然书屋、安隐幢
    main: { mian: 3, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 6, tile: 'hui' },
    aux: [
      { rank: 'xuan', x: -20, z: 14, name: '琴趣轩' },
      { rank: 'tower', x: 20, z: -12, name: '寻云楼' },
      { rank: 'xuan', x: 20, z: 16, name: '澄练楼' },
      { rank: 'xuan', x: -20, z: -14, name: '怡然书屋' },
      { rank: 'pavilion', x: 0, z: 26, name: '安隐幢' },
    ],
    named: ['接秀山房'],
    water: 'lake',
    rock: 0.3,
    grove: 'poplar',
  },

  涵虚朗鉴: {
    note: '仿杭州西湖雷峰夕照建造，采用"因水成景，借景西山"的造景手法',
    rank: 'xuan',
    // 考据：正殿称雷峰夕照；北为惠如春、寻云榭、会心不远
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 6, tile: 'hui' },
    // 匾额题字（考据实记）
    plaque: '雷峰夕照',

    aux: [
      { rank: 'xuan', x: -20, z: -18, name: '惠如春' },
      { rank: 'xuan', x: 0, z: -22, name: '寻云榭' },
      { rank: 'xuan', x: 20, z: -18, name: '会心不远' },
      { rank: 'pavilion', x: 20, z: 18, name: '云锦墅' },
    ],
    named: ['雷峰夕照'],
    water: 'lake',
    rock: 0.22,
    grove: 'willow',
  },

  方壶胜境: {
    note: '福海北岸的三层方形楼阁。亭后过桥为方壶胜境正殿，二层楼宇，前后各五楹',
    rank: 'tower',
    // 考据：三层重檐大亭 + 二层楼宇（哕鸾殿、琼华楼），彩色琉璃瓦
    main: { mian: 5, jin: 5, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 11, tile: 'wuse', doubleEave: true },
    // 匾额题字（考据实记）
    plaque: '哕鸾殿',

    aux: [
      { rank: 'pavilion', x: 0, z: 34, name: '重檐大亭', mian: 3, eave: 7 },
      { rank: 'pavilion', x: -24, z: 30, name: '重檐大亭', mian: 3, eave: 7 },
      { rank: 'pavilion', x: 24, z: 30, name: '重檐大亭', mian: 3, eave: 7 },
      { rank: 'side', x: 0, z: -22, name: '琼华楼' },
      { rank: 'xuan', x: 34, z: 2, name: '蕊珠宫' },
      { rank: 'xuan', x: -34, z: 2, name: '三潭印月' },
    ],
    named: ['方壶胜境', '哕鸾殿', '琼华楼'],
    water: 'lake',
    rock: 0.18,
    grove: 'pine',
  },

  谐奇趣: {
    note: '西洋楼景区主景，中国式屋顶配西洋内部陈设',
    rank: 'hall',
    // 西洋楼谐奇趣见 western.js（庑殿顶、红琉璃），此处仅为九州景区的同名景
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'simple', eave: 8, tile: 'lv' },
    aux: [
      { rank: 'pavilion', x: 22, z: 14, name: '亭' },
      { rank: 'xuan', x: -22, z: 14, name: '轩' },
    ],
    named: ['谐奇趣'],
    water: 'pond',
    rock: 0.1,
    grove: 'maple',
  },

  // ⚠ 非四十景并入（2026-11-24）：思永斋等导览图有标、但不在四十景之列的景点。
  //   直接放进 SCENE_PROGRAM ⇒ layout.js / figures.js / build-scene.mjs 等
  //   所有按 `SCENE_PROGRAM[scene.name]` 取景的地方**不用改**就能拿到。
  ...EXTRA_SCENES,
};

/**
 * ⚠ **非四十景**：园内另有若干景点，官方导览图上也标了名，但**不在**乾隆《四十景图》之列。
 * 2026-11-24 逐处查证后，这几处的真相是：
 *
 * | 导览图标注 | 真相 | 处置 |
 * |---|---|---|
 * | **紫碧山房** | 鸿慈永祜（安佑宫）北面的建筑 | **已建**（安佑宫的配建筑）—— 从来不是缺口 |
 * | **含卫城** | 「**舍卫城**」的误写（坐石临流景内的佛城） | 已正名并**补建**到坐石临流 |
 * | **涵月楼** | 「**上下天光**」景的主体建筑 | 已改：上下天光主殿即涵月楼 |
 * | **思永斋** | 含经堂西的独立小园（**不是**四十景） | **在此新建** |
 * | **涵月楼** | 同上（导览图与思永斋相邻，两处都在长春园西北） | — |
 */
/** 视频中的四十景出场顺序 */
export const SCENE_ORDER = [
  '正大光明', '九洲清晏', '勤政亲贤', '镂月开云', '天然图画', '碧桐书院',
  '慈云普护', '上下天光', '杏花春馆', '坦坦荡荡', '茹古涵今', '长春仙馆',
  '山高水长', '万方安和', '月地云居', '鸿慈永祜', '武陵春色', '映水兰香',
  '澹泊宁静', '水木明瑟', '濂溪乐处', '日天琳宇', '汇芳书院', '多稼如云',
  '鱼跃鸢飞', '西峰秀色', '坐石临流', '曲院风荷', '洞天深处', '蓬岛瑶台',
  '平湖秋月', '四宜书屋', '北远山村', '廓然大公', '澡身浴德', '夹镜鸣琴',
  '别有洞天', '接秀山房', '涵虚朗鉴', '方壶胜境', '谐奇趣',
  // ⚠ 非四十景（导览图有名、圆明园四十景图中无）
  '思永斋',
];
