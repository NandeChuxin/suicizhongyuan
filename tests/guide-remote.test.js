// 《碎瓷重圆》远程讲解适配层测试：配置开关 / SSE 解析 / 流式与 20s 空闲超时回退 /
// 五层标签强制校验 / 上下文最小化（不含个人数据）/ textContent 化 / 面板开关与模型选择 /
// 失败与断网回退本地 / 用户停止不提示故障 / 不触碰主线存档。
// 说明：本文件在 Node 中运行，不引入 jsdom；用最小 DOM 桩与可中断的 fetch 桩驱动真实模块。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  remoteEnabled, remoteContext, pushMessage, buildRequestBody, CONTEXT_KEYS,
  sseParser, streamRemote, sanitizeRemoteText, validateRemoteAnswer,
  domainCheck, REMOTE_IDLE_TIMEOUT_MS
} from '../src/modules/guide-remote.js';
import { createGuideAgent } from '../src/modules/guide-agent.js';
import { createGuideVoice } from '../src/modules/guide-voice.js';
import { createGuidePanel } from '../src/modules/guide-panel.js';
import { UNKNOWN_ANSWER } from '../src/data/guide.js';

const EP = 'https://guide-backend.example/ask';

// —— fetch 桩：可编程响应，记录全部调用 ——
const calls = [];
function installFetch(impl) {
  globalThis.fetch = (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null, init });
    return impl(String(url), init);
  };
}
// SSE 响应体：把若干文本块装进 ReadableStream（Node 原生 Web Streams）。
function sseResponse(chunks, { ok = true, status = 200 } = {}) {
  const encoder = new TextEncoder();
  return {
    ok, status,
    headers: { get: () => 'text/event-stream' },
    body: new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      }
    })
  };
}

// —— 最小 DOM 桩：仅供问答面板的构造与设置接口契约使用 ——
function installDom() {
  const noop = () => {};
  const node = () => ({
    className: '', id: '', hidden: false, innerHTML: '', textContent: '', title: '', disabled: false, value: '',
    dataset: {}, style: { setProperty: noop }, children: [], _attrs: {}, _q: new Map(),
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute(k, v) { this._attrs[k] = String(v); }, getAttribute(k) { return this._attrs[k]; },
    removeAttribute() {}, append(...cs) { cs.forEach(c => this.children.push(c)); },
    remove() {}, focus: noop, blur: noop, closest: () => null,
    addEventListener: noop, removeEventListener: noop,
    querySelector(sel) { if (!this._q.has(sel)) this._q.set(sel, node()); return this._q.get(sel); },
    querySelectorAll: () => []
  });
  globalThis.document = {
    createElement: () => node(),
    createElementNS: () => node(),
    documentElement: node(), head: node(), body: node(), hidden: false,
    addEventListener: noop, removeEventListener: noop,
    querySelectorAll: () => [], getElementsByTagName: () => []
  };
}
installDom();

test('① 配置开关：未配置 / 显式关闭都不启用远程，配置且未关才启用', () => {
  assert.equal(remoteEnabled('', { remoteOn: true }), false);
  assert.equal(remoteEnabled('   ', {}), false);
  assert.equal(remoteEnabled(EP, { remoteOn: false }), false);
  assert.equal(remoteEnabled(EP, {}), true);
  assert.equal(remoteEnabled(EP, { remoteOn: true }), true);
  assert.equal(REMOTE_IDLE_TIMEOUT_MS, 20000, '流式空闲超时必须为 20s');
});

