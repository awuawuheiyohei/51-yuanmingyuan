/**
 * 逐景考证配置表
 *
 * 说明文字来自参考视频《圆明园，它的规模可能超出你的想象，一镜到底数字复原》
 * （UP 主：见筑师）画面内的四十景解说词，该视频自述参照《圆明园四十景图》、
 * 西洋楼透视图与圆明园版画制作，可作为一手的复原依据。
 * 四十景名单与出现顺序亦按该视频核对。
 *
 * 每景给出：
 *   note   考证解说词（原文）
 *   rank   主建筑等级（grand/hall/side/house/xuan/pavilion/tower/gate）
 *   main   主建筑形制：开间、进深、屋顶、彩画、台基、檐高
 *   aux    配建筑群：形制 + 相对主建筑的方位（米）
 *   named  景内有名建筑（解说词明确提到的）
 *   water  水景：'lake' 大湖 / 'pond' 池 / 'river' 河渠 / null
 *   rock   假山强度 0~1（决定叠山体量与范围）
 *   grove  林相：主栽树种
 *
 * ⚠ 建筑数量与尺度为依据解说词的合理复原，不是样式雷图级别的测绘数据。
 */

export const SCENE_PROGRAM = {
  正大光明: {
    note: '圆明园四十景之首。为清代帝王举行朝会、接见外使的正殿，功能类似紫禁城太和殿',
    rank: 'grand',
    main: { mian: 9, jin: 5, roof: 'xieshan', caihua: 'hexi', platform: 'xumizuo', eave: 11.5 },
    aux: [
      { rank: 'side', x: -34, z: -30 },
      { rank: 'side', x: 34, z: -30 },
      { rank: 'gate', x: 0, z: 42 },
      { rank: 'xuan', x: -20, z: 34 },
      { rank: 'xuan', x: 20, z: 34 },
    ],
    named: ['圆明园殿'],
    water: null,
    rock: 0.12,
    grove: 'pine',
  },

  九州清晏: {
    note: '清代帝后的寝宫核心区。主体建筑包括圆明园殿、奉三无私殿及九洲清晏殿',
    rank: 'grand',
    main: { mian: 9, jin: 5, roof: 'xieshan', caihua: 'hexi', platform: 'xumizuo', eave: 11 },
    aux: [
      { rank: 'hall', x: -40, z: -22 },
      { rank: 'hall', x: 40, z: -22 },
      { rank: 'side', x: -22, z: 34 },
      { rank: 'side', x: 22, z: 34 },
      { rank: 'gate', x: 0, z: 46 },
    ],
    named: ['圆明园殿', '奉三无私殿', '九洲清晏殿'],
    water: 'lake',
    rock: 0.1,
    grove: 'willow',
  },

  勤政亲贤: {
    note: '清代帝王在园内处理政务的核心区域，功能类似紫禁城养心殿',
    rank: 'hall',
    main: { mian: 7, jin: 5, roof: 'xieshan', caihua: 'hexi', platform: 'xumizuo', eave: 9.5 },
    aux: [
      { rank: 'side', x: -30, z: 8 },
      { rank: 'xuan', x: 30, z: 8 },
      { rank: 'gate', x: 0, z: 38 },
    ],
    named: ['勤政殿', '亲贤殿'],
    water: null,
    rock: 0.18,
    grove: 'pine',
  },

  镂月开云: {
    note: '殿宇与山峦相叠，云影镂月',
    rank: 'hall',
    main: { mian: 7, jin: 5, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9.5 },
    aux: [
      { rank: 'tower', x: 26, z: -26 },
      { rank: 'xuan', x: -24, z: 20 },
      { rank: 'pavilion', x: 0, z: 34 },
    ],
    named: ['镂月开云殿'],
    water: 'pond',
    rock: 0.8,
    grove: 'pine',
  },

  天然图画: {
    note: '近西峰，天然图画楼',
    rank: 'hall',
    main: { mian: 7, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9 },
    aux: [
      { rank: 'tower', x: 28, z: -10 },
      { rank: 'xuan', x: -26, z: 16 },
      { rank: 'pavilion', x: 4, z: 30 },
    ],
    named: ['天然图画楼'],
    water: 'pond',
    rock: 0.62,
    grove: 'pine',
  },

  碧桐书院: {
    note: '为清代皇家书房建筑群，四面环山，遍植梧桐，形成清凉庭园空间',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'yingshan', caihua: 'su', platform: 'simple', eave: 6.2 },
    aux: [
      { rank: 'xuan', x: -22, z: 6 },
      { rank: 'xuan', x: 22, z: 6 },
      { rank: 'house', x: 0, z: -26 },
      { rank: 'pavilion', x: -14, z: 26 },
    ],
    named: ['碧桐书院'],
    water: 'pond',
    rock: 0.35,
    grove: 'maple',
  },

  慈云普护: {
    note: '佛堂香火，阁楼对峙',
    rank: 'hall',
    main: { mian: 7, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9 },
    aux: [
      { rank: 'tower', x: 26, z: -12 },
      { rank: 'pavilion', x: -22, z: 18 },
      { rank: 'gate', x: 0, z: 34 },
    ],
    named: ['慈云普护殿'],
    water: 'pond',
    rock: 0.3,
    grove: 'pine',
  },

  上下天光: {
    note: '为中秋赏月场所，得名于范仲淹《岳阳楼记》中的"上下天光"',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'juanpeng', caihua: 'su', platform: 'simple', eave: 6.4 },
    aux: [
      { rank: 'tower', x: 24, z: -18 },
      { rank: 'xuan', x: -24, z: 12 },
      { rank: 'pavilion', x: 0, z: 30 },
    ],
    named: ['上下天光楼'],
    water: 'lake',
    rock: 0.22,
    grove: 'willow',
  },

  杏花春馆: {
    note: '杏花村舍',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'yingshan', caihua: 'su', platform: 'simple', eave: 6 },
    aux: [
      { rank: 'xuan', x: -20, z: 14 },
      { rank: 'pavilion', x: 20, z: 10 },
      { rank: 'house', x: 4, z: -22 },
    ],
    named: ['杏花春馆'],
    water: 'pond',
    rock: 0.18,
    grove: 'blossom',
  },

  坦坦荡荡: {
    note: '初名"金鱼池"，以凿池观鱼为主题，仿杭州西湖"玉泉鱼跃"景观建造',
    rank: 'xuan',
    main: { mian: 3, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 5.6 },
    aux: [
      { rank: 'pavilion', x: -18, z: 20 },
      { rank: 'pavilion', x: 18, z: 20 },
    ],
    named: ['金鱼池'],
    water: 'lake',
    rock: 0.05,
    grove: 'willow',
  },

  茹古涵今: {
    note: '为清朝皇帝冬日读书场所，命名出自唐《韩文公墓志铭》，取"博学通晓古今"',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'yingshan', caihua: 'su', platform: 'simple', eave: 6.2 },
    aux: [
      { rank: 'xuan', x: -20, z: 16 },
      { rank: 'xuan', x: 20, z: 16 },
      { rank: 'house', x: 0, z: -24 },
    ],
    named: ['茹古涵今斋'],
    water: 'pond',
    rock: 0.2,
    grove: 'pine',
  },

  长春仙馆: {
    note: '四周山水环绕，初名"莲花馆"，雍正十年，开始作为皇子弘历（乾隆）的居所',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'simple', eave: 6.8 },
    aux: [
      { rank: 'side', x: -24, z: 4 },
      { rank: 'xuan', x: 24, z: 4 },
      { rank: 'pavilion', x: 0, z: 26 },
    ],
    named: ['长春仙馆'],
    water: 'lake',
    rock: 0.28,
    grove: 'poplar',
  },

  山高水长: {
    note: '俗称"西园"或"西苑"，兼具皇家禁军操练与骑射比赛功能',
    rank: 'hall',
    main: { mian: 7, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9 },
    aux: [
      { rank: 'side', x: -30, z: 22 },
      { rank: 'pavilion', x: 30, z: 22 },
      { rank: 'gate', x: 0, z: 40 },
    ],
    named: ['山高水长楼', '碑亭'],
    water: null,
    rock: 0.3,
    grove: 'pine',
  },

  万方安和: {
    note: '万方安和，禅意小景',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'juanpeng', caihua: 'su', platform: 'simple', eave: 6 },
    aux: [{ rank: 'xuan', x: -18, z: 16 }],
    named: ['万方安和殿'],
    water: 'pond',
    rock: 0.18,
    grove: 'maple',
  },

  月地云居: {
    note: '佛寺园林建筑群，俗称"清净地"，其名与"日天琳宇"呼应体现阴阳融合意境',
    rank: 'hall',
    main: { mian: 7, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9 },
    aux: [
      { rank: 'tower', x: 26, z: -14 },
      { rank: 'pavilion', x: -22, z: 18 },
    ],
    named: ['月地云居'],
    water: 'pond',
    rock: 0.32,
    grove: 'pine',
  },

  鸿慈永祜: {
    note: '安佑宫，位于园内西北隅的皇家祖祠，主体建筑为园内规制最高的建筑',
    rank: 'grand',
    main: { mian: 9, jin: 5, roof: 'xieshan', caihua: 'hexi', platform: 'xumizuo', eave: 12.5 },
    aux: [
      { rank: 'side', x: -36, z: -22 },
      { rank: 'side', x: 36, z: -22 },
      { rank: 'gate', x: 0, z: 44 },
    ],
    named: ['安佑宫'],
    water: null,
    rock: 0.2,
    grove: 'pine',
  },

  武陵春色: {
    note: '桃花源景，渔家村舍',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'yingshan', caihua: 'su', platform: 'simple', eave: 5.8 },
    aux: [
      { rank: 'xuan', x: -20, z: 14 },
      { rank: 'pavilion', x: 20, z: 12 },
    ],
    named: ['武陵春色馆'],
    water: 'river',
    rock: 0.35,
    grove: 'blossom',
  },

  映水兰香: {
    note: '水榭临流，兰香映水',
    rank: 'xuan',
    main: { mian: 3, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 5.2 },
    aux: [{ rank: 'pavilion', x: 18, z: 16 }],
    named: ['映水兰香'],
    water: 'lake',
    rock: 0.16,
    grove: 'willow',
  },

  澹泊宁静: {
    note: '其名取自诸葛亮《诫子书》"非淡泊无以明志，非宁静无以致远"，核心建筑为"四"字形土殿（四宜堂）',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'yingshan', caihua: 'su', platform: 'simple', eave: 6 },
    aux: [
      { rank: 'xuan', x: -20, z: 12 },
      { rank: 'xuan', x: 20, z: 12 },
    ],
    named: ['四宜堂'],
    water: 'pond',
    rock: 0.4,
    grove: 'pine',
  },

  水木明瑟: {
    note: '仿扬州水竹居，室内用西洋式水力机械驱动风扇',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'juanpeng', caihua: 'su', platform: 'simple', eave: 6.2 },
    aux: [{ rank: 'xuan', x: -18, z: 14 }],
    named: ['水木明瑟'],
    water: 'lake',
    rock: 0.18,
    grove: 'willow',
  },

  濂溪乐处: {
    note: '园内最大的园中之园，其以湖心岛为核心，山水环绕',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'yingshan', caihua: 'su', platform: 'simple', eave: 6.2 },
    aux: [
      { rank: 'xuan', x: -22, z: 10 },
      { rank: 'pavilion', x: 22, z: 12 },
      { rank: 'house', x: 0, z: -26 },
    ],
    named: ['濂溪乐处'],
    water: 'lake',
    rock: 0.5,
    grove: 'poplar',
  },

  日光琳宇: {
    note: '属皇家寺院建筑景观，初名佛楼，为御园内最大皇家寺院，其名与月地云居呼应',
    rank: 'hall',
    main: { mian: 7, jin: 5, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9.5 },
    aux: [
      { rank: 'tower', x: 26, z: -18 },
      { rank: 'side', x: -26, z: -14 },
      { rank: 'pavilion', x: 0, z: 32 },
    ],
    named: ['日光琳宇'],
    water: 'pond',
    rock: 0.3,
    grove: 'pine',
  },

  汇芳书院: {
    note: '汇芳书院，建筑群呈眉月形布局，三面临水，功能兼具文化教育与休憩观景',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'yingshan', caihua: 'su', platform: 'simple', eave: 6.2 },
    aux: [
      { rank: 'xuan', x: -26, z: 4, rot: 0.5 },
      { rank: 'xuan', x: -14, z: 24, rot: 0.9 },
      { rank: 'xuan', x: 14, z: 24, rot: 2.3 },
      { rank: 'xuan', x: 26, z: 4, rot: -0.5 },
      { rank: 'side', x: 0, z: -26 },
    ],
    named: ['汇芳书院'],
    water: 'lake',
    rock: 0.2,
    grove: 'maple',
  },

  多稼如云: {
    note: '初名"观稼轩"，供帝后赏荷，其名取自陆游诗句，以稻田环绕，荷景为胜',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 6.2 },
    aux: [
      { rank: 'xuan', x: -20, z: 16 },
      { rank: 'pavilion', x: 20, z: 14 },
    ],
    named: ['观稼轩'],
    water: 'pond',
    rock: 0.12,
    grove: 'blossom',
  },

  跃鸾飞: {
    note: '楼阁',
    rank: 'tower',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9.5 },
    aux: [{ rank: 'pavilion', x: 20, z: 16 }],
    named: ['跃鸾飞楼'],
    water: 'pond',
    rock: 0.45,
    grove: 'pine',
  },

  西峰秀: {
    note: '原为雍正年间建造的帝王寝宫区，四周环水，为园内赏花胜境',
    rank: 'hall',
    main: { mian: 7, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9 },
    aux: [
      { rank: 'side', x: -26, z: 10 },
      { rank: 'xuan', x: 26, z: 10 },
    ],
    named: ['西峰秀'],
    water: 'lake',
    rock: 0.4,
    grove: 'blossom',
  },

  坐石临流: {
    note: '该景由兰亭、把杯草堂、垂卫城、同乐园及……融合园林建筑与市井文化元素',
    rank: 'xuan',
    main: { mian: 5, jin: 3, roof: 'juanpeng', caihua: 'su', platform: 'simple', eave: 5.8 },
    aux: [
      { rank: 'house', x: -24, z: 8 },
      { rank: 'xuan', x: 24, z: 6 },
      { rank: 'pavilion', x: 0, z: 28 },
      { rank: 'gate', x: -10, z: -24 },
    ],
    named: ['兰亭', '把杯草堂', '垂卫城', '同乐园'],
    water: 'pond',
    rock: 0.55,
    grove: 'poplar',
  },

  曲院风荷: {
    note: '该景以九孔石桥为核心建筑，南北向贯穿荷花池，形成"日"字形布局',
    rank: 'xuan',
    main: { mian: 3, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 5.2 },
    aux: [
      { rank: 'pavilion', x: -20, z: 18 },
      { rank: 'pavilion', x: 20, z: 18 },
    ],
    named: ['九孔石桥'],
    water: 'lake',
    rock: 0.15,
    grove: 'blossom',
  },

  同天深处: {
    note: '初名蓬莱洲，参照唐代画家李思训"仙山楼阁"，位于福海中央，由象征蓬莱、方丈、瀛洲的三座……',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 7.5 },
    aux: [{ rank: 'pavilion', x: 20, z: 16 }],
    named: ['同天深处'],
    water: 'lake',
    rock: 0.6,
    grove: 'pine',
  },

  蓬岛瑶台: {
    note: '初名蓬莱洲，参照唐代画家李思训"仙山楼阁"，位于福海中央',
    rank: 'tower',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9 },
    aux: [{ rank: 'pavilion', x: 18, z: 20 }],
    named: ['蓬岛瑶台'],
    water: 'lake',
    rock: 0.55,
    grove: 'pine',
  },

  平湖秋月: {
    note: '仿杭州西湖同名景观而建，清代帝王常于中秋在此赏月，临水敞厅可观全湖',
    rank: 'xuan',
    main: { mian: 3, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 5.6 },
    aux: [
      { rank: 'pavilion', x: -18, z: 20 },
      { rank: 'xuan', x: 18, z: 18 },
    ],
    named: ['平湖秋月'],
    water: 'lake',
    rock: 0.16,
    grove: 'willow',
  },

  宜书房: {
    note: '清帝的藏书读书处，收藏有《重刻淳化阁帖》，取"春宜花、夏宜风、秋宜月、冬宜雪"之意',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 6.4 },
    aux: [
      { rank: 'xuan', x: -20, z: 12 },
      { rank: 'pavilion', x: 20, z: 14 },
    ],
    named: ['宜书房'],
    water: 'pond',
    rock: 0.22,
    grove: 'maple',
  },

  北远山村: {
    note: '模仿渔村农舍的田野园景，建筑分布在河的两岸',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'yingshan', caihua: 'su', platform: 'simple', eave: 5.6 },
    aux: [
      { rank: 'house', x: -22, z: 14 },
      { rank: 'house', x: 22, z: -12 },
      { rank: 'house', x: 10, z: 26 },
      { rank: 'house', x: -12, z: -22 },
    ],
    named: [],
    water: 'river',
    rock: 0.3,
    grove: 'poplar',
  },

  廓然大公: {
    note: '仿无锡惠山寄畅园而建',
    rank: 'hall',
    main: { mian: 7, jin: 5, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 9.5 },
    aux: [
      { rank: 'side', x: -30, z: -14 },
      { rank: 'side', x: 30, z: -14 },
      { rank: 'pavilion', x: 0, z: 30 },
    ],
    named: ['廓然大公'],
    water: 'pond',
    rock: 0.95,
    grove: 'pine',
  },

  洁身浴德: {
    note: '名源自儒家经典，寓指修身养德盛时，每逢端午节常在福海干北景附近举办……',
    rank: 'xuan',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'simple', eave: 6 },
    aux: [{ rank: 'pavilion', x: 20, z: 16 }],
    named: ['洁身浴德'],
    water: 'lake',
    rock: 0.2,
    grove: 'pine',
  },

  夹镜鸣琴: {
    note: '水中镜亭，以水为镜',
    rank: 'pavilion',
    main: { mian: 1, jin: 1, roof: 'zanjiandian', caihua: 'su', platform: 'simple', eave: 5, circular: true },
    aux: [{ rank: 'xuan', x: 20, z: 16 }],
    named: ['夹镜鸣琴'],
    water: 'lake',
    rock: 0.25,
    grove: 'willow',
  },

  别有洞天: {
    note: '初名秀清村，该景观为道教建筑群，雍正时期曾作为炼丹场所',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'simple', eave: 6.6 },
    aux: [
      { rank: 'tower', x: 24, z: -16 },
      { rank: 'xuan', x: -22, z: 16 },
      { rank: 'pavilion', x: 6, z: 30 },
    ],
    named: ['别有洞天'],
    water: 'pond',
    rock: 0.72,
    grove: 'pine',
  },

  接秀山房: {
    note: '前临后湖澄碧，远望西山秀色',
    rank: 'house',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 6.4 },
    aux: [
      { rank: 'xuan', x: -20, z: 14 },
      { rank: 'pavilion', x: 20, z: 12 },
    ],
    named: ['接秀山房'],
    water: 'lake',
    rock: 0.3,
    grove: 'poplar',
  },

  涵虚朗鉴: {
    note: '仿杭州西湖雷峰夕照建造，采用"因水成景，借景西山"的造景手法',
    rank: 'xuan',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'su', platform: 'simple', eave: 6 },
    aux: [{ rank: 'pavilion', x: 20, z: 18 }],
    named: ['涵虚朗鉴'],
    water: 'lake',
    rock: 0.22,
    grove: 'willow',
  },

  方壶胜境: {
    note: '福海北岸的三层方形楼阁',
    rank: 'tower',
    main: { mian: 3, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'xumizuo', eave: 11 },
    aux: [
      { rank: 'pavilion', x: 24, z: 16 },
      { rank: 'pavilion', x: -24, z: 16 },
    ],
    named: ['方壶胜境'],
    water: 'lake',
    rock: 0.18,
    grove: 'pine',
  },

  谐奇趣: {
    note: '西洋楼景区主景，中国式屋顶配西洋内部陈设',
    rank: 'hall',
    main: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', platform: 'simple', eave: 8 },
    aux: [
      { rank: 'pavilion', x: 22, z: 14 },
      { rank: 'xuan', x: -22, z: 14 },
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
