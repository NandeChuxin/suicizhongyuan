import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadProgress, saveProgress, markCompleted, resetProgress,
  getLocked3D, saveLocked3D,
  slotKey, activeSlot, setActiveSlot, SLOT_COUNT, listSlots, slotSummary,
  exportJSON, exportFileName, parseImport, importIntoSlot,
  backupBeforeImport, hasImportBackup, restoreImportBackup, clearImportBackup,
  toShareCode, fromShareCode, sanitizeProgress, completedCount,
} from '../src/modules/progress.js';
import { VESSELS } from '../src/data/vessels.js';

// Node 下没有真实 localStorage：注入一个内存版（与浏览器的同步 API 一致）。
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
  clear: () => store.clear(),
};

const KEY = 'porcelain-reunion-progress-v1';

test('旧存档（无 puzzle3d 字段）加载后安全回退：getLocked3D 返回空集合，旧字段原样保留', () => {
  // 构造一份"旧 2D 存档"：只有 completed/certificates/userName，没有 puzzle3d
  store.set(KEY, JSON.stringify({
    completed: { meiping: { mode: 'kintsugi', date: '2026/10/01' } },
    certificates: { meiping: '瓷 · A1' },
    userName: '修复师甲',
  }));
  const progress = loadProgress();
  // 旧字段未被改动
  assert.equal(progress.completed.meiping.mode, 'kintsugi');
  assert.equal(progress.certificates.meiping, '瓷 · A1');
  assert.equal(progress.userName, '修复师甲');
  assert.ok(!('puzzle3d' in progress), '旧存档不应凭空多出 puzzle3d 字段');
  // 缺失字段安全回退为空集合
  assert.equal(getLocked3D(progress, 'meiping', VESSELS).size, 0);
});

test('未知器物 / 无效索引 安全回退', () => {
  const progress = loadProgress();
  assert.equal(getLocked3D(progress, 'nonexistent-vessel', VESSELS).size, 0, '未知器物返回空集合');
  // 直接构造含越界索引的 puzzle3d，越界索引须被丢弃
  progress.puzzle3d = { meiping: [0, 3, 999, -1, 8] }; // meiping fragmentCount=8，999/-1/8 均越界
  const locked = getLocked3D(progress, 'meiping', VESSELS);
  assert.deepEqual([...locked].sort((a, b) => a - b), [0, 3], '越界/负数索引被丢弃，仅保留合法 0..count-1');
});

test('saveLocked3D 写入向后兼容的可选字段，不触碰旧字段；越界索引被裁剪', () => {
  const progress = loadProgress();
  const before = JSON.stringify({ c: progress.completed, u: progress.userName });
  saveLocked3D(progress, 'meiping', [0, 2, 5, 8, -3], 8);
  // 旧字段未改
  assert.equal(JSON.stringify({ c: progress.completed, u: progress.userName }), before, '旧字段不变');
  // 越界索引被裁剪（meiping count=8，5 合法、8/-3 丢弃）
  assert.deepEqual(progress.puzzle3d.meiping, [0, 2, 5]);
  // 持久化后再读，仍正确
  const reloaded = loadProgress();
  assert.deepEqual(reloaded.puzzle3d.meiping, [0, 2, 5]);
});

test('getLocked3D 对 count 缺省 / null 字段 不报错', () => {
  const progress = { completed: {}, certificates: {}, userName: '', currentVesselId: null };
  assert.equal(getLocked3D(progress, 'meiping', VESSELS).size, 0);
  progress.puzzle3d = { meiping: null };
  assert.equal(getLocked3D(progress, 'meiping', VESSELS).size, 0, 'puzzle3d[vesselId] 为 null 安全回退');
  progress.puzzle3d = { meiping: 'not-array' };
  assert.equal(getLocked3D(progress, 'meiping', VESSELS).size, 0, '非数组安全回退');
});

