import * as THREE from 'three';
import { mulberry32 } from '../data/vessels.js';
import { ONLINE_MODE } from '../config.js';
import { vesselProfile, radiusAt } from './vessels3d.js';

// 六套釉彩纹理。纹样唯一来源 = 用户提供的器物照片（public/patterns/real/）：
// · 平面版（2D 回退）：照片按器型轮廓**逐行重映射**到轮廓包围盒——实测剪影的左右边缘
//   对齐轮廓该高度的半宽，口沿/足底对齐包围盒上下沿，2D 碎片纹样与器形完全嵌套；
// · 环绕版（3D 器身/碎片）：把照片按**实测剪影**逐行重投影到柱面——每行只取照片里
//   器身左右边缘之间的像素，压进前 180°，再镜像铺满后 180°，两侧同源所以接缝天然连续，
//   取样永不溢出到照片背景，纹样与器形严丝合缝。
//   不再用程序化笔触补画缠枝莲/花鸟等纹样：照片上没有的纹样不会出现在器身上。
//   程序化画笔仅作"照片未就绪/线上无授权模式"的占位兜底；剪影实测失败时退回 photoCrop 取景框。
// 原型图片来源与许可：public/patterns/real/ATTRIBUTION.md
// UV 按器型轮廓包围盒映射，画布 768×1200。

const W = 768, H = 1200;

const REAL_TEXTURES = {
  meiping: './patterns/real/vessel-01-meiping.png',
  yuhuchun: './patterns/real/vessel-02-yuhuchun.png',
  jiangjun: './patterns/real/vessel-03-guan.png',
  gaozu: './patterns/real/vessel-04-gaozu.jpg',
  suantou: './patterns/real/vessel-05-suantou.jpg',
  linglong: './patterns/real/vessel-06-linglong.jpg'
};
// 平面版沿用原口径：只给有馆藏照片的三件青花叠照片底图（其余三件的照片带背景，平面版不铺）。
const FLAT_PHOTO_IDS = new Set(['meiping', 'yuhuchun', 'jiangjun']);

const realImages = new Map();

// 启动时预载真实器物照片；每张载入完成即入缓存并回调，新生成的纹理自动使用照片底图。
export function preloadRealTextures(onReady) {
  for (const [id, src] of Object.entries(REAL_TEXTURES)) {
    if (realImages.has(id)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { realImages.set(id, img); onReady?.(id); };
    img.src = src;
  }
}

function baseCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  return [canvas, canvas.getContext('2d')];
}