test('④ 上下文最小化：白名单字段 + 消息队列上限 8 条丢最旧，绝不携带个人数据', () => {
  const ctx = remoteContext({
    view: 'exhibit', vessel: 'meiping', hotspot: 'glaze', mode: 'kintsugi',
    nickname: '青花匠', completed: 4, progress: { a: 1 }, muted: true
  });
  assert.deepEqual(ctx, { page: 'exhibit', vesselId: 'meiping', hotspot: 'glaze', repairMode: 'kintsugi' });
  assert.deepEqual(Object.keys(ctx), CONTEXT_KEYS);
  assert.ok(!JSON.stringify(ctx).includes('青花匠'), '昵称不得进入远程上下文');

  let q = [];
  for (let i = 0; i < 10; i++) q = pushMessage(q, i % 2 ? 'assistant' : 'user', '第' + i + '轮问答文本');
  assert.equal(q.length, 8);
  assert.equal(q[0].content, '第2轮问答文本', '超出上限应丢最旧');
  assert.equal(pushMessage(q, 'user', '   ').length, 8, '空内容不入队');

  const body = buildRequestBody({ messages: q, context: { view: 'exhibit', vessel: 'meiping', nickname: '青花匠' }, model: ' keqing-1 ' });
  assert.equal(body.stream, true);
  assert.equal(body.messages.length, 8);
  assert.equal(body.model, 'keqing-1');
  assert.deepEqual(Object.keys(body.context), CONTEXT_KEYS);
  assert.ok(!JSON.stringify(body).includes('青花匠'), '请求体不得携带个人数据');
  assert.ok(!('model' in buildRequestBody({ messages: [], context: {} })), '未选模型时不携带 model 字段');
});

test('② SSE 解析：跨块截断拼接、CRLF、[DONE]、多行 data 与非 JSON 负载', () => {
  const push = sseParser();
  const r1 = push('data: {"delta":"青"}\n\ndata: {"del');
  assert.deepEqual(r1.events, [{ delta: '青' }]);
  const r2 = push('ta":"花"}\n\n');
  assert.deepEqual(r2.events, [{ delta: '花' }]);
  assert.equal(r2.rest, '');

  const p2 = sseParser();
  const r = p2('data: {"delta":"a"}\r\n\r\ndata: {"delta":"b"}\r\n\r\ndata: [DONE]\r\n\r\nnoise\n\n');
  assert.deepEqual(r.events, [{ delta: 'a' }, { delta: 'b' }, { done: true }], 'CRLF 事件边界与 [DONE] 应正确归一');
  // 同一事件内多行 data: 按 SSE 规范以换行合并后再解析。
  const p3 = sseParser();
  const r3 = p3('data: {"delta":\ndata: "x"}\n\n');
  assert.deepEqual(r3.events, [{ delta: 'x' }]);
  const p4 = sseParser();
  assert.deepEqual(p4('data: not-json\n\n\ndata:{"delta":"y"}\n\n').events, [{ delta: 'y' }], '非 JSON 负载应被忽略且不中断解析');
});

test('② 流式请求：逐 delta 回调、done 元数据透出；404 / 缺 endpoint 抛错', async () => {
  const deltas = [];
  const { text, meta, finished } = await streamRemote({
    endpoint: EP,
    body: { messages: [], context: {}, stream: true },
    fetchImpl: async (url, init) => {
      assert.equal(url, EP);
      assert.equal(JSON.parse(init.body).stream, true);
      assert.equal(init.headers.accept, 'text/event-stream');
      return sseResponse(['data: {"delta":"青花"}\n\n', 'data: {"delta":"发色"}\n\n', 'data: {"done":true,"title":"青花","layer":"fact","layers":["fact"]}\n\n']);
    },
    onDelta: d => deltas.push(d),
    idleTimeoutMs: 5000
  });
  assert.equal(text, '青花发色');
  assert.deepEqual(deltas, ['青花', '发色']);
  assert.equal(meta.title, '青花');
  assert.equal(meta.layer, 'fact');
  assert.equal(finished, true);

  await assert.rejects(
    streamRemote({ endpoint: EP, body: {}, fetchImpl: async () => ({ ok: false, status: 404 }) }),
    /remote-404/
  );
  await assert.rejects(streamRemote({ endpoint: '', body: {} }), /remote-unavailable/);
  // 无 fetch 实现（极端环境）也应抛错回退：临时摘除 Node 自带的全局 fetch。
  const had = globalThis.fetch;
  delete globalThis.fetch;
  try {
    await assert.rejects(streamRemote({ endpoint: EP, body: {} }), /remote-unavailable/);
  } finally { globalThis.fetch = had; }
});

