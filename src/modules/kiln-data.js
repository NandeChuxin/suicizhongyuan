// 窑火数据小卡：两张叙事示意图，Canvas 程序化绘制，零素材。
// 图纸用于表达「成功背后的失败」与「落选器物的处理流程」，是创作示意，不是史料统计。
const INK = '#101b2b', GOLD = '#c9a961', PAPER = '#eee6d2', FADE = '#5a6b80', RED = '#b0432e';

function base(canvas, w, h) {
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d');
  c.fillStyle = PAPER; c.fillRect(0, 0, w, h);
  return c;
}

function caption(c, w, h, text) {
  c.fillStyle = FADE; c.font = '11px "Microsoft YaHei", sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillText(text, 14, h - 12);
  c.fillStyle = `${GOLD}55`; c.fillRect(12, h - 30, w - 24, 1);
}

// ① 釉里红「十窑九不成」示意：10 座窑位中 1 座成、9 座废。
export function paintKilnChart(canvas) {
  const w = 360, h = 190, c = base(canvas, w, h);
  c.fillStyle = INK; c.font = '13px "Microsoft YaHei", sans-serif'; c.textAlign = 'left';
  c.fillText('十窑九不成 · 釉里红成色示意', 14, 24);
  const total = 10, gap = 6, startX = 20, baseline = 132, maxH = 82;
  const bw = (w - startX * 2 - gap * (total - 1)) / total;
  for (let i = 0; i < total; i++) {
    const success = i === 3;
    const x = startX + i * (bw + gap);
    const bh = success ? maxH : maxH * 0.34;
    c.fillStyle = success ? RED : `${FADE}66`;
    c.fillRect(x, baseline - bh, bw, bh);
    if (success) { c.strokeStyle = GOLD; c.lineWidth = 1; c.strokeRect(x - 0.5, baseline - bh - 0.5, bw + 1, bh + 1); }
    c.fillStyle = FADE; c.font = '9px Arial, sans-serif'; c.textAlign = 'center';
    c.fillText(String(i + 1), x + bw / 2, baseline + 13);
  }
  c.fillStyle = RED; c.font = '10px "Microsoft YaHei", sans-serif'; c.textAlign = 'left';
  c.fillText('成 1 窑', startX + 3 * (bw + gap) - 6, baseline - maxH - 8);
  c.fillStyle = FADE; c.fillText('废 9 窑', w - 78, baseline - maxH * 0.34 - 8);
  caption(c, w, h, '数字为叙事示意，非史料统计');
}

// ② 御窑「落选即碎」流程示意：入窑 → 验瓷 → 落选砸碎掩埋 → 考古复原。
export function paintKilnFlow(canvas) {
  const w = 360, h = 150, c = base(canvas, w, h);
  c.fillStyle = INK; c.font = '13px "Microsoft YaHei", sans-serif'; c.textAlign = 'left';
  c.fillText('御窑 · 落选即碎 流程示意', 14, 24);
  const steps = ['入窑', '验瓷', '落选\n砸碎掩埋', '考古\n复原'];
  const n = steps.length, padX = 16, top = 46, boxH = 52, gap = 16;
  const bw = (w - padX * 2 - gap * (n - 1)) / n;
  steps.forEach((label, i) => {
    const x = padX + i * (bw + gap);
    c.fillStyle = i === 2 ? '#e5cfc4' : '#e6ddc7';
    c.fillRect(x, top, bw, boxH);
    c.strokeStyle = i === 2 ? RED : `${GOLD}aa`; c.lineWidth = 1;
    c.strokeRect(x + 0.5, top + 0.5, bw - 1, boxH - 1);
    c.fillStyle = i === 2 ? RED : INK; c.font = '12px "Microsoft YaHei", sans-serif'; c.textAlign = 'center';
    label.split('\n').forEach((line, li) => c.fillText(line, x + bw / 2, top + boxH / 2 - (label.includes('\n') ? 6 : 0) + li * 15 + 4));
    if (i < n - 1) {
      c.strokeStyle = GOLD; c.lineWidth = 1.4; c.beginPath();
      c.moveTo(x + bw + 2, top + boxH / 2); c.lineTo(x + bw + gap - 2, top + boxH / 2); c.stroke();
      c.beginPath(); c.moveTo(x + bw + gap - 2, top + boxH / 2); c.lineTo(x + bw + gap - 6, top + boxH / 2 - 3); c.lineTo(x + bw + gap - 6, top + boxH / 2 + 3); c.closePath(); c.fillStyle = GOLD; c.fill();
    }
  });
  caption(c, w, h, '数字为叙事示意，非史料统计');
}
