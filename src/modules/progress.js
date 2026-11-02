// 修复档案进度：localStorage 持久化（档案柜解锁、完成印章、证书编号）。
// —— 多槽位 / 导出导入 / 分享码 ——
// 槽位 1 沿用旧 key porcelain-reunion-progress-v1（旧存档无缝并入，读旧写新兼容）；
// 槽位 2/3 使用独立 key（…-slot2 / …-slot3）。所有写操作默认落到"当前槽位"。
import { VESSELS } from '../data/vessels.js';

const KEY = 'porcelain-reunion-progress-v1';
const ACTIVE_SLOT_KEY = 'porcelain-reunion-progress-v1-active-slot';
const BACKUP_KEY = 'porcelain-reunion-progress-v1-import-backup';
export const SLOT_COUNT = 3;
export const EXPORT_VERSION = 1;

const EMPTY = { completed: {}, certificates: {}, userName: '', currentVesselId: null };

// 导出/导入只认这些字段（单一白名单，保证往返一致，且天然不含个人数据字段）。
const IMPORT_FIELDS = ['completed', 'certificates', 'userName', 'currentVesselId', 'puzzle3d', 'exhibitNotes'];

const VESSEL_BY_ID = new Map(VESSELS.map(v => [v.id, v]));
const personalKeyRe = /open[-_]?id|union[-_]?id|e[-_]?mail|mail|device|fingerprint|guid|token|电话|phone/i;

// —— 槽位基础设施 ——
function normSlot(slot) {
  const n = Math.trunc(Number(slot));
  return n >= 1 && n <= SLOT_COUNT ? n : 1;
}
export function slotKey(slot = 1) {
  const n = normSlot(slot);
  return n === 1 ? KEY : `${KEY}-slot${n}`;
}
function emptyProgress() {
  return { ...EMPTY, completed: {}, certificates: {} };
}
function readRaw(slot) {
  try { return localStorage.getItem(slotKey(slot)); } catch { return null; }
}
function writeRaw(slot, raw) {
  try { localStorage.setItem(slotKey(slot), raw); } catch { /* 隐私模式下静默降级 */ }
}
function parseRecord(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function activeSlot() {
  try {
    const n = Number(localStorage.getItem(ACTIVE_SLOT_KEY));
    return n >= 1 && n <= SLOT_COUNT ? n : 1;
  } catch { return 1; }
}
export function setActiveSlot(slot) {
  const n = normSlot(slot);
  try { localStorage.setItem(ACTIVE_SLOT_KEY, String(n)); } catch { /* ignore */ }
  return n;
}

// —— 读取 / 写入 ——
export function loadProgress(slot = activeSlot()) {
  try {
    const data = parseRecord(readRaw(slot));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return emptyProgress();
    return { ...EMPTY, ...data, completed: data.completed ?? {}, certificates: data.certificates ?? {} };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(progress, slot = activeSlot()) {
  writeRaw(slot, JSON.stringify(progress));
  return progress;
}

export function resetProgress(slot = activeSlot()) {
  try { localStorage.removeItem(slotKey(slot)); } catch { /* ignore */ }
  return emptyProgress();
}

// 槽位摘要：完成数 / 修复师昵称 / 最近日期 / 是否空槽（卡片展示与互不干扰校验用）。
export function slotSummary(slot) {
  const n = normSlot(slot);
  const raw = readRaw(n);
  if (raw == null) return { slot: n, active: activeSlot() === n, empty: true, completed: 0, total: VESSELS.length, userName: '', lastDate: '' };
  const data = parseRecord(raw) || {};
  const completed = completedCount(data);
  let lastDate = '';
  for (const entry of Object.values(data.completed || {})) {
    if (entry && typeof entry.date === 'string' && entry.date > lastDate) lastDate = entry.date;
  }
  const empty = completed === 0
    && Object.keys(data.certificates || {}).length === 0
    && !Object.keys(data.puzzle3d || {}).length
    && !String(data.userName || '').trim()
    && !data.currentVesselId;
  return { slot: n, active: activeSlot() === n, empty, completed, total: VESSELS.length, userName: String(data.userName || '').trim(), lastDate };
}
export function listSlots() {
  return Array.from({ length: SLOT_COUNT }, (_, i) => slotSummary(i + 1));
}
export function slotHasProgress(slot) {
  return readRaw(slot) != null;
}

// —— 既有 API（保持契约不变）——
export function isVesselUnlocked(progress, vessel, vesselList) {
  if (vessel.index === 0) return true;
  const previous = vesselList[vessel.index - 1];
  return Boolean(progress.completed[previous.id]);
}

export function completedCount(progress) {
  return Object.keys(progress.completed || {}).length;
}

export function markCompleted(progress, vesselId, mode, certificateId = null, slot = activeSlot()) {
  progress.completed[vesselId] = { mode, date: new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) };
  if (certificateId) progress.certificates[vesselId] = certificateId;
  return saveProgress(progress, slot);
}

// —— 3D 工作台兼容层（可选字段 progress.puzzle3d，向后兼容旧存档）——
// 旧存档没有 puzzle3d 字段时一律安全返回空集合，不报错、不改动旧字段。
// 存「已归位碎片索引集合」：progress.puzzle3d?.[vesselId] = [0, 3, 7]（稳定碎片索引）。
// vesselList 用于校验索引合法性（越界索引丢弃）；vesselId 未知时返回空集合。
export function getLocked3D(progress, vesselId, vesselList = []) {
  const vessel = vesselList.find(v => v.id === vesselId);
  if (!vessel) return new Set();
  const raw = progress.puzzle3d?.[vesselId];
  if (!Array.isArray(raw)) return new Set();
  const count = vessel.fragmentCount;
  const out = new Set();
  for (const i of raw) {
    if (Number.isInteger(i) && i >= 0 && i < count) out.add(i);
  }
  return out;
}

// 把 3D 已归位索引集合写回存档（可选字段，不触碰旧字段）；count 用于裁剪越界索引。
export function saveLocked3D(progress, vesselId, indices, count = Number.MAX_SAFE_INTEGER, slot = activeSlot()) {
  progress.puzzle3d ??= {};
  progress.puzzle3d[vesselId] = Array.from(indices).filter(i => Number.isInteger(i) && i >= 0 && i < count);
  return saveProgress(progress, slot);
}

// —— 导出：剔除个人数据（open_id / 邮箱 / 设备标识等），昵称可选剔除 ——
// 只导出白名单字段，保证「导出 → 清空 → 导入」往返一致。
function pickKnown(progress) {
  const out = {};
  for (const field of IMPORT_FIELDS) {
    if (progress && progress[field] !== undefined) out[field] = progress[field];
  }
  return out;
}

export function sanitizeProgress(progress, { includeUserName = true } = {}) {
  const walk = value => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (personalKeyRe.test(key)) continue;
      out[key] = walk(val);
    }
    return out;
  };
  const clean = walk(pickKnown(progress));
  if (!includeUserName) delete clean.userName;
  return clean;
}