test('② 空闲超时：流式 20s（测试用 40ms）无数据判定超时并抛 TimeoutError', async () => {
  const encoder = new TextEncoder();
  const stalled = {
    ok: true, status: 200,
    headers: { get: () => 'text/event-stream' },
    body: new ReadableStream({
      start(c) { c.enqueue(encoder.encode('data: {"delta":"开"}\n\n')); } // 发一块后不再有数据，也不关闭
    })
  };
  await assert.rejects(
    streamRemote({ endpoint: EP, body: {}, fetchImpl: async () => stalled, idleTimeoutMs: 40 }),
    e => e.name === 'TimeoutError'
  );
});

test('⑤ 展示前校验：textContent 化 + 标签强制「待人工核实」+ 越界与资料不足不采用', () => {
  // 脚本 / HTML / 危险链接全部剥离，仅保留纯文本。
  const s = sanitizeRemoteText('看 <b>青花</b> [资料](https://a.b/c) 与 [坏](javascript:alert(1)) 与 <a href="https://c.d/">直链</a><script>evil()</script>');
  assert.ok(!s.includes('<'), '不得残留任何 HTML 标签');
  assert.ok(!s.includes('javascript:'), '危险协议链接必须整体剥离');
  assert.ok(!s.includes('evil'), '脚本内容必须剥除');
  assert.ok(s.includes('青花') && s.includes('资料') && s.includes('直链'), '安全链接保留文字');

  // 标签非法 / 缺失 → 强制「待人工核实」。
  const bad = validateRemoteAnswer({ text: '<script>x</script>一件釉里红梅瓶', meta: { layer: 'made-up' } }, { query: '什么是釉里红？' });
  assert.equal(bad.ok, true);
  assert.equal(bad.text, '一件釉里红梅瓶');
  assert.equal(bad.layer, 'pending');
  assert.deepEqual(bad.layers, ['pending']);
  const good = validateRemoteAnswer({ text: '正文', meta: { layers: ['fact', 'legend', 'nope'] } }, { query: '什么是釉里红？' });
  assert.deepEqual(good.layers, ['fact', 'legend']);

  // 越界问题：模型答了也不采用；空文本 / insufficient 同样不采用。
  assert.deepEqual(domainCheck('明天北京的天气怎么样？'), { inScope: false });
  assert.ok(domainCheck('什么是粉彩？').inScope);
  assert.ok(domainCheck('给我讲讲陶瓷史吧').inScope, '行业分类入口也算领域内');
  assert.equal(validateRemoteAnswer({ text: '明天晴', meta: { layer: 'fact' } }, { query: '明天北京的天气怎么样？' }).reason, 'out-of-domain');
  assert.equal(validateRemoteAnswer({ text: '   ', meta: {} }, { query: '什么是粉彩？' }).reason, 'insufficient');
  assert.equal(validateRemoteAnswer({ text: '正文', meta: { insufficient: true } }, { query: '什么是粉彩？' }).reason, 'insufficient');
});

// —— 智能体集成桩 ——
function stubPanel() {
  return {
    remoteAvailable: false, remoteOn: null, notices: 0, deltas: [], models: null, ended: [],
    setObject() {}, setRecommendations() {}, setBusy() {}, open() {}, resetPlayback() {},
    setRemoteAvailable(v) { this.remoteAvailable = v; },
    setRemoteOn(v) { this.remoteOn = v; },
    setModels(list) { this.models = list; },
    beginAnswer() { return {}; },
    streamDelta(_art, d) { this.deltas.push(d); },
    endAnswer(_art, answer) { this.ended.push(answer); },
    fallbackNotice() { this.notices++; }
  };
}
const character = { summon() {}, speak() {}, idle() {}, think() {}, emphasize() {}, setLine() {}, dismiss() {}, present() {} };
const agentCtx = () => ({ view: 'exhibit', vessel: 'meiping', mode: 'kintsugi', hotspot: null, nickname: '青花匠', completed: 4 });