// —— 剪影实测：逐行扫描照片，量出器身每行的左右边缘与口沿/足底位置 ——
// 馆藏照片为均匀灰底（玲珑等 jpg 亦同），透明切图则直接读 alpha；瓷面/青花纹样
// 与背景差异显著，可稳定分割。实测结果让取样严格落在器身之内：纹样与器形
// 完全嵌套，不再把照片背景带进纹理。实测失败（背景不均匀等）返回 null，走 photoCrop 兜底。
const silCache = new Map();
export function analyzeSilhouette(img, crop) {
  if (!crop) crop = { x: 0, y: 0, w: 1, h: 1 };
  const IW = img.naturalWidth || img.width, IH = img.naturalHeight || img.height;
  if (!IW || !IH) return null;
  const scale = Math.min(1, 320 / IW);
  const w = Math.max(48, Math.round(IW * scale)), h = Math.max(48, Math.round(IH * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const sctx = c.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, 0, 0, w, h);
  const d = sctx.getImageData(0, 0, w, h).data;
  // 逐行背景参照带（最多 4 条）：画幅左右边距（全局）+ 取景框外侧邻带（局部）。
  // 像素与任一参照同色即判背景：馆藏照片有渐晕（边角暗、中部亮），单一全局参照
  // 会把器旁背景整行误检成器身（实测出横贯画幅的假腹径）；局部参照带紧邻器身，
  // 与器旁背景几乎无渐晕差。取景框过紧（邻带压到器身上）的行，局部参照失真，
  // 但此时像素仍可与全局边距参照比对，两条互为兜底。
  const band = (x0, x1) => { x0 = Math.max(2, x0); x1 = Math.min(w - 3, x1); return x1 >= x0 ? [x0, x1] : null; };
  const bands = [];
  const gL = band(2, 8), gR = band(w - 9, w - 3);
  if (gL) bands.push(gL);
  if (gR) bands.push(gR);
  const lL = band(Math.round(crop.x * w) - 12, Math.round(crop.x * w) - 4);
  const lR = band(Math.round((crop.x + crop.w) * w) + 4, Math.round((crop.x + crop.w) * w) + 12);
  if (lL && lL[0] > 8) bands.push(lL);                     // 局部带不与全局带重叠才有增量信息
  if (lR && lR[1] < w - 9) bands.push(lR);
  const rowBg = new Float32Array(bands.length * h * 3);
  for (let y = 0; y < h; y++) {
    for (let k = 0; k < bands.length; k++) {
      let sr = 0, sg = 0, sb = 0;
      const [x0, x1] = bands[k];
      for (let x = x0; x <= x1; x++) { const o = (y * w + x) * 4; sr += d[o]; sg += d[o + 1]; sb += d[o + 2]; }
      const n = x1 - x0 + 1, j = (k * h + y) * 3;
      rowBg[j] = sr / n; rowBg[j + 1] = sg / n; rowBg[j + 2] = sb / n;
    }
  }
  const isVes = (y, x) => {
    const o = (y * w + x) * 4;
    if (d[o + 3] < 40) return false;                      // 透明切图：alpha 即剪影
    const r = d[o], g = d[o + 1], b = d[o + 2];
    // 冷白瓷面：白釉偏蓝（b-r 明显为正且偏亮），中性灰底没有这种偏色——
    // 白釉贴浅灰底的照片（高足杯/蒜头瓶等）整体色差偏低，靠它补充检出。
    if (b - r > 12 && b > 190) return true;
    for (let k = 0; k < bands.length; k++) {
      const j = (k * h + y) * 3;
      // 阈值 35：四参照带下背景与参照的色差实测 ≤17，留足余量。更低的阈值会把
      // 背景噪点（26-35）并进游程、令实测窗外扩采进背景（目检灰条反而加重）；
      // 青白釉中间调（高足杯足柄，色差 20-33）漏检成背景的行由 span 全跨度兜底——
      // 漏检的是器身内部，跨度两端仍贴真实边缘，不会产生灰区。
      if (Math.abs(r - rowBg[j]) + Math.abs(g - rowBg[j + 1]) + Math.abs(b - rowBg[j + 2]) <= 35) return false;
    }
    return true;
  };
  const BORDER = 6;                                        // 画幅边缘若干列常是扫描伪影/渐晕条带，直接不参与检测
  // 主链只在取景框 ±2% 行范围内搜索：取景框是人工精调的器物边界，框外（照片顶部
  // 渐变斑、水印、右缘伪影柱等）必非器身——不限定的话这些杂带会沿链路并进实测窗。
  const cTop = Math.max(0, crop.y * h - h * .02), cBot = Math.min(h, (crop.y + crop.h) * h + h * .02);
  // 逐行提取器身游程：阈值分割 → 近邻游程合并（容忍 ≤4px 高光/浅纹间断）→
  // 剔除全幅横带（扫描伪影/桌沿横线，真实器物不会占满 93% 画幅宽）。
  const runsByRow = [];
  const rawLo = new Int32Array(h).fill(1 << 30), rawHi = new Int32Array(h).fill(-1);
  for (let y = 0; y < h; y++) {
    if (y < cTop || y >= cBot) { runsByRow.push([]); continue; }
    const raw = [];
    let s = -1;
    for (let x = BORDER; x < w - BORDER; x++) {
      if (isVes(y, x)) { if (s < 0) s = x; }
      else if (s >= 0) { raw.push(s, x - 1); s = -1; }
    }
    if (s >= 0) raw.push(s, w - BORDER - 1);
    const runs = [];
    for (let i = 0; i < raw.length; i += 2) {
      const a = raw[i], b = raw[i + 1], p = runs.length ? runs[runs.length - 1] : null;
      if (p && a - p[1] <= 4) p[1] = b; else runs.push([a, b]);
    }
    // 每行只保留「包含取景框中线」的游程：器身一定穿过中线，而背景渐变带/阴影带
    // 几乎总在中线之外——旧口径取最宽游程，渐晕带比器身宽时整条链就跟带走了
    // （蒜头瓶/玲珑碗的花纹因此整片采到背景上）。中线无游程时取距中线最近的游程。
    const cc = (crop.x + crop.w / 2) * w;
    let pick = null, pickD = Infinity, lo = 1 << 30, hi = -1;
    for (const [a, b] of runs) {
      if (b - a >= (w - 2 * BORDER) * .93) continue;
      if (a < lo) lo = a;
      if (b > hi) hi = b;
      if (a <= cc && b >= cc) { pick = [a, b]; pickD = 0; break; }
      const d = a > cc ? a - cc : cc - b;
      if (d < pickD && d < w * .12) { pick = [a, b]; pickD = d; }
    }
    // 从含中线的游程向两侧跨花隙合并：青花纹样的白隙（>4px 合并阈值）会把器身
    // 游程切碎，窗口逐行抖动 → 纹理横向拉花。合并条件 = 相邻游程间隙 ≤2.5% 画宽
    // （真实背景与器身之间的空隙远大于此），且并回后不超出取景框。
    if (pick) {
      // 跨隙合并的间隙上限取 6% 画宽：青花纹样的白隙在 320 宽的缩略图上是 5~20px，
      // 阈值太小窗口会被花隙切碎（逐行在"整幅器身"与"单朵花"之间跳，纹理横向拉花）；
      // 同时用 GLB 轮廓包络（×1.15）钳住合并边界——真实背景与器身之间的空隙远大于
      // 花隙，且包络本身就按器型收放，不会把背景带并进来。
      const gapMax = w * .06;
      const envR = Math.min(w - BORDER - 1, cc + crop.w * w / 2);
      const envL = Math.max(BORDER, cc - crop.w * w / 2);
      let merged = true;
      while (merged) {
        merged = false;
        for (const [a, b] of runs) {
          if (b - a >= (w - 2 * BORDER) * .93) continue;
          if (a >= pick[0] && b <= pick[1]) continue;
          if (a - pick[1] >= 0 && a - pick[1] <= gapMax && b <= envR) { pick[1] = b; merged = true; }
          else if (pick[0] - b >= 0 && pick[0] - b <= gapMax && a >= envL) { pick[0] = a; merged = true; }
        }
      }
      pick[0] = Math.max(BORDER, pick[0]); pick[1] = Math.min(w - BORDER - 1, pick[1]);
    }
    runsByRow.push(pick ? [pick] : []);
    if (hi >= 0) { rawLo[y] = lo; rawHi[y] = hi; }         // 全跨度：链路漏检行的兜底窗口
  }
  // 主链定位：取中部 60% 内「含中线游程」最宽的行作种子（腹径），再向上下逐行延伸：
  // 与上一行段重叠（且单行外扩受限）的游程并入器身段；连续 gap 超过桥限（浅色纹带
  // 与灰底同色调时整行检不出，实测纹带宽可达器高 12%）则链路终止。
  const L = new Int32Array(h).fill(-1), R = new Int32Array(h).fill(-1);
  const bridge = Math.round(h * .20);
  let seedY = -1, seedL = 0, seedR = 0, seedW = 0;
  for (let y = Math.round(h * .2), yE = Math.round(h * .8); y < yE; y++) {
    for (const [a, b] of runsByRow[y]) {
      const wd = b - a + 1;
      if (wd > seedW && wd >= w * .10) { seedW = wd; seedY = y; seedL = a; seedR = b; }
    }
  }
  if (seedY >= 0) {
    L[seedY] = seedL; R[seedY] = seedR;
    for (let dir = 1; dir >= -1; dir -= 2) {               // dir=1 向下、-1 向上各走一遍
      let cl = seedL, cr = seedR, gap = 0;
      for (let y = seedY + dir; y >= 0 && y < h; y += dir) {
        let nl = -1, nr = -1;
        const grow = (cr - cl) * .125 + 3;                 // 每侧单行最多外扩 12.5%+3px
        if (dir < 0) {                                     // 上行防带：比腹径还宽 15% 的游程必是照片顶部
          let rawW = 0;                                    // 伪影横带（真实口沿外张不会超过腹径），止步。
          for (const [a, b] of runsByRow[y]) { const wd = b - a + 1; if (wd > rawW) rawW = wd; }
          if (rawW > seedW * 1.15) break;                  // 不与当前段比宽：玉壶春软边实测段偏窄，会误杀外张口沿
        }
        for (const [a, b] of runsByRow[y]) {
          const a2 = Math.max(a, cl - grow), b2 = Math.min(b, cr + grow);
          if (a2 > b2 || b2 < cl - 2 || a2 > cr + 2) continue;
          if (nl < 0 || a2 < nl) nl = a2;
          if (b2 > nr) nr = b2;
        }
        if (nl >= 0) { cl = nl; cr = nr; gap = 0; L[y] = nl; R[y] = nr; }
        else if (++gap > bridge) break;
      }
    }
  }
  const minW = Math.max(2, w * .02);
  const valid = y => L[y] >= 0 && R[y] > L[y] && R[y] - L[y] >= minW;
  let top = -1, bot = -1;
  for (let y = 0; y < h; y++) if (valid(y)) { top = y; break; }      // 口沿顶
  for (let y = h - 1; y >= 0; y--) if (valid(y)) { bot = y; break; } // 足底
  if (top < 0 || bot - top < h * .2) return null;
  // 口沿/足底精测：腹径（中部 60% 内最宽行）只作左右中线基准（drift 判定）；
  // 宽度上限取全跨距最大宽——碗/高足杯的口沿是最宽点，若以腹径为限会把上行
  // 截断在腹径处，口沿量不到。遇到比全跨距最大宽还宽 8% 的行（桌面/投影横带）
  // 或行中线明显偏离腹径中线（边缘噪点/渐晕）即止。
  const midTop = top + Math.round((bot - top) * .2), midBot = top + Math.round((bot - top) * .8);
  let belly = -1, bW = 0;
  for (let y = midTop; y <= midBot; y++) { if (!valid(y)) continue; const wY = R[y] - L[y]; if (wY > bW) { bW = wY; belly = y; } }
  if (belly < 0 || bW < minW) return null;
  let maxW = 0;
  for (let y = top; y <= bot; y++) { if (!valid(y)) continue; const wY = R[y] - L[y]; if (wY > maxW) maxW = wY; }
  const bC = (L[belly] + R[belly]) / 2, drift = w * .12;
  const nearBelly = y => L[y] >= 0 && Math.abs((L[y] + R[y]) / 2 - bC) <= drift;
  // 去毛刺：±3 行滑动平均（跳过无效行与中线漂移行）
  const Ls = new Float32Array(h), Rs = new Float32Array(h);
  for (let y = top; y <= bot; y++) {
    let sl = 0, sr = 0, k = 0;
    for (let j = Math.max(0, y - 3); j <= Math.min(h - 1, y + 3); j++) {
      if (!nearBelly(j)) continue;
      sl += L[j]; sr += R[j]; k++;
    }
    if (k) { Ls[y] = sl / k; Rs[y] = sr / k; }
  }
  // 边缘内缩：从实测左右边缘向内收，跳过与背景同色的混合/软边像素（单侧至多
  // 行宽 4%）。柱面投影在 sin 斜率零点（纹理 x≈192/576）会把贴边混合像素横向
  // 拉伸成宽色带——暗底照片拉出褐条、灰底照片拉出灰条；内缩让取样落在釉面内。
  for (let y = top; y <= bot; y++) {
    if (Ls[y] <= 0 || Rs[y] - Ls[y] < minW * 2) continue;
    const maxE = Math.max(2, Math.round((Rs[y] - Ls[y]) * .04));
    let l = Math.round(Ls[y]), r = Math.round(Rs[y]), e = 0;
    while (e++ < maxE && r - l > minW && !isVes(y, l)) l++;
    for (e = 0; e < maxE && r - l > minW && !isVes(y, r); e++) r--;
    if (r - l >= minW) { Ls[y] = l; Rs[y] = r; }
  }
  const rowOk = y => Ls[y] > 0 && Rs[y] - Ls[y] >= minW && Math.abs((Ls[y] + Rs[y]) / 2 - bC) <= drift;
  const tooWide = y => Rs[y] - Ls[y] > maxW * 1.08;
  let top2 = belly, bot2 = belly;
  for (let y = belly, gap = 0; y >= top; y--) {
    if (tooWide(y)) break;
    if (rowOk(y)) { top2 = y; gap = 0; } else if (++gap > bridge) break;
  }
  for (let y = belly, gap = 0; y <= bot; y++) {
    if (tooWide(y)) break;
    if (rowOk(y)) { bot2 = y; gap = 0; } else if (++gap > bridge) break;
  }
  top = top2; bot = bot2;
  if (bot - top < h * .2) return null;                   // 有效范围退化：走 photoCrop 兜底
  const inv = 1 / scale;
  const edge = (y, tab) => {
    const t = y * scale, i = Math.round(t);
    if (t < top || t > bot || Ls[i] <= 0 || Rs[i] - Ls[i] < minW || Rs[i] - Ls[i] > maxW * 1.08 || Math.abs((Ls[i] + Rs[i]) / 2 - bC) > drift) return -1;
    return tab[i] * inv;
  };
  // 原始游程全跨度：链路整行漏检（釉面与背景同色调）或只剩单侧游程时，该行
  // 全部游程的合并跨度两端仍贴真实器身边缘——中间漏检段本就是器身内部，用跨度
  // 取样不会带进背景。
  const span = y => {
    const t = y * scale, i = Math.round(t);
    if (t < top || t > bot || rawHi[i] < 0 || rawHi[i] - rawLo[i] < minW || Math.abs((rawLo[i] + rawHi[i]) / 2 - bC) > drift) return null;
    return [rawLo[i] * inv, rawHi[i] * inv];
  };
  return {
    top: top * inv, bottom: (bot + 1) * inv,
    l: y => edge(y, Ls),   // 无效行返回 -1：调用方按行兜底
    r: y => edge(y, Rs),
    span
  };
}
function getSilhouette(vessel) {
  const img = realImages.get(vessel.id);
  if (!img) return null;
  if (!silCache.has(vessel.id)) silCache.set(vessel.id, analyzeSilhouette(img, vessel.photoCrop));
  return silCache.get(vessel.id);
}

function porcelainGround(ctx, top = '#fbf6ea', bottom = '#efe7d3') {
  const shade = ctx.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, '#c5c6bc'); shade.addColorStop(.3, top);
  shade.addColorStop(.65, top); shade.addColorStop(1, '#a3b3b6');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
  const soft = ctx.createLinearGradient(0, 0, 0, H);
  soft.addColorStop(0, top); soft.addColorStop(1, bottom);
  ctx.globalAlpha = .45; ctx.fillStyle = soft; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
}

