// 真实尺寸常量表（单位统一为米）。
// 依据分级（HUD 与清单文档中同样使用这三档）：
//   [标准]     清式通用营造 / 行业通用值，可直接使用
//   [官网原文] 景区官网或媒体原文给出的尺寸描述
//   [图测]     由参考图比例反推，尚未确认，HUD 中标注"待确认"
// 参考图库：d:\数字媒体\景德镇3D参考图\

export const DEG = Math.PI / 180;

// 人物参照高度：场景中放置剪影用，兼作比例尺。
export const HUMAN_HEIGHT = 1.70; // [标准]

// ---- 砌体 ----
export const BRICK = {
  length: 0.240, // [标准] 清式标准青砖
  width: 0.115,
  height: 0.053,
  joint: 0.010, // [标准] 灰缝 8–10mm
  // 砌筑模数（含灰缝）
  get moduleX() { return this.length + this.joint; },
  get moduleY() { return this.height + this.joint; }
};

export const RED_BRICK = { ...BRICK }; // 陶溪川厂房红砖沿用同一模数 [标准]

export const KILN_BRICK = {
  length: 0.230,
  width: 0.114,
  height: 0.065, // [标准] 耐火砖略厚
  joint: 0.014 // 窑砖砌缝较粗
};

// ---- 瓦作 ----
export const TILE = {
  length: 0.180, // [标准] 小青瓦
  width: 0.180,
  thickness: 0.010,
  ridgeGap: 0.200 // [标准] 瓦垄间距（底瓦+盖瓦一垄）
};

// ---- 木构 ----
export const TIMBER = {
  columnDia: 0.220, // [标准] 穿斗式柱径 200–260mm
  columnDiaMin: 0.200,
  columnDiaMax: 0.260,
  purlinGap: 0.750, // [标准] 檩距 600–900mm
  tieBeam: 0.150, // 穿枋高
  rafterGap: 0.300 // 椽距
};

// ---- 开间与层高 ----
export const BAY = { dwelling: 3.300, hall: 4.200, min: 3.000, max: 3.600 }; // [标准]
export const STOREY = { min: 3.000, max: 3.600, typical: 3.300 }; // [标准]

// ---- 屋顶 ----
export const ROOF = {
  hardSlope: 24 * DEG, // [标准] 硬山顶 22°–27°，取中值
  overhangEave: 0.600, // 檐口出挑
  ridgeHeight: 0.280, // 正脊高
  eaveRaise: 0.220 // 飞檐起翘量（龙珠阁等楼阁用，[图测]）
};

// ---- 台基 ----
export const PLINTH = { height: 0.450, stepHeight: 0.150 }; // [标准] 台基/踏跺

// ======================================================================
// 窑炉形制（以下尺寸依据景区官网原文，见参考资料《古窑民俗博览区》一节）
// ======================================================================
export const KILN = {
  // 清代镇窑：蛋形柴窑，穿斗式木构窑房，双砖烟囱，松柴燃料
  zhenyao: {
    lengthMin: 15.0,
    lengthMax: 20.0,
    length: 17.5, // 取区间中值
    volume: 300, // 约 300 m³
    height: 6.0, // 最高约 6m
    houseLength: 22.0, // 窑房（含前端操作间）
    houseWidth: 8.0,
    houseHeight: 4.6,
    chimneys: 2,
    source: 'guyao_043 / guyao_046 / guyao_047 / guyao_105 / guyao_115',
    confidence: '官网原文'
  },
  // 宋代龙窑：依山坡倾斜砌筑，形似卧龙，窑身狭长爬坡
  longyao: {
    width: 2.2, // 窑室宽
    height: 1.9,
    length: 30.0, // 窑身狭长
    slope: 14, // 爬坡坡度（度），[标准] 龙窑常见 10°–20°
    shedWidth: 5.0,
    source: 'guyao_104 / guyao_052 / guyao_116（仅门楼与敞廊，窑身爬坡走向参考资料标注为缺失）',
    confidence: '图测'
  },
  // 元代馒头窑：马蹄形窑床，两根烟囱
  mantou: {
    bedWidth: 4.2, // 马蹄形窑床
    bedDepth: 3.6,
    height: 3.4,
    chimneys: 2, // [官网原文] 拥有两根烟囱
    chimneyHeight: 7.5,
    gateWallHeight: 6.0, // 明黄砖高墙
    source: 'guyao_118（门楼）/ guyao_048 / guyao_055（窑内）',
    confidence: '官网原文'
  },
  // 明代葫芦窑：形似卧地葫芦，前大后小
  hulu: {
    frontDia: 4.6, // 前部（大）
    backDia: 2.5, // 后部（小），前大后小 [官网原文]
    height: 3.2,
    length: 9.0,
    saggerRows: 3, // 门楼墙头横向码放的匣钵排数
    source: 'guyao_120（门楼与墙头匣钵）',
    confidence: '官网原文'
  },
  // 清代狮子窑（槎窑）：窑头似狮头、窑囱似狮尾、窑前两脚似狮脚
  shizi: {
    headWidth: 4.0,
    height: 3.6,
    length: 11.0,
    source: 'guyao_095（仅悬匾正立面；窑体形状参考资料标注为缺失）',
    confidence: '图测'
  },
  // 明清御窑六式窑：成排穿斗木构敞廊窑房，逐间悬匾
  liushi: {
    bayWidth: 4.0, // 每间开间
    bays: 6, // 青窑 / 龙缸窑 / 风火窑 / 色窑 / 爁熿窑 / 匣窑
    depth: 6.5,
    eaveHeight: 3.4,
    ridgeHeight: 2.0,
    source: 'guyao_102 / guyao_123',
    confidence: '官网原文'
  }
};