test('整件完成（markCompleted）与 3D 碎片级记录互不干扰', () => {
  const progress = loadProgress();
  markCompleted(progress, 'meiping', 'juci', '瓷 · B2');
  saveLocked3D(progress, 'meiping', [0, 1, 2], 8);
  const reloaded = loadProgress();
  assert.equal(reloaded.completed.meiping.mode, 'juci', '整件完成记录保留');
  assert.equal(reloaded.certificates.meiping, '瓷 · B2');
  assert.deepEqual(reloaded.puzzle3d.meiping, [0, 1, 2], '3D 碎片级记录并存');
  // resetProgress 清除全部（含 puzzle3d）
  resetProgress();
  const after = loadProgress();
  assert.ok(!('completed' in after) || Object.keys(after.completed).length === 0);
  assert.ok(!after.puzzle3d, 'resetProgress 后无 puzzle3d 残留');
});

// ===== 多槽位 / 导出导入 / 分享码（本轮新增）=====

test('多槽位：旧 key 无缝并入槽 1，三槽互不干扰、切换即时重载', () => {
  store.clear();
  // 旧存档（只有旧 key）默认落在槽 1
  localStorage.setItem(KEY, JSON.stringify({ completed: { meiping: { mode: 'juci', date: '2026/10/01' } }, certificates: {}, userName: '旧档案' }));
  assert.equal(slotKey(1), KEY, '槽 1 沿用旧 key');
  assert.equal(slotKey(2), `${KEY}-slot2`);
  assert.equal(slotKey(3), `${KEY}-slot3`);
  setActiveSlot(1);
  assert.equal(completedCount(loadProgress()), 1, '旧存档读入槽 1');
  assert.equal(slotSummary(1).userName, '旧档案');
  assert.equal(slotSummary(1).empty, false);
  assert.equal(slotSummary(2).empty, true);
  // 槽 2 独立写入
  setActiveSlot(2);
  saveProgress({ completed: { yuhuchun: { mode: 'kintsugi', date: '2026/10/05' } }, certificates: {}, userName: '乙' });
  assert.equal(Object.keys(loadProgress().completed).join(), 'yuhuchun');
  // 槽 3 独立写入（空进度）
  setActiveSlot(3);
  assert.equal(completedCount(loadProgress()), 0, '槽 3 初始为空，不串槽');
  saveProgress({ completed: {}, certificates: {}, userName: '丙' });
  // 切回槽 1：内容仍是旧存档，未被槽 2/3 影响
  setActiveSlot(1);
  assert.equal(Object.keys(loadProgress().completed).join(), 'meiping');
  assert.equal(loadProgress().userName, '旧档案');
  // 三槽各自 key 内容互不覆盖
  assert.equal(localStorage.getItem(slotKey(1)).includes('meiping'), true);
  assert.equal(localStorage.getItem(slotKey(2)).includes('yuhuchun'), true);
  assert.equal(localStorage.getItem(slotKey(3)).includes('丙'), true);
  const list = listSlots();
  assert.equal(list.length, SLOT_COUNT);
  assert.deepEqual(list.map(s => s.slot), [1, 2, 3]);
  assert.equal(list[0].active, true, '当前槽位标记正确');
});

test('导出 → 清空 → 导入：白名单字段往返一致', () => {
  store.clear();
  setActiveSlot(1);
  const source = {
    completed: { meiping: { mode: 'juci', date: '2026/10/01' }, yuhuchun: { mode: 'kintsugi', date: '2026/10/02' } },
    certificates: { meiping: '瓷 · A1', yuhuchun: '瓷 · B2' },
    userName: '修复师甲',
    currentVesselId: 'yuhuchun',
    puzzle3d: { meiping: [0, 2, 5], yuhuchun: [1, 3] },
    exhibitNotes: { meiping: '留住这段春天' },
  };
  saveProgress(source, 1);
  const text = exportJSON(loadProgress(1), { includeUserName: true });
  store.clear();            // 清空：模拟换设备 / 清缓存
  setActiveSlot(1);
  assert.equal(completedCount(loadProgress()), 0, '清空后进度为空');
  const parsed = parseImport(text);
  assert.equal(parsed.ok, true, parsed.error);
  importIntoSlot(parsed.progress, 1);
  const after = loadProgress(1);
  assert.deepEqual(after.completed, source.completed);
  assert.deepEqual(after.certificates, source.certificates);
  assert.deepEqual(after.puzzle3d, source.puzzle3d);
  assert.equal(after.userName, '修复师甲');
  assert.equal(after.currentVesselId, 'yuhuchun');
  assert.deepEqual(after.exhibitNotes, source.exhibitNotes);
});

