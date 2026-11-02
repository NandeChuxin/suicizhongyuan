const frame = document.querySelector('#game'), list = document.querySelector('#results');
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, label, timeout = 15000) { const start = performance.now(); while (!fn()) { if (performance.now() - start > timeout) throw Error('超时：' + label); await wait(80); } }
function check(ok, text) { if (!ok) throw Error(text); const li = document.createElement('li'); li.textContent = '✓ ' + text; list.append(li); }
document.querySelector('#run').onclick = async () => {
  document.querySelector('#run').disabled = true; list.replaceChildren();
  try {
    await until(() => frame.contentWindow.porcelain?.renderer, 'WebGL初始化');
    const win = frame.contentWindow, doc = win.document, app = win.porcelain;
    app.reset(); await wait(500);
    const canvas = app.renderer.domElement;
    // 真实 pointer 事件（3D 点击即归位 / 2D 拖拽共用同一条输入管线）
    function event(type, x, y, button = 0) { canvas.dispatchEvent(new win.PointerEvent(type, { clientX: x, clientY: y, button, buttons: type === 'pointerup' ? 0 : button === 2 ? 2 : 1, pointerId: 42, pointerType: 'mouse', bubbles: true })); }
    const lockedCount = () => app.fragments.filter(f => f.locked).length;
    // 采样目标碎片的真实顶点投影，逐点点击：命中目标或前方未归位碎片都算推进。
    async function clickSnap(frag) {
      const before = lockedCount();
      // 每次点击前重新投影：归位瞬间的视角轻推会让旧的屏幕坐标失效。
      for (let attempt = 0; attempt < 24; attempt++) {
        frag.mesh.updateMatrixWorld(true);
        const pos = frag.mesh.geometry.attributes.position, rect = canvas.getBoundingClientRect(), Vec = app.camera.position.constructor;
        const step = Math.max(1, Math.floor(pos.count / 60)), pts = [];
        for (let i = 0; i < pos.count; i += step) {
          const v = new Vec(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(frag.mesh.matrixWorld).project(app.camera);
          const p = { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
          if (p.x <= rect.left + 2 || p.x >= rect.right - 2 || p.y <= rect.top + 2 || p.y >= rect.bottom - 2) continue;
          const key = Math.round(p.x / 14) + ':' + Math.round(p.y / 14);
          if (!pts.some(q => q.key === key)) pts.push({ key, x: p.x, y: p.y });
        }
        if (!pts.length) break;
        const p = pts[attempt % pts.length];
        event('pointerdown', p.x, p.y);
        event('pointerup', p.x, p.y);
        await wait(340);
        if (lockedCount() > before) return true;
      }
      return false;
    }
    // 长故事：全部归位后自动展开，可逐页翻读
    const total = app.fragments.length;
    const started = performance.now();
    while (lockedCount() < total) {
      if (performance.now() - started > 120000) throw Error('拼合超时');
      const frag = app.fragments.find(f => !f.locked);
      if (!frag) break;
      const next = lockedCount() + 1;
      check(await clickSnap(frag), `第${next}片真实 pointer 点击归位`);
      const done = lockedCount();
      // snapFragment3D 先置 locked、滑行结束后才回调 repaired++，等计数追平再断言。
      await until(() => app.repaired === done, `第${done}片进度计数`, 8000);
      // 单片归位只推进底部修复进度条，不再逐片弹出小故事；全部归位后才统一展开长卷。
      check(app.view === 'puzzle', `第${done}片归位后仍留在拼合台`);
      check(doc.querySelector('#repair-progress').getAttribute('aria-valuenow') === String(Math.round(done / total * 100)), `第${done}片后修复进度条同步更新`);
    }
    await until(() => app.view === 'memory', '长卷展开', 30000); await wait(1100);
    check(!doc.querySelector('[data-screen="memory"]').hidden, '全部归位后长卷页展开');
    check(doc.querySelectorAll('#memory-dots .memory-dot').length === app.currentVessel.stories.length, '长卷页码点与记忆段数一致');
    check((doc.querySelector('#memory-pager').textContent || '').includes('1 /'), '长卷从第 1 页开始');
    doc.querySelector('#memory-next-page').click(); await wait(700);
    check((doc.querySelector('#memory-pager').textContent || '').includes('2 /'), '长卷可逐页翻读');
    doc.querySelector('#memory-next').click(); await until(() => app.view === 'choice', '进入修复抉择'); await wait(1100);
    // 现状保存是唯一不经过 3D 修复工序台的方案，用它验证「抉择 → 证书」的完整落地。
    doc.querySelector('[data-mode="preserve"]').click(); await until(() => app.view === 'certificate', '现状保存证书'); await wait(1200);
    check(app.mode === 'preserve' && doc.querySelector('#cert-mode').textContent.includes('现状保存'), '隐藏结局与证书理念一致');
    check(/^(瓷|窑) · /.test(doc.querySelector('#cert-id').textContent), '修复编号已生成');
    const complete = document.createElement('li'); complete.textContent = '全部交互验收通过。PNG下载和移动GPU帧率需另行检查。'; list.append(complete);
  } catch (e) {
    const li = document.createElement('li'); li.textContent = '失败：' + e.message; list.append(li);
  } finally { document.querySelector('#run').disabled = false; }
};
