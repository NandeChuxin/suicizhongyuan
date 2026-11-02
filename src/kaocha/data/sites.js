// 三景点元数据：真实尺寸锚点、构件清单与**参考图溯源**、预设机位、光照/雾的本地修正。
// 纯数据文件（只依赖 kernel/units.js），场景与页面壳都从这里取值，
// 保证 HUD 显示的"依据"与建模实际使用的数字是同一份（可逐张对照参考图）。
// 依据分级：[标准] 行业通用值 / [官网原文] 景区官网或媒体原文 / [图测] 由参考图比例反推，待确认。
import { SEEDS, KILN, YUYAO, TAOXICHUAN } from '../kernel/units.js';

export const CONFIDENCE_TAG = {
  '标准': '[标准]',
  '官网原文': '[官网原文]',
  '图测': '[图测·待确认]'
};

// 构件分类（HUD 与清单文档共用）
export const COMPONENT_KIND = {
  mass: '体块',
  structure: '结构',
  material: '材质',
  prop: '道具',
  env: '环境',
  ref: '尺度参照'
};

// ======================================================================
// 御窑厂国家考古遗址公园
// ======================================================================
const yuyao = {
  id: 'yuyao',
  name: '御窑厂国家考古遗址公园',
  short: '御窑厂',
  subtitle: '御窑博物馆 · 龙珠阁 · 明清窑址',
  html: 'kaocha-yuyao.html',
  seed: SEEDS.yuyao,
  refDir: '01-御窑厂国家考古遗址公园',
  refCount: 31,
  // 场景尺度与 LOD 切换距离（米）
  lod: { mid: 46, far: 130 },
  ground: { width: 320, depth: 320 },

  anchors: [
    { label: '青砖', value: '240 × 115 × 53 mm，灰缝 10 mm', basis: '标准' },
    { label: '小青瓦', value: '180 × 180 × 10 mm，瓦垄间距 200 mm', basis: '标准' },
    { label: '民居开间 / 层高', value: '3.3 m / 3.3 m', basis: '标准' },
    { label: '硬山顶坡度', value: '24°', basis: '标准' },
    { label: '御窑博物馆筒拱', value: '8 拱，最大拱高 6.2 m，单拱长 14–30 m，壁厚 0.60 m', basis: '图测' },
    { label: '龙珠阁', value: '3 层重檐，阁身直径 7.2 m，层高 3.4 m，珠山相对高 8.0 m', basis: '图测' },
    { label: '遗址探方', value: '6 × 6 m，深 1.2 m，4 个文化层', basis: '图测' },
    { label: '人物参照', value: '1.70 m', basis: '标准' }
  ],

  // 场景布置（米）。建模与预设机位共用这一份数字。
  layout: {
    museum: {
      pool: { width: 74, depth: 48, x: 0, z: 4, rim: 0.34 },
      // radius = 拱高（半圆筒拱），length = 单拱纵向长度，轴沿 Z
      vaults: [
        { r: 6.20, len: 30.0, x: -14.0, z: -2.0 },
        { r: 5.60, len: 27.0, x: -4.0, z: 0.5 },
        { r: 4.80, len: 21.0, x: 4.5, z: -1.5 },
        { r: 6.00, len: 28.0, x: 13.5, z: 1.0 },
        { r: 4.20, len: 15.0, x: -20.5, z: 13.0 },
        { r: 3.60, len: 18.0, x: -10.0, z: 15.0 },
        { r: 5.20, len: 24.0, x: 1.5, z: 13.5 },
        { r: 4.40, len: 20.0, x: 13.0, z: 15.5 }
      ]
    },
    longzhu: {
      x: -58, z: -34,
      hillH: 8.0, hillRTop: 11.0, hillRBottom: 17.0,
      podiumR: 5.6, podiumH: 0.9,
      bodyDia: 7.2, storeys: 3, storeyHeight: 3.4
    },
    trench: { x: 34, z: 46, size: 6.0, depth: 1.2, layers: 4, cols: 3, rows: 2, gap: 2.0 },
    yuanRoad: { x: 16, z: -30, width: 2.4, length: 14.0 },
    gratingWall: { x: 0, z: 46, length: 12.0, height: 2.6, thickness: 0.18 },
    brickHouse: { x: 44, z: -26, bays: 3, bay: 3.3, depth: 5.4, storeys: 2, storeyHeight: 3.3, rotY: -Math.PI / 2 },
    shrine: { x: -42, z: 24, bay: 3.0, depth: 4.2, gateHeight: 3.2 },
    far: {
      hills: [{ x: -150, z: -110, r: 90, h: 42 }, { x: 120, z: -150, r: 110, h: 52 }, { x: 165, z: 60, r: 80, h: 34 }],
      skyline: { x: 0, z: -190, count: 26, spread: 300, height: 14, depth: 22 }
    }
  },

  components: [
    {
      id: 'museum', name: '御窑博物馆多曲面筒拱（8 拱）', kind: 'structure', group: '御窑博物馆',
      dims: '最大拱高 6.2 m / 单拱长 30 m / 壁厚 0.60 m / 拱下浅水镜面',
      source: ['yuyao_001', 'yuyao_024', 'yuyao_026', 'yuyao_027', 'yuyao_028'],
      confidence: '图测', note: '约 20% 用老窑砖砌筑（景点简介）；拱数与高差按图测，待确认'
    },
    {
      id: 'longzhu', name: '龙珠阁（重檐楼阁）', kind: 'structure', group: '珠山',
      dims: '3 层重檐 / 阁身直径 7.2 m / 层高 3.4 m / 珠山相对高 8.0 m',
      source: ['yuyao_018'],
      confidence: '图测', note: '参考资料仅 1 张正面图，层数与总高未给出，按柱高与门洞高反推，**待确认**'
    },
    {
      id: 'trench', name: '考古遗址探方群', kind: 'env', group: '遗址区',
      dims: '6 × 6 m / 深 1.2 m / 4 个文化层，共 6 个探方',
      source: ['yuyao_011', 'yuyao_013', 'yuyao_015'],
      confidence: '图测', note: '层位划分按图中剖面比例'
    },
    {
      id: 'yuanRoad', name: '元代路面与瓷片堆积层', kind: 'env', group: '遗址区',
      dims: '宽 2.4 m / 长 14 m，两侧瓷片堆积剖面',
      source: ['yuyao_025'], confidence: '图测', note: '瓷片堆积层用嵌瓷片材质表达'
    },
    {
      id: 'gratingWall', name: '年号格栅景墙（锈红耐候钢镂空）', kind: 'structure', group: '入口',
      dims: '长 12 m / 高 2.6 m / 厚 0.18 m',
      source: ['yuyao_006'], confidence: '图测', note: '镂空文字为明代年号序列，StagA 先做板材格栅'
    },
    {
      id: 'brickHouse', name: '仿古青砖两层楼', kind: 'structure', group: '园内建筑',
      dims: '3 开间 × 3.3 m / 进深 5.4 m / 两层各 3.3 m / 硬山顶带红脊',
      source: ['yuyao_007'], confidence: '标准', note: '清水砖墙 + 圆通风孔 + 木棂窗按图；开间层高取标准值'
    },
    {
      id: 'shrine', name: '佑陶灵祠门罩', kind: 'structure', group: '园内建筑',
      dims: '面阔 3.0 m / 门罩高 3.2 m / 抬梁式木构 + 悬匾',
      source: ['yuyao_016'], confidence: '图测', note: '黑漆描金木构件，材质 Stage A2 细化'
    },
    {
      id: 'ground', name: '场地素土与铺装', kind: 'env', group: '环境',
      dims: '320 × 320 m', source: ['yuyao_011', 'yuyao_024'], confidence: '图测'
    },
    {
      id: 'farHills', name: '远景山体与城市轮廓', kind: 'env', group: '环境',
      dims: '半径 80–110 m 山体剪影 + 天际线体块', source: ['yuyao_024', 'yuyao_028'],
      confidence: '图测', note: '远景精度分层：低模 + 单张合并贴图'
    }
  ],

  // 预设机位：对应参考图的实际拍摄角度，便于逐张对照
  cameras: [
    { id: 'front', label: '正面（博物馆拱群）', position: [0, 5.0, 52], target: [0, 3.6, 4], ref: 'yuyao_001' },
    { id: 'side', label: '侧面（拱群纵列）', position: [46, 7.0, 18], target: [0, 3.6, 4], ref: 'yuyao_026' },
    { id: 'aerial', label: '鸟瞰（园区总览）', position: [8, 56, 96], target: [0, 2, 4], ref: 'yuyao_024' },
    { id: 'detail', label: '局部特写（龙珠阁）', position: [-34, 15, -4], target: [-58, 16, -34], ref: 'yuyao_018' }
  ],

  // 位置光（灯笼 / 窑火 / 窗内暖光），强度由 env.js 按光照预设统一驱动
  roleLights: [
    { role: 'lantern', position: [-42, 3.2, 26.5], options: { baseIntensity: 5, distance: 10 } },
    { role: 'lantern', position: [0, 2.4, 45.0], options: { baseIntensity: 4, distance: 9 } },
    { role: 'windowGlow', position: [44, 2.6, -26], options: { baseIntensity: 6, distance: 14 } }
  ],

  atmosphere: { fogScale: 1.0, environmentScale: 1.0, label: '开阔遗址园区，雾略淡' }
};