// ======================================================================
// 御窑厂
// ======================================================================
export const YUYAO = {
  // 御窑博物馆：八个多曲面拱体，约 20% 用老窑砖砌筑
  museum: {
    vaultCount: 8,
    vaultRadius: 4.2, // 筒拱半径 [图测]
    vaultLength: 26.0, // 单拱纵向长度 [图测]
    vaultHeight: 6.4, // 拱顶高 [图测]
    wallThickness: 0.60,
    oldBrickRatio: 0.20, // 老窑砖占比，来源于景点简介
    poolDepth: 0.06, // 浅水镜面
    source: 'yuyao_001 / yuyao_026 / yuyao_027 / yuyao_028 / yuyao_024',
    confidence: '图测'
  },
  // 龙珠阁：多层重檐楼阁，位于珠山之巅
  longzhu: {
    storeys: 3, // 参考资料仅给出"多层重檐"，未给出层数
    bodyDia: 7.2, // 平面尺度 [图测]
    storeyHeight: 3.4, // [图测]
    eaves: 3, // 重檐层数 [图测]
    hillHeight: 8.0, // 珠山（相对标高）[图测]
    source: 'yuyao_018（仅正面 1 张，侧面/背面/内部/屋顶俯视均缺失）',
    confidence: '图测'
  },
  // 遗址探方
  trench: { size: 6.0, depth: 1.2, layers: 4, source: 'yuyao_011 / yuyao_013 / yuyao_015', confidence: '图测' },
  // 元代路面 + 瓷片堆积层
  yuanRoad: { width: 2.4, length: 14.0, source: 'yuyao_025', confidence: '图测' },
  // 入口锈红耐候钢镂空年号格栅景墙
  gratingWall: { height: 2.6, length: 12.0, source: 'yuyao_006', confidence: '图测' },
  // 园内仿古青砖两层建筑：硬山顶带红脊、清水砖墙、圆通风孔、木棂窗
  brickHouse: {
    bays: 3,
    bay: 3.3,
    depth: 5.4,
    storeys: 2,
    storeyHeight: 3.3,
    source: 'yuyao_007',
    confidence: '标准'
  },
  // 佑陶灵祠：黑漆描金木构门罩、重檐式木枋、悬匾、石香炉
  shrine: { bay: 3.0, gateHeight: 3.2, source: 'yuyao_016', confidence: '图测' }
};

// ======================================================================
// 陶溪川（原国营宇宙瓷厂改造）
// ======================================================================
export const TAOXICHUAN = {
  area: 197 * 666.67, // 占地 197 亩 ≈ 131,333 m²  [官网原文]
  floorArea: 89000, // 建筑面积 8.9 万 m²       [官网原文]
  buildingCount: 22, // 保留 22 栋老厂房        [官网原文]
  // 包豪斯锯齿形（sawtooth）屋顶厂房
  sawtooth: {
    length: 60.0, // 厂房长向 [图测]
    width: 18.0,
    moduleWidth: 6.0, // 单个锯齿跨度（沿长向等距重复）[图测]
    eaveHeight: 5.0, // 底墙高 [图测]
    crestHeight: 8.0, // 锯齿最高点 [图测]
    glazingRatio: 0.45, // 竖面发光面板占比
    source: 'taoxichuan_005 / taoxichuan_002',
    confidence: '图测'
  },
  // 红砖烟囱：圆柱形、下粗上细带锥形收分，高约 20m
  chimney: {
    height: 20.0, // [官网原文]
    rBase: 1.15, // 底部外径 ≈2.3m [图测]
    rTop: 0.62, // 顶部收口 [图测]
    wallThickness: 0.50,
    source: 'taoxichuan_002（可用于定标烟囱与厂房的高度关系）',
    confidence: '官网原文'
  },
  // 水景广场：大面积浅水池倒映厂房与烟囱，木栈道环水
  pool: { width: 46.0, depth: 24.0, waterDepth: 0.25, source: 'taoxichuan_002 / taoxichuan_005', confidence: '图测' },
  // 邑空间：暴露的白色三角桁架屋架 + 红砖墙 + 玻璃店面
  atelier: { bay: 6.0, bays: 4, trussHeight: 3.2, source: 'taoxichuan_007', confidence: '图测' },
  // 入口现代钢构门架：多组倾斜矩形钢框 + 锈红耐候钢镂空标识墙
  gate: { frames: 5, frameWidth: 1.6, frameHeight: 5.0, tilt: 12 * DEG, source: 'taoxichuan_003 / taoxichuan_004', confidence: '图测' }
};

// 单体变形用的统一随机种子（保证每次构建结果一致，便于逐张对照参考图）
export const SEEDS = {
  yuyao: 20261007,
  guyao: 20261008,
  taoxichuan: 20261009
};