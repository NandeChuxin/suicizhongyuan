// 「讲解员」的视觉呈现层：程序化水墨剪影（单一器灵剪影，零外部模型）+ 3D 器灵「阿圆」。
// 轻量约束：
//   · 同一时间只保留一个活动角色（由集成层保证单例）；
//   · 减少动态 / 低性能模式：取消粒子与大幅动作，剪影静态（无呼吸动画），只做淡入淡出；
//   · 器灵首次出现前展示「原创数字角色」声明块（见 GUIDE_QILING.disclaimer）；
//   · 3D 加载失败时静默回退 2D 剪影，不阻塞任何流程。
import { gsap } from 'gsap';

// 3D 器灵加载失败时的 2D 水墨剪影兜底（全程序化 SVG 路径，不引入任何外部图片 / 素材）。
// 单一固定剪影：发片 + 画坯细笔，与 3D「器灵 · 阿圆」对应；仅在 3D 不可用时作为静默兜底呈现。
export const INK_SVG = `
<svg class="gc-ink" viewBox="0 0 220 300" aria-hidden="true">
  <defs>
    <linearGradient id="gcRobe" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f8ff" stop-opacity=".5"/>
      <stop offset=".55" stop-color="#b7cbe8" stop-opacity=".36"/>
      <stop offset="1" stop-color="#3d5c94" stop-opacity=".14"/>
    </linearGradient>
    <radialGradient id="gcGlow" cx=".5" cy=".32" r=".55">
      <stop offset="0" stop-color="#f8e2ae" stop-opacity=".52"/>
      <stop offset="1" stop-color="#f3d79a" stop-opacity="0"/>
    </radialGradient>
    <filter id="gcSoft"><feGaussianBlur stdDeviation="1.1"/></filter>
  </defs>
  <circle cx="110" cy="96" r="86" fill="url(#gcGlow)"/>
  <g class="gc-shape">
    <g class="gc-body" filter="url(#gcSoft)">
      <path class="gc-hair" d="M83 74c2-19 14-30 27-30s25 11 27 30c-6-8-16-12-27-12s-21 4-27 12z" fill="#2c4066" fill-opacity=".62"/>
      <path class="gc-head" d="M110 46c16 0 27 13 27 30 0 12-5 22-13 26l-28 0c-8-4-13-14-13-26 0-17 11-30 27-30z" fill="none" stroke="#e4edfb" stroke-opacity=".85" stroke-width="1.6"/>
      <path class="gc-robe" d="M110 104c26 0 46 20 52 52 4 22 6 52 6 82H52c0-30 2-60 6-82 6-32 26-52 52-52z" fill="url(#gcRobe)" stroke="#d8e6f8" stroke-opacity=".55" stroke-width="1.3"/>
      <path class="gc-collar" d="M110 104l-20 22 20 16 20-16z" fill="#f4f8ff" fill-opacity=".34"/>
      <path class="gc-sleeve" d="M64 128c-18 14-30 36-34 60 14 6 30 8 44 6-2-26 0-48 8-66z" fill="#b7cbe8" fill-opacity=".2" stroke="#d8e6f8" stroke-opacity=".38" stroke-width="1"/>
      <path class="gc-arm" d="M156 128c10 20 12 46 8 70 10-4 18-10 22-18-4-24-16-44-30-52z" fill="#b7cbe8" fill-opacity=".2" stroke="#d8e6f8" stroke-opacity=".36" stroke-width="1"/>
      <path class="gc-prop" d="M162 130l32-36M162 130l7 7" stroke="#e4edfb" stroke-opacity=".78" stroke-width="2" fill="none"/>
    </g>
  </g>
</svg>`;

// 器灵资料（名称与免责声明）。集成层可通过 avatars 参数覆盖。
const AVATAR_FALLBACK = {
  qiling: { name: '器灵 · 阿圆', disclaimer: '「器灵 · 阿圆」为原创数字角色，不是真实历史人物复原，也不代表任何器灵信仰；3D 形象为程序化数字资产。' }
};