test('①②④ 智能体：远程流式回答 + 多轮上下文随请求携带 + 模型列表注入面板', async () => {
  calls.length = 0;
  installFetch(async url => {
    if (url.endsWith('/models')) return { ok: true, json: async () => [{ id: 'keqing-1', name: '青瓷模型', desc: '演示' }] };
    const n = calls.filter(c => !c.url.endsWith('/models')).length;
    return sseResponse([`data: {"delta":"第${n}轮流式回答"}\n\n`, `data: {"done":true,"title":"讲解","layer":"fact","layers":["fact"]}\n\n`]);
  });
  try {
    const panel = stubPanel();
    const agent = createGuideAgent({ endpoint: EP, context: agentCtx, panel, voice: createGuideVoice({}), character });
    assert.equal(panel.remoteAvailable, true, '已配置 endpoint 时开关应可用');
    assert.equal(panel.remoteOn, true, '已配置时默认开启');
    assert.equal(agent.endpoint, EP);
    await new Promise(r => setTimeout(r, 10));
    assert.deepEqual(panel.models, [{ id: 'keqing-1', name: '青瓷模型', desc: '演示' }]);

    const a1 = await agent.ask('什么是粉彩？');
    assert.equal(a1.text, '第1轮流式回答');
    assert.equal(a1.layer, 'fact');
    assert.equal(a1.remote, true);
    assert.ok(panel.deltas.length >= 1, '面板应逐 delta 收到流式文本');

    await agent.ask('什么是釉里红？');
    const asks = calls.filter(c => !c.url.endsWith('/models'));
    assert.equal(asks.length, 2);
    const second = asks[1];
    assert.equal(second.body.messages.length, 3, '第二轮应携带上一轮 user/assistant 与新问题');
    assert.deepEqual(second.body.messages.map(m => m.role), ['user', 'assistant', 'user']);
    assert.equal(second.body.messages[0].content, '什么是粉彩？');
    assert.equal(second.body.messages[2].content, '什么是釉里红？');
    assert.deepEqual(Object.keys(second.body.context), CONTEXT_KEYS);
    assert.ok(!JSON.stringify(second.body).includes('青花匠'), '请求体绝不携带昵称等个人数据');
    assert.equal(second.body.stream, true);
  } finally { delete globalThis.fetch; }
});

test('⑤ 超时 / 404 / 断网回退本地检索，且回退提示可见；越界问题统一回「没有足够依据」', async () => {
  calls.length = 0;
  const panel = stubPanel();
  installFetch(async () => ({ ok: false, status: 404 }));
  try {
    const agent = createGuideAgent({ endpoint: EP, context: agentCtx, panel, voice: createGuideVoice({}), character });
    const a = await agent.ask('釉里红为什么难以烧制？');
    assert.equal(a.entryId, 'gz-youlihong', '应回退本地知识库');
    assert.equal(panel.notices, 1, '应提示「联网讲解暂不可用，已切换本地讲解」');
  } finally { delete globalThis.fetch; }

  const panel3 = stubPanel();
  installFetch(async () => { throw new TypeError('fetch failed'); }); // 断网
  try {
    const agent3 = createGuideAgent({ endpoint: EP, context: agentCtx, panel: panel3, voice: createGuideVoice({}), character });
    const a3 = await agent3.ask('什么是粉彩？');
    assert.equal(a3.inScope, true);
    assert.equal(panel3.notices, 1);
  } finally { delete globalThis.fetch; }

  const panel4 = stubPanel();
  installFetch(async () => sseResponse(['data: {"delta":"明天一定是大晴天，适合晾坯"}\n\n', 'data: {"done":true,"layer":"fact"}\n\n']));
  try {
    const agent4 = createGuideAgent({ endpoint: EP, context: agentCtx, panel: panel4, voice: createGuideVoice({}), character });
    const a4 = await agent4.ask('明天北京的天气怎么样？');
    assert.equal(a4.text, UNKNOWN_ANSWER, '越界问题不得采用模型文本');
    assert.deepEqual(a4.layers, ['pending']);
  } finally { delete globalThis.fetch; }
});