function bandLines(ctx, color, ys, width = 3) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  for (const y of ys) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

function fretBand(ctx, color, y, size = 16) {
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, y);
  for (let x = 0; x < W; x += size * 2) {
    ctx.lineTo(x + size, y); ctx.lineTo(x + size, y + size * .7);
    ctx.lineTo(x + size * 2, y + size * .7); ctx.lineTo(x + size * 2, y);
  }
  ctx.stroke();
}

function lotusScroll(ctx, color, centerY, rows = 4, scale = 1) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 5;
  const step = W / (rows * 1.9);
  for (let row = 0; row < 2; row++) for (let col = 0; col < rows + 1; col++) {
    ctx.save();
    ctx.translate(col * step + (row % 2) * step * .5 - 30, centerY + (row - .5) * 190 * scale);
    ctx.beginPath(); ctx.arc(0, 0, 94 * scale, 0, Math.PI * 1.8); ctx.stroke();
    for (let petal = 0; petal < 8; petal++) {
      ctx.save(); ctx.rotate(petal * Math.PI / 4);
      ctx.beginPath(); ctx.ellipse(0, -34 * scale, 13 * scale, 31 * scale, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 12 * scale, 0, 7); ctx.fill();
    for (let leaf = 0; leaf < 5; leaf++) {
      ctx.save(); ctx.rotate(leaf * 1.3);
      ctx.beginPath(); ctx.ellipse(65 * scale, 0, 21 * scale, 7 * scale, .7, 0, 7); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

function waveCliff(ctx, color, centerY) {
  ctx.strokeStyle = color; ctx.lineWidth = 4;
  for (let band = 0; band < 2; band++) for (let x = -80; x < W + 80; x += 96) {
    const y = centerY + band * 42;
    ctx.beginPath(); ctx.arc(x, y, 48, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 18, y); ctx.lineTo(x + 48, y - 55); ctx.lineTo(x + 78, y); ctx.stroke();
  }
}

function speckle(ctx, seed, count = 5000, alpha = .07) {
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = i % 2 ? `rgba(60,80,110,${alpha})` : `rgba(187,167,128,${alpha})`;
    ctx.fillRect(rng() * W, rng() * H, 1.5, 1.5);
  }
}

// 一号 · 青花缠枝莲纹梅瓶：缠枝莲主体 + 海水江崖足饰 + 回纹颈带。
function qinghuaLotus(ctx) {
  porcelainGround(ctx);
  const blue = '#245b88';
  lotusScroll(ctx, blue, 470, 4, 1);
  waveCliff(ctx, blue, 930);
  fretBand(ctx, blue, 180);
  bandLines(ctx, blue, [70, 90, 1000, 1040, 1100]);
  speckle(ctx, 7, 4200);
}

// 一号 · 青花花鸟纹梅瓶（兜底）：肩部垂云披纹 + 腹部花鸟树石 + 近足缠枝莲带 + 蕉叶纹。
// 纹样布局参照原型：明嘉靖 青花花鸟纹梅瓶（故宫博物院藏）。
function qinghuaBirdflower(ctx) {
  porcelainGround(ctx);
  const blue = '#2b568c';
  bandLines(ctx, blue, [70, 92, 1050, 1078, 1130]);
  // 颈部蕉叶
  for (let x = 40; x < W - 40; x += 46) {
    ctx.strokeStyle = blue; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + 20, 96); ctx.quadraticCurveTo(x + 8, 150, x + 20, 196); ctx.quadraticCurveTo(x + 32, 150, x + 20, 96); ctx.stroke();
  }
  // 肩部垂云披纹（如意云头 + 间隔朵花）
  ctx.lineWidth = 3.5;
  for (let x = 0; x < W; x += 96) {
    ctx.beginPath(); ctx.arc(x + 48, 250, 40, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 48, 268, 8, 0, 7); ctx.fillStyle = blue; ctx.fill();
  }
  // 腹部主纹：折枝花果树石 + 双禽
  const branch = () => { ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 620); ctx.bezierCurveTo(180, 560, 320, 700, 768, 600); ctx.stroke(); };
  branch();
  for (const [cx, cy, r] of [[150, 470, 44], [360, 430, 52], [600, 490, 40], [250, 740, 46], [540, 760, 50]]) {
    ctx.fillStyle = blue;
    for (let p = 0; p < 6; p++) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(p * Math.PI / 3);
      ctx.beginPath(); ctx.ellipse(0, -r * .6, r * .22, r * .48, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = '#f6f1e2'; ctx.beginPath(); ctx.arc(cx, cy, r * .2, 0, 7); ctx.fill();
    ctx.fillStyle = blue; ctx.beginPath(); ctx.arc(cx, cy, r * .1, 0, 7); ctx.fill();
  }
  // 枝叶
  ctx.fillStyle = blue;
  const rng = mulberry32(1524);
  for (let i = 0; i < 46; i++) {
    const x = rng() * W, y = 380 + rng() * 420, a = rng() * Math.PI * 2, len = 26 + rng() * 30;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(0, 0, len * .3, len, 0, 0, 7); ctx.fill(); ctx.restore();
  }
  // 双禽（绶带鸟简形：身 + 首尾 + 翅）
  for (const [bx, by, dir] of [[300, 520, 1], [520, 620, -1]]) {
    ctx.save(); ctx.translate(bx, by); ctx.scale(dir, 1);
    ctx.strokeStyle = blue; ctx.fillStyle = blue; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, 46, 26, -.3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(44, -20, 12, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(54, -24); ctx.lineTo(70, -20); ctx.lineTo(54, -14); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-40, 8); ctx.quadraticCurveTo(-110, 30, -150, 90); ctx.quadraticCurveTo(-90, 62, -42, 26); ctx.fill();
    ctx.restore();
  }
  // 下腹蕉叶纹带
  for (let x = 0; x < W; x += 52) {
    ctx.strokeStyle = blue; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(x + 24, 960); ctx.quadraticCurveTo(x + 6, 1030, x + 24, 1078); ctx.quadraticCurveTo(x + 42, 1030, x + 24, 960); ctx.stroke();
  }
  // 近足缠枝莲带
  lotusScroll(ctx, blue, 1160, 6, .5);
  speckle(ctx, 15, 4200);
}

// 二号 · 青花缠枝莲纹玉壶春瓶：缠枝莲主体 + 回纹颈带 + 莲瓣足饰（布局参照原型：明永乐 青花玉壶春瓶）。
function qinghuaFigure(ctx) {
  porcelainGround(ctx);
  const blue = '#244f83';
  bandLines(ctx, blue, [130, 152, 1040, 1068]);
  fretBand(ctx, blue, 62, 13);
  // 腹部大朵缠枝莲：两排交叠，枝蔓相连（布局参照原型）。
  lotusScroll(ctx, blue, 520, 3, 1.12);
  lotusScroll(ctx, blue, 850, 3, .9);
  // 肩部卷草
  ctx.lineWidth = 4; ctx.strokeStyle = blue;
  for (let x = 0; x < W; x += 56) { ctx.beginPath(); ctx.moveTo(x, 250); ctx.quadraticCurveTo(x + 28, 214, x + 56, 250); ctx.stroke(); }
  // 足部仰莲瓣
  ctx.lineWidth = 3.6;
  for (let x = 0; x < W; x += 72) {
    ctx.beginPath(); ctx.moveTo(x, 1090); ctx.quadraticCurveTo(x + 36, 1010, x + 72, 1090); ctx.stroke();
  }
  speckle(ctx, 27, 4200);
}

// 三号 · 青花云龙纹罐（兜底）：双云龙 + 缠枝牡丹带 + 仰莲瓣（布局参照原型：元 青花缠枝牡丹云龙纹罐）。
function qinghuaDragon(ctx) {
  porcelainGround(ctx);
  const blue = '#1f4d80';
  bandLines(ctx, blue, [95, 115, 1020, 1055, 1110]);
  // 颈部缠枝栀子（简化花环）
  ctx.lineWidth = 3.4; ctx.strokeStyle = blue;
  for (let x = 0; x < W; x += 48) {
    ctx.beginPath(); ctx.arc(x + 24, 170, 16, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 24, 170, 5, 0, 7); ctx.fillStyle = blue; ctx.fill();
  }
  // 双云龙：两条横向行龙（身 + 鬣鬃 + 爪）。
  for (const [cy, dir] of [[420, 1], [700, -1]]) {
    ctx.save(); ctx.translate(W / 2, cy); ctx.scale(dir, 1);
    ctx.strokeStyle = blue; ctx.fillStyle = blue; ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-250, 40);
    ctx.bezierCurveTo(-150, -70, 40, -90, 150, -10);
    ctx.bezierCurveTo(210, 30, 170, 80, 90, 66);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(168, -18, 26, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(150, -34); ctx.quadraticCurveTo(120, -66, 80, -52); ctx.stroke();
    for (const [sx, sy] of [[-120, 0], [-40, 20], [40, -30], [-190, -20]]) {
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + 34, sy - 40, sx + 70, sy - 6);
      ctx.quadraticCurveTo(sx + 30, sy - 14, sx, sy); ctx.fill();
    }
    for (let claw = 0; claw < 3; claw++) {
      ctx.save(); ctx.translate(60 + claw * 26, 70); ctx.rotate(.4);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, 24); ctx.moveTo(0, 0); ctx.lineTo(4, 26); ctx.moveTo(0, 0); ctx.lineTo(14, 22); ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(178, -24, 5, 0, 7); ctx.fill();
    ctx.restore();
  }
  // 下腹缠枝牡丹带
  for (const cx of [96, 288, 480, 672]) {
    ctx.fillStyle = blue;
    for (let p = 0; p < 6; p++) {
      ctx.save(); ctx.translate(cx, 930); ctx.rotate(p * Math.PI / 3);
      ctx.beginPath(); ctx.ellipse(0, -34, 12, 26, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = '#f6f1e2'; ctx.beginPath(); ctx.arc(cx, 930, 9, 0, 7); ctx.fill();
  }
  ctx.strokeStyle = blue; ctx.lineWidth = 2.6;
  for (let x = 0; x < W; x += 96) {
    ctx.beginPath(); ctx.moveTo(x, 930); ctx.quadraticCurveTo(x + 48, 880, x + 96, 930); ctx.stroke();
  }
  // 近足仰莲瓣
  ctx.lineWidth = 3.4;
  for (let x = 0; x < W; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 1150); ctx.quadraticCurveTo(x + 32, 1070, x + 64, 1150); ctx.stroke();
  }
  speckle(ctx, 47, 4600);
}

// 四号 · 釉里红高足转杯（兜底）：铜红斑块 + 晕散（布局参照原型：元 景德镇窑釉里红转把杯）。
function youlihong(ctx) {
  porcelainGround(ctx, '#fdf9f0', '#f6efdf');
  const red = '#9e2b25';
  ctx.lineCap = 'round';
  // 腹部主红斑：多层叠加的有机形状，边缘晕散。
  const rng = mulberry32(1341);
  const splash = (cx, cy, rx, ry, layers) => {
    for (let l = layers; l > 0; l--) {
      const grow = 1 + l * .16;
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + .1; a += Math.PI / 14) {
        const wob = 1 + Math.sin(a * 3 + l * 2.2) * .1 + (rng() - .5) * .12;
        const px = cx + Math.cos(a) * rx * grow * wob, py = cy + Math.sin(a) * ry * grow * wob;
        a ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(158,43,37,${l === 1 ? .92 : .13})`;
      ctx.fill();
    }
    // 红斑内的留白斑点（釉里红特有的发色斑驳）
    for (let i = 0; i < 220; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng());
      ctx.fillStyle = `rgba(246,240,225,${.1 + rng() * .25})`;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d * rx * .9, cy + Math.sin(a) * d * ry * .9, rng() * 2.4, 0, 7); ctx.fill();
    }
  };
  splash(W * .46, 560, 150, 200, 4);
  splash(W * .74, 700, 60, 90, 3);
  // 杯口沿与足部的淡红晕
  ctx.strokeStyle = 'rgba(158,43,37,.35)'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(0, 130); ctx.lineTo(W, 130); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 980); ctx.lineTo(W, 980); ctx.stroke();
  // 全身铜红晕散颗粒
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(158,43,37,${rng() * .1})`;
    ctx.beginPath(); ctx.arc(rng() * W, 140 + rng() * 900, rng() * 3 + .5, 0, 7); ctx.fill();
  }
}

// 五号 · 祭红釉蒜头瓶：通体祭红，口沿灯草边，深浅窑变。
function jihong(ctx) {
  const body = ctx.createLinearGradient(0, 0, W, 0);
  body.addColorStop(0, '#6e1512'); body.addColorStop(.32, '#a02c22');
  body.addColorStop(.55, '#8f231c'); body.addColorStop(.8, '#7c1a16'); body.addColorStop(1, '#5c100e');
  ctx.fillStyle = body; ctx.fillRect(0, 0, W, H);
  const depth = ctx.createLinearGradient(0, 0, 0, H);
  depth.addColorStop(0, 'rgba(255,120,90,.20)'); depth.addColorStop(.5, 'rgba(0,0,0,0)'); depth.addColorStop(1, 'rgba(40,0,0,.32)');
  ctx.fillStyle = depth; ctx.fillRect(0, 0, W, H);
  const rng = mulberry32(1403);
  for (let i = 0; i < 900; i++) {
    const cx = rng() * W, cy = rng() * H, r = 4 + rng() * 26;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const tone = rng();
    g.addColorStop(0, tone > .6 ? 'rgba(220,90,60,.16)' : 'rgba(60,8,6,.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  }
  // 灯草边：口沿与足端一圈白釉。
  ctx.fillStyle = '#f4efe2';
  ctx.fillRect(0, 0, W, 26); ctx.fillRect(0, H - 40, W, 40);
  ctx.fillStyle = 'rgba(244,239,226,.35)'; ctx.fillRect(0, 26, W, 14); ctx.fillRect(0, H - 62, W, 22);
  // 流釉痕。
  for (let i = 0; i < 14; i++) {
    const x = rng() * W, len = 80 + rng() * 300, y0 = 40 + rng() * 400;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, 'rgba(200,70,50,.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y0, 8 + rng() * 14, len);
  }
}

// 六号 · 青花玲珑镂空碗：青花边饰 + 米粒玲珑眼（透光点）。
function linglong(ctx) {
  porcelainGround(ctx, '#f9f4e6', '#eef0e2');
  const blue = '#245b88';
  bandLines(ctx, blue, [90, 110, 1120, 1145]);
  fretBand(ctx, blue, 40, 14);
  // 玲珑眼：米粒形，釉料填平后透光。亮芯 + 青边。
  const rng = mulberry32(1785);
  for (let row = 0; row < 7; row++) for (let col = 0; col < 9; col++) {
    const cx = col * 84 + (row % 2) * 42 + 20, cy = 210 + row * 118;
    if (cy > 1060) continue;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rng() * .5 - .25 + Math.PI / 2);
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 26, 0, 0, 7);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 28);
    g.addColorStop(0, '#fdfbf2'); g.addColorStop(.7, '#e8f0e6'); g.addColorStop(1, blue);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2.4; ctx.strokeStyle = blue; ctx.stroke();
    ctx.restore();
  }
  // 缠枝细线串起玲珑眼。
  ctx.strokeStyle = blue; ctx.lineWidth = 2.6; ctx.globalAlpha = .8;
  for (let row = 0; row < 6; row++) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 12) {
      const y = 268 + row * 118 + Math.sin(x / 70 + row) * 30;
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  waveCliff(ctx, blue, 1010);
}

const PAINTERS = {
  'qinghua-birdflower': qinghuaBirdflower,
  'qinghua-lotus': qinghuaLotus,
  'qinghua-figure': qinghuaFigure,
  'qinghua-dragon': qinghuaDragon,
  'youlihong': youlihong,
  'jihong': jihong,
  'linglong': linglong
};

// 真实器物照片底图（平面版）：按器型轮廓**逐行重映射**照片——实测剪影的左右边缘
// 精确对齐轮廓该高度的半宽，口沿/足底对齐包围盒上下沿；2D 碎片（UV=轮廓包围盒）
// 上的纹样因此与器形完全嵌套，边缘不再带入照片背景。实测失败退回整幅铺底。
function paintRealPhoto(ctx, img, vessel) {
  const sil = vessel ? getSilhouette(vessel) : null;
  if (!sil) {
    const ratio = img.naturalWidth / img.naturalHeight;
    let dw = H * ratio, dh = H;
    if (dw < W) { dw = W; dh = W / ratio; }
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    paintGlazeVeil(ctx);
    return;
  }
  const IW = img.naturalWidth || img.width, IH = img.naturalHeight || img.height;
  const src = document.createElement('canvas');
  src.width = IW; src.height = IH;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, 0, 0);
  const sd = sctx.getImageData(0, 0, IW, IH).data;
  const out = ctx.createImageData(W, H);
  const od = out.data;
  const crop = vessel.photoCrop;
  const prof = vesselProfile(vessel.outline);
  const maxR = prof.reduce((m, p) => Math.max(m, p.x), 0) || 1;
  const yTop = prof[prof.length - 1].y, yBot = prof[0].y;
  // 纵向：优先实测口沿顶→足底（与环绕版同一口径）；兜底 photoCrop 取景框
  const silOk = Math.abs(sil.top - crop.y * IH) < IH * .10 && Math.abs(sil.bottom - (crop.y + crop.h) * IH) < IH * .10;
  // 纵向映射钳制在取景框 ±0.5% 内：实测底沿常延到足下投影（比器底低几个百分点），
  // 不钳制的话纹理底行会采到桌面/投影灰带；取景框上沿同理防口沿上方渐晕。
  const yRimF = silOk ? Math.max(sil.top, crop.y * IH - IH * .005) : crop.y * IH;
  const yBotF = silOk ? Math.min(sil.bottom, (crop.y + crop.h) * IH + IH * .005) : (crop.y + crop.h) * IH;
  const chF = yBotF - yRimF;
  const cxCrop = (crop.x + crop.w / 2) * IW, halfMax = crop.w * IW / 2; // 兜底：中线/半宽
  for (let ty = 0; ty < H; ty++) {
    const hv = 1 - (ty + .5) / H;
    const rho = Math.max(.02, radiusAt(prof, yBot + hv * (yTop - yBot)) / maxR); // 轮廓该行半宽（归一）
    const py = yRimF + (ty + .5) / H * chF;                   // 照片对应行（口沿在上）
    const y0i = Math.min(IH - 2, Math.max(0, Math.floor(py)));
    const fy = Math.min(1, Math.max(0, py - y0i));
    let cxF = cxCrop, hp = halfMax;                           // 兜底：取景框即器身边缘
    if (silOk) {
      let l = sil.l(py), r = sil.r(py);
      if (!(l >= 0 && r > l + 1)) { const sp = sil.span(py); if (sp) { l = sp[0]; r = sp[1]; } }
      if (l >= 0 && r > l + 1) {
        const env = rho * halfMax * 1.03;                     // 轮廓包络（平面版），同环绕版口径
        const l2 = Math.max(l, cxCrop - env), r2 = Math.min(r, cxCrop + env);
        if (r2 > l2 + 1) {
          const c2 = (l2 + r2) / 2, h2 = (r2 - l2) / 2;
          // 合理性门控：中心偏离取景框中线 >5% 画幅宽（单侧阴影带偏实测窗）的行退回
          // 包络。宽度只设 15% 退化下限——GLB 轮廓与照片器形的比例存在个体差（如
          // 高足杯模型柄粗、照片柄细，玉壶春模型腹部低垂），窄于包络的实测行往往是
          // 照片真实的颈/柄/足，退回包络反而会采到器身外的背景灰区；实测偏窄最多
          // 让纹样略收，采样永不溢出器身。
          if (Math.abs(c2 - cxCrop) < IW * .05 && h2 > env * .15) { cxF = c2; hp = h2 * .985; }
        }
      }
    }
    const stretch = Math.max(1, hp) / rho;                     // 轮廓归一半宽 → 照片像素换算
    const rowO = ty * W * 4;
    for (let tx = 0; tx < W; tx++) {
      const us = (tx + .5) / W * 2 - 1;                        // -1..1 ↔ 轮廓包围盒全宽
      let sx = cxF + us * stretch;                             // 轮廓边缘（|us|=rho）恰好落在照片剪影边缘
      sx = Math.min(IW - 2, Math.max(0, sx));
      const x0i = Math.floor(sx), fx = sx - x0i;
      const i00 = (y0i * IW + x0i) * 4, i10 = i00 + 4;
      const i01 = i00 + IW * 4, i11 = i01 + 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const o = rowO + tx * 4;
      od[o] = sd[i00] * w00 + sd[i10] * w10 + sd[i01] * w01 + sd[i11] * w11;
      od[o + 1] = sd[i00 + 1] * w00 + sd[i10 + 1] * w10 + sd[i01 + 1] * w01 + sd[i11 + 1] * w11;
      od[o + 2] = sd[i00 + 2] * w00 + sd[i10 + 2] * w10 + sd[i01 + 2] * w01 + sd[i11 + 2] * w11;
      od[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  paintGlazeVeil(ctx);
}

// —— 环绕版（3D 器身 / 碎片）：用户照片的柱面重投影 ——
// 照片是正视单视角，只有正对镜头那 180° 的信息。按柱面反投影逐像素取样：
//   ① 横向：柱面上角度 θ 的点在正视图里落在 x = r·sinθ，所以纹理 u（角度）对应照片
//      横向偏移 sin(2πu) —— 中央不拉伸、器侧自然收缩，正对镜头看过去与照片完全一致；
//      背面 180° 用同一函数自然形成镜像（sin 的对称性），不会出现错位花斑。
//   ② 纵向：优先实测器形范围（口沿顶→足底，以腹径行连续延伸精测、抗渐晕误检）；
//      实测失败退回 photoCrop 取景框。
//   ③ 每行的横向跨度用**实测剪影**该行的左右边缘——取样严格落在器身之内，任何一行
//      都不会把照片背景带进纹理，纹样与器形完全嵌套（该行实测失败才按轮廓半径换算）。
// 全程只从照片取样（双线性插值），不做任何程序化补画：照片上没有的纹样不会凭空出现。
function paintPhotoWrap(ctx, img, vessel) {
  porcelainGround(ctx);
  const crop = vessel.photoCrop;
  const IW = img.naturalWidth || img.width, IH = img.naturalHeight || img.height;
  if (!crop || !IW || !IH) return;
  const src = document.createElement('canvas');
  src.width = IW; src.height = IH;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, 0, 0);
  const sd = sctx.getImageData(0, 0, IW, IH).data;

  const out = ctx.createImageData(W, H);
  const od = out.data;
  // 纵向：优先实测口沿顶→足底（以腹径行连续延伸精测，抗渐晕误检）；
  // 横向：实测剪影逐行左右边缘。任一环节实测失败按 photoCrop 取景框兜底。
  const sil = getSilhouette(vessel);
  const silOk = sil && Math.abs(sil.top - crop.y * IH) < IH * .10 && Math.abs(sil.bottom - (crop.y + crop.h) * IH) < IH * .10;
  // 纵向映射钳制在取景框 ±0.5% 内（同环绕版）：防实测底沿带入足下投影灰带
  // 口沿行再内收 0.5%：口沿在照片里是椭圆开口（能看到器内与对侧内壁），顶行直接取
  // 实测口沿会把这条椭圆弧拉成一圈灰带；内收半行让顶行落在口沿釉面上。
  const yRimF = silOk ? Math.max(sil.top, crop.y * IH - IH * .005) + IH * .005 : crop.y * IH + IH * .003;     // 口沿（纹理顶行 ty=0）
  const yBotF = silOk ? Math.min(sil.bottom, (crop.y + crop.h) * IH + IH * .005) : (crop.y + crop.h) * IH;
  const chF = yBotF - yRimF;
  const cxCrop = (crop.x + crop.w / 2) * IW;       // 兜底：照片里器身中线
  const halfMax = crop.w * IW / 2;
  const prof = vesselProfile(vessel.outline);
  const maxR = prof.reduce((m, p) => Math.max(m, p.x), 0) || 1;
  const yTop = prof[prof.length - 1].y, yBot = prof[0].y;

  // 兜底逐行半径表（像素半跨），避免每像素都查轮廓；实测剪影可用时不走此表
  const rowHalf = new Float32Array(H);
  for (let ty = 0; ty < H; ty++) {
    const hv = 1 - (ty + .5) / H;
    const r = radiusAt(prof, yBot + hv * (yTop - yBot));
    rowHalf[ty] = Math.max(1, (r / maxR) * halfMax);
  }
  const TWO_PI = Math.PI * 2;

  // —— 投影窗口：GLB 轮廓包络 × 照片实测尺寸的全局等比缩放 ——
  // 两个历史坑：
  // ① 窗口直接用 GLB 轮廓包络：模型与馆藏照片是两只个体（蒜头瓶模型肩更宽、高足杯模型
  //    腹更瘦），窗口比照片器身宽的行会采进背景灰区——成品上一块块“嵌不进去”的背景色；
  // ② 窗口逐行跟随实测剪影：青花纹样的白隙（>合并阈值的连续白釉）会把含中线的游程
  //    切碎，窗口逐行在“整幅器身”与“单朵花”之间跳（实测 half 在 16↔148px 抖），
  //    纹理横向拉花。
  // 现在取两者之长：包络保证窗口形状光滑、随器型收放；再用照片实测的最大半宽
  // （90 分位，抗单行噪声）对包络做一次全局等比缩放，消除个体尺寸差；中线偏移取
  // 实测最大宽行的中心（钳 ±3% 画幅宽）。纵向仍按实测口沿→足底映射。
  const maxRowHalf = Math.max(...rowHalf);
  let measMax = 0, measMaxC = cxCrop;
  if (silOk) {
    const samples = [];
    for (let ty = 0; ty < H; ty++) {
      const sy = yRimF + (ty + .5) / H * chF;
      let l = sil.l(sy), r = sil.r(sy);
      if (!(l >= 0 && r > l + 2)) { const sp = sil.span && sil.span(sy); if (sp) { l = sp[0]; r = sp[1]; } }
      if (l >= 0 && r > l + 2 && Math.abs((l + r) / 2 - cxCrop) < IW * .12) samples.push((r - l) / 2);
    }
    if (samples.length > H * .2) {
      samples.sort((a, b) => a - b);
      measMax = samples[Math.floor(samples.length * .9)];   // 90 分位：抗眩光行/浅纹行的窄窗噪声
      // 最大宽行中心：取宽度在 measMax*.9 以上的行的中心均值
      let cs = 0, cn = 0;
      for (let ty = 0; ty < H; ty++) {
        const sy = yRimF + (ty + .5) / H * chF;
        const l = sil.l(sy), r = sil.r(sy);
        if (l >= 0 && r > l + 2 && (r - l) / 2 >= measMax * .9) { cs += (l + r) / 2; cn++; }
      }
      if (cn) measMaxC = cs / cn;
    }
  }
  const fitK = measMax > 4 ? measMax / maxRowHalf : 1;                    // 照片/模型 尺寸比
  const cShift = measMax > 4 ? Math.max(-IW * .03, Math.min(IW * .03, measMaxC - cxCrop)) : 0;
  for (let ty = 0; ty < H; ty++) {
    const sy = yRimF + (ty + .5) / H * chF;      // 口沿在上、器底在下：与程序画笔/平铺纹理方向一致
    const y0i = Math.min(IH - 2, Math.max(0, Math.floor(sy)));
    const fy = Math.min(1, Math.max(0, sy - y0i));
    const kRow = rowHalf[ty] / maxRowHalf;       // 该行相对腹径的收缩比（轮廓形状）
    const cxF = cxCrop + cShift * kRow;          // 中线偏移随器身收放衰减（口沿处趋近取景框中线）
    const half = Math.max(2, rowHalf[ty] * fitK * 1.02);
    const rowO = ty * W * 4;
    for (let tx = 0; tx < W; tx++) {
      const u = (tx + .5) / W;
      let sx = cxF + Math.sin(u * TWO_PI) * half;
      sx = Math.min(IW - 2, Math.max(0, sx));
      const x0i = Math.floor(sx), fx = sx - x0i;
      const i00 = (y0i * IW + x0i) * 4, i10 = i00 + 4;
      const i01 = i00 + IW * 4, i11 = i01 + 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const o = rowO + tx * 4;
      od[o] = sd[i00] * w00 + sd[i10] * w10 + sd[i01] * w01 + sd[i11] * w11;
      od[o + 1] = sd[i00 + 1] * w00 + sd[i10 + 1] * w10 + sd[i01 + 1] * w01 + sd[i11 + 1] * w11;
      od[o + 2] = sd[i00 + 2] * w00 + sd[i10 + 2] * w10 + sd[i01 + 2] * w01 + sd[i11 + 2] * w11;
      od[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  paintGlazeVeil(ctx);
}

// 环绕纹样绘在瓷地上（照片未就绪 / 线上无授权模式时的占位兜底，不是最终纹样）。
function paintBirdflowerWrap(ctx) {
  ctx.fillStyle = '#f2efe4'; ctx.fillRect(0, 0, W, H);
  const blue = '#315a86';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  bandLines(ctx, blue, [35, 53, 190, 208, 325, 343, 1040, 1060, 1155, 1173], 2.5);
  fretBand(ctx, blue, 95, 24);
  // 肩部如意云头，与颈部、腹部之间留出瓷地。
  ctx.strokeStyle = blue; ctx.lineWidth = 2.8;
  for (let x = 0; x < W; x += 96) {
    ctx.beginPath(); ctx.moveTo(x, 235);
    ctx.bezierCurveTo(x + 16, 242, x + 14, 276, x + 32, 279);
    ctx.bezierCurveTo(x + 26, 251, x + 70, 251, x + 64, 279);
    ctx.bezierCurveTo(x + 82, 276, x + 80, 242, x + 96, 235); ctx.stroke();
  }
  // 两个连续花鸟单元：枝干越过单元边界，转动时仍环绕相接。
  for (let unit = 0; unit < 2; unit++) {
    ctx.save(); ctx.translate(unit * W / 2, 0);
    ctx.strokeStyle = blue; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 775);
    ctx.bezierCurveTo(90, 775, 124, 622, 224, 650);
    ctx.bezierCurveTo(310, 679, 330, 775, 384, 775); ctx.stroke();
    for (const [x,y,dir] of [[75,735,-1],[128,680,1],[202,653,-1],[275,693,1],[327,755,-1]]) {
      ctx.beginPath(); ctx.moveTo(x,y); ctx.quadraticCurveTo(x+dir*24,y-65,x+dir*38,y-111); ctx.stroke();
      for (let leaf=0;leaf<3;leaf++) {
        const lx=x+dir*(10+leaf*10), ly=y-25-leaf*24;
        ctx.save(); ctx.translate(lx,ly); ctx.rotate(dir*.65);
        ctx.globalAlpha=.65; ctx.fillStyle=blue;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(-28,-22,-8,-49);
        ctx.quadraticCurveTo(17,-26,0,0); ctx.fill(); ctx.globalAlpha=1; ctx.stroke(); ctx.restore();
      }
      const fx=x+dir*38, fy=y-113;
      for(let petal=0;petal<5;petal++) {
        ctx.save(); ctx.translate(fx,fy); ctx.rotate(petal*Math.PI*2/5);
        ctx.fillStyle='rgba(49,90,134,.22)';
        ctx.beginPath(); ctx.moveTo(0,0); ctx.bezierCurveTo(-26,-17,-20,-48,0,-35);
        ctx.bezierCurveTo(20,-48,26,-17,0,0); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle=blue; ctx.beginPath(); ctx.arc(fx,fy,4,0,Math.PI*2); ctx.fill();
    }
    ctx.save(); ctx.translate(210,490); ctx.rotate(-.18);
    ctx.fillStyle='rgba(49,90,134,.42)';
    ctx.beginPath(); ctx.ellipse(0,0,32,18,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(30,-16,10,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40,-16); ctx.lineTo(52,-13); ctx.lineTo(39,-10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-25,5); ctx.quadraticCurveTo(-65,27,-92,64);
    ctx.moveTo(-22,11); ctx.quadraticCurveTo(-49,37,-60,78);
    ctx.moveTo(16,1); ctx.quadraticCurveTo(-5,-22,-25,1); ctx.quadraticCurveTo(-3,19,16,1); ctx.stroke();
    ctx.fillStyle=blue; ctx.beginPath(); ctx.arc(33,-19,2,0,Math.PI*2); ctx.fill(); ctx.restore();
    ctx.restore();
  }
  // 下腹莲瓣与足部双弦纹，避免腹部孤立成一块图标。
  ctx.strokeStyle=blue; ctx.lineWidth=2.5;
  for(let x=0;x<W;x+=48) {
    ctx.beginPath(); ctx.moveTo(x,1128); ctx.quadraticCurveTo(x+24,1067,x+48,1128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+9,1128); ctx.quadraticCurveTo(x+24,1090,x+39,1128); ctx.stroke();
  }
  speckle(ctx,1524,6500,.035);
  paintGlazeVeil(ctx);
}

// 轻微的纵向空气感渐变，让照片与瓷地兜底层衔接更自然。
function paintGlazeVeil(ctx) {
  const glaze = ctx.createLinearGradient(0, 0, 0, H);
  glaze.addColorStop(0, 'rgba(251,246,234,.10)');
  glaze.addColorStop(.5, 'rgba(251,246,234,0)');
  glaze.addColorStop(1, 'rgba(60,50,30,.08)');
  ctx.fillStyle = glaze; ctx.fillRect(0, 0, W, H);
}

export function makeVesselTexture(vessel, { wrap = false } = {}) {
  const [canvas, ctx] = baseCanvas();
  const painter = PAINTERS[vessel.glazeType];
  if (!painter) throw new Error(`未知的釉彩纹理类型：${vessel.glazeType}`);
  const real = realImages.get(vessel.id);
  // 线上公开版（VITE_ONLINE_MODE=1）不使用馆藏照片底图，统一走程序化器身纹样，规避授权风险。
  const usePhoto = !!real && !ONLINE_MODE;
  if (wrap) {
    // 环绕版：只从用户照片取样重投影；照片未就绪才退回程序化占位纹样。
    if (usePhoto) paintPhotoWrap(ctx, real, vessel);
    else if (vessel.glazeType === 'qinghua-birdflower') paintBirdflowerWrap(ctx);
    else painter(ctx);
  } else {
    painter(ctx);
    if (usePhoto && FLAT_PHOTO_IDS.has(vessel.id)) paintRealPhoto(ctx, real, vessel);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (wrap) {
    // 连续的环绕纹样以整周 UV 映射到器身。
    texture.wrapS = THREE.RepeatWrapping;
    texture.offset.x = 0;
  }
  return texture;
}