// ======================================================================
// 古窑民俗博览区
// ======================================================================
const guyao = {
  id: 'guyao',
  name: '古窑民俗博览区',
  short: '古窑',
  subtitle: '清代镇窑 · 宋代龙窑 · 元明窑炉群',
  html: 'kaocha-guyao.html',
  seed: SEEDS.guyao,
  refDir: '02-古窑民俗博览区',
  refCount: 124,
  lod: { mid: 40, far: 115 },
  ground: { width: 380, depth: 380 },

  anchors: [
    { label: '青砖 / 窑砖', value: '240×115×53 mm（灰缝 10）/ 230×114×65 mm（灰缝 14）', basis: '标准' },
    { label: '穿斗木构', value: '柱径 220 mm，檩距 750 mm，穿枋高 150 mm', basis: '标准' },
    { label: '清代镇窑', value: `全长 ${KILN.zhenyao.length} m（区间 ${KILN.zhenyao.lengthMin}–${KILN.zhenyao.lengthMax} m），容积约 ${KILN.zhenyao.volume} m³，最高约 ${KILN.zhenyao.height} m，双砖烟囱`, basis: '官网原文' },
    { label: '元代馒头窑', value: '马蹄形窑床，**两根烟囱**', basis: '官网原文' },
    { label: '明代葫芦窑', value: '前大后小，前径 4.6 m / 后径 2.5 m', basis: '官网原文' },
    { label: '宋代龙窑', value: '窑身狭长 30 m，爬坡 14°', basis: '图测' },
    { label: '明清御窑六式窑', value: '6 间，每间开间 4.0 m，进深 6.5 m', basis: '官网原文' },
    { label: '人物参照', value: '1.70 m', basis: '标准' }
  ],

  layout: {
    zhenyao: {
      x: -34, z: -26,
      houseLength: 22.0, houseWidth: 8.0, eaveH: 4.6,
      kilnLen: 17.5, frontW: 5.0, backW: 3.2, frontH: 6.0, backH: 4.2,
      // 窑门开在 +X 端山墙（面向园区）；两根砖烟囱在 -X 端穿出屋面
      chimneys: [{ dx: -11.0, dz: -3.0, h: 12.0 }, { dx: -11.0, dz: 3.0, h: 12.0 }],
      door: { w: 2.2, h: 2.6 }
    },
    shizi: {
      x: 26, z: -30, length: 11.0, frontW: 4.0, backW: 3.0, frontH: 3.6, backH: 3.0,
      gate: { w: 4.6, h: 4.6, depth: 1.4, plaque: '狮子窑' }
    },
    longyao: { x: 64, z: -46, width: 2.2, height: 1.9, length: 30.0, slope: 14, shedWidth: 5.0 },
    mantou: {
      x: 26, z: 6, radius: 3.6, height: 3.4, bedWidth: 4.2, bedDepth: 3.6,
      chimneys: [{ dx: -1.8, dz: -3.4, h: 7.5 }, { dx: 1.8, dz: -3.4, h: 7.5 }],
      gateWall: { w: 7.2, h: 6.0, thickness: 0.6 }
    },
    hulu: {
      x: 26, z: 38, length: 9.0, frontDia: 4.6, backDia: 2.5, height: 3.2,
      gate: { w: 4.2, h: 4.4, depth: 1.2, saggerRows: 3 }
    },
    liushi: { x: -30, z: 36, bayWidth: 4.0, bays: 6, depth: 6.5, eaveH: 3.4, ridgeH: 2.0 },
    inlayWall: { x: 0, z: 22, length: 14.0, height: 2.4, thickness: 0.28 },
    gates: [
      { x: -8, z: 56, w: 4.2, h: 5.4, span: 3.6, plaque: '古窑' },
      { x: 0, z: 56, w: 4.6, h: 6.0, span: 4.0, plaque: '民俗博览区' },
      { x: 8, z: 56, w: 4.2, h: 5.4, span: 3.6, plaque: '窑神' }
    ],
    racks: [{ x: -16, z: 12, rot: 0 }, { x: -16, z: 17, rot: 0 }, { x: 12, z: 12, rot: 0 }],
    firewood: [{ x: -24, z: 6 }, { x: -24, z: 10 }, { x: -20, z: 46 }],
    far: {
      hills: [{ x: -170, z: -130, r: 120, h: 62 }, { x: 150, z: -160, r: 130, h: 70 }, { x: 180, z: 90, r: 100, h: 46 }],
      skyline: { x: 40, z: -210, count: 22, spread: 280, height: 15, depth: 24 }
    }
  },

  components: [
    {
      id: 'zhenyao', name: '清代镇窑窑房（穿斗木构 + 双砖烟囱）', kind: 'structure', group: '镇窑',
      dims: `窑房 ${KILN.zhenyao.houseLength} × ${KILN.zhenyao.houseWidth} m，檐高 ${KILN.zhenyao.houseHeight} m；蛋形窑体长 ${KILN.zhenyao.length} m、最高约 ${KILN.zhenyao.height} m；窑体后端两根砖烟囱`,
      source: ['guyao_043', 'guyao_046', 'guyao_047', 'guyao_093', 'guyao_094', 'guyao_105', 'guyao_115', 'guyao_117'],
      confidence: '官网原文', note: '窑体尺寸取官网 15–20 m / 约 300 m³ / 高约 6 m 的区间中值'
    },
    {
      id: 'shizi', name: '清代狮子窑（槎窑）与悬匾门楼', kind: 'structure', group: '狮子窑',
      dims: '窑体长 11 m，狮头端宽 4.0 m；门楼悬匾',
      source: ['guyao_095'], confidence: '图测', note: '参考资料仅有正立面悬匾，窑体形状标注为缺失，按文字描述反推'
    },
    {
      id: 'longyao', name: '宋代龙窑（依坡而建 + 敞廊）', kind: 'structure', group: '龙窑',
      dims: '窑身长 30 m / 宽 2.2 m / 高 1.9 m / 爬坡 14°，敞廊宽 5 m',
      source: ['guyao_052', 'guyao_104', 'guyao_116'], confidence: '图测',
      note: '参考资料仅门楼与敞廊，窑身爬坡走向缺失，按龙窑通用形制建模'
    },
    {
      id: 'mantou', name: '元代馒头窑（马蹄形窑床 + 两根烟囱）', kind: 'structure', group: '馒头窑',
      dims: '窑床 4.2 × 3.6 m，穹顶高 3.4 m，烟囱 2 根各 7.5 m，明黄砖门墙高 6.0 m',
      source: ['guyao_048', 'guyao_055', 'guyao_118'], confidence: '官网原文',
      note: '"两根烟囱"为官网原文明确特征，是结构校验要点'
    },
    {
      id: 'hulu', name: '明代葫芦窑（前大后小）与匣钵门楼', kind: 'structure', group: '葫芦窑',
      dims: '窑体长 9 m，前径 4.6 m / 后径 2.5 m，高 3.2 m；门楼墙头横码 3 排匣钵',
      source: ['guyao_120'], confidence: '官网原文', note: '前大后小的束腰是识别特征'
    },
    {
      id: 'liushi', name: '明清御窑六式窑长廊', kind: 'structure', group: '六式窑',
      dims: '6 间 × 开间 4.0 m，进深 6.5 m，檐高 3.4 m，正脊高 2.0 m；逐间悬匾',
      source: ['guyao_102', 'guyao_123'], confidence: '官网原文',
      note: '青窑 / 龙缸窑 / 风火窑 / 色窑 / 爁熿窑 / 匣窑'
    },
    {
      id: 'inlayWall', name: '嵌青花碎瓷片砖墙', kind: 'material', group: '装饰',
      dims: '长 14 m / 高 2.4 m', source: ['guyao_051', 'guyao_064'],
      confidence: '图测', note: '釉面反光与冰裂纹用程序化材质表达，Stage A2 加金缮修补'
    },
    {
      id: 'gates', name: '门楼牌坊群', kind: 'structure', group: '入口',
      dims: '3 座，面阔 4.2–4.6 m，檐高 5.4–6.0 m，悬匾',
      source: ['guyao_018', 'guyao_019', 'guyao_020', 'guyao_059', 'guyao_075', 'guyao_078', 'guyao_081', 'guyao_082', 'guyao_089', 'guyao_106', 'guyao_107'],
      confidence: '图测'
    },
    {
      id: 'racks', name: '晾晒坯架（坯房）', kind: 'prop', group: '道具',
      dims: '架长 4.0 m / 高 1.9 m，4 层，每层 7 件瓷坯', source: ['guyao_033', 'guyao_038', 'guyao_041', 'guyao_098'],
      confidence: '图测'
    },
    {
      id: 'firewood', name: '松柴垛（复烧燃料）', kind: 'prop', group: '道具',
      dims: '垛长 2.4 m / 高 1.2 m / 进深 1.0 m', source: ['guyao_068', 'guyao_123'], confidence: '图测'
    },
    {
      id: 'ground', name: '场地素土与窑砖散落', kind: 'env', group: '环境',
      dims: '380 × 380 m', source: ['guyao_124', 'guyao_112'], confidence: '图测'
    },
    {
      id: 'farHills', name: '远景山体与城市轮廓', kind: 'env', group: '环境',
      dims: '半径 100–130 m 山体剪影 + 天际线体块', source: ['guyao_112', 'guyao_124'], confidence: '图测'
    }
  ],

  cameras: [
    { id: 'front', label: '正面（镇窑窑门与窑房）', position: [4, 5.5, -20], target: [-34, 3.6, -26], ref: 'guyao_043' },
    { id: 'side', label: '侧面（窑房长向与双烟囱）', position: [-34, 7.5, 12], target: [-34, 4.2, -26], ref: 'guyao_046' },
    { id: 'aerial', label: '鸟瞰（窑群总览）', position: [-4, 68, 74], target: [-8, 2, 2], ref: 'guyao_124' },
    { id: 'detail', label: '局部特写（六式窑长廊）', position: [-30, 5.5, 52], target: [-30, 3.0, 36], ref: 'guyao_102' }
  ],

  roleLights: [
    { role: 'kilnFire', position: [-25.0, 1.4, -26.0], options: { baseIntensity: 9, distance: 16 } },
    { role: 'kilnFire', position: [26, 1.2, 33.4], options: { baseIntensity: 7, distance: 12 } },
    { role: 'lantern', position: [0, 3.4, 55.0], options: { baseIntensity: 5, distance: 10 } },
    { role: 'lantern', position: [-30, 2.6, 36], options: { baseIntensity: 5, distance: 10 } }
  ],

  atmosphere: { fogScale: 1.35, environmentScale: 0.95, label: '依山林地，湿度高、雾更浓' }
};

