// 按钮绑定审计（静态）：逐屏列出可见按钮及其 onclick 绑定状态，无副作用。
import '../src/immersive.js';
import { VESSELS } from '../src/data/vessels.js';

const out = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  await sleep(1200);
  const P = window.porcelain;
  out.push('porcelain=' + Boolean(P));
  if (P) {
    const screens = ['start', 'cabinet', 'commission', 'puzzle', 'choice', 'certificate', 'tour'];
    for (const screen of screens) {
      if (screen === 'puzzle') P.openVessel(VESSELS[0]);
      if (screen === 'certificate') { P.openVessel(VESSELS[0]); for (const f of P.fragments) { f.mesh.position.copy(f.correctPosition); f.mesh.rotation.z = f.correctRotation; P.attemptSnap(f); } await sleep(800); }
      P.go(screen);
      await sleep(screen === 'tour' ? 2200 : 1100);
      const buttons = [...document.querySelectorAll('button')].filter(b => !b.hidden && b.offsetParent !== null);
      const lines = buttons.map(b => {
        const key = b.id || 'data-go=' + b.dataset.go || 'data-preview=' + b.dataset.preview || 'data-mode=' + b.dataset.mode || b.className.split(' ')[0];
        const bound = typeof b.onclick === 'function';
        return (bound ? '  ok   ' : '  MISS ') + key;
      });
      const hs=[...document.querySelectorAll('[data-screen]')].map(s=>s.dataset.screen+':'+(s.hidden?'H':'VISIBLE')).join(' ');out.push(`[${screen}] ${buttons.length} 按钮 | sections: ${hs} | errs=${(window.__errs||[]).length}\n` + lines.join('\n'));
    }
    // 事件委托的容器单独说明
    out.push('委托容器: tourNote(addEventListener)=' + Boolean(document.querySelector('#tour-note')));
  }
} catch (error) {
  out.push('审计异常：' + (error && error.stack ? error.stack.split('\n')[0] : error));
}
document.getElementById('audit-out').textContent = out.join('\n');
document.title = '审计完成';
window.__audit = out.join('\n');