test('① 关闭联网开关：纯本地检索，零远程请求（与现状一致）', async () => {
  installFetch(async () => { throw new Error('开关关闭后不应发起任何请求'); });
  try {
    const panel = stubPanel();
    const agent = createGuideAgent({ endpoint: EP, context: agentCtx, panel, voice: createGuideVoice({}), character });
    calls.length = 0; // 构造期可能有一次 /models 探测，从开关关闭后开始计数
    agent.setRemoteOn(false);
    assert.equal(panel.remoteOn, false, '开关状态应同步到面板');
    const a = await agent.ask('什么是粉彩？');
    assert.equal(a.entryId, 'frm-fencai');
    assert.equal(calls.length, 0, '关闭后不得有任何远程调用');
    assert.equal(panel.notices, 0);
  } finally { delete globalThis.fetch; }
});

test('② 停止中断：AbortController 生效，用户主动停止不提示故障且回退本地', async () => {
  calls.length = 0;
  installFetch((url, init) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      const e = new Error('The operation was aborted');
      e.name = 'AbortError';
      reject(e);
    });
  }));
  try {
    const panel = stubPanel();
    const agent = createGuideAgent({ endpoint: EP, context: agentCtx, panel, voice: createGuideVoice({}), character });
    const pending = agent.ask('什么是粉彩？');
    await new Promise(r => setTimeout(r, 15));
    agent.stop();
    const a = await pending;
    assert.equal(a.inScope, true, '停止后应回退本地回答');
    assert.equal(panel.notices, 0, '用户主动停止不算服务故障');
  } finally { delete globalThis.fetch; }
});

test('面板：联网开关置灰 / 可用切换、模型下拉显隐、流式追加与回退提示', () => {
  const toggled = [];
  const panel = createGuidePanel({ mount: globalThis.document.body, onRemoteToggle: v => toggled.push(v) });
  const b = panel.el.querySelector('#gp-remote');
  const wrap = panel.el.querySelector('#gp-models');

  // 未配置：置灰 + 提示，点击无效果。
  assert.equal(panel.remoteAvailable, false);
  assert.equal(b.disabled, true);
  assert.ok(String(b.title).includes('未配置远程服务') && String(b.title).includes('本地讲解'));
  b.onclick();
  assert.deepEqual(toggled, [], '置灰态点击不得触发回调');

  // 已配置：可开关，点击回调并把状态同步回面板。
  panel.setRemoteAvailable(true);
  assert.equal(b.disabled, false);
  assert.equal(panel.remoteOn, false, '未配置过时初始为关，由 agent 同步默认开');
  panel.setRemoteOn(false);
  assert.equal(b.textContent, '联网讲解 · 关');
  b.onclick();
  assert.deepEqual(toggled, [true]);
  panel.setRemoteOn(true);
  assert.equal(b.textContent, '联网讲解 · 开');

  // 模型下拉：有列表显示、无列表隐藏。
  panel.setModels([{ id: 'm1', name: '青瓷模型', desc: '演示' }]);
  assert.equal(wrap.hidden, false);
  assert.equal(panel.el.querySelector('#gp-model').children.length, 1);
  panel.setModels([]);
  assert.equal(wrap.hidden, true);

  // 流式追加（textContent）与回退提示不抛错。
  const art = panel.beginAnswer('什么是釉里红？');
  panel.streamDelta(art, '釉');
  panel.streamDelta(art, '里红');
  assert.equal(art.querySelector('.gp-text').textContent, '釉里红');
  assert.doesNotThrow(() => panel.fallbackNotice());
});

test('静态守卫：远程适配层相关模块不得触碰主线存档', async () => {
  for (const f of ['guide-remote.js', 'guide-agent.js', 'guide-panel.js']) {
    const src = await readFile(new URL(`../src/modules/${f}`, import.meta.url), 'utf8');
    assert.ok(!/localStorage|porcelain-reunion-progress-v1/.test(src), `${f} 不应触碰主线存档`);
  }
});
