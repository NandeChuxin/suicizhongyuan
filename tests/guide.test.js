// 《碎瓷重圆》讲解体验自动测试：知识条目结构 / 内容标签 / 器物上下文 /
// 未知问题不伪造 / 语音回退字幕 / 不改动主线存档 / 角色关闭即停声 / 减少动态不跑粒子。
// 说明：本文件在 Node 中运行，不引入 jsdom；对需要 DOM 的两个契约
// （古人角色、自动导览的计时）使用最小桩对象，保证测试仍是「真实模块」的行为验证。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gsap } from 'gsap';
import { KNOWLEDGE, GUIDE_SOURCES, GUIDE_QILING, GUIDE_DISCLAIMER, VOICE_LABEL, UNKNOWN_ANSWER, hotspotByVessel } from '../src/data/guide.js';
import { LAYER_LABELS } from '../src/data/culture.js';
import { answerQuestion, searchKnowledge, recommendedQuestions, ANSWER_LAYERS, KNOWLEDGE_MIN_SCORE, categoryGuidance, ALL_KNOWLEDGE } from '../src/modules/knowledge-base.js';
import { CERAMICS, CERAMIC_CATEGORIES } from '../src/data/ceramics.js';
import { createGuideAgent, minimalContext, checkAnswer } from '../src/modules/guide-agent.js';
import { createGuideVoice, splitSegments } from '../src/modules/guide-voice.js';
import { answerCardHTML, createGuidePanel } from '../src/modules/guide-panel.js';
import { createGuideCharacter } from '../src/modules/guide-character.js';
import { createMuseumTour, TOUR_MIN_SECONDS, TOUR_MAX_SECONDS } from '../src/modules/museum-tour.js';
import { createGuideVoice as createVoice2, TONE_PRESETS, SPEAK_RATE_STEPS, nearestSpeakRate } from '../src/modules/guide-voice.js';
import { wrapCJK, createGuideSubtitle } from '../src/modules/guide-subtitle.js';
import {
  GUIDE_SETTINGS_KEY, DEFAULT_GUIDE_SETTINGS, SPEAK_RATES, SUBTITLE_SIZES,
  normalizeGuideSettings, nearestRate, nearestSubtitleSize, loadGuideSettings, saveGuideSettings
} from '../src/modules/guide-settings.js';

const SCOPES = ['vessel', 'craft', 'history', 'repair', 'life', 'fieldwork', 'project'];
const VESSEL_IDS = ['meiping', 'yuhuchun', 'jiangjun', 'gaozu', 'suantou', 'linglong'];
const textOf = a => String(a?.text ?? '');
const answerOf = e => String(e?.answer ?? '');

// —— 最小 DOM 桩：仅供古人角色的出现/绘制契约使用，不含真实排版能力 ——
function installDom() {
  const counts = { fill: 0, clear: 0 };
  const ctx = {
    fillStyle: '',
    beginPath() {}, arc() {},
    fill() { counts.fill++; },
    clearRect() { counts.clear++; }
  };
  const noop = () => {};
  const node = () => ({
    className: '', id: '', hidden: false, innerHTML: '', textContent: '', opacity: 1, y: 0, x: 0, rotate: 0, filter: '',
    dataset: {}, style: { setProperty: noop }, children: [], _attrs: {}, _q: new Map(),
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute(k, v) { this._attrs[k] = String(v); }, getAttribute(k) { return this._attrs[k]; },
    append(...cs) { cs.forEach(c => this.children.push(c)); }, prepend(...cs) { this.children.unshift(...cs); },
    remove() {}, focus: noop, blur: noop, closest: () => null,
    addEventListener: noop, removeEventListener: noop,
    getContext: () => ctx,
    querySelector(sel) { if (!this._q.has(sel)) this._q.set(sel, node()); return this._q.get(sel); },
    querySelectorAll: () => []
  });
  const doc = { createElement: () => node(), createElementNS: () => node(), documentElement: node(), head: node(), body: node(), hidden: false, addEventListener: noop, removeEventListener: noop, querySelectorAll: () => [], getElementsByTagName: () => [] };
  globalThis.document = doc;
  const queue = [];
  globalThis.requestAnimationFrame = fn => { queue.push(fn); return queue.length; };
  globalThis.cancelAnimationFrame = noop;
  return {
    counts, doc, queue,
    drain(n = 1) { for (let i = 0; i < n; i++) { queue.splice(0, queue.length).forEach(fn => fn(16 * (i + 1))); } }
  };
}
const dom = installDom();