test('非法 JSON / 版本错误 / 越界索引 / 未知器物：一律拒绝且不写入', () => {
  store.clear();
  setActiveSlot(1);
  saveProgress({ completed: { meiping: { mode: 'juci', date: '2026/10/01' } }, certificates: {}, userName: '' }, 1);
  const before = localStorage.getItem(slotKey(1));
  assert.equal(parseImport('这不是 JSON').ok, false, '非 JSON 拒绝');
  assert.equal(parseImport('{"version":2,"progress":{}}').ok, false, '版本不符拒绝');
  assert.equal(parseImport('{"version":1}').ok, false, '缺 progress 拒绝');
  assert.equal(parseImport(JSON.stringify({ version: 1, progress: { completed: { ghost: { mode: 'juci' } } } })).ok, false, '未知器物 id 拒绝');
  assert.equal(parseImport(JSON.stringify({ version: 1, progress: { completed: { meiping: {} } } })).ok, false, '缺 mode 拒绝');
  assert.equal(parseImport(JSON.stringify({ version: 1, progress: { puzzle3d: { meiping: [0, 8] } } })).ok, false, '越界索引拒绝（meiping count=8）');
  assert.equal(parseImport(JSON.stringify({ version: 1, progress: { puzzle3d: { meiping: [-1] } } })).ok, false, '负索引拒绝');
  assert.equal(parseImport(JSON.stringify({ version: 1, progress: { puzzle3d: { meiping: [1.5] } } })).ok, false, '非整数索引拒绝');
  assert.equal(parseImport(JSON.stringify({ version: 1, progress: { exhibitNotes: { meiping: 5 } } })).ok, false, 'exhibitNotes 类型错误拒绝');
  // 全部拒绝路径都不写入：现有数据无损
  assert.equal(localStorage.getItem(slotKey(1)), before, '拒绝导入后现有存档未被改动');
});

test('导入前备份：可精确恢复到导入前的存档（含原本为空槽的情况）', () => {
  store.clear();
  setActiveSlot(1);
  saveProgress({ completed: { meiping: { mode: 'juci', date: '2026/10/01' } }, certificates: { meiping: '瓷 · A1' }, userName: '甲' }, 1);
  assert.equal(backupBeforeImport(1), true);
  assert.equal(hasImportBackup(), true);
  importIntoSlot({ completed: { yuhuchun: { mode: 'preserve', date: '2026/10/03' } }, certificates: {}, userName: '乙' }, 1);
  assert.equal(Object.keys(loadProgress(1).completed).join(), 'yuhuchun', '导入已覆盖当前槽');
  const r = restoreImportBackup();
  assert.equal(r.ok, true);
  assert.equal(r.slot, 1);
  const restored = loadProgress(1);
  assert.equal(restored.completed.meiping.mode, 'juci', '恢复后回到导入前进度');
  assert.equal(restored.userName, '甲');
  // 原本为空槽：备份 raw=null → 恢复即移除该 key
  store.clear();
  setActiveSlot(1);
  assert.equal(backupBeforeImport(1), true);
  importIntoSlot({ completed: {}, certificates: {}, userName: '' }, 1);
  assert.notEqual(localStorage.getItem(slotKey(1)), null, '导入后槽内已写入');
  assert.equal(restoreImportBackup().ok, true);
  assert.equal(localStorage.getItem(slotKey(1)), null, '空槽备份恢复后 key 被移除');
  clearImportBackup();
  assert.equal(hasImportBackup(), false);
  assert.equal(restoreImportBackup().ok, false, '无备份时安全拒绝');
});

