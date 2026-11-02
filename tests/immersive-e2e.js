// 沉浸版端到端验收：加载真实应用，脚本化走完多器型流程。
// 在浏览器中打开 /tests/immersive-e2e.html 自动运行；结果写入页面与 window.__e2e。
import '../src/immersive.js';
import { VESSELS, LOCATIONS } from '../src/data/vessels.js';
import { markCompleted, completedCount } from '../src/modules/progress.js';

const out = [];
const ok = (cond, msg) => { out.push((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) out.fail = true; };
ok.fail = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  await sleep(1200); // 等待场景与首屏初始化
  const P = window.porcelain;
  ok(Boolean(P), 'window.porcelain 验收接口已暴露');
  // 〇、启程页版式：四项能力条、身份卡 CTA、月洞水墨背景就位。
  ok(document.querySelectorAll('.hero-abilities li').length === 4, '启程页四项能力条就位');
  ok(Boolean(document.querySelector('.hero-card .primary[data-go="cabinet"]')), '身份卡含「开始修复」CTA');
  ok((document.querySelector('#hero-identity')?.textContent || '').includes('数字修复师'), '身份卡写明「数字修复师」身份');
  ok(Boolean(document.querySelector('#landscape')?.width), '月洞水墨远山背景已绘制');
  if (P) {
    // 一、档案柜
    P.renderCabinet();
    ok(document.querySelectorAll('.cabinet-card').length === 6, '档案柜渲染 6 张档案卡');
    ok(document.querySelectorAll('.cabinet-card.available, .cabinet-card.done').length >= 1, '首件已解锁');
    ok(document.querySelectorAll('.cabinet-card.locked').length === 5, '其余 5 件未解锁');

    // 二、多器型拼合：逐件走完吸附管线（3D 走真实点击归位；无 WebGL 时走 2D 吸附接口）
    const canvas = P.renderer?.domElement;
    const pointer = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 42, pointerType: 'mouse', isPrimary: true,
      button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: x, clientY: y
    }));
    // 把未归位的瓷片逐片点掉（3D 点击即归位）；采样真实顶点，保证射线一定落在瓷面。
    function surfacePoints(frag) {
      frag.mesh.updateMatrixWorld(true);
      const pos = frag.mesh.geometry.attributes.position, rect = canvas.getBoundingClientRect();
      const Vec = P.camera.position.constructor, step = Math.max(1, Math.floor(pos.count / 60)), out = [];
      for (let i = 0; i < pos.count; i += step) {
        const v = new Vec(pos.getX(i), pos.getY(i), pos.getZ(i))
          .applyMatrix4(frag.mesh.matrixWorld).project(P.camera);
        const x = rect.left + (v.x + 1) / 2 * rect.width, y = rect.top + (1 - v.y) / 2 * rect.height;
        if (x <= rect.left + 2 || x >= rect.right - 2 || y <= rect.top + 2 || y >= rect.bottom - 2) continue;
        const key = Math.round(x / 14) + ':' + Math.round(y / 14);
        if (!out.some(p => p.key === key)) out.push({ key, x, y });
      }
      return out.slice(0, 24).map(p => [p.x, p.y]);
    }
    async function snapAll() {
      if (!canvas) {
        for (const f of P.fragments) {
          f.mesh.position.copy(f.correctPosition);
          f.mesh.rotation.z = f.correctRotation;
          P.attemptSnap(f);
        }
        return true;
      }
      const started = Date.now();
      while (Date.now() - started < 120000) {
        const unlocked = P.fragments.filter(f => !f.locked);
        if (!unlocked.length) return true;
        const frag = unlocked[0];
        let changed = false;
        // 每次点击前重新投影：归位瞬间的视角轻推会让旧的屏幕坐标失效。
        for (let attempt = 0; attempt < 24; attempt++) {
          const pts = surfacePoints(frag);
          if (!pts.length) break;
          const [x, y] = pts[attempt % pts.length];
          pointer('pointerdown', x, y);
          pointer('pointerup', x, y);
          await sleep(340);
          // 点击命中目标或其它未归位碎片都算推进（碎片叠压时先归位前方那片）。
          if (frag.locked || unlocked.some(f => f.locked)) { changed = true; break; }
        }
        if (!changed) { ok(false, `${P.currentVessel.id} 碎片 #${frag.index} 点击后未归位`); return false; }
      }
      return false;
    }

    for (const vessel of VESSELS.slice(0, 3)) {
      P.go('puzzle');
      await sleep(1500);
      P.openVessel(vessel);
      P.reset();
      await sleep(600);
      ok(P.fragments.length === vessel.fragmentCount, `${vessel.id} 生成 ${vessel.fragmentCount} 片`);
      // 3D 碎片的正确姿态是恒等四元数（几何已按器身建模），2D 回退用 correctRotation。
      const is3D = Boolean(P.fragments[0]?.correctQuaternion);
      if (is3D) {
        ok(P.fragments.every(f => f.correctPosition && f.correctQuaternion), `${vessel.id} 每片都有归位目标位姿`);
      } else {
        const rotated = P.fragments.filter(f => f.correctRotation !== 0).length;
        ok(rotated === Object.keys(vessel.rotationMap).length, `${vessel.id} 非零正确角碎片 ${rotated} 片`);
      }
      ok(await snapAll(), `${vessel.id} 全部瓷片归位`);
      // snapFragment3D 先置 locked、滑行结束后才回调 repaired++：等进度计数追平再断言进度条。
      for (let i = 0; i < 40 && P.repaired !== vessel.fragmentCount; i++) await sleep(300);
      ok(P.repaired === vessel.fragmentCount, `${vessel.id} 全部吸附 ${P.repaired}/${vessel.fragmentCount}`);
      // 底部修复进度条：单片归位只推进进度，不再逐片弹记忆
      const meter = document.querySelector('#repair-progress');
      ok(meter?.getAttribute('aria-valuenow') === '100' && meter.classList.contains('complete'), `${vessel.id} 修复进度条 100%（${meter?.getAttribute('aria-valuenow')}）`);
      ok(!document.querySelector('.memory-timeline'), '底部记忆时间轴已替换为修复进度条');
      if (vessel !== VESSELS[2]) ok(P.view === 'puzzle', `${vessel.id} 拼合过程中不单独弹出记忆（当前 ${P.view}）`);
    }

    // 三、长故事：全部归位后自动展开的翻页长卷
    for (let i = 0; i < 40 && P.view !== 'memory'; i++) await sleep(500);
    ok(P.view === 'memory', `全部归位后自动展开器物长卷（当前 ${P.view}）`);
    ok(document.querySelectorAll('#memory-dots .memory-dot').length === P.currentVessel.stories.length, '长卷页码与记忆段数一致');
    ok((document.querySelector('#memory-pager')?.textContent || '').includes('1 /'), '长卷从第 1 页开始');
    document.querySelector('#memory-next-page')?.click();
    await sleep(700);
    ok((document.querySelector('#memory-pager')?.textContent || '').includes('2 /'), '长卷可逐页翻读');
    ok((document.querySelector('#memory-title')?.textContent || '').length > 0, '长卷当前页有标题');
    document.querySelector('#memory-next')?.click();
    await sleep(1800);
    ok(P.view === 'choice', '读完全卷进入修复抉择');

    // 四、进度与证书
    P.openVessel(VESSELS[0]);
    P.go('certificate');
    await sleep(1800);
    ok(Boolean(P.progress.completed.meiping), '梅瓶完成状态已入档');
    ok(document.querySelector('#cert-name').textContent.length > 0, '证书含修复师');
    ok(document.querySelector('#cert-origin').textContent.includes(VESSELS[0].origin), '证书含器物出处');
    ok((document.querySelector('#cert-seal')?.src || '').startsWith('data:image/png'), '修复师篆印已钤于证书');
    ok(Boolean(document.querySelector('#knock-cert')), '证书页有「轻叩瓷身」入口');

    // 五、解锁链与考察点
    for (const v of VESSELS.slice(1)) markCompleted(P.progress, v.id, 'kintsugi', '窑 · 乙巳 · TEST');
    P.renderCabinet();
    ok(document.querySelectorAll('.cabinet-card.done').length === 6, '六件全部盖章');
    ok(completedCount(P.progress) === 6, '进度计数 6/6');
    ok(LOCATIONS.every(l => completedCount(P.progress) >= l.unlockAt), '三处考察点全部解锁');

    // 六、考察导览与终局成就
    P.go('tour');
    await sleep(1500);
    const tour = P.ensureTour();
    ok(tour.currentStop === 0 || tour.currentStop >= 0, `导览已进入第 ${tour.currentStop + 1} 站`);
    tour.travel(LOCATIONS.length - 1);
    for (let i = 0; i < 30 && tour.currentStop !== LOCATIONS.length - 1; i++) await sleep(500); // 旅途最长约 9 秒
    ok(tour.currentStop === LOCATIONS.length - 1, '相机已抵达最后一站');
    await sleep(1600); // 成就弹窗有 900ms 延迟
    const note = document.querySelector('#tour-note');
    ok(!note.hidden && note.textContent.includes('陶溪川'), '考察手记卡弹出');
    const chips = document.querySelectorAll('.tour-chip.open').length;
    ok(chips === 3, `导览地图 3 站全开（当前 ${chips}）`);
    const ach = !document.querySelector('#achievement').hidden;
    ok(ach, '终局成就「一镇瓷魂 · 千年窑火」已触发');

    // 七、控制台错误
    ok((window.__errs || []).length === 0, '无未捕获运行时错误');
    if ((window.__errs || []).length) out.push(...window.__errs.map(e => '  ERR ' + e.split('\n').slice(0, 3).join(' | ')));
  }
} catch (error) {
  ok(false, '异常：' + (error && error.stack ? error.stack.split('\n')[0] : error));
}

const failed = out.filter(l => l.startsWith('FAIL'));
const summary = `E2E 结果：${out.length - failed.length}/${out.length} 通过${failed.length ? '，' + failed.length + ' 项失败' : ''}`;
const el = document.getElementById('e2e-out');
el.textContent = summary + '\n' + out.join('\n');
el.style.color = failed.length ? '#ff9a8a' : '#9fe6a0';
document.title = failed.length ? `E2E 失败 ${failed.length}` : 'E2E 全部通过';
window.__e2e = { summary, out, failed: failed.length };