// gsap 计时器收尾，避免测试进程被动画 ticker 挂住。
after(() => { try { gsap.globalTimeline.clear(); gsap.ticker.sleep(); } catch { /* ignore */ } });

test('知识条目结构完整：编号唯一、范围合法、标签合法、来源可解析', () => {
  assert.ok(KNOWLEDGE.length >= 24, `知识条目过少：${KNOWLEDGE.length}`);
  const ids = new Set();
  for (const e of KNOWLEDGE) {
    assert.ok(e.id && !ids.has(e.id), `条目 id 重复或缺失：${e.id}`); ids.add(e.id);
    assert.ok(SCOPES.includes(e.scope), `${e.id} scope 非法：${e.scope}`);
    assert.ok(e.question && /[？?]/.test(e.question), `${e.id} 缺少问句`);
    assert.ok(answerOf(e).length >= 40, `${e.id} 回答过短`);
    assert.ok(ANSWER_LAYERS.includes(e.layer), `${e.id} 主标签非法：${e.layer}`);
    for (const k of e.layers || []) assert.ok(ANSWER_LAYERS.includes(k), `${e.id} 附加标签非法：${k}`);
    assert.ok(Array.isArray(e.keywords) && e.keywords.length >= 3, `${e.id} 检索关键词不足`);
    for (const s of e.sources || []) assert.ok(GUIDE_SOURCES[s]?.url, `${e.id} 来源无法解析：${s}`);
    // 标为待核实的条目，正文必须带明确的不确定性标注，不得以肯定语气补全。
    if (e.pending) assert.ok(/待人工核实|待核实/.test(answerOf(e)), `${e.id} 标记 pending 但正文未注明`);
  }
  for (const v of VESSEL_IDS) {
    assert.ok(KNOWLEDGE.some(e => e.vessel === v), `${v} 缺少专属知识条目`);
    assert.ok(hotspotByVessel(v).length >= 3, `${v} 缺少热点`);
  }
});

test('器灵角色与免责声明符合原创数字角色的边界', () => {
  assert.ok(GUIDE_QILING.name.includes('阿圆'));
  assert.ok(GUIDE_QILING.disclaimer.includes('不是真实历史人物复原'));
  assert.ok(GUIDE_QILING.forbidden.length >= 3);
  assert.ok(GUIDE_DISCLAIMER.includes('不替代专业鉴定'));
  assert.ok(VOICE_LABEL.includes('AI 合成'));
  for (const e of KNOWLEDGE) assert.ok(!/传承人.{0,4}(口述|采访)/.test(textOf(e) + e.characterLine), `${e.id} 疑似虚构采访`);
});

test('所有回答都带内容标签，且标签属于五层体系', () => {
  for (const e of KNOWLEDGE) {
    const a = answerQuestion(e.question, { view: (e.view || [])[0], vessel: e.vessel });
    assert.equal(a.inScope, true, `${e.id} 自身问句未能命中：${e.question}`);
    assert.ok(Array.isArray(a.layers) && a.layers.length >= 1, `${e.id} 回答缺少标签`);
    for (const k of a.layers) assert.ok(ANSWER_LAYERS.includes(k), `${e.id} 出现越界标签：${k}`);
    assert.ok(ANSWER_LAYERS.includes(a.layer), `${e.id} 主标签越界`);
    assert.equal(a.layers[0], a.layer, `${e.id} 主标签未在首位`);
    const html = answerCardHTML(a, { question: e.question });
    assert.ok(html.includes('gp-chip'), `${e.id} 卡片未渲染标签`);
    for (const k of a.layers) assert.ok(html.includes(LAYER_LABELS[k]), `${e.id} 卡片缺少标签文案 ${k}`);
  }
  // 远程回答的标签检查：非法或缺失标签一律降级为「待人工核实」。
  const bad = checkAnswer({ text: '一句没有依据的断言', layer: 'made-up' }, { query: 'x' });
  assert.equal(bad.layer, 'pending'); assert.ok(bad.layers.includes('pending')); assert.equal(bad.pending, true);
  const good = checkAnswer({ text: '合规回答', layer: 'fact', layers: ['fact', 'schematic'], sources: [{ name: '故宫', url: 'https://www.dpm.org.cn/' }] });
  assert.deepEqual(good.layers, ['fact', 'schematic']);
  assert.equal(good.remote, true);
  // 危险协议不得进入来源链接。
  const evil = checkAnswer({ text: 'x', layer: 'fact', sources: [{ name: 'x', url: 'javascript:alert(1)' }, { name: 'ok', url: 'https://a.b/' }] });
  assert.equal(evil.sources.length, 1); assert.equal(evil.sources[0].url, 'https://a.b/');
});

