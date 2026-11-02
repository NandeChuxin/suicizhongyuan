// 《碎瓷重圆》数据层：六件瓷器、四十八段编年记忆、匠人之声、六个考察点。
// 全部为创作性叙事；纹样与器型为程序化艺术复原，不冒充真实文物档案。

// 对称器型轮廓：输入自底向上的 [高度, 半宽] 折点，输出闭合多边形。
export function buildOutline(knots) {
  const right = knots.map(([y, r]) => [r, y]);
  const left = [...right].reverse().map(([x, y]) => [-x, y]);
  return [...right, ...left].map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]);
}

// 可复现随机数（mulberry32），保证每件瓷器的碎片站点每次一致。
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function polygonArea(poly) {
  return Math.abs(poly.reduce((n, a, i) => { const b = poly[(i + 1) % poly.length]; return n + a[0] * b[1] - a[1] * b[0]; }, 0)) / 2;
}

// 在轮廓内生成 count 个分布均匀的碎片站点：稠密随机采样 + 贪心最远点。
export function generateSites(outline, count, seed) {
  const rng = mulberry32(seed);
  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const samples = [];
  for (let i = 0; i < 900; i++) {
    const x = minX + rng() * (maxX - minX), y = minY + rng() * (maxY - minY);
    if (pointInPolygon(x, y, outline)) samples.push([x, y]);
  }
  if (samples.length < count) return outline.slice(0, count).map(p => [+p[0].toFixed(3), +p[1].toFixed(3)]);
  let top = samples[0];
  for (const s of samples) if (s[1] > top[1]) top = s;
  const picked = [top];
  const rest = samples.filter(s => s !== top);
  while (picked.length < count && rest.length) {
    let best = null, bestDist = -1;
    for (const c of rest) {
      let d = Infinity;
      for (const p of picked) d = Math.min(d, Math.hypot(c[0] - p[0], c[1] - p[1]));
      if (d > bestDist) { bestDist = d; best = c; }
    }
    picked.push(best); rest.splice(rest.indexOf(best), 1);
  }
  return picked.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]);
}

// 一号：清康熙 青花缠枝莲纹梅瓶（沿用既有轮廓，市井民窑的起点）。
export const MEIPING_OUTLINE = buildOutline([[-4.00,1.54],[-3.65,1.49],[-3.30,1.36],[-2.96,1.23],[-2.61,1.16],[-2.26,1.11],[-1.91,1.10],[-1.56,1.14],[-1.22,1.20],[-0.87,1.28],[-0.52,1.39],[-0.17,1.50],[0.17,1.61],[0.52,1.71],[0.87,1.78],[1.22,1.83],[1.56,1.86],[1.91,1.87],[2.26,1.85],[2.61,1.78],[2.96,1.61],[3.31,1.23],[3.65,0.79],[4.00,0.63]]);
export const YUHUCHUN_OUTLINE = buildOutline([[-4.00,1.57],[-3.65,1.81],[-3.30,2.09],[-2.96,2.33],[-2.61,2.48],[-2.26,2.56],[-1.91,2.59],[-1.56,2.59],[-1.22,2.55],[-0.87,2.47],[-0.52,2.35],[-0.17,2.21],[0.17,2.03],[0.52,1.84],[0.87,1.63],[1.22,1.42],[1.57,1.21],[1.91,1.02],[2.26,0.86],[2.61,0.75],[2.96,0.67],[3.31,0.66],[3.65,0.80],[4.00,1.10]]);
// 【2026-10-17】六件轮廓全部改为「由用户提供的 GLB 反推」：
// 逐顶点按高度分箱取 97 分位水平半径，再平滑、按「最大边 = 8」归一（保留各器真实高宽比）。
// 因此碎片外壁、拼合成的器型、全息、展柜与证书小像共用同一副轮廓，与模型严格一一对应。
// （旧的手绘轮廓：云龙罐是 3:1 瘦高罐而模型是矮胖罐；玲珑碗按 7 单位高画，套到模型上会被放大成巨碗。）
// 三号：元 青花缠枝牡丹云龙纹罐。
// 轮廓不再手绘，而是由用户提供的 public/models/vessels/jiangjun.glb 逐顶点反推：
// 按高度分 26 带取 97 分位水平半径（scripts 可复算），再等比归一到器高 6.42。
// 因此碎片外壁、拼合成的器型与展柜/证书里的真实模型是同一副轮廓——
// 旧的手绘折点（高 3:1 的瘦高罐）与模型（高宽比 0.81 的矮胖罐）差异过大，已废弃。
export const JIANGJUN_OUTLINE = buildOutline([[-3.22,2.37],[-2.94,2.41],[-2.66,2.52],[-2.38,2.67],[-2.10,2.85],[-1.82,3.03],[-1.54,3.22],[-1.26,3.40],[-0.98,3.56],[-0.70,3.70],[-0.42,3.81],[-0.14,3.90],[0.14,3.96],[0.42,4.00],[0.70,4.00],[0.98,3.97],[1.26,3.91],[1.54,3.82],[1.82,3.69],[2.10,3.46],[2.38,3.14],[2.66,2.82],[2.94,2.65],[3.22,2.63]]);
export const GAOZU_OUTLINE = buildOutline([[-4.00,1.92],[-3.65,1.75],[-3.30,1.60],[-2.96,1.48],[-2.61,1.40],[-2.26,1.33],[-1.91,1.28],[-1.56,1.26],[-1.22,1.26],[-0.87,1.25],[-0.52,1.24],[-0.17,1.42],[0.17,1.87],[0.52,2.37],[0.87,2.70],[1.22,2.95],[1.56,3.21],[1.91,3.40],[2.26,3.40],[2.61,3.33],[2.96,3.31],[3.31,3.33],[3.65,3.37],[4.00,3.43]]);
export const SUANTOU_OUTLINE = buildOutline([[-4.00,1.31],[-3.65,1.32],[-3.31,1.57],[-2.96,1.86],[-2.61,2.02],[-2.26,2.10],[-1.91,2.12],[-1.56,2.10],[-1.22,2.05],[-0.87,1.95],[-0.52,1.80],[-0.17,1.60],[0.17,1.37],[0.52,1.15],[0.87,0.95],[1.22,0.79],[1.56,0.67],[1.91,0.60],[2.26,0.57],[2.61,0.59],[2.96,0.69],[3.30,0.82],[3.65,0.89],[4.00,0.87]]);
export const LINGLONG_OUTLINE = buildOutline([[-1.75,1.48],[-1.59,1.52],[-1.44,1.59],[-1.29,1.76],[-1.14,2.04],[-0.99,2.29],[-0.83,2.47],[-0.68,2.61],[-0.53,2.73],[-0.38,2.83],[-0.23,2.93],[-0.07,3.01],[0.08,3.10],[0.23,3.17],[0.38,3.25],[0.53,3.33],[0.68,3.40],[0.84,3.47],[0.99,3.55],[1.14,3.62],[1.29,3.71],[1.44,3.83],[1.59,3.94],[1.75,4.00]]);