export function buildExport(progress, { includeUserName = true, now = new Date() } = {}) {
  return {
    version: EXPORT_VERSION,
    savedAt: now.toISOString(),
    progress: sanitizeProgress(progress, { includeUserName })
  };
}

export function exportJSON(progress, options = {}) {
  return JSON.stringify(buildExport(progress, options), null, 2);
}

// 文件名「碎瓷重圆存档-YYYYMMDD.json」（按东八区日期）。
export function exportFileName(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replace(/-/g, '');
  return `碎瓷重圆存档-${day}.json`;
}

// —— 导入：严格校验 version / 字段类型 / vesselId 归属 / 索引越界 ——
// 返回 { ok:true, progress } 或 { ok:false, error }；任何非法输入都不写入存档。
function fail(error) { return { ok: false, error }; }

function validateProgress(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('存档内容格式不正确。');
  const out = {};

  const completed = raw.completed ?? {};
  if (typeof completed !== 'object' || Array.isArray(completed)) return fail('completed 字段类型不正确。');
  out.completed = {};
  for (const [id, entry] of Object.entries(completed)) {
    if (!VESSEL_BY_ID.has(id)) return fail(`completed 含未知器物「${id}」。`);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return fail(`completed.${id} 类型不正确。`);
    if (typeof entry.mode !== 'string' || !entry.mode) return fail(`completed.${id}.mode 缺失。`);
    if (entry.date !== undefined && typeof entry.date !== 'string') return fail(`completed.${id}.date 类型不正确。`);
    out.completed[id] = entry.date === undefined ? { mode: entry.mode } : { mode: entry.mode, date: entry.date };
  }

  const certificates = raw.certificates ?? {};
  if (typeof certificates !== 'object' || Array.isArray(certificates)) return fail('certificates 字段类型不正确。');
  out.certificates = {};
  for (const [id, value] of Object.entries(certificates)) {
    if (!VESSEL_BY_ID.has(id)) return fail(`certificates 含未知器物「${id}」。`);
    if (value === null) continue;
    if (typeof value !== 'string') return fail(`certificates.${id} 类型不正确。`);
    out.certificates[id] = value;
  }

  if (raw.puzzle3d !== undefined) {
    if (!raw.puzzle3d || typeof raw.puzzle3d !== 'object' || Array.isArray(raw.puzzle3d)) return fail('puzzle3d 字段类型不正确。');
    out.puzzle3d = {};
    for (const [id, indices] of Object.entries(raw.puzzle3d)) {
      const vessel = VESSEL_BY_ID.get(id);
      if (!vessel) return fail(`puzzle3d 含未知器物「${id}」。`);
      if (!Array.isArray(indices)) return fail(`puzzle3d.${id} 类型不正确。`);
      for (const i of indices) {
        if (!Number.isInteger(i) || i < 0 || i >= vessel.fragmentCount) return fail(`puzzle3d.${id} 含越界碎片索引「${i}」（应为 0~${vessel.fragmentCount - 1}）。`);
      }
      out.puzzle3d[id] = indices.slice();
    }
    if (!Object.keys(out.puzzle3d).length) delete out.puzzle3d;
  }

  if (raw.exhibitNotes !== undefined) {
    if (!raw.exhibitNotes || typeof raw.exhibitNotes !== 'object' || Array.isArray(raw.exhibitNotes)) return fail('exhibitNotes 字段类型不正确。');
    out.exhibitNotes = {};
    for (const [id, note] of Object.entries(raw.exhibitNotes)) {
      if (!VESSEL_BY_ID.has(id)) return fail(`exhibitNotes 含未知器物「${id}」。`);
      if (typeof note !== 'string') return fail(`exhibitNotes.${id} 类型不正确。`);
      out.exhibitNotes[id] = note;
    }
    if (!Object.keys(out.exhibitNotes).length) delete out.exhibitNotes;
  }

  if (raw.userName !== undefined) {
    if (typeof raw.userName !== 'string') return fail('userName 类型不正确。');
    if (raw.userName.length > 40) return fail('userName 过长。');
    out.userName = raw.userName;
  }

  if (raw.currentVesselId !== undefined && raw.currentVesselId !== null) {
    if (!VESSEL_BY_ID.has(raw.currentVesselId)) return fail('currentVesselId 指向未知器物。');
    out.currentVesselId = raw.currentVesselId;
  } else {
    out.currentVesselId = null;
  }

  return { ok: true, progress: { ...EMPTY, completed: {}, certificates: {}, ...out } };
}