test('器物上下文切换：同一问句随当前器物命中不同档案', () => {
  const q = '这件器物为什么采用这种器型？';
  const mp = answerQuestion(q, { view: 'exhibit', vessel: 'meiping' });
  const yhc = answerQuestion(q, { view: 'exhibit', vessel: 'yuhuchun' });
  assert.equal(mp.entryId, 'mp-form');
  assert.equal(yhc.entryId, 'yhc-form');
  assert.notEqual(mp.entryId, yhc.entryId);
  assert.equal(KNOWLEDGE.find(e => e.id === mp.entryId).vessel, 'meiping');
  assert.equal(KNOWLEDGE.find(e => e.id === yhc.entryId).vessel, 'yuhuchun');
  // 推荐问题随器物变化，且每条都能被检索命中。
  for (const v of VESSEL_IDS) {
    const recos = recommendedQuestions({ vessel: v, view: 'exhibit' });
    assert.ok(recos.length >= 3 && recos.length <= 5, `${v} 推荐问题数量异常`);
    assert.equal(recos[0], KNOWLEDGE.find(e => e.vessel === v).question, `${v} 未优先推荐本器问题`);
    for (const r of recos) assert.equal(answerQuestion(r, { vessel: v, view: 'exhibit' }).inScope, true, `推荐问题不可命中：${r}`);
  }
});

test('未知问题不会伪造史实：诚实回答「没有足够依据」', () => {
  for (const q of ['明天北京的天气怎么样？', '这件瓷器的拍卖成交价是多少？', '请介绍一下某位考古学家的生平']) {
    const a = answerQuestion(q, { view: 'exhibit', vessel: 'gaozu' });
    assert.equal(a.inScope, false, `越界问题被误答：${q}`);
    assert.equal(textOf(a), UNKNOWN_ANSWER);
    assert.equal(a.entryId, null);
    assert.equal(a.sources.length, 0);
    assert.deepEqual(a.layers, ['pending']);
    assert.ok(textOf(a).includes('没有足够依据') && textOf(a).includes('核实'));
  }
  assert.equal(answerQuestion('   ', {}).inScope, false);
  assert.ok(KNOWLEDGE_MIN_SCORE > 0, '命中阈值必须为正，保留「答不出」的区间');
  assert.equal(searchKnowledge('锔瓷与金缮有什么不同？', { view: 'choice' })[0].entry.id, 'repair-diff');
});

test('语音失败时回退到字幕：无语音服务仍逐段推送字幕', () => {
  const segs = splitSegments('客官且看这枝花叶。落笔虽轻，入窑之后却再无修改余地。');
  assert.ok(segs.length >= 2, '长句应切分为多段字幕');
  const seen = [];
  const voice = createGuideVoice({ onSubtitle: s => seen.push(s) });
  assert.equal(voice.supported, false, 'Node 环境应识别为无语音服务');
  voice.speak('客官且看这枝花叶。入窑之后便再无修改余地。');
  assert.equal(voice.speaking, true);
  assert.ok(seen.length >= 1 && (seen[0].current || '').includes('客官'), '应立刻推送首段字幕');
  assert.ok(seen.some(s => s.total >= 1), '字幕必须持续推进，而不是静默失败');
  // 静音不阻断字幕，且不会自行开声。
  voice.setMuted(true);
  assert.equal(voice.muted, true);
  voice.speak('第二段讲解文本。');
  assert.equal(voice.muted, true, '静音状态不得被 speak 重置');
  assert.ok(seen.some(s => textOf(s).includes('第二段') || (s.current || '').includes('第二段')));
  voice.stop();
  assert.equal(voice.speaking, false);
});