test('分享码：纯文本往返一致、仅含 ASCII；损坏码安全拒绝', () => {
  store.clear();
  setActiveSlot(1);
  const src = { completed: { meiping: { mode: 'juci', date: '2026/10/01' } }, certificates: { meiping: '瓷 · A1' }, userName: '修复师甲', currentVesselId: 'meiping', puzzle3d: { meiping: [0, 3] } };
  saveProgress(src, 1);
  const code = toShareCode(loadProgress(1));
  assert.ok(code.length > 10, '分享码非空');
  assert.equal(/^[\x00-\x7F]+$/.test(code), true, '分享码必须为纯 ASCII（无第三方二维码库也能复制传输）');
  const back = fromShareCode(code);
  assert.equal(back.ok, true, back.error);
  store.clear();
  setActiveSlot(1);
  importIntoSlot(back.progress, 1);
  const after = loadProgress(1);
  assert.deepEqual(after.completed, src.completed);
  assert.deepEqual(after.puzzle3d, src.puzzle3d);
  assert.equal(after.userName, '修复师甲');
  assert.equal(fromShareCode('!!!not-base64!!!').ok, false, '损坏分享码拒绝');
  assert.equal(fromShareCode('').ok, false, '空分享码拒绝');
});

test('导出隐私：剔除 open_id / 邮箱 / 设备标识等个人数据，昵称可选剔除', () => {
  store.clear();
  setActiveSlot(1);
  saveProgress({
    completed: { meiping: { mode: 'juci', date: '2026/10/01' } }, certificates: {}, userName: '修复师甲',
    open_id: 'ou_xxx', email: 'a@b.com', deviceId: 'dev-123', puzzle3d: { meiping: [0, 1] },
  }, 1);
  const withName = JSON.parse(exportJSON(loadProgress(1)));
  assert.equal(withName.version, 1);
  assert.equal(typeof withName.savedAt, 'string');
  assert.equal(withName.progress.userName, '修复师甲');
  assert.ok(!('open_id' in withName.progress), 'open_id 被剔除');
  assert.ok(!('email' in withName.progress), '邮箱被剔除');
  assert.ok(!('deviceId' in withName.progress), '设备标识被剔除');
  const noName = JSON.parse(exportJSON(loadProgress(1), { includeUserName: false }));
  assert.ok(!('userName' in noName.progress), '勾选剔除后不含昵称');
  // 白名单外字段（含深层个人数据）一律不进导出；个人数据键名亦被递归剔除
  const nested = sanitizeProgress({ completed: {}, certificates: {}, userName: 'x', open_id: 'ou_1', profile: { union_id: 'u1', nested: { token: 't' }, keep: 1 } });
  assert.ok(!('profile' in nested), '白名单外字段不进入导出');
  assert.ok(!('open_id' in nested), 'open_id 不进入导出');
  assert.equal(nested.userName, 'x');
});

test('导出文件名：碎瓷重圆存档-YYYYMMDD.json（按东八区日期）', () => {
  const name = exportFileName(new Date('2026-10-17T12:00:00Z'));
  assert.match(name, /^碎瓷重圆存档-\d{8}\.json$/);
  assert.equal(name, '碎瓷重圆存档-20261017.json');
});

test('旧存档读取兼容不回退：默认槽位读取旧 key，旧字段与既有访问器均不受影响', () => {
  store.clear();
  localStorage.setItem(KEY, JSON.stringify({ completed: { meiping: { mode: 'kintsugi', date: '2026/10/01' } }, certificates: { meiping: '瓷 · A1' }, userName: '修复师甲' }));
  assert.equal(activeSlot(), 1, '未设置时默认槽 1');
  const progress = loadProgress();              // 不传槽位 → 旧调用点行为完全不变
  assert.equal(progress.completed.meiping.mode, 'kintsugi');
  assert.equal(progress.certificates.meiping, '瓷 · A1');
  assert.equal(progress.userName, '修复师甲');
  assert.ok(!('puzzle3d' in progress), '旧存档仍不凭空多出 puzzle3d');
  assert.equal(getLocked3D(progress, 'meiping', VESSELS).size, 0, '旧存档 3D 访问器安全回退');
});
