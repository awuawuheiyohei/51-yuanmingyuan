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
  hui:   { glazed: false, color: '#9aa2a8' }, // 灰瓦（青瓦）
  huang: { glazed: true,  color: '#d9a419' }, // 黄琉璃
  lv:    { glazed: true,  color: '#2f7a4a' }, // 绿琉璃
  keque: { glazed: true,  color: '#1d8b81' }, // 孔雀绿琉璃
  lan:   { glazed: true,  color: '#2a5f9c' }, // 蓝琉璃
  hong:  { glazed: true,  color: '#a83a2e' }, // 红琉璃
  jin:   { glazed: true,  color: '#c8a02a' }, // 金（鱼鳞金瓦）
  jinbi: { glazed: true,  color: '#c09a2c' }, // 金碧二色琉璃
  // 五色琉璃（红紫孔雀蓝粉天青）：整片屋顶做成单色会失真，
  // 取其中最中性的孔雀蓝作主体，宝顶用金色，五色感由脊饰与斗栱彩画承担。
  wuse:  { glazed: true,  color: '#2f7d8c' },
};

export const SCENE_PROGRAM = {
  正大光明: {
    note: '圆明园四十景之首。为清代帝王举行朝会、接见外使的正殿，功能类似紫禁城太和殿',
    rank: 'hall',
    // 考据：面阔七间、进深五间，前后有出廊，灰瓦，卷棚歇山顶
    main: { mian: 7, jin: 5, roof: 'juanpengxieshan', caihua: 'hexi', platform: 'xumizuo', eave: 10.5, tile: 'hui' },
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

  九州清晏: {
    note: '清代帝后的寝宫核心区。三进南向大殿：圆明园殿—奉三无私殿—九州清晏殿',
    rank: 'grand',
    main: { mian: 7, jin: 5, roof: 'xieshan', caihua: 'hexi', platform: 'xumizuo', eave: 11, tile: 'huang' },
    aux: [
      // 考据：三进大殿，最前圆明园殿五楹 → 奉三无私殿七楹 → 九州清晏殿七楹
      { rank: 'hall', x: 0, z: 46, name: '圆明园殿', mian: 5, jin: 3, eave: 8.5 },
      { rank: 'hall', x: 0, z: 18, name: '奉三无私殿', mian: 7, jin: 5, eave: 9.5 },
      { rank: 'side', x: -36, z: 0, name: '天地一家春' },
      { rank: 'side', x: 36, z: 0, name: '乐安和' },
      { rank: 'tower', x: -52, z: -8, name: '清晖阁' },
      { rank: 'xuan', x: -52, z: 16, name: '露香斋' },
      { rank: 'xuan', x: 52, z: 14, name: '怡情书史' },
    ],
    named: ['圆明园殿', '奉三无私殿', '九州清晏殿'],
    water: 'lake',
    rock: 0.1,
    grove: 'willow',
  },

  勤政亲贤: {
    note: '清代帝王在园内处理政务的核心区域，功能类似紫禁城养心殿',
    rank: 'hall',
    // 考据：殿为五楹
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'hexi', platform: 'xumizuo', eave: 9, tile: 'hui' },
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
    note: '为中秋赏月场所，得名于范仲淹《岳阳楼记》中的"上下天光"',
    rank: 'house',
    // 考据：临湖楼房，上下三楹，左右有亭，楼后为平安院
    main: { mian: 3, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 6.4, tile: 'hui' },
    aux: [
      { rank: 'pavilion', x: -22, z: 6, name: '亭' },
      { rank: 'pavilion', x: 22, z: 6, name: '亭' },
      { rank: 'house', x: 0, z: -26, name: '平安院' },
    ],
    named: ['上下天光楼'],
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

  日光琳宇: {
    note: '属皇家寺院建筑景观，初名佛楼，为御园内最大皇家寺院，其名与月地云居呼应',
    rank: 'hall',
    // 考据：中前楼、中后楼、西前楼、西后楼，前后楼间有穿堂，各楼之间以天桥相连
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9.5, tile: 'lv' },
    aux: [
      { rank: 'side', x: 0, z: -26, name: '中后楼' },
      { rank: 'side', x: -30, z: -14, name: '西前楼' },
      { rank: 'side', x: -30, z: -34, name: '西后楼' },
      { rank: 'pavilion', x: 0, z: 32, name: '楞严坛' },
      { rank: 'xuan', x: 28, z: 18, name: '瑞应宫' },
    ],
    named: ['日光琳宇'],
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

  跃鸾飞: {
    note: '楼阁',
    rank: 'tower',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9.5, tile: 'lv' },
    aux: [{ rank: 'pavilion', x: 20, z: 16, name: '亭' }],
    named: ['跃鸾飞楼'],
    water: 'pond',
    rock: 0.45,
    grove: 'pine',
  },

  西峰秀: {
    note: '原为雍正年间建造的帝王寝宫区，四周环水，为园内赏花胜境',
    rank: 'hall',
    // 考据：西面隔河为小匡庐，东为含韵轩、一堂和气、自得轩、岚镜舫
    main: { mian: 7, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9, tile: 'lv' },
    aux: [
      { rank: 'xuan', x: 26, z: 8, name: '含韵轩' },
      { rank: 'xuan', x: 26, z: 26, name: '一堂和气' },
      { rank: 'xuan', x: -26, z: 10, name: '自得轩' },
      { rank: 'xuan', x: -26, z: 28, name: '岚镜舫' },
      { rank: 'pavilion', x: 0, z: -30, name: '龙王庙' },
    ],
    named: ['西峰秀色'],
    water: 'lake',
    rock: 0.4,
    grove: 'blossom',
  },

  坐石临流: {
    note: '该景由兰亭、把杯草堂、垂卫城、同乐园及……融合园林建筑与市井文化元素',
    rank: 'xuan',
    main: { mian: 5, jin: 3, roof: 'juanpeng', caihua: 'su', platform: 'simple', eave: 5.8, tile: 'hui' },
    aux: [
      { rank: 'house', x: -24, z: 8, name: '把杯草堂' },
      { rank: 'xuan', x: 24, z: 6, name: '兰亭' },
      { rank: 'side', x: -34, z: -20, name: '同乐园' },
      { rank: 'pavilion', x: 0, z: 28, name: '亭' },
    ],
    named: ['兰亭', '同乐园'],
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

  同天深处: {
    note: '初名蓬莱洲，参照唐代画家李思训"仙山楼阁"，位于福海中央，由象征蓬莱、方丈、瀛洲的三座……',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 7.5, tile: 'wuse' },
    aux: [{ rank: 'pavilion', x: 20, z: 16, name: '亭' }],
    named: ['同天深处'],
    water: 'lake',
    rock: 0.6,
    grove: 'pine',
  },

  蓬岛瑶台: {
    note: '初名蓬莱洲，参照唐代画家李思训"仙山楼阁"，位于福海中央',
    rank: 'tower',
    // 考据：中央岛屿有门三楹、正殿七楹；东岛瀛海仙山，北岛北屿仙居；彩色琉璃瓦
    main: { mian: 7, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9, tile: 'wuse' },
    aux: [
      { rank: 'gate', x: 0, z: 30, name: '门', mian: 3 },
      { rank: 'side', x: -28, z: -4, name: '神州三岛殿' },
      { rank: 'xuan', x: 28, z: -4, name: '随安室' },
      { rank: 'pavilion', x: 44, z: 10, name: '瀛海仙山' },
      { rank: 'pavilion', x: -46, z: 12, name: '北屿仙居' },
    ],
    named: ['蓬岛瑶台'],
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

  宜书房: {
    note: '清帝的藏书读书处，收藏有《重刻淳化阁帖》，取"春宜花、夏宜风、秋宜月、冬宜雪"之意',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 6.4, tile: 'hui' },
    aux: [
      { rank: 'xuan', x: -20, z: 12, name: '书房' },
      { rank: 'pavilion', x: 20, z: 14, name: '亭' },
    ],
    named: ['宜书房'],
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

  洁身浴德: {
    note: '名源自儒家经典，寓指修身养德盛时，每逢端午节常在福海干北景附近举办……',
    rank: 'xuan',
    // 考据：正殿澄虚榭，三楹；南为含清晖，北为含妙识
    main: { mian: 3, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'simple', eave: 5.6, tile: 'lv' },
    aux: [
      { rank: 'xuan', x: 0, z: 20, name: '含清晖' },
      { rank: 'xuan', x: 0, z: -20, name: '含妙识' },
      { rank: 'xuan', x: -26, z: -6, name: '静香书馆' },
    ],
    named: ['澄虚榭'],
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
};

/** 视频中的四十景出场顺序 */
export const SCENE_ORDER = [
  '正大光明', '九州清晏', '勤政亲贤', '镂月开云', '天然图画', '碧桐书院',
  '慈云普护', '上下天光', '杏花春馆', '坦坦荡荡', '茹古涵今', '长春仙馆',
  '山高水长', '万方安和', '月地云居', '鸿慈永祜', '武陵春色', '映水兰香',
  '澹泊宁静', '水木明瑟', '濂溪乐处', '日光琳宇', '汇芳书院', '多稼如云',
  '跃鸾飞', '西峰秀', '坐石临流', '曲院风荷', '同天深处', '蓬岛瑶台',
  '平湖秋月', '宜书房', '北远山村', '廓然大公', '洁身浴德', '夹镜鸣琴',
  '别有洞天', '接秀山房', '涵虚朗鉴', '方壶胜境', '谐奇趣',
];