const pattern = (vesselIndex, i) => `patterns/memory-${String((vesselIndex * 3 + i) % 9 + 1).padStart(2, '0')}.svg`;

export const VESSELS = [
  {
    id: 'meiping', index: 0, name: '青花花鸟纹梅瓶', era: '明嘉靖', glaze: '青花',
    origin: '昌江龙窑', storyline: '民窑 · 市井', archive: 'QH-1524',
    glazeType: 'qinghua-birdflower', textureSeed: 1524,
    model: 'vessels/meiping.glb',
    // 用户提供的器物照片在照片内的取景框（归一化 x/y/w/h）：柱面纹理只从这个框里取样，
    // 不补画任何纹样。图源：public/patterns/real/vessel-01-meiping.png
    photoCrop: { x: .287, y: .168, w: .386, h: .758 },
    outline: MEIPING_OUTLINE, fragmentCount: 8, siteSeed: 172501, rotationMap: {},
    location: 'guyao',
    fragments3d: { seed: 152401, rings: 4, thickness: .18, tilt: .35, benchDepth: 1.45, scatterRadius: 1.55, scatterLift: .92, hoverHeight: .16 },
    proto: { img: './patterns/real/vessel-01-meiping.png', caption: '明嘉靖 · 青花花鸟纹梅瓶', source: '故宫博物院藏 · 故00145714（近足饰缠枝莲纹）', cutout: true },
    intro: '民窑烧造的市井佳器，曾立在昌江边茶铺的木柜上。旧居整理时意外破损，委托人希望保留青花，也保留器物曾被使用的记忆。',
    breakdown: '八块瓷片 / 纹样可辨 / 待拼合',
    stories: [
      { id: 'mp-01', title: '窑火初起', year: '嘉靖二年 · 1523', image: pattern(0, 0), text: '我是被窑火唤醒的一团白土。松柴噼啪作响，热浪从匣钵缝里舔过我的肩；空气里有松脂、湿泥与灰烬的气味。那一夜，景德镇的天被窑口映得通红。' },
      { id: 'mp-02', title: '画师点青', year: '嘉靖二年 · 春', image: pattern(0, 1), text: '我是画师笔下的一树花鸟。他蘸取青料，落笔很轻，收笔很稳；笔尖擦过瓷胎时沙沙作响。窗外昌江水亮了一瞬，禽鸟与花枝便在我身上安了家。' },
      { id: 'mp-03', title: '入窑一色', year: '嘉靖二年 · 夏', image: pattern(0, 2), text: '我再次进入窑火时，身上的青料近乎灰黑。四周只有火舌呼吸的轰鸣，炽热空气带着矿土的涩味。没有人知道，幽暗里的这一色会在冷却后变成怎样的蓝。' },
      { id: 'mp-04', title: '出窑万彩', year: '嘉靖二年 · 秋', image: pattern(0, 3), text: '我是清晨第一批被抱出窑门的瓷。冷风碰上釉面，发出细小清脆的鸣响；师傅转动我，看见青花从雾灰里显出深浅。那双沾满窑灰的手，久久没有放下。' },
      { id: 'mp-05', title: '市井茶香', year: '乾隆二十七年 · 1762', image: pattern(0, 4), text: '我曾立在昌江边一间茶铺的木柜上。茶汤蒸出的暖气带着桂花香，码头号子从晨雾里传来；南来北往的人在我面前说起远方，而我把江南的春天留在花纹里。' },
      { id: 'mp-06', title: '朝代更迭', year: '民国元年 · 1912', image: pattern(0, 5), text: '我看过匾额换下，也听过街巷里陌生的新称呼。雨水敲在瓦檐上，旧木柜散发潮湿气味；人们匆忙搬走许多东西，却仍用布把我一层层包好。' },
      { id: 'mp-07', title: '沉埋河沙', year: '二十世纪中叶', image: pattern(0, 6), text: '我是沉入昌江老井底的一段静默。井水冰凉，河沙慢慢填进瓶腹；上方的脚步和人声被水面磨得遥远。黑暗里，我仍记得每一片曾经相连的位置。' },
      { id: 'mp-08', title: '碎于今朝', year: '数字纪年 · 今日', image: pattern(0, 7), text: '我是今天重新见到光的碎瓷。探灯扫过断口，潮湿泥土的气味随井绳上升；八片仍停在彼此身旁。现在，你的手成为我的新记忆，也决定裂痕将如何说话。' }
    ],
    voices: {
      painter: '画师：落笔要轻，收笔要稳。青料遇火会晕散，急不得——你手里这些碎片，也是一样。',
      keeper: '掌柜：这瓶子装过江南的整个春天。如今春天回来了，就摆在你的桌上。',
      kilnWorker: '窑工：这世上没有烧不裂的瓷，只有不肯修的手。可怎么修，是你的道理。'
    },
    culture: {
      culturalContext: '明嘉靖景德镇民窑烧造的陈设瓷。民窑面向市井与海内外市场，花鸟题材在嘉靖民窑青花中常见；梅瓶小口短颈丰肩，是宋以来的经典器型，明清多作陈设。',
      craftRoles: ['淘泥 · 拉坯', '利坯', '画坯（青花）', '施釉', '烧窑', '使用者与修补者'],
      referenceScope: '器型比例与近足缠枝莲纹参考故宫藏故00145714；花鸟构图、使用与沉埋经历为原创。',
      contentLayers: {
        fact: '嘉靖民窑青花常见花鸟题材；梅瓶器型为馆藏与公开资料支持的史实语境。',
        legend: '',
        fiction: '器物「沉埋河沙—碎于今朝」的经历与委托人林青一家为原创叙事。'
      },
      sources: [
        { name: '故宫博物院 · 明嘉靖青花花鸟纹梅瓶（故00145714）', url: 'https://www.dpm.org.cn/collection/ceramic/226936.html', used: '器型与纹样参考' },
        { name: '中国非物质文化遗产网 · 景德镇传统手工制瓷技艺', url: 'https://www.ihchina.cn/project_details/10291', used: '工种分工语境' }
      ],
      digitalTranslation: '纹样辨识与「对花」投影 → 学习花鸟构图与缠枝纹的连续性；碎片拼合 → 体会画坯落笔的耐心。',
      uncertainty: '茶铺使用场景与沉埋经历为创作；本件数字器物对应的具体民窑窑口不可考。'
    }
  },
  {
    id: 'yuhuchun', index: 1, name: '青花缠枝莲纹玉壶春瓶', era: '明永乐', glaze: '青花',
    origin: '御窑厂', storyline: '御窑 · 落选即碎', archive: 'YHC-YL-1420',
    glazeType: 'qinghua-lotus', textureSeed: 1420,
    model: 'vessels/yuhuchun.glb',
    // 用户提供的器物照片在照片内的取景框（归一化 x/y/w/h）：柱面纹理只从这个框里取样，
    // 不补画任何纹样。图源：public/patterns/real/vessel-02-yuhuchun.png
    photoCrop: { x: .258, y: .218, w: .514, h: .658 },
    outline: YUHUCHUN_OUTLINE, fragmentCount: 10, siteSeed: 142701, rotationMap: { 5: 15 },
    location: 'yuyao',
    fragments3d: { seed: 142701, rings: 5, thickness: .16, tilt: .32, benchDepth: 1.35, scatterRadius: 1.7, scatterLift: 1.05, hoverHeight: .18 },
    proto: { img: './patterns/real/vessel-02-yuhuchun.png', caption: '明永乐 · 青花玉壶春瓶', source: '故宫博物院藏 · 故00145313（器型与缠枝莲纹原型）', cutout: true },
    intro: '御窑厂贡瓷，颈上一道细纹被判落选。故事中落选贡瓷被打碎掩埋——它的每一片，都被小心地放回了原位。',
    breakdown: '十块瓷片 / 断口齐整 / 掩埋坑出土',
    stories: [
      { id: 'yhc-01', title: '御土细泥', year: '永乐十八年 · 1420', image: pattern(1, 0), text: '我是御窑厂里辘轳车上的一团细白泥。拉坯人的手指稳得像尺，泥与布之间沙沙的水声里，我一天天长出玉壶春的腰身。作坊里飘着石膏模的干燥气味。' },
      { id: 'yhc-02', title: '苏麻离青', year: '永乐十八年 · 春', image: pattern(1, 1), text: '我身上的青料来自远洋的苏麻离青。画师蘸取它为我描画缠枝莲，入釉便会晕散，像墨落进宣纸。他说：晕出去的这一分，是别处仿不来的。' },
      { id: 'yhc-03', title: '官窑之火', year: '永乐十八年 · 夏', image: pattern(1, 2), text: '我再次进入御窑的窑火时，火比民窑更烈，也更怕错。我听见窑头的人低声念着火候，像在念一道圣旨。热气里没有松柴味，只有照应不过来的紧张。' },
      { id: 'yhc-04', title: '验瓷之日', year: '永乐十八年 · 秋', image: pattern(1, 3), text: '我是出窑那天被官员验看的贡瓷。手指抚过我釉面的橘皮纹，在颈前停住了——那里有一道极细的纹。屋里静得能听见香灰落下的声音。' },
      { id: 'yhc-05', title: '落选即碎', year: '永乐十九年 · 春', image: pattern(1, 4), text: '我是落选的贡瓷，不许流进人间。锤落下来之前，我听见执锤的匠人叹了口气——他碎了我，却把我每一片都放得整整齐齐，像在替我收殓。' },
      { id: 'yhc-06', title: '与碎片同眠', year: '成化年间', image: pattern(1, 5), text: '我与万千碎片同眠在御窑厂东院的黄土下。层层叠叠的断口贴着断口，像一座被打碎的宫廷。泥土的凉意里，偶尔传来地面上新的年号。' },
      { id: 'yhc-07', title: '考古探方', year: '一九八〇年代', image: pattern(1, 6), text: '我是被探方的绳子围进方格的一堆碎瓷。毛刷扫过黄土，年轻的考古队员念出我的编号，声音因为激动而发紧。五百多年了，第一次有人为我的碎片撑伞。' },
      { id: 'yhc-08', title: '重见天光', year: '数字纪年 · 今日', image: pattern(1, 7), text: '我是今天重新见到光的御窑碎瓷。掩埋坑的灯又亮了，十片碎瓷躺在海绵垫上，断口之间的缝隙窄得像一句没说完的话。请把那句话，替我拼完。' }
    ],
    voices: {
      painter: '画师：苏麻离青遇火会晕，像记忆会漫过边界。别追着笔锋跑，让它自己长。',
      keeper: '掌柜：官家说我有瑕。可三百年后，人人争看那道细纹——瑕，也是命。',
      kilnWorker: '窑工：官窑的规矩是落选即碎。可碎掉的东西还在原位，你说，这算不算另一种忠诚？'
    },
    culture: {
      culturalContext: '明代御窑（御器厂）专为宫廷烧造，成品经层层验看；落选贡瓷按规例打碎掩埋于厂内。景德镇御窑厂遗址考古出土成层落选瓷堆积，可与传世品对应。',
      craftRoles: ['辘轳拉坯', '利坯', '画坯（苏麻离青）', '施釉', '烧窑', '验瓷官员', '考古工作者'],
      referenceScope: '器型与缠枝莲纹参考故宫藏故00145313；苏麻离青入釉晕散为公开资料支持；「颈上细纹致落选」为创作。',
      contentLayers: {
        fact: '御窑落选贡瓷打碎掩埋、遗址成层堆积，见于御窑厂遗址考古公开资料。',
        legend: '',
        fiction: '本件「因细纹落选」的个体经历与委托人小周为原创叙事。'
      },
      sources: [
        { name: '故宫博物院 · 明永乐青花玉壶春瓶（故00145313）', url: 'https://www.dpm.org.cn/collection/ceramic/226976.html', used: '器型与纹样参考' },
        { name: '中国非物质文化遗产网 · 景德镇传统手工制瓷技艺', url: 'https://www.ihchina.cn/project_details/10291', used: '工种分工语境' },
        { name: '景德镇御窑厂遗址考古公开资料（公开资料）', url: '', used: '落选掩埋语境' }
      ],
      digitalTranslation: '记忆页验瓷情节 → 理解官窑检验制度；断口对位拼合 → 体会考古复原的严谨。',
      uncertainty: '落选打碎的执行细节与本件器物的年代对应关系待专业核实。'
    }
  },
  {
    id: 'jiangjun', index: 2, name: '青花云龙纹罐', era: '元', glaze: '青花',
    origin: '古码头', storyline: '外销 · 海上丝路', archive: 'QY-1351',
    glazeType: 'qinghua-dragon', textureSeed: 1351,
    model: 'vessels/jiangjun.glb',
    // 用户提供的器物照片在照片内的取景框（归一化 x/y/w/h）：柱面纹理只从这个框里取样，
    // 不补画任何纹样。图源：public/patterns/real/vessel-03-guan.png
    photoCrop: { x: .10,  y: .328, w: .80,  h: .598 },
    outline: JIANGJUN_OUTLINE, fragmentCount: 12, siteSeed: 165401, rotationMap: { 2: 15, 8: -15 },
    location: 'taoxichuan',
    fragments3d: { seed: 165401, rings: 6, thickness: .18, tilt: .38, benchDepth: 1.55, scatterRadius: 1.85, scatterLift: 1.12, hoverHeight: .2 },
    proto: { img: './patterns/real/vessel-03-guan.png', caption: '元 · 青花缠枝牡丹云龙纹罐', source: '故宫博物院藏 · 新00196642（云龙纹样原型）', cutout: true },
    intro: '按异国客商图样烧造的外销大罐，装满稻壳随商船出海，归途沉于近海。海水腌渍数百年后出水，云龙与牡丹的蓝几乎未褪。',
    breakdown: '十二块瓷片 / 盐结晶已清除 / 待拼合',
    stories: [
      { id: 'jj-01', title: '为远行而造', year: '至正十一年 · 1351', image: pattern(2, 0), text: '我是按异国客商的图样烧成的罐子，腹上盘着两条云龙，近足处开着缠枝牡丹。窑工说，海那边的人喜欢大器——要能装下整整一个东方的想象。' },
      { id: 'jj-02', title: '装箱启程', year: '至正十二年 · 春', image: pattern(2, 1), text: '我被稻壳裹得严严实实，装进烙着商行火印的木箱。古码头的号子声里，我被抬上跳板；脚下的青石被千万双草鞋磨得发亮。' },
      { id: 'jj-03', title: '江入海', year: '至正十二年 · 夏', image: pattern(2, 2), text: '我随船离港，昌江的水越来越宽，咸味一天天变重。船舱里挤着我的同乡——几百只瓷箱在黑暗里彼此倾听，听龙骨在浪里的呻吟。' },
      { id: 'jj-04', title: '异乡集市', year: '至正十三年', image: pattern(2, 3), text: '我在一处说不清名字的集市上被打开。咸腥的海风换成了香料的甜腻；人们用我听不懂的语言惊叹，指尖隔着绸布抚过我的龙鳞。' },
      { id: 'jj-05', title: '归途风浪', year: '至正十四年 · 秋', image: pattern(2, 4), text: '我在归途遇到风暴。那夜浪头比桅杆还高，木箱在货舱里滑动、碰撞，我用尽全身的釉面去抵住同伴——碎裂声里，我们谁也没能留住谁。' },
      { id: 'jj-06', title: '海底长眠', year: '此后数百年', image: pattern(2, 5), text: '我沉在近海的海床上，一睡数百年。珊瑚把我当成礁石，鱼群从我的断口游进游出。盐慢慢渗进胎骨，可云龙还保持着飞行的姿势。' },
      { id: 'jj-07', title: '出水之日', year: '二十世纪末', image: pattern(2, 6), text: '我被起吊缆拉出水面那一刻，阳光像一把利剑劈开海水。脱盐池里的淡水一天天换，我身上的盐霜化作细小的白雾，散了几百年的一口咸气。' },
      { id: 'jj-08', title: '归乡', year: '数字纪年 · 今日', image: pattern(2, 7), text: '我回来了，回到昌江边的修复桌上。十二片碎瓷摊在天鹅绒上，像一张摊开的航海图。请把我拼回大器——这次，我要堂堂正正地出海，或者，再也不出海。' }
    ],
    voices: {
      painter: '画师：外销瓷的纹样要画得满，海那边的人隔着万里看不清留白。可你拼瓷要看得清——慢一点。',
      keeper: '掌柜：绕了地球一圈的货，最后赚到的不是银子，是这段水路。你的手，把它捞回来了。',
      kilnWorker: '窑工：出海的瓷十船九凶。它没沉在心理上，就还能再装一次春天。你说呢？'
    },
    culture: {
      culturalContext: '元代景德镇青花大量外销，常按订户图样烧造，经海路远销。元青花多用多层带状布局，云龙与缠枝牡丹为经典组合；沉船出水与海外馆藏证明这条贸易路线的存在。',
      craftRoles: ['配釉', '画坯', '装坯 · 烧窑', '商行包装 · 航运', '出水文物保护（脱盐）'],
      referenceScope: '云龙与缠枝牡丹组合参考故宫藏新00196642；多层装饰布局参考元青花公开馆藏；外销沉船经历为创作。',
      contentLayers: {
        fact: '元青花外销与海上贸易路线，为馆藏与沉船考古资料支持的史实语境。',
        legend: '',
        fiction: '本件的沉没海域、商行与集市见闻为原创叙事。'
      },
      sources: [
        { name: '故宫博物院 · 元青花缠枝牡丹云龙纹罐（新00196642）', url: 'https://www.dpm.org.cn/collection/ceramic/227554.html', used: '纹样参考' },
        { name: '中国非物质文化遗产网 · 景德镇传统手工制瓷技艺', url: 'https://www.ihchina.cn/project_details/10291', used: '工艺语境' }
      ],
      digitalTranslation: '拼合页「航海图」式碎片布局 → 体会外销瓷的旅程；记忆页出水脱盐情节 → 认识出水文物保护。',
      uncertainty: '本件沉没海域与商行信息均为虚构；如需引用真实沉船案例，须另行核实来源。'
    }
  },
  {
    id: 'gaozu', index: 3, name: '釉里红高足转杯', era: '元', glaze: '釉里红',
    origin: '高岭村', storyline: '创烧 · 匠人胆魄', archive: 'YLH-1341',
    glazeType: 'youlihong', textureSeed: 1341,
    model: 'vessels/gaozu.glb',
    // 用户提供的器物照片在照片内的取景框（归一化 x/y/w/h）：柱面纹理只从这个框里取样，
    // 不补画任何纹样。图源：public/patterns/real/vessel-04-gaozu.jpg
    photoCrop: { x: .198, y: .293, w: .614, h: .608 },
    outline: GAOZU_OUTLINE, fragmentCount: 10, siteSeed: 136901, rotationMap: { 1: 25, 6: -15 },
    location: 'guyao',
    fragments3d: { seed: 136901, rings: 5, thickness: .15, tilt: .3, benchDepth: 1.25, scatterRadius: 1.5, scatterLift: .95, hoverHeight: .16 },
    proto: { img: './patterns/real/vessel-04-gaozu.jpg', caption: '元 · 景德镇窑釉里红转把杯', source: '故宫博物院藏 · 新00020527（釉里红高足杯原型）', cutout: false },
    intro: '以元代釉里红为灵感的数字试验之作。铜红一窑九败，窑工们却在高岭村的窑火里一次次重来。此杯腹上那一片红，烧得将将好。',
    breakdown: '十块瓷片 / 红釉局部可辨 / 矿洞出土',
    stories: [
      { id: 'gz-01', title: '高岭取土', year: '至正元年 · 1341', image: pattern(3, 0), text: '我是高岭村溪水里淘洗出的一捧白石。水碓日夜敲打着矿脉的回声，淘洗槽下的溪水凉得像瓷。匠人捧起我说：这一捧，要试着烧出人间的红。' },
      { id: 'gz-02', title: '铜红初试', year: '至正元年 · 夏', image: pattern(3, 1), text: '我是窑里第一支被点上铜红的杯坯。老窑工摇头说，铜红是火里的赌——差一分是黑，过一分是绿。他点完我腹上的红斑，手心全是汗。' },
      { id: 'gz-03', title: '开窑皆灰', year: '至正三年', image: pattern(3, 2), text: '我看着同一釉方的兄弟们出窑：那一整窑的釉里红全成了灰黑。开窑时没有人说话，只有匣钵相碰的钝响。我听见年轻的窑工蹲在窑口，半日没有起身。' },
      { id: 'gz-04', title: '再来一窑', year: '至正五年', image: pattern(3, 3), text: '我被换了窑位，改了火路，身上的铜红点得比上次薄了一半。我带着腹上那一片将将好的红出了窑——所有失败的窑火，都在为这一次成功陪葬。' },
      { id: 'gz-05', title: '匠人之家', year: '元末', image: pattern(3, 4), text: '我被摆在窑主家的堂屋条案上，成了这窑最体面的一件。每年新窑点火前，全家人都要来摸一摸我腹上的红——像摸一块被驯服过的火，也像提醒自己别忘了那些灰黑的窑。' },
      { id: 'gz-06', title: '矿洞避乱', year: '明末', image: pattern(3, 5), text: '我在兵乱来时被窑主的后人藏进高岭的废弃矿洞。黑暗里我听见外面的人说：瓷可以再烧，命只有一条。可我知道，有些东西碎了，就再也不会红。' },
      { id: 'gz-07', title: '矿洞重开', year: '民国', image: pattern(3, 6), text: '我看见矿灯照进洞口，蝙蝠扑棱棱飞起。一个穿短褂的人捧起我，用袖口擦去几百年的尘土——我腹上的红从他的瞳孔里亮起来，像一场迟到的大火。' },
      { id: 'gz-08', title: '红归原位', year: '数字纪年 · 今日', image: pattern(3, 7), text: '我今天回到了高岭村，回到离出生最近的桌上。十片碎瓷散着，像当年没烧成的那些窑。请拼好我——替所有说过「再来一窑」的人。' }
    ],
    voices: {
      painter: '画师：釉里红要一气呵成，笔停的地方釉就死。你手上的碎片停了不要紧——重新拿起来，就是。',
      keeper: '掌柜：这一圈红，值一窑的失败。世上成器的事，大抵如此。',
      kilnWorker: '窑工：十窑九不成，是我们那代人的命。可我们从来没说过不烧。'
    },
    culture: {
      culturalContext: '釉里红以铜为呈色剂，须高温还原焰方显红色，对窑温与气氛极为敏感，成品率低。高足杯为元代流行器型，「转把」（杯身与足可转动）是其特色做法。',
      craftRoles: ['淘泥 · 拉坯', '画坯（釉里红）', '施釉', '把桩（看火）', '窑主与使用者'],
      referenceScope: '高足杯器型与釉里红呈色参考故宫藏新00020527；「转把」结构为元代高足杯公开资料支持。',
      contentLayers: {
        fact: '釉里红工艺敏感、成品率低，高足杯为元代典型器型，为馆藏与陶瓷史资料支持。',
        legend: '「十窑九不成」为民间俗语，形容成品率低，非统计数据。',
        fiction: '高岭村取土、矿洞避乱等经历与委托人小禾为原创叙事。'
      },
      sources: [
        { name: '故宫博物院 · 元景德镇窑釉里红转把杯（新00020527）', url: 'https://www.dpm.org.cn/collection/ceramic/226885.html', used: '器型与釉色参考' },
        { name: '中国非物质文化遗产网 · 景德镇传统手工制瓷技艺', url: 'https://www.ihchina.cn/project_details/10291', used: '看火与分工语境' }
      ],
      digitalTranslation: '窑火数据卡（创作示意）→ 直观感受成品率之低；「再来一窑」叙事 → 理解匠人经验的价值。',
      uncertainty: '釉里红「元代创烧」的具体年代与最早实物存学术讨论；釉方与烧成温度为专业资料，本项目不作具体数值表述。'
    }
  },
  {
    id: 'suantou', index: 4, name: '祭红釉蒜头瓶', era: '明永乐', glaze: '颜色釉',
    origin: '御窑厂', storyline: '传说 · 跳窑女', archive: 'JH-YY-1403',
    glazeType: 'jihong', textureSeed: 1403,
    model: 'vessels/suantou.glb',
    // 用户提供的器物照片在照片内的取景框（归一化 x/y/w/h）：柱面纹理只从这个框里取样，
    // 不补画任何纹样。图源：public/patterns/real/vessel-05-suantou.jpg
    photoCrop: { x: .292, y: .098, w: .45,  h: .852 },
    outline: SUANTOU_OUTLINE, fragmentCount: 12, siteSeed: 140301, rotationMap: { 3: 25, 9: -15 },
    location: 'yuyao',
    fragments3d: { seed: 140301, rings: 6, thickness: .18, tilt: .4, benchDepth: 1.5, scatterRadius: 1.8, scatterLift: 1.1, hoverHeight: .2 },
    proto: { img: './patterns/real/vessel-05-suantou.jpg', caption: '明嘉靖 · 白釉塑贴红蟠螭纹蒜头瓶', source: '故宫博物院藏 · 故00145720（蒜头瓶器型参考）', cutout: false },
    intro: '祭红釉，窑变十窑九不成。通体不见纹样，只有一片被火驯服的红。民间传有窑工之女纵身入火、满窑霞色的故事——传说不可考，红是真的。',
    breakdown: '十二块瓷片 / 釉色完好 / 库房移交',
    stories: [
      { id: 'st-01', title: '配釉之人', year: '永乐元年 · 1403', image: pattern(4, 0), text: '我听着配釉的窑工之女把珊瑚、玛瑙、石英一样样称进臼里，杵声在夜里格外清脆。她说：祭天的红，要配得比自己的命还认真。' },
      { id: 'st-02', title: '素胎如雪', year: '永乐二年', image: pattern(4, 1), text: '我上釉前是通体素白的一支蒜头瓶。她用釉笔从我肩头一路淋下，釉浆的凉意顺着胎骨滑到底——那是我第一次披上即将成为传说的东西。' },
      { id: 'st-03', title: '十窑九败', year: '永乐二年 · 夏', image: pattern(4, 2), text: '我看着同一釉方的兄弟们一窑窑出窑：灰的、黑的、猪肝色的。失败品在厂外堆成小山。没有人哭——御窑的人早把眼泪烧干了。' },
      { id: 'st-04', title: '那一窑红', year: '永乐三年 · 春', image: pattern(4, 3), text: '我出窑的时候天还没亮。通体的红在晨光里显出来，深得像凝固的晚霞。老窑工跪在窑口，久久没有说话。十窑九败的第九十一窑，成了。' },
      { id: 'st-05', title: '传说', year: '传述无定年', image: pattern(4, 4), text: '我后来听人说起那位女子：祭红难成，她纵身入了火。窑门开时，满窑红釉如霞。传说我从未考证过——可每当我看见自己的红，就想起她称釉时的杵声。' },
      { id: 'st-06', title: '藏入祭器库', year: '万历年间', image: pattern(4, 5), text: '我被收进祭器库的深架，与钟鼎为邻，终年不见日光。只有每年祭典前的大扫除，能让我听见一下人间的扫帚声，闻一闻窗缝里漏进来的香灰气。' },
      { id: 'st-07', title: '流散之路', year: '清末', image: pattern(4, 6), text: '我眼看着库房的大门在混乱中被撞开。我被裹进一张旧毡子，在人手里辗转。每到夜里，毡子缝隙漏进的月光照在我身上——红在月光下是暗的，像压住的一团火。' },
      { id: 'st-08', title: '月下归位', year: '数字纪年 · 今日', image: pattern(4, 7), text: '我今晚被摆上修复桌，月光很好。十二片碎瓷排开，我的红在灯下安安静静。传说里的女子用一瞬换了我，你用耐心让我重圆。我愿被记住的，是匠人的劳动与手艺。' }
    ],
    voices: {
      painter: '画师：祭红无纹可循，拼它靠的是断口的弧度，不是眼睛。信手，更要信缝。',
      keeper: '掌柜：九十一窑才出一件的红，碎十二片算什么。它见过的失败，比你我多得多。',
      kilnWorker: '窑工：传说寄托了乡人的心意，成色却来自材料与火候。修好它，也把手艺讲清楚。'
    },
    culture: {
      culturalContext: '祭红（霁红）为高温铜红釉，烧成极难，明清文献多记其难得；民间流传窑工之女跳窑成红的传说，属地方叙事而非工艺成因。蒜头瓶因口部形似蒜头得名。',
      craftRoles: ['配釉', '施釉', '把桩（看火）', '祭器管理', '传说传述者'],
      referenceScope: '蒜头瓶器型参考故宫藏故00145720（白釉塑贴红蟠螭纹蒜头瓶）；红色为数字釉色表达，非复制该馆藏器物。',
      contentLayers: {
        fact: '祭红属铜红釉、烧成困难，为公开馆藏资料支持。',
        legend: '窑工之女跳窑为民间传说，不可考，不作为红釉的科学成因。',
        fiction: '「九十一窑成红」的情节与配釉之女的形象为原创叙事。'
      },
      sources: [
        { name: '故宫博物院 · 明嘉靖白釉塑贴红蟠螭纹蒜头瓶（故00145720）', url: 'https://www.dpm.org.cn/collection/ceramic/227142.html', used: '器型参考' },
        { name: '中国非物质文化遗产网 · 景德镇传统手工制瓷技艺', url: 'https://www.ihchina.cn/project_details/10291', used: '配釉与烧成语境' }
      ],
      digitalTranslation: '委托人「写两张展签」的心愿 → 记忆页刻意区分传说与工艺事实，训练求真意识。',
      uncertainty: '永乐朝祭红的成熟程度及其与宣德霁红的关系存学术讨论。'
    }
  },
  {
    id: 'linglong', index: 5, name: '青花玲珑镂空碗', era: '清乾隆', glaze: '玲珑瓷',
    origin: '古镇作坊', storyline: '绝技 · 透光之美', archive: 'LL-ZF-1785',
    glazeType: 'linglong', textureSeed: 1785,
    model: 'vessels/linglong.glb',
    // 用户提供的器物照片在照片内的取景框（归一化 x/y/w/h）：柱面纹理只从这个框里取样，
    // 不补画任何纹样。图源：public/patterns/real/vessel-06-linglong.jpg
    photoCrop: { x: .073, y: .358, w: .85,  h: .568 },
    outline: LINGLONG_OUTLINE, fragmentCount: 10, siteSeed: 178501, rotationMap: { 4: 15, 8: -25 },
    location: 'taoxichuan',
    fragments3d: { seed: 178501, rings: 5, thickness: .14, tilt: .28, benchDepth: 1.18, scatterRadius: 1.45, scatterLift: .9, hoverHeight: .15 },
    proto: { img: './patterns/real/vessel-06-linglong.jpg', caption: '明永乐 · 影青暗花缠枝莲纹碗', source: '故宫博物院藏 · 故00145525（薄胎透光工艺参考）', cutout: false },
    intro: '作坊老师傅晚年的绝技之作：碗身刻出米粒状玲珑眼，填釉烧成后透光如星。碎于作坊最顺手的位置——那应该是一辈子没离开过条凳的人。',
    breakdown: '十块瓷片 / 玲珑眼多数完好 / 作坊出土',
    stories: [
      { id: 'll-01', title: '刻眼之人', year: '乾隆五十年 · 1785', image: pattern(5, 0), text: '我身上被刻出第一粒玲珑眼时，刻眼的师傅已经很老了。他把我捧在膝上，刻刀转过时坯屑簌簌落下。他说：这些眼，是给光留的门。' },
      { id: 'll-02', title: '填釉', year: '乾隆五十年 · 春', image: pattern(5, 1), text: '我被师娘一点点填釉——她把釉料填进每个孔眼，指腹擦过坯面，凉凉的。她说填釉的人心里要静——心里有一粒躁，釉就堵一粒光。' },
      { id: 'll-03', title: '入窑', year: '乾隆五十年 · 夏', image: pattern(5, 2), text: '我进了窑。那些填了釉的小孔在火里与我一同受热，像一盏盏将亮未亮的灯。窑膛深处，我听见自己的心跳和火是同一个节奏。' },
      { id: 'll-04', title: '灯下见星', year: '乾隆五十年 · 秋', image: pattern(5, 3), text: '我出窑那晚，被师傅举到油灯前。光从每一个玲珑眼里漏出来，在我身上落成一碗星星。老人举着我，手抖得像第一次拉坯。' },
      { id: 'll-05', title: '验货之日', year: '乾隆五十一年', image: pattern(5, 4), text: '我被商人举过头顶，让日头从碗里照下来。满碗的光斑落在他的账本上。他没还价，只用生硬的官话说：这样的货，有多少，要多少。' },
      { id: 'll-06', title: '茶楼岁月', year: '嘉庆至道光', image: pattern(5, 5), text: '我最终没有出海，被一家茶楼留了下来。每天最亮的时辰，阳光会斜穿过我的玲珑眼，在桌面上洒下细碎的光点——客人们说，那是这间楼里最好看的一道菜。' },
      { id: 'll-07', title: '残于晨扫', year: '咸丰年间', image: pattern(5, 6), text: '我在一个清晨被伙计擦桌时的袖口带倒。碎裂声惊起满楼麻雀。掌柜把我的碎片用茶盘收起来，收得很慢，像在收一段唱完了的曲。' },
      { id: 'll-08', title: '光待重燃', year: '数字纪年 · 今日', image: pattern(5, 7), text: '我今天回到了作坊的条凳上，身边摆满自己的碎片。玲珑眼里的釉还透着光。请把那些光的门一扇扇拼回来——灯，我已经等了两百年。' }
    ],
    voices: {
      painter: '画师：玲珑眼是给光留的门。拼它的时候，把台灯打开——光会告诉你对不对。',
      keeper: '掌柜：老辈人说，碗碎有声是它在跟楼里道别。今天这一声，是重逢。',
      kilnWorker: '窑工：透光的瓷，是拿整块胎换一粒光。所以它碎了，也要碎得亮堂。'
    },
    culture: {
      culturalContext: '玲珑瓷在坯体镂出「玲珑眼」填釉烧成，透光如米粒，旧有「米通」之称，常与青花结合为青花玲珑。景德镇制瓷分工细密，《天工开物》有「过手七十二方克成器」之说；此技至今仍有人传习。',
      craftRoles: ['刻眼（镂坯）', '填釉', '画坯（青花边饰）', '施釉 · 烧窑', '师徒传习'],
      referenceScope: '薄胎透光工艺参考故宫藏故00145525（永乐影青暗花碗）；玲珑眼布局与青花边饰为数字纹样原创。',
      contentLayers: {
        fact: '玲珑瓷工艺与《天工开物》「过手七十二」的分工记载为公开资料支持。',
        legend: '',
        fiction: '老师傅与作坊故事、委托人阿宁为原创叙事。'
      },
      sources: [
        { name: '故宫博物院 · 明永乐影青暗花缠枝莲纹碗（故00145525）', url: 'https://www.dpm.org.cn/collection/ceramic/227639.html', used: '薄胎透光工艺参考' },
        { name: '中国非物质文化遗产网 · 景德镇传统手工制瓷技艺', url: 'https://www.ihchina.cn/project_details/10291', used: '分工与传承语境' }
      ],
      digitalTranslation: '玲珑眼「对光」拼合 → 体会透光审美；「给光留的门」 → 传承叙事的落点。',
      uncertainty: '「过手七十二」为《天工开物》文献引述，工序数目历代记载有异。'
    }
  }
];