test('角色关闭即停止发声，且不再自行播放', async () => {
  const voice = createGuideVoice({});
  const calls = { dismiss: 0, reset: 0 };
  const character = { summon() {}, speak() {}, idle() {}, think() {}, emphasize() {}, setLine() {}, dismiss() { calls.dismiss++; } };
  const panel = { setObject() {}, setRecommendations() {}, beginAnswer() { return {}; }, endAnswer() {}, resetPlayback() { calls.reset++; }, setBusy() {}, open() {} };
  const agent = createGuideAgent({ context: () => ({ view: 'exhibit', vessel: 'gaozu', label: '高足杯' }), panel, voice, character });
  const answer = await agent.ask('釉里红为什么难以烧制？');
  assert.equal(answer.entryId, 'gz-youlihong');
  agent.narrate(answer, { profile: 'character' });
  assert.equal(voice.speaking, true, '讲解开始后应处于发声状态');
  agent.dismiss();
  assert.equal(voice.speaking, false, '关闭角色后必须立即停止发声');
  assert.equal(calls.dismiss, 1, '应调用角色的消散动作');
  await new Promise(r => setTimeout(r, 320));
  assert.equal(voice.speaking, false, '关闭后不得自行恢复播放');
  assert.equal(agent.narrating, false);
});

test('展厅问答与讲解不写入主线存档（localStorage 与 progress 常量）', async () => {
  // 运行时守卫：任何写入都应让测试失败。
  globalThis.localStorage = { getItem: () => null, setItem() { throw new Error('guide 模块写入了存档'); }, removeItem() { throw new Error('guide 模块改动了存档'); } };
  const voice = createGuideVoice({});
  const panel = { setObject() {}, setRecommendations() {}, beginAnswer() { return {}; }, endAnswer() {}, resetPlayback() {}, setBusy() {}, open() {} };
  const character = { summon() {}, speak() {}, idle() {}, think() {}, emphasize() {}, setLine() {}, dismiss() {} };
  const agent = createGuideAgent({ context: () => ({ view: 'exhibit', vessel: 'linglong', label: '玲珑碗', hotspot: 'craft' }), panel, voice, character });
  await agent.ask('玲珑瓷是怎么做出来的？');
  assert.equal(agent.lastAnswer.entryId, 'll-craft');
  assert.doesNotThrow(() => { agent.narrate(agent.lastAnswer, { profile: 'curator' }); agent.dismiss(); });
  // 最少必要上下文：绝不携带昵称 / 存档 / 完成度等个人数据。
  const ctx = minimalContext({ view: 'exhibit', vessel: 'linglong', hotspot: 'craft', mode: 'kintsugi', nickname: '青花匠', completed: 4, progress: {} });
  assert.deepEqual(Object.keys(ctx).sort(), ['hotspot', 'mode', 'vessel', 'view']);
  assert.ok(!JSON.stringify(ctx).includes('青花匠'));
  // 静态守卫：讲解相关模块不得引用存档键或 localStorage。
  for (const f of ['guide-agent.js', 'knowledge-base.js', 'guide-panel.js', 'guide-character.js', 'guide-voice.js', 'museum-tour.js']) {
    const src = await readFile(new URL(`../src/modules/${f}`, import.meta.url), 'utf8');
    assert.ok(!/localStorage|porcelain-reunion-progress-v1/.test(src), `${f} 不应触碰主线存档`);
  }
});