export function parseImport(text) {
  if (typeof text !== 'string' || !text.trim()) return fail('没有可导入的内容。');
  let payload;
  try { payload = JSON.parse(text); } catch { return fail('不是合法的 JSON 文件。'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail('JSON 顶层应为对象。');
  if (payload.version !== EXPORT_VERSION) return fail(`不支持的存档版本（需要 version ${EXPORT_VERSION}）。`);
  if (!('progress' in payload)) return fail('缺少 progress 字段。');
  const result = validateProgress(payload.progress);
  if (!result.ok) return result;
  return { ok: true, progress: result.progress, meta: { version: payload.version, savedAt: payload.savedAt ?? null } };
}

// 把导入结果写入指定槽位（覆盖）。调用方负责先备份。
export function importIntoSlot(progress, slot = activeSlot()) {
  writeRaw(slot, JSON.stringify(progress));
  return progress;
}

// —— 导入前自动备份 / 恢复 ——
export function backupBeforeImport(slot = activeSlot()) {
  const n = normSlot(slot);
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ slot: n, savedAt: new Date().toISOString(), raw: readRaw(n) }));
    return true;
  } catch { return false; }
}
export function hasImportBackup() {
  try { return localStorage.getItem(BACKUP_KEY) != null; } catch { return false; }
}
export function restoreImportBackup() {
  let payload;
  try { payload = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null'); } catch { payload = null; }
  if (!payload || typeof payload !== 'object') return { ok: false, error: '没有可恢复的导入前存档。' };
  const slot = normSlot(payload.slot);
  try {
    if (payload.raw == null) localStorage.removeItem(slotKey(slot));
    else localStorage.setItem(slotKey(slot), String(payload.raw));
  } catch { return { ok: false, error: '恢复失败，本地存储不可用。' }; }
  return { ok: true, slot };
}
export function clearImportBackup() {
  try { localStorage.removeItem(BACKUP_KEY); } catch { /* ignore */ }
}

// —— 分享码：纯文本（base64），不依赖任何第三方二维码库 ——
// 分享码就是导出 JSON 的 encodeURIComponent + btoa，导入走同一套校验流程。
export function toShareCode(progress, options = {}) {
  const json = exportJSON(progress, options);
  try { return btoa(encodeURIComponent(json)); } catch { return ''; }
}
export function decodeShareCode(code) {
  if (typeof code !== 'string' || !code.trim()) return null;
  try { return decodeURIComponent(atob(code.trim().replace(/\s+/g, ''))); } catch { return null; }
}
export function fromShareCode(code) {
  const text = decodeShareCode(code);
  if (text == null) return fail('分享码无法解析（可能已损坏或缺少字符）。');
  return parseImport(text);
}