// 三处写实考察点：与 src/kaocha 中已详细建模的三处景点一一对应。
// unlockAt：修满该件数后开放；site/camera 指向写实景点与预设机位。
export const LOCATIONS = [
  {
    id: 'yuyao', name: '御窑厂', site: 'yuyao', camera: 0, unlockAt: 2,
    ambient: 'noon', timeLabel: '午静',
    note: '红墙下的匣钵堆了半人高。晌午的日头很静，落在掩埋坑的探方上；讲解的人说，这里的碎瓷按年代分层，一层就是一个朝代的手抖与心虚。'
  },
  {
    id: 'guyao', name: '古窑', site: 'guyao', camera: 0, unlockAt: 4,
    ambient: 'kiln', timeLabel: '窑火',
    note: '镇窑的窑房是穿斗木构，双砖烟囱从屋面探出；沿坡而上的宋代龙窑敞廊里，还留着上一次封窑的灰。松柴与釉料的气味压在檐下，散不开。'
  },
  {
    id: 'taoxichuan', name: '陶溪川', site: 'taoxichuan', camera: 0, unlockAt: 6,
    ambient: 'water', timeLabel: '暮色',
    note: '包豪斯锯齿屋顶的厂房一字排开，红砖烟囱以锥形收分立在水边；镜面浅水池把烟囱与钢桁架倒映成两半，暮色里钢铁与窑砖一样安静。'
  }
];

// 首页主角：独立的真实模型（网页优化副本）。
export const HERO_MODEL = 'hero.glb';

export const vesselById = id => VESSELS.find(v => v.id === id);
export const locationById = id => LOCATIONS.find(l => l.id === id);

// 器型轮廓的包围盒：碎片 UV 与纹理映射的基准（留少量边距防裁切）。
export function outlineBBox(outline) {
  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
  const pad = .12;
  return [+Math.min(...xs).toFixed(3) - pad, +Math.min(...ys).toFixed(3) - pad,
    +Math.max(...xs).toFixed(3) + pad, +Math.max(...ys).toFixed(3) + pad];
}