test('减少动态模式下不执行窑火粒子动画，常规模式仍聚合粒子', () => {
  dom.queue.length = 0;
  const soft = createGuideCharacter({ mount: dom.doc.body, reduced: true, low: false, disclaimer: GUIDE_QILING.disclaimer });
  dom.counts.fill = 0;
  soft.summon();
  dom.drain(5);
  assert.equal(dom.counts.fill, 0, '减少动态时不应绘制粒子');
  assert.equal(soft.el.dataset.state, 'appear');
  soft.dispose();

  dom.queue.length = 0;
  const full = createGuideCharacter({ mount: dom.doc.body, reduced: false, low: false, disclaimer: GUIDE_QILING.disclaimer });
  dom.counts.fill = 0;
  full.summon();
  dom.drain(5);
  assert.ok(dom.counts.fill > 0, '常规模式应绘制窑火粒子聚合');
  full.dispose();

  // 低性能模式同样走轻量分支（不绘制粒子、只淡入淡出）。
  dom.queue.length = 0;
  const lowChar = createGuideCharacter({ mount: dom.doc.body, reduced: false, low: true, disclaimer: GUIDE_QILING.disclaimer });
  dom.counts.fill = 0;
  lowChar.summon();
  dom.drain(5);
  assert.equal(dom.counts.fill, 0, '低性能模式不应绘制粒子');
  lowChar.dispose();
});

test('自动导览：单件时长限制在 30~60 秒，可暂停 / 跳过 / 退出', () => {
  const seen = [];
  const tour = createMuseumTour({ count: 6, duration: 999, reduced: true, onState: s => seen.push(s.reason) });
  assert.equal(tour.duration, TOUR_MAX_SECONDS);
  assert.equal(tour.total, 6);
  assert.equal(createMuseumTour({ count: 6, duration: 1 }).duration, TOUR_MIN_SECONDS);
  tour.start({ from: 0 });
  assert.equal(tour.active, true);
  assert.equal(tour.index, 0);
  tour.pause(); assert.equal(tour.paused, true);
  tour.resume(); assert.equal(tour.paused, false);
  tour.skip(); assert.equal(tour.index, 1);
  tour.stop();
  assert.equal(tour.active, false);
  assert.ok(seen.includes('start') && seen.includes('paused') && seen.includes('resumed') && seen.includes('advance'));
  // 静音只影响配音，不改变巡礼状态。
  tour.setMuted(true); assert.equal(tour.muted, true);
});

