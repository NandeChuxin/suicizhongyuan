export const SNAP_DISTANCE = 0.16;
export const SNAP_ANGLE = Math.PI / 15;
export const MAGNET_DISTANCE = 0.72;

export function normalizeAngle(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

export function canSnap(fragment) {
  if (fragment.locked) return false;
  const { position, rotation } = fragment.mesh;
  const distance = Math.hypot(position.x - fragment.correctPosition.x, position.y - fragment.correctPosition.y);
  return distance < SNAP_DISTANCE && Math.abs(normalizeAngle(rotation.z - fragment.correctRotation)) < SNAP_ANGLE;
}

export function createGameState(fragments = []) {
  return { phase: 'welcome', repairMode: null, repairedCount: 0, totalCount: fragments.length,
    fragments, userName: '无名修复师', certificateId: null, certificateDate: null, unlockedStories: [], soundOn:false };
}

export function lockFragment(state, fragment) {
  if (!state.fragments.includes(fragment) || fragment.locked) return false;
  fragment.locked = true;
  fragment.revealed = true;
  state.repairedCount += 1;
  if (!state.unlockedStories.includes(fragment.storyId)) state.unlockedStories.push(fragment.storyId);
  return true;
}

export function setRepairMode(state, mode) {
  if (state.repairedCount !== state.totalCount || state.totalCount === 0) throw new Error('请先完成拼合');
  if (!['traditional', 'kintsugi', 'preserve'].includes(mode)) throw new Error('未知修复方式');
  if (state.repairMode !== mode) {
    state.certificateId = null;
    state.certificateDate = null;
  }
  state.repairMode = mode;
}

export function setUserName(state, name) {
  state.userName = Array.from(String(name).normalize('NFC').trim()).slice(0, 20).join('') || '无名修复师';
}

export function issueCertificate(state, date = new Date(), makeId = () => crypto.randomUUID()) {
  if (state.repairedCount !== state.totalCount || !state.repairMode) throw new Error('修复尚未完成');
  if (!state.certificateId) {
    const suffix=makeId().replace(/[^a-f0-9]/gi,'').slice(0,4).toUpperCase().padEnd(4,'0');
    state.certificateId = `窑 · 乙巳 · ${suffix}`;
    state.certificateDate = new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit'}).format(date);
  }
  return { id: state.certificateId, date: state.certificateDate, userName: state.userName, repairMode: state.repairMode };
}

export function resetGameState(state) {
  for (const fragment of state.fragments) { fragment.locked = false; fragment.revealed = false; }
  state.phase = 'playing';
  state.repairMode = null;
  state.repairedCount = 0;
  state.unlockedStories.length = 0;
  state.certificateId = null;
  state.certificateDate = null;
}