export function createGuideCharacter({ mount, reduced = false, low = false, disclaimer = '', avatars = AVATAR_FALLBACK, onActivate, motion = false } = {}) {
  const info = kind => avatars[kind] || AVATAR_FALLBACK[kind] || AVATAR_FALLBACK.qiling;
  const el = document.createElement('aside');
  el.className = 'guide-character';
  // 角色本身就是「知识库」的入口：点击 / 回车即可打开窑火问答。
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.setAttribute('aria-label', `原创数字角色讲解员：点击打开窑火问答${disclaimer ? '。' + disclaimer : ''}`);
  el.hidden = true;
  el.innerHTML = `
    <canvas class="gc-particles" width="220" height="300" aria-hidden="true"></canvas>
    ${INK_SVG}
    <span class="gc-label">原创数字角色</span>
    <p class="gc-disclaim" hidden></p>
    <p class="gc-line" aria-live="polite"></p>`;
  (mount || document.body).append(el);

  const canvas = el.querySelector('.gc-particles');
  const ctx = canvas.getContext('2d');
  const lineEl = el.querySelector('.gc-line');
  const labelEl = el.querySelector('.gc-label');
  const disclaimEl = el.querySelector('.gc-disclaim');
  const soft = reduced || low; // 减少动态 / 低画质时禁用粒子与呼吸动画
  let particles = [], raf = 0, active = false;
  const avatar = 'qiling';     // 全站唯一讲解形象：3D 器灵「阿圆」
  let qiling3d = null, qilingLoading = false, qilingDead = false;
  let disclaimShown = false;   // 声明块在会话内只展示一次
  let disclaimTimer = 0;

  // —— 可移动角色（motion，默认关闭；由集成层启用）：位置改由 JS 接管，CSS 仅保留尺寸与外观 ——
  // 范围：始终被 clamp 在视口安全区（顶部让出页头，四周留 8px），不越出屏幕、不覆盖页头/面板边缘。
  // 触发：切屏 / 面板开合（body 的 data-view 与 class 变化）→ 平滑移动到停靠位；
  //       讲解（speak）→ 朝视口中心「探身」；拖拽 / 方向键 → 自由改位。
  // 记忆：拖拽后的位置仅本次会话内保留（dockOverride），不写任何本地存储，不触碰存档。
  const canMove = Boolean(motion);
  let dockOverride = null;   // 会话内拖拽改位
  let curX = 0, curY = 0;     // 当前位置（拖拽与方向键的基准）
  let dragging = false, dragMoved = false, suppressClick = false, dragStart = null, dragOrigin = null;
  let bodyObserver = 0, resizeHandler = null;
  let lastMotionKey = '';

  // 仅当「影响停靠位」的状态键真正变化时才重新停靠：
  // 视图（data-view）、面板开合（guide-open）、证书聚焦（cert-focus）。
  // 其余无关的 body class 变化（dragging / low-power / exhibit-focus / tour-note-open 等）
  // 不应把讲解中的「探身」状态拉回停靠位。
  function motionStateKey() {
    const body = typeof document !== 'undefined' ? document.body : null;
    if (!body) return '';
    const view = (body.dataset && body.dataset.view) || 'start';
    return `${view}|${body.classList.contains('guide-open') ? 1 : 0}|${body.classList.contains('cert-focus') ? 1 : 0}`;
  }

  function motionMetrics() {
    const W = typeof window !== 'undefined' ? (window.innerWidth || 0) : 0;
    const H = typeof window !== 'undefined' ? (window.innerHeight || 0) : 0;
    const mobile = W > 0 && W <= 760;
    const w = el.offsetWidth || (mobile ? 110 : 178);
    const h = el.offsetHeight || (mobile ? 150 : 240);
    return { W, H, mobile, w, h, scale: mobile ? 0.9 : 1 };
  }
  function clampToSafe(x, y, m) {
    const bw = m.w * m.scale, bh = m.h * m.scale;
    const minX = 8, maxX = Math.max(minX, m.W - 8 - bw);
    const minY = 56, maxY = Math.max(minY, m.H - 8 - bh); // 顶部让出页头
    return { x: Math.min(maxX, Math.max(minX, x)), y: Math.min(maxY, Math.max(minY, y)) };
  }
  // 停靠位（dock）/ 探身位（focus）：沿用既有观感锚点，换算为元素左上角坐标后 clamp。
  function computeAnchor(kind) {
    const m = motionMetrics();
    const body = typeof document !== 'undefined' ? document.body : null;
    const view = (body && body.dataset && body.dataset.view) || 'start';
    const open = Boolean(body && body.classList.contains('guide-open') && !body.classList.contains('cert-focus'));
    const wide = m.W >= 2050;
    let x, y;
    if (m.mobile) { x = m.W - 8 - m.w; y = 64; }
    else {
      const rightPx = open ? 376 + 14 : (wide ? 14 : Math.round(m.W * 0.28));
      x = m.W - rightPx - m.w;
      y = (view === 'tour' && !open) ? m.H - 178 - m.h : 104;
    }
    let pos = clampToSafe(x, y, m);
    if (kind === 'focus') pos = clampToSafe(pos.x + (m.W / 2 - pos.x) * 0.2, pos.y - 16, m); // 讲解时朝中心探身
    return { x: pos.x, y: pos.y, scale: m.scale };
  }
  function setMotionPos(p, animate) {
    if (!canMove || !p) return;
    curX = p.x; curY = p.y;
    gsap.to(el, { x: p.x, y: p.y, scale: p.scale ?? 1, duration: animate === false ? 0 : 0.62, ease: 'power2.out', overwrite: 'auto' });
  }
  function dock() { // 回到停靠位（用户拖拽过则用其会话内位置）
    if (!canMove) return;
    const m = motionMetrics();
    const base = dockOverride || computeAnchor('dock');
    setMotionPos({ x: base.x, y: base.y, scale: m.scale }, !soft);
  }
  function leanIn() { // 讲解/热点时向焦点探身（用户已手动改位则不计；减少动效/低性能改为即时移动而非取消）
    if (!active || !canMove || dockOverride) return;
    setMotionPos(computeAnchor('focus'), !soft);
  }
  function onPointerDown(e) {
    if (e.button !== undefined && e.button > 0) return;
    dragging = true; dragMoved = false;
    dragStart = { x: e.clientX, y: e.clientY };
    dragOrigin = { x: curX, y: curY };
    try { el.setPointerCapture?.(e.pointerId); } catch { /* 无捕获能力时忽略 */ }
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
    if (!dragMoved && Math.hypot(dx, dy) < 6) return; // 6px 内视为点击，不改位
    dragMoved = true;
    const m = motionMetrics();
    const p = clampToSafe(dragOrigin.x + dx, dragOrigin.y + dy, m);
    curX = p.x; curY = p.y;
    gsap.set(el, { x: p.x, y: p.y });
  }
  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    try { el.releasePointerCapture?.(e.pointerId); } catch { /* 忽略 */ }
    if (dragMoved) { suppressClick = true; dockOverride = { x: curX, y: curY }; } // 会话内记忆
  }
  if (canMove && typeof window !== 'undefined') {
    el.style.right = 'auto'; el.style.bottom = 'auto';
    el.style.left = '0px'; el.style.top = '0px';
    el.style.transformOrigin = '0 0';
    el.style.willChange = 'transform';
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    resizeHandler = () => { if (!dragging) dock(); };
    window.addEventListener('resize', resizeHandler);
    // 切屏（body[data-view]）与面板开合（body.guide-open / cert-focus）→ 平滑重新停靠。
    // 只响应「停靠状态键」的变化，忽略无关 body class（避免讲解探身被回拉）。
    lastMotionKey = motionStateKey();
    if (typeof MutationObserver === 'function' && document.body) {
      const mo = new MutationObserver(() => {
        if (dragging) return;
        const k = motionStateKey();
        if (k === lastMotionKey) return;
        lastMotionKey = k;
        dock();
      });
      mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-view'] });
      bodyObserver = mo;
    }
  }

  function hideDisclaim() {
    if (disclaimTimer) { clearTimeout(disclaimTimer); disclaimTimer = 0; }
    if (disclaimEl) disclaimEl.hidden = true;
  }
  function showDisclaim() {
    if (!disclaimEl) return;
    const meta = info('qiling');
    if (!meta?.disclaimer) return;
    disclaimEl.textContent = meta.disclaimer;
    disclaimEl.hidden = false;
    el.dataset.disclaim = 'qiling';
    if (disclaimTimer) clearTimeout(disclaimTimer);
    disclaimTimer = setTimeout(() => { disclaimEl.hidden = true; disclaimTimer = 0; }, 7000);
    // Node 测试环境避免计时器挂住进程；浏览器无 unref，定时照常生效。
    if (disclaimTimer && typeof disclaimTimer.unref === 'function') disclaimTimer.unref();
  }
  // 器灵首次出现前展示声明块（会话内一次）。
  function claimFirstAppear() {
    if (disclaimShown) return;
    disclaimShown = true;
    showDisclaim();
  }

  function seedParticles() {
    // 从底部（器物方向）向人形轮廓聚合。
    particles = Array.from({ length: 46 }, () => ({
      x: 20 + Math.random() * 180,
      y: 260 + Math.random() * 30,
      tx: 40 + Math.random() * 140,
      ty: 60 + Math.random() * 200,
      r: 0.8 + Math.random() * 1.8,
      a: 0,
      v: 0.02 + Math.random() * 0.03
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, 220, 300);
    let alive = false;
    for (const p of particles) {
      p.x += (p.tx - p.x) * p.v;
      p.y += (p.ty - p.y) * p.v;
      p.a = Math.min(0.9, p.a + 0.03);
      ctx.beginPath();
      ctx.fillStyle = `rgba(243,215,154,${p.a * 0.7})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      if (Math.abs(p.x - p.tx) > 1 || Math.abs(p.y - p.ty) > 1) alive = true;
    }
    if (alive) raf = requestAnimationFrame(draw);
    else raf = 0;
  }

  function appear() {
    active = true;
    el.hidden = false;
    if (canMove) setMotionPos(dockOverride || computeAnchor('dock'), false); // 首现即落在停靠位
    applyAvatarVisibility(); // 阿圆 3D 已预加载时，召唤瞬间即呈现 3D 形象
    el.dataset.state = 'appear';
    if (soft) { gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.6 }); }
    else {
      // 可移动角色：x/y 已交给 motion 层，入场只做淡入，避免与位移补间抢占 transform。
      if (canMove) gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'power3.out' });
      else gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' });
      seedParticles(); if (!raf) raf = requestAnimationFrame(draw);
      gsap.to(canvas, { opacity: 0, duration: 1.2, delay: 1.1 });
      gsap.fromTo(canvas, { opacity: 1 }, { opacity: 0, duration: 1.2, delay: 1.1 });
    }
    // 先注视器物，再面向用户。
    const body = el.querySelector('.gc-body');
    if (!soft && body) {
      gsap.fromTo(body, { rotate: -6, x: -8 }, { rotate: 0, x: 0, duration: 1.1, ease: 'power2.out', delay: 0.2 });
    }
    gsap.delayedCall(soft ? 0.3 : 1.2, () => { if (active) el.dataset.state = 'idle'; });
  }

  function summon() {
    if (active) { el.dataset.state = 'idle'; return; }
    appear();
  }

  function speak() {
    if (!active) return;
    el.dataset.state = 'speaking';
    if (avatar === 'qiling') qiling3d?.setSpeaking(true);
    leanIn(); // 讲解时朝焦点探身
  }
  function idle() {
    if (!active) return;
    el.dataset.state = 'idle';
    if (avatar === 'qiling') qiling3d?.setSpeaking(false);
    dock(); // 讲完归位
  }
  function think() { if (active) el.dataset.state = 'thinking'; }

  // 强调：在关键纹样 / 裂痕旁生成一枚光点（由集成层传入屏幕坐标或默认位置）。
  function emphasize(point) {
    if (!active) return;
    const spark = document.createElement('i');
    spark.className = 'gc-spark';
    if (point) { spark.style.left = `${point.x}px`; spark.style.top = `${point.y}px`; }
    el.append(spark);
    gsap.fromTo(spark, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, yoyo: true, repeat: 1, onComplete: () => spark.remove() });
  }

  // 同步剪影与 3D 的可见性（激活状态可能已变化时也只做这一件事）。
  function applyAvatarVisibility() {
    const ink = el.querySelector('.gc-ink');
    const show3d = avatar === 'qiling' && qiling3d && active;
    if (qiling3d) qiling3d.setVisible(show3d);
    if (ink) ink.style.opacity = show3d ? '0' : '1';
  }

  // 呈现器灵「阿圆」：走 3D（懒加载，失败静默回退 2D 剪影），不阻塞任何流程、失败不重试。
  async function present() {
    labelEl.textContent = `原创数字角色 · ${info('qiling').name}`;
    el.title = `点击打开窑火问答 · ${info('qiling').name}`;
    el.setAttribute('aria-label', `原创数字角色讲解员 ${info('qiling').name}：点击打开窑火问答。${info('qiling').disclaimer}`);
    claimFirstAppear(); // 器灵首次出现前展示声明块（会话内一次）
    if (qilingDead || qiling3d) { applyAvatarVisibility(); return; }
    if (qilingLoading) return;
    const ink = el.querySelector('.gc-ink');
    if (ink) ink.style.opacity = '0';
    qilingLoading = true;
    try {
      const mod = await import('./guide-character3d.js');
      qiling3d = await mod.mountQiling3D(el, { reduced, low, onContextLost: () => {
        // WebGL 上下文丢失：立即退回剪影，并永久禁用 3D（避免"有形但看不见"的隐形状态）。
        qilingDead = true;
        qiling3d = null;
        applyAvatarVisibility();
      } });
    } catch { qiling3d = null; }
    qilingLoading = false;
    if (!qiling3d) qilingDead = true; // 加载失败：保持 2D 剪影呈现「阿圆」，不报错、不阻塞、不重试
    applyAvatarVisibility();
  }

  function setLine(text) { if (lineEl) lineEl.textContent = text || ''; }

  // 作为知识库入口：点击 / Enter / 空格打开窑火问答。（拖拽超过阈值后的这次 click 视为改位，不触发打开）
  el.addEventListener('click', () => { if (suppressClick) { suppressClick = false; return; } onActivate?.(); });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate?.(); return; }
    if (!canMove) return;
    // 方向键微调位置（16px/次，clamp 在安全区内），会话内记忆。
    const step = 16;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const m = motionMetrics();
    const base = dockOverride || { x: curX, y: curY };
    const p = clampToSafe(base.x + dx, base.y + dy, m);
    dockOverride = { x: p.x, y: p.y };
    setMotionPos({ x: p.x, y: p.y, scale: m.scale }, false);
  });

  function dismiss() {
    if (!active) { el.hidden = true; hideDisclaim(); return; }
    active = false;
    el.dataset.state = 'leave';
    hideDisclaim();
    if (avatar === 'qiling') qiling3d?.setSpeaking(false);
    const done = () => { el.hidden = true; el.dataset.state = 'idle'; ctx.clearRect(0, 0, 220, 300); if (avatar === 'qiling') qiling3d?.setVisible(false); };
    if (soft || canMove) gsap.to(el, { opacity: 0, duration: 0.4, onComplete: done }); // 可移动角色：退场只淡出，保留位移通道
    else gsap.to(el, { opacity: 0, y: 18, filter: 'blur(4px)', duration: 0.9, ease: 'power2.in', onComplete: done });
  }

  return {
    el,
    summon, speak, idle, think, emphasize, dismiss, setLine, present, dock, focus: leanIn,
    get active() { return active; },
    get avatar() { return avatar; },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      if (disclaimTimer) clearTimeout(disclaimTimer);
      if (bodyObserver) { bodyObserver.disconnect(); bodyObserver = 0; }
      if (resizeHandler && typeof window !== 'undefined') window.removeEventListener('resize', resizeHandler);
      qiling3d?.dispose();
      el.remove();
    }
  };
}