test('问答卡片对模型返回内容做转义，不执行任意 HTML', () => {
  const html = answerCardHTML({
    title: '<img src=x onerror=alert(1)>', text: '<script>alert(2)</script>', layer: 'fact', layers: ['fact'],
    sources: [{ name: '<b>来源</b>', url: 'javascript:alert(3)' }]
  }, { question: '<svg onload=alert(4)>' });
  assert.ok(!html.includes('<img'), '标题中的标签未被转义');
  assert.ok(!html.includes('<script'), '正文中的脚本未被转义');
  assert.ok(html.includes('&lt;img'));
  assert.ok(!/href="javascript:/.test(html), '危险协议不应生成可点击链接');
});

// 回归守卫：面板返回值曾同时定义 open() 方法与 get open() 取值器，
// 取值器覆盖方法后使 onNeedOpen 抛 TypeError，导致提问链路整体失效。
test('问答面板契约：open 必须是可调用方法，展开状态用 isOpen 读取', () => {
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  const asked = [];
  const panel = createGuidePanel({ mount: dom.doc.body, onAsk: q => asked.push(q) });
  assert.equal(typeof panel.open, 'function', 'open 必须是方法，不能被同名取值器覆盖');
  assert.equal(typeof panel.isOpen, 'boolean');
  assert.equal(panel.isOpen, false);
  assert.equal(typeof panel.toggle, 'function');
  assert.doesNotThrow(() => panel.open(), '打开面板不得抛出');
  assert.equal(panel.isOpen, true);
  panel.ask('这件器物为什么采用这种器型？');
  assert.deepEqual(asked, ['这件器物为什么采用这种器型？'], '提问必须经 onAsk 转交智能体');
});
// ===== 行业知识库扩展：ceramics.js + 合并检索 + 联想 + 分类引导 =====
test('行业知识库：规模、结构与来源可追溯（每分类≥10条，总计≥80条）', () => {
  assert.ok(CERAMICS.length >= 80, `行业条目应≥80，当前${CERAMICS.length}`);
  for (const cat of CERAMIC_CATEGORIES) {
    const n = CERAMICS.filter(e => e.cat === cat.id).length;
    assert.ok(n >= 10, `分类${cat.name}仅${n}条（需≥10）`);
  }
  const ids = new Set(ALL_KNOWLEDGE.map(e => e.id));
  assert.equal(ids.size, ALL_KNOWLEDGE.length, '条目 id 不得重复');
  for (const e of CERAMICS) {
    assert.ok(e.question && e.title && e.answer, `${e.id} 缺 question/title/answer`);
    assert.ok(e.answer.length >= 40, `${e.id} 正文过短（≥40字）`);
    assert.ok((e.keywords || []).length >= 4, `${e.id} keywords 不足（≥4）`);
    assert.ok(ANSWER_LAYERS.includes(e.layer), `${e.id} 标签非法`);
    assert.ok((e.sources || []).length >= 1 && e.sources.every(sid => GUIDE_SOURCES[sid]), `${e.id} 来源不可追溯`);
    assert.ok(CERAMIC_CATEGORIES.some(c => c.id === e.cat), `${e.id} 分类非法`);
  }
});

test('行业通识可答：「什么是粉彩」带标签与来源；「青花发展」能联想回展厅梅瓶', () => {
  const a = answerQuestion('什么是粉彩？', { view: 'exhibit' });
  assert.equal(a.inScope, true);
  assert.ok(a.entryId.startsWith('frm-fencai') || a.entryId === 'frm-fencai', '应命中粉彩条目');
  assert.ok((a.layers || []).every(l => ANSWER_LAYERS.includes(l)));
  assert.ok(a.sources.length >= 1, '粉彩回答应附来源');
  const b = answerQuestion('青花瓷是怎么发展的？', { view: 'exhibit' });
  assert.equal(b.inScope, true);
  assert.ok(Array.isArray(b.related) && b.related.length >= 1, '青花发展应给出联想条目');
  // 联想必须能连回展厅：related 中至少一条来自 guide.js（展厅/工艺层）或指向梅瓶。
  const linked = b.related.some(r => {
    const e = ALL_KNOWLEDGE.find(x => x.id === r.id);
    return e && (e.vessel === 'meiping' || !CERAMICS.some(c => c.id === e.id));
  });
  assert.ok(linked, '联想未连回展厅知识');
});

test('分类引导：命中行业范畴但无具体条目时给出入口，而不是「没有依据」', () => {
  const g = answerQuestion('给我讲讲陶瓷史吧', {});
  assert.equal(g.inScope, true);
  assert.equal(g.layer, 'schematic');
  assert.ok(g.title.includes('陶瓷史'));
  assert.ok(Array.isArray(g.related) && g.related.length >= 3, '分类引导应给出可点击的样例问题');
  // 分类引导是导航性回答，不是伪造的史实：正文不含具体结论性断言。
  assert.ok(g.text.includes('可以先问问我'));
});

test('验收场景：越界问题仍诚实回退，远程层关闭时本地库兜底正常', () => {
  for (const q of ['明天北京的天气怎么样？', '这件瓷器的拍卖成交价是多少？']) {
    const a = answerQuestion(q, { view: 'exhibit', vessel: 'gaozu' });
    assert.equal(a.inScope, false, `越界问题被误答：${q}`);
    assert.equal(a.text, UNKNOWN_ANSWER);
  }
  // 无 ENDPOINT（默认关闭）时 createGuideAgent 完全走本地库。
  const panel = { setObject() {}, setRecommendations() {}, beginAnswer() { return {}; }, endAnswer() {}, resetPlayback() {}, setBusy() {}, open() {} };
  const character = { summon() {}, speak() {}, idle() {}, think() {}, emphasize() {}, setLine() {}, dismiss() {}, present() {} };
  const agent = createGuideAgent({ context: () => ({ view: 'exhibit', vessel: 'meiping', label: '梅瓶' }), panel, voice: createGuideVoice({}), character });
  return agent.ask('什么是粉彩？').then(a => {
    assert.equal(a.inScope, true);
    assert.ok(a.sources.length >= 1);
  });
});


// ===== 语音 / 字幕体验（语速 · 音色 · 字号 · 位置 · 开关独立）=====

test('字幕断行：每行不超过 22 字，优先在标点后断行，且不丢字', () => {
  const text = '这件梅瓶的肩部绘着缠枝莲纹，笔意连绵不断；腹部留白处题着一行小字，记的是嘉靖二年的夏天。';
  const lines = wrapCJK(text, 22);
  assert.ok(lines.length >= 3, '长句应断为多行');
  for (const line of lines) assert.ok(Array.from(line).length <= 22, `行超长：${line}`);
  assert.equal(lines.join(''), text, '断行不得丢字或改字');
  // 标点优先：断点落在标点之后的行尾应占多数
  const punctEnd = lines.filter(l => /[。！？；，、,;!?]$/.test(l)).length;
  assert.ok(punctEnd >= Math.floor(lines.length / 2), '应在标点处优先断行');
  // 边界：短句不断行、空文本返回空数组
  assert.deepEqual(wrapCJK('短句。', 22), ['短句。']);
  assert.deepEqual(wrapCJK('', 22), []);
  assert.deepEqual(wrapCJK(null, 22), []);
});

test('设置仓库：默认值 / 就近取档 / 独立 key 存取（guide-settings-v1）', () => {
  assert.equal(GUIDE_SETTINGS_KEY, 'guide-settings-v1');
  assert.deepEqual(SPEAK_RATES, [0.8, 1, 1.2]);
  assert.deepEqual(SUBTITLE_SIZES, [14, 16, 18]);
  assert.deepEqual(loadGuideSettings(null), { ...DEFAULT_GUIDE_SETTINGS }, '无存储时应回退默认值');

  // 就近取档：越界/中间值都收敛到允许档位
  assert.equal(nearestRate(0.2), 0.8);
  assert.equal(nearestRate(1.13), 1.2);
  assert.equal(nearestRate('0.8'), 0.8);
  assert.equal(nearestRate(undefined), 1);
  assert.equal(nearestSubtitleSize(13), 14);
  assert.equal(nearestSubtitleSize(15), 16);
  assert.equal(nearestSubtitleSize(17.6), 18);
  assert.equal(nearestSubtitleSize('abc'), 16);

  // 归一化：未知枚举回默认，缺字段补默认，布尔被规整
  const norm = normalizeGuideSettings({ rate: 1.2, tone: 'screaming', subtitleSize: 18, subtitlePos: 'left', subtitleOn: 0 });
  assert.equal(norm.tone, 'steady');
  assert.equal(norm.subtitlePos, 'bottom');
  assert.equal(norm.subtitleOn, false);
  assert.equal(norm.subtitleSize, 18);

  // 存取往返：只写 guide-settings-v1，不碰主线存档
  const store = new Map();
  const fake = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  };
  const saved = saveGuideSettings({ rate: 0.8, tone: 'bright', subtitleSize: 14, subtitlePos: 'top', subtitleOn: false, voiceOn: false }, fake);
  assert.equal(saved.rate, 0.8);
  assert.deepEqual([...store.keys()], ['guide-settings-v1']);
  assert.ok(![...store.keys()].some(k => k.includes('progress')), '设置仓库不得写入主线存档 key');
  const back = loadGuideSettings(fake);
  assert.equal(back.tone, 'bright');
  assert.equal(back.subtitlePos, 'top');
  assert.equal(back.voiceOn, false);
  // 坏数据（非 JSON / 抛错存储）不崩
  store.set('guide-settings-v1', '{oops');
  assert.deepEqual(loadGuideSettings(fake), { ...DEFAULT_GUIDE_SETTINGS });
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadGuideSettings(broken), { ...DEFAULT_GUIDE_SETTINGS });
  assert.doesNotThrow(() => saveGuideSettings({ rate: 1 }, broken));
});

