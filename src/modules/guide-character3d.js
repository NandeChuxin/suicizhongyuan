// 「器灵 · 阿圆」3D 形象：独立小场景渲染 public/models/qiling.glb。
// 约束：
//   · 复用 vessel-model.js 的加载管线（GLTFLoader + meshopt + fitToHeight）；
//   · 任何失败（下载 / 解析 / WebGL）都返回 null，由 guide-character.js 静默回退 2D 剪影；
//   · 仅在可见时渲染（rAF 门控），减少动态 / 低性能模式不播动画只做静态呈现；
//   · 不写任何存档，不参与任何流程状态。
import * as THREE from 'three';
import { loadVesselModel, fitToHeight } from './vessel-model.js';
import { createEyePearl } from './qiling-eye-pearl.js';

export async function mountQiling3D(container, { reduced = false, low = false, onContextLost } = {}) {
  try {
    const res = await loadVesselModel('qiling.glb');
    if (!res.ok) return null;

    const canvas = document.createElement('canvas');
    canvas.className = 'gc-3d';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.display = 'none';
    container.append(canvas);

    const w = container.clientWidth || 220;
    const h = container.clientHeight || 300;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !low });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 2));
    renderer.setSize(w, h, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 50);
    // 取景：视口下缘正好落在模型底沿——器灵「站」在画框底部，整个身形完整入画、不悬空。
    // （fov34°、距离≈4.8 → 视口半高≈1.47；模型半高≈1.03，视口中心抬到 +0.42 即可让底沿贴边。）
    camera.position.set(0, 1.05, 4.8);
    camera.lookAt(0, 0.42, 0);

    scene.add(new THREE.AmbientLight(0xdfe8f5, 1.15));
    const key = new THREE.DirectionalLight(0xf3d79a, 2.1);
    key.position.set(1.6, 2.4, 2.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb4e8, 1.15);
    rim.position.set(-2, 1.4, -1.6);
    scene.add(rim);

    const root = res.root;
    fitToHeight(root, 2.05); // 居中于原点，构图交给相机（取景已保证底沿贴边、全身入画）
    scene.add(root);

    // 眼部珠光：在已归一的模型局部坐标上叠程序化高光，随 root 一起转头/悬浮。
    // 低画质只保留静态 sheen + pearl；减少动态保留四层但不跑时间驱动动画。
    let eyePearl = null;
    try { eyePearl = createEyePearl(root, { low, reduced }); }
    catch (error) { console.warn('[器灵阿圆] 眼部珠光初始化失败，保留原眼部：', error?.message || error); }

    let raf = 0, visible = false, speaking = false, dead = false;
    const clock = new THREE.Clock();

    // WebGL 上下文丢失（驱动重置 / 显存不足等）：画面会突然"只剩个轮廓但看不见"。
    // 一律立即回退 2D 剪影，并通知外层不再尝试 3D——宁可用剪影，不留一个隐形角色。
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      if (dead) return;
      dead = true;
      if (raf) cancelAnimationFrame(raf); raf = 0;
      console.warn('[器灵阿圆] WebGL 上下文丢失，回退 2D 剪影。');
      onContextLost?.();
    });

    function frame() {
      if (dead) { raf = 0; return; }
      raf = requestAnimationFrame(frame);
      const t = clock.getElapsedTime();
      if (!reduced) {
        // 待机：轻微摇曳 + 悬浮；说话：小幅上下律动（不遮字幕）。
        root.rotation.y = Math.sin(t * 0.5) * 0.26;
        root.position.y = speaking
          ? Math.abs(Math.sin(t * 3.1)) * 0.05
          : Math.sin(t * 1.05) * 0.03;
        eyePearl?.update(t);
      }
      renderer.render(scene, camera);
    }
    function startStop() {
      const want = visible && !reduced;
      if (want && !raf) { clock.getDelta(); raf = requestAnimationFrame(frame); }
      else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; renderer.render(scene, camera); }
    }

    return {
      setVisible(v) {
        visible = Boolean(v);
        canvas.style.display = visible ? 'block' : 'none';
        startStop();
      },
      setSpeaking(s) {
        speaking = Boolean(s);
        eyePearl?.setSpeaking(speaking);
        // reduced 模式没有渲染循环：状态变化后补一帧，保证静态珠光也能反映语气。
        if (reduced && visible) renderer.render(scene, camera);
      },
      dispose() {
        if (raf) cancelAnimationFrame(raf); raf = 0;
        eyePearl?.dispose?.();
        res.dispose?.();
        renderer.dispose();
        canvas.remove();
      },
      get ok() { return true; }
    };
  } catch (error) {
    // 静默回退 2D 剪影；诊断信息仅进控制台，不打扰用户。
    console.warn('[器灵阿圆] 3D 形象加载失败，回退 2D 剪影：', error?.message || error);
    return null;
  }
}
