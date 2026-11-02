// 有语音服务时的参数验证：utterance.rate/pitch 是否按「档案 × 语速档 × 音色」计算，
// 切换语速时是否从当前句重合成（不重复已读句、不误判播完）。
globalThis.window = globalThis;
const spoken = [];
let finishedPremature = 0;
class FakeUtter {
  constructor(text) { this.text = text; this.onend = null; this.onerror = null; this.onboundary = null; this.rate = 1; this.pitch = 1; this.volume = 1; this.lang = ''; this.voice = null; }
}
globalThis.SpeechSynthesisUtterance = FakeUtter;
globalThis.speechSynthesis = {
  getVoices: () => [{ name: 'Xiaoxiao', lang: 'zh-CN' }],
  speak(u) { spoken.push({ text: u.text, rate: u.rate, pitch: u.pitch }); },
  cancel() { /* 模拟浏览器：cancel 会触发被取消句的 onend —— 修复必须避免误判 */ }
};
const { createGuideVoice, TONE_PRESETS } = await import('../src/modules/guide-voice.js');

const subs = [];
const v = createGuideVoice({ onSubtitle: s => subs.push(s) });
v.setRate(1); v.setTone('steady'); v.setVoiceEnabled(true);
v.speak('第一句看器型。第二句看釉色。第三句看落款。', { profile: 'character' });
const p = v.profiles[v.profile];
const tone = TONE_PRESETS.steady;
console.log('① 首句 utterance:', JSON.stringify({ rate: +spoken[0].rate.toFixed(4), expectRate: +(p.rate).toFixed(4), pitch: +spoken[0].pitch.toFixed(4), expectPitch: +(p.pitch * tone.pitch).toFixed(4), text: spoken[0].text.slice(0, 6) + '…' }));

// 切到 1.2× + 清亮：应从当前句重念（文本为剩余段），并按新系数计算 rate/pitch
const idxBefore = subs[subs.length - 1].index;
v.setRate(1.2); v.setTone('bright');
const last = spoken[spoken.length - 1];
const bright = TONE_PRESETS.bright;
console.log('② 切换后 utterance:', JSON.stringify({
  rate: +last.rate.toFixed(4), expectRate: +(p.rate * 1.2 * bright.rate).toFixed(4),
  pitch: +last.pitch.toFixed(4), expectPitch: +(p.pitch * bright.pitch).toFixed(4),
  textStartsWithCurrentSeg: last.text.startsWith(subs.find(s => s.index === idxBefore)?.current || '') || '（末段）',
  speaking: v.speaking, cps: +v.cps().toFixed(3)
}));
// cancel 之后旧句的 onend 若被触发，不得结束播放
console.log('③ 仍在朗读（未被 cancel 误判播完）:', v.speaking);
// 关语音 → 字幕继续；开语音 → 从当前句接着说
v.setVoiceEnabled(false);
console.log('④ 关语音后 muted=', v.muted, 'speaking=', v.speaking);
const n = spoken.length;
v.setVoiceEnabled(true);
console.log('⑤ 开语音后重新发声:', spoken.length === n + 1, '文本长度=', spoken[spoken.length - 1].text.length);
v.stop();
console.log('⑥ stop 后 speaking=', v.speaking);