test('语速与音色：同一系数驱动语音与字幕，切换即时生效且不打断时间轴', async () => {
  const voice = createVoice2({});
  const subs = [];
  const v2 = createVoice2({ onSubtitle: s => subs.push(s) });
  // 默认：rate=1 / 沉稳
  assert.equal(voice.rate, 1);
  assert.equal(voice.tone, 'steady');
  assert.equal(nearestSpeakRate(9), 1.2);
  assert.deepEqual(SPEAK_RATE_STEPS, [0.8, 1, 1.2]);
  const baseCps = voice.cps();
  // 档位 × 音色微调共同构成速率系数（语音 utterance.rate 与字幕 cps 同源）
  voice.setRate(1.2);
  assert.equal(voice.rate, 1.2);
  assert.ok(Math.abs(voice.cps() - baseCps * 1.2) < 1e-6, '字幕推进速率应按语速档位缩放');
  voice.setTone('bright');
  assert.equal(voice.tone, 'bright');
  const profCps = voice.profiles[voice.profile].cps;
  assert.ok(Math.abs(voice.cps() - profCps * 1.2 * TONE_PRESETS.bright.rate) < 1e-6, '字幕 cps 与语音 rate 共用同一系数');
  assert.ok(voice.speedFactor() > 1);
  // 无语音服务（Node）：设定音色/语速不抛错，字幕照常推进
  assert.equal(voice.supported, false);
  assert.doesNotThrow(() => { voice.setTone('steady'); voice.setRate('0.8'); });
  v2.speak('第一句先看器型。第二句再看釉色。第三句是落款。');
  assert.equal(v2.speaking, true);
  const before = subs.length;
  v2.setRate(1.2);          // 切换语速：时间轴不重置、已读段不重复
  v2.setTone('bright');     // 切换音色
  assert.equal(v2.speaking, true, '切换语速/音色不得中断朗读');
  assert.ok(subs.length >= before, '字幕仍按同一 timeline 推送');
  assert.ok((subs[subs.length - 1].current || '').length > 0);
  // 语音开关与字幕互相独立：关语音后字幕继续按同一 timeline 推进
  const subs3 = [];
  const v3 = createVoice2({ onSubtitle: s => subs3.push(s) });
  v3.setRate(1.2);
  v3.speak('甲段。乙段。丙段。丁段。戊段。己段。庚段。辛段。');
  v3.setVoiceEnabled(false);
  assert.equal(v3.muted, true, '关语音应置为静音');
  const n3 = subs3.length;
  await new Promise(r => setTimeout(r, 900));
  assert.ok(subs3.length > n3, '关语音后字幕必须继续推进');
  const lastIdx = subs3[subs3.length - 1].index;
  assert.ok(lastIdx > 0, '字幕应逐段前进（同一 timeline）');
  assert.equal(v3.speaking, true, '关语音不影响字幕播放状态');
  v3.setVoiceEnabled(true);
  assert.equal(v3.voiceEnabled, true);
  v3.stop();
  assert.equal(v3.speaking, false);
  v2.stop();
});

