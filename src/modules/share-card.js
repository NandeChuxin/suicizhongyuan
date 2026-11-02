// 修复分享卡：9:16 竖版（1080×1920），复用 html2canvas 导出。
// 视觉沿用项目语言：墨蓝夜色 + 宣纸卡 + 金线 + 朱砂篆印；零外部素材。
// 二维码优先读取 public/share-qr.png，缺省时使用程序化占位框（qrPlaceholder）。
import { sealImage, qrPlaceholder } from './workshop-art.js';

const STYLE_ID = 'share-card-style';
const CSS = `
.sc-root{position:fixed;left:-10000px;top:0;width:540px;height:960px;padding:34px;box-sizing:border-box;
  background:linear-gradient(160deg,#0d1626,#1a2332 55%,#141e2d);color:#f5f2ea;
  font-family:SimSun,'Songti SC','Noto Serif SC',serif;display:flex;flex-direction:column;overflow:hidden}
.sc-frame{position:relative;flex:1;border:1px solid #c9a961cc;padding:26px 24px;box-sizing:border-box;display:flex;flex-direction:column}
.sc-frame:before{content:'';position:absolute;inset:7px;border:1px solid #c9a96144;pointer-events:none}
.sc-head{text-align:center}
.sc-brand{font-size:30px;letter-spacing:12px;color:#f2ead8}
.sc-brand small{display:block;font:9px/2.4 Arial,sans-serif;letter-spacing:5px;color:#c9a961b0;margin-top:4px}
.sc-slogan{margin-top:10px;font-size:13px;letter-spacing:4px;color:#b7c1cf}
.sc-rule{height:1px;margin:18px 0 14px;background:linear-gradient(90deg,transparent,#c9a96199,transparent)}
.sc-vessel{position:relative;align-self:center;width:300px;height:346px;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(170deg,#f7f1df,#eee3c2 60%,#e6d8b0);border:1px solid #c9a96199;box-shadow:0 18px 46px #050b17aa}
.sc-vessel img{width:100%;height:100%;object-fit:contain;padding:14px;box-sizing:border-box}
.sc-vessel span{position:absolute;left:0;bottom:0;background:#b0432e;color:#f7efe0;font-size:11px;letter-spacing:3px;padding:5px 12px}
.sc-name{text-align:center;font-size:25px;letter-spacing:4px;color:#f4ecda;margin-top:20px}
.sc-era{text-align:center;font:11px/2 Arial,sans-serif;letter-spacing:3px;color:#c9a961bd;margin-top:6px}
.sc-meta{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:16px}
.sc-signer{text-align:center}
.sc-signer small{display:block;font-size:10px;letter-spacing:3px;color:#8fa0b2}
.sc-signer b{display:block;font-size:17px;font-weight:400;letter-spacing:3px;color:#e9ddbd;margin-top:4px}
.sc-seal{width:58px;height:58px;display:block}
.sc-qr{display:flex;align-items:center;gap:18px;justify-content:center;margin-top:auto;padding-top:18px}
.sc-qr img{width:118px;height:118px;display:block;background:#fdfcf8;border:1px solid #c9a96199;padding:5px;box-sizing:border-box}
.sc-qr div{text-align:left}
.sc-qr b{font-size:16px;font-weight:400;letter-spacing:4px;color:#f2ead8;display:block}
.sc-qr small{font:10px/2 Arial,sans-serif;letter-spacing:2px;color:#9fb0c0;display:block;margin-top:6px}
.sc-foot{text-align:center;font-size:10px;letter-spacing:3px;color:#8c9cac;margin-top:14px}
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

// 优先用正式二维码图片，缺省回退程序化占位框（dataURL）。
function resolveQr(canvas) {
  return new Promise(resolve => {
    const probe = new Image();
    probe.onload = () => resolve('./share-qr.png');
    probe.onerror = () => resolve(canvas.toDataURL('image/png'));
    probe.src = './share-qr.png';
  });
}

export async function exportShareCard({ vessel, modeLabel, record, portraitSrc, download = true } = {}) {
  ensureStyle();
  const sealName = !record?.name || record.name === '无名修复师' ? '惜物重生' : record.name;
  const qrSrc = await resolveQr(qrPlaceholder(220, 1725 + (vessel?.index ?? 0)));

  const root = document.createElement('div');
  root.className = 'sc-root';
  root.innerHTML = `
    <div class="sc-frame">
      <div class="sc-head">
        <div class="sc-brand">碎瓷重圆<small>PORCELAIN · REUNITED</small></div>
        <div class="sc-slogan">修复一件瓷器 · 接续一段生活</div>
      </div>
      <div class="sc-rule"></div>
      <div class="sc-vessel"><img alt="修复后的器物"><span data-field="mode"></span></div>
      <div class="sc-name" data-field="name"></div>
      <div class="sc-era" data-field="era"></div>
      <div class="sc-meta">
        <div class="sc-signer"><small>数字修复师</small><b data-field="signer"></b></div>
        <img class="sc-seal" alt="修复师印章">
      </div>
      <div class="sc-qr">
        <img alt="扫码即玩">
        <div><b>扫码即玩</b><small>手机打开《碎瓷重圆》<br>拾起散落的青花</small></div>
      </div>
      <div class="sc-foot">完整，不必抹去经历 · 八片重逢 · 八段记忆</div>
    </div>`;
  const values = {
    mode: modeLabel || '数字修复',
    name: vessel?.name || '青花重圆',
    era: `${vessel?.era || ''} · ${vessel?.glaze || ''} · 数字复原`,
    signer: sealName
  };
  for (const [field, value] of Object.entries(values)) root.querySelector(`[data-field="${field}"]`).textContent = value;
  root.querySelector('.sc-vessel img').src = portraitSrc || '';
  root.querySelector('.sc-seal').src = sealImage(sealName);
  root.querySelector('.sc-qr img').src = qrSrc;
  document.body.append(root);

  try {
    await document.fonts.ready;
    await Promise.all([...root.querySelectorAll('img')].map(img => img.decode().catch(() => {})));
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(root, { backgroundColor: '#0d1626', scale: 2, width: 540, height: 960, logging: false });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('分享卡图像生成失败');
    if (download) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `碎瓷重圆-分享卡-${vessel?.id || 'vessel'}.png`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    return { canvas, blob };
  } finally {
    root.remove();
  }
}
