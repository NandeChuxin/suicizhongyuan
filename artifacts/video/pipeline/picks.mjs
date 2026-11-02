// 拼合屏：按几何顶点投影得到每片碎片的可点击屏幕点
export const FRAG_PICK = () => {
  const p = window.porcelain;
  const cvs = [...document.querySelectorAll('canvas')].find(c => getComputedStyle(c).pointerEvents === 'auto');
  if (!cvs) return [];
  const r = cvs.getBoundingClientRect();
  const cam = p.camera;
  const P = cam.projectionMatrix.elements, V = cam.matrixWorldInverse.elements;
  const mul = (a, b) => {
    const o = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + i] * b[j * 4 + k];
      o[j * 4 + i] = s;
    }
    return o;
  };
  const VC = mul(P, V);
  const proj = (x, y, z) => {
    const cx = VC[0] * x + VC[4] * y + VC[8] * z + VC[12];
    const cy = VC[1] * x + VC[5] * y + VC[9] * z + VC[13];
    const cw = VC[3] * x + VC[7] * y + VC[11] * z + VC[15];
    return { x: r.left + (cx / cw + 1) / 2 * r.width, y: r.top + (1 - cy / cw) / 2 * r.height, w: cw };
  };
  const out = [];
  p.fragments.forEach((f, i) => {
    if (f.locked) return;
    const M = f.mesh.matrixWorld.elements;
    const pos = f.mesh.geometry.attributes.position;
    const pts = [];
    const step = Math.max(1, Math.floor(pos.count / 80));
    for (let k = 0; k < pos.count; k += step) {
      const lx = pos.getX(k), ly = pos.getY(k), lz = pos.getZ(k);
      const s = proj(
        M[0] * lx + M[4] * ly + M[8] * lz + M[12],
        M[1] * lx + M[5] * ly + M[9] * lz + M[13],
        M[2] * lx + M[6] * ly + M[10] * lz + M[14]);
      if (s.w > 0.01) pts.push(s);
    }
    if (pts.length < 3) return;
    const cx = pts.reduce((a, b) => a + b.x, 0) / pts.length;
    const cy = pts.reduce((a, b) => a + b.y, 0) / pts.length;
    const cands = [{ x: cx, y: cy }];
    for (let k = 0; k < pts.length; k += Math.max(1, Math.floor(pts.length / 12))) {
      cands.push({ x: cx + (pts[k].x - cx) * 0.45, y: cy + (pts[k].y - cy) * 0.45 });
    }
    const usable = cands.filter(c => {
      const el = document.elementFromPoint(c.x, c.y);
      return el === cvs && c.y > 130 && c.y < 880 && c.x > 575 && c.x < 1440;
    }).map(c => ({ x: Math.round(c.x), y: Math.round(c.y) }));
    out.push({ i, cx: Math.round(cx), cy: Math.round(cy), usable });
  });
  return out;
};

export const SEED = {
  // 六件全修：用于考察/终局成就
  allDone: (name = '沈砚') => {
    const ids = ['meiping', 'yuhuchun', 'jiangjun', 'gaozu', 'suantou', 'linglong'];
    const modes = ['kintsugi', 'traditional', 'juci', 'kintsugi', 'preserve', 'traditional'];
    const completed = {}, certificates = {};
    ids.forEach((id, i) => {
      completed[id] = { mode: modes[i], date: '2026/10/18' };
      certificates[id] = '瓷 · ' + String(1000 + i * 37).slice(-4);
    });
    return { 'porcelain-reunion-progress-v1': JSON.stringify({ completed, certificates, userName: name, currentVesselId: 'linglong' }) };
  },
  // 首件完成：用于展厅
  oneDone: (name = '沈砚') => ({
    'porcelain-reunion-progress-v1': JSON.stringify({
      completed: { meiping: { mode: 'kintsugi', date: '2026/10/18' } },
      certificates: { meiping: '瓷 · 7A21' }, userName: name, currentVesselId: 'meiping',
    }),
  }),
  // 三槽位：用于存档面板
  slots: () => ({
    'porcelain-reunion-progress-v1': JSON.stringify({
      completed: { meiping: { mode: 'kintsugi', date: '2026/10/18' } },
      certificates: { meiping: '瓷 · 7A21' }, userName: '沈砚', currentVesselId: 'meiping',
    }),
    'porcelain-reunion-progress-v1-slot2': JSON.stringify({
      completed: {
        meiping: { mode: 'juci', date: '2026/10/12' },
        yuhuchun: { mode: 'traditional', date: '2026/10/13' },
        jiangjun: { mode: 'preserve', date: '2026/10/15' },
      },
      certificates: { meiping: '瓷 · 3C08', yuhuchun: '瓷 · 51D2', jiangjun: '瓷 · 9E44' },
      userName: '林青', currentVesselId: 'jiangjun',
    }),
    'porcelain-reunion-progress-v1-slot3': JSON.stringify({ completed: {}, certificates: {}, userName: '', currentVesselId: null }),
  }),
};