// ======================================================================
// 陶溪川文创街区（原国营宇宙瓷厂）
// ======================================================================
const taoxichuan = {
  id: 'taoxichuan',
  name: '陶溪川文创街区',
  short: '陶溪川',
  subtitle: '包豪斯锯齿厂房 · 红砖烟囱 · 水景广场',
  html: 'kaocha-taoxichuan.html',
  seed: SEEDS.taoxichuan,
  refDir: '03-陶溪川文创街区',
  refCount: 9,
  lod: { mid: 44, far: 125 },
  ground: { width: 300, depth: 300 },

  anchors: [
    { label: '园区占地', value: '197 亩 ≈ 131,333 m²', basis: '官网原文' },
    { label: '建筑面积', value: '8.9 万 m²，保留 22 栋老厂房', basis: '官网原文' },
    { label: '红砖烟囱', value: '高 20 m，底外径 ≈ 2.3 m，顶部收口', basis: '官网原文' },
    { label: '锯齿形厂房', value: '长 60 m / 宽 18 m / 单锯齿跨度 6 m / 底墙高 5 m / 锯齿最高 8 m', basis: '图测' },
    { label: '水景广场', value: '46 × 24 m，水深 0.25 m，木栈道环水', basis: '图测' },
    { label: '人物参照', value: '1.70 m', basis: '标准' }
  ],

  layout: {
    ground: { width: 300, depth: 300 },
    sawtooth: { length: 60.0, width: 18.0, moduleWidth: 6.0, eaveH: 5.0, crestH: 8.0 },
    halls: [
      { id: 'hallA', x: -34, z: -30, rotY: 0 },
      { id: 'hallB', x: 34, z: -30, rotY: 0 },
      { id: 'hallC', x: 0, z: 30, rotY: 0 }
    ],
    chimney: { x: -24, z: -12, height: 20.0, rBase: 1.15, rTop: 0.62 },
    pool: { x: 6, z: -2, width: 46.0, depth: 24.0, rim: 0.28 },
    atelier: { x: 62, z: 18, bayWidth: 6.0, bays: 4, span: 14.0, trussHeight: 3.2, rotY: Math.PI / 2 },
    gate: { x: 0, z: 62, frames: 5, frameWidth: 1.6, frameHeight: 5.0, tilt: 12, spacing: 2.4, signLength: 12.0 },
    far: {
      skyline: { x: 0, z: 210, count: 34, spread: 340, height: 22, depth: 26 },
      hills: [{ x: -180, z: -160, r: 110, h: 38 }, { x: 170, z: -140, r: 100, h: 30 }]
    }
  },

  components: [
    {
      id: 'sawtooth', name: '包豪斯锯齿形屋顶厂房群（3 栋）', kind: 'structure', group: '厂房',
      dims: `单栋 ${TAOXICHUAN.sawtooth.length} × ${TAOXICHUAN.sawtooth.width} m，底墙高 ${TAOXICHUAN.sawtooth.eaveHeight} m，锯齿最高 ${TAOXICHUAN.sawtooth.crestHeight} m，单锯齿跨度 ${TAOXICHUAN.sawtooth.moduleWidth} m，竖面发光面板占比约 45%`,
      source: ['taoxichuan_002', 'taoxichuan_005'], confidence: '图测',
      note: '园区总平面无权威资料，仅做**可确认的厂房单体 + 烟囱 + 水景关系**，不臆造总规'
    },
    {
      id: 'chimney', name: '红砖烟囱（锥形收分 + 顶部收口）', kind: 'structure', group: '厂房',
      dims: `高 ${TAOXICHUAN.chimney.height} m，底外径 ${(TAOXICHUAN.chimney.rBase * 2).toFixed(1)} m，顶部收口至 ${(TAOXICHUAN.chimney.rTop * 2).toFixed(1)} m`,
      source: ['taoxichuan_002'], confidence: '官网原文',
      note: '高度与厂房高度的比例须与 taoxichuan_002 一致'
    },
    {
      id: 'pool', name: '水景广场（镜面浅水池 + 环水栈道）', kind: 'env', group: '水景',
      dims: `水池 ${TAOXICHUAN.pool.width} × ${TAOXICHUAN.pool.depth} m，水深 ${TAOXICHUAN.pool.waterDepth} m`,
      source: ['taoxichuan_002', 'taoxichuan_005'], confidence: '图测', note: '水面倒影是夜景图的核心构图元素'
    },
    {
      id: 'atelier', name: '邑空间（室内三角桁架屋架）', kind: 'structure', group: '厂房',
      dims: '4 间 × 6.0 m，跨度 14 m，桁架高 3.2 m，红砖墙 + 玻璃店面',
      source: ['taoxichuan_007'], confidence: '图测'
    },
    {
      id: 'gate', name: '入口钢构门架 + 耐候钢标识墙', kind: 'structure', group: '入口',
      dims: '5 组倾斜矩形钢框，框 1.6 × 5.0 m，倾斜 12°，间距 2.4 m',
      source: ['taoxichuan_003', 'taoxichuan_004'], confidence: '图测'
    },
    {
      id: 'ground', name: '场地铺装与红砖散水', kind: 'env', group: '环境',
      dims: '300 × 300 m', source: ['taoxichuan_002', 'taoxichuan_005'], confidence: '图测'
    },
    {
      id: 'farSkyline', name: '远景城市轮廓与山体', kind: 'env', group: '环境',
      dims: '天际线体块 + 半径 100–110 m 山体剪影', source: ['taoxichuan_002'], confidence: '图测'
    }
  ],

  cameras: [
    { id: 'front', label: '正面（烟囱 + 水面倒影）', position: [-2, 6.5, 62], target: [-6, 7.0, -6], ref: 'taoxichuan_002' },
    { id: 'side', label: '侧面（厂房长向）', position: [66, 11, 34], target: [0, 6.5, -2], ref: 'taoxichuan_005' },
    { id: 'aerial', label: '鸟瞰（锯齿屋顶阵列）', position: [10, 62, 92], target: [0, 2, 0], ref: 'taoxichuan_005' },
    { id: 'detail', label: '局部特写（烟囱收口与水面）', position: [-2, 10, 4], target: [-24, 12, -12], ref: 'taoxichuan_002' }
  ],

  roleLights: [
    { role: 'windowGlow', position: [62, 2.8, 18], options: { baseIntensity: 8, distance: 18 } },
    { role: 'windowGlow', position: [0, 3.0, 30], options: { baseIntensity: 8, distance: 18 } },
    { role: 'lantern', position: [0, 3.0, 60], options: { baseIntensity: 5, distance: 11 } },
    { role: 'lantern', position: [6, 2.6, -2], options: { baseIntensity: 4, distance: 10 } }
  ],

  atmosphere: { fogScale: 0.7, environmentScale: 1.05, label: '城市街区，雾淡、夜景发光面更亮' }
};

export const SITES = { yuyao, guyao, taoxichuan };
export const SITE_ORDER = ['yuyao', 'guyao', 'taoxichuan'];

export function getSite(id) {
  return SITES[id] ?? null;
}

export function getComponent(site, componentId) {
  if (!site) return null;
  return site.components.find(c => c.id === componentId) ?? null;
}

export function componentSource(site, componentId) {
  const c = getComponent(site, componentId);
  if (!c) return { name: '—', source: [], confidence: '图测', tag: CONFIDENCE_TAG['图测'], note: '' };
  return { ...c, tag: CONFIDENCE_TAG[c.confidence] ?? CONFIDENCE_TAG['图测'] };
}