test('字幕条：字号/位置即时切换、当前句高亮、关闭后不再显示', () => {
  const sub = createGuideSubtitle({ size: 16, position: 'bottom', enabled: true });
  const el = sub.el, text = el.children[0];
  assert.ok(el, '字幕条元素应已创建');
  assert.equal(el.hidden, true, '无内容时隐藏');
  sub.update({ current: '客官且看这枝花叶。落笔虽轻，入窑之后却再无修改余地。', index: 0, total: 4 });
  assert.equal(el.hidden, false, '有字幕时应显示');
  const marks = text.children;
  assert.ok(marks.length >= 2, '长句应渲染为多条底条（每行一条）');
  assert.ok(marks.every(n => n.className === 'gs-cur gs-l'), '当前句用高亮底条（mark.gs-cur）渲染');
  const lines = marks.map(n => n.textContent);
  assert.ok(lines.length >= 2 && lines.every(l => Array.from(l).length <= 22), '长句按 22 字/行断行');
  assert.equal(lines.join(''), '客官且看这枝花叶。落笔虽轻，入窑之后却再无修改余地。');
  // 字号 / 位置即时切换：只改属性，不重建元素
  assert.deepEqual(sub.setOptions({ size: 18 }).size, 18);
  assert.equal(sub.el.dataset.pos, 'bottom');
  assert.equal(sub.setOptions({ position: 'top' }).position, 'top');
  assert.equal(sub.el.dataset.pos, 'top');
  // 关字幕 → 立即隐藏，但仍可继续接收文本（再开时立刻恢复）
  sub.setOptions({ enabled: false });
  assert.equal(el.hidden, true);
  sub.setOptions({ enabled: true });
  assert.equal(el.hidden, false, '重新开启后应立即显示当前句');
  sub.clear();
  assert.equal(el.hidden, true);
  sub.dispose();
});
