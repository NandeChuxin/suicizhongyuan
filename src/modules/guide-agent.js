// 讲解智能体：把「本地知识检索 / 远程适配层」「问答面板」「古人角色」「语音」编排到一起。
// 边界与合规：
//   · 优先保证本地结构化资料可用（knowledge-base.answerQuestion），无依据时诚实回答未知；
//   · 远程服务为可替换适配层（guide-remote.js）：默认关闭、纯本地检索；配置 VITE_GUIDE_ENDPOINT
//     并在面板打开「联网讲解」后启用，走 SSE 流式（fetch + ReadableStream 原生实现）；
//   · 前端不保存任何密钥，只发送最近 8 条问答文本与最少必要上下文（页面/器物/热点/修复方式），
//     不发送昵称 / 存档 / 个人数据；
//   · 远程回答展示前做「领域内 + 来源标签」检查，异常一律降级为「待人工核实」，
//     正文一律 textContent 化；超时 / 404 / 断网回退本地检索并明确提示；
//   · 不执行模型返回的任何 HTML / 脚本（只用 textContent 渲染）。
import { answerQuestion, recommendedQuestions, ANSWER_LAYERS } from './knowledge-base.js';
import { UNKNOWN_ANSWER } from '../data/guide.js';
import { remoteEnabled, pushMessage, buildRequestBody, streamRemote, fetchModels, validateRemoteAnswer } from './guide-remote.js';

// 远程接入点：默认读构建环境配置（Vite 注入，构建期决定）；测试可经 createGuideAgent({endpoint}) 覆盖。
const ENV_ENDPOINT = (import.meta.env && import.meta.env.VITE_GUIDE_ENDPOINT) || '';

// 最少必要上下文：不含昵称、存档、证书编号等任何个人数据。
export function minimalContext(ctx = {}) {
  return {
    view: ctx.view || 'unknown',
    vessel: ctx.vessel || null,
    hotspot: ctx.hotspot || null,
    mode: ctx.mode || null
  };
}

// 来源链接只允许 http(s) 与站内相对路径，杜绝 javascript: 等危险协议。
const SAFE_URL = /^(https?:\/\/|\.{0,2}\/)/i;
const safeUrl = u => (SAFE_URL.test(String(u || '')) ? String(u) : '');

// 展示前校验：标签必须在五层之内，正文必须是纯文本；不合法则降级为待核实。
// related（条目间联想）一并透传：只保留 title/question 均合法的条目，最多两条。
export function checkAnswer(raw, { query = '', context = {}, fallback } = {}) {
  const text = String(raw?.text ?? '').trim();
  if (!text) return fallback ?? localAnswer(query, context);
  const layers = (Array.isArray(raw.layers) ? raw.layers : [raw.layer]).filter(k => ANSWER_LAYERS.includes(k));
  const layer = ANSWER_LAYERS.includes(raw.layer) ? raw.layer : (layers[0] || 'pending');
  if (!layers.length) layers.push('pending');
  const related = (Array.isArray(raw.related) ? raw.related : [])
    .filter(r => r && String(r.title || '').trim() && String(r.question || '').trim())
    .slice(0, 2)
    .map(r => ({ id: String(r.id || ''), title: String(r.title), question: String(r.question) }));
  return {
    ok: true,
    inScope: raw.inScope !== false,
    entryId: raw.entryId || null,
    title: String(raw.title || '数字讲解'),
    text,
    layer: layer === raw.layer ? layer : 'pending',
    layers: [...new Set(layers)],
    sources: (Array.isArray(raw.sources) ? raw.sources : [])
      .filter(s => s && s.name && safeUrl(s.url))
      .map(s => ({ name: String(s.name), url: safeUrl(s.url) })),
    characterLine: String(raw.characterLine || raw.spiritLine || ''),
    scope: raw.scope || 'remote',
    pending: Boolean(raw.pending) || !ANSWER_LAYERS.includes(raw.layer),
    related: related.length ? related : undefined,
    remote: true
  };
}

function localAnswer(query, context) { return answerQuestion(query, context); }

// —— 角色与音色路由 ——
// 全站唯一讲解形象为 3D 器灵「阿圆」：character.present() 统一呈现，不再做多角色切换。
// 音色：器物记忆与行业通识 → 器灵音色；现代研究 / 来源 / 不确定性 / 项目口径 → 中性数字策展员音色；
// 其余（可承载劳动与经验的工序类回答）→ 基础讲解音色。显式传入的 profile 优先（兼容既有调用与测试）。
const QILING_SCOPES = ['vessel', 'life', 'repair', 'history', 'kiln', 'form', 'industry', 'appreciation', 'ceramics'];
const CURATOR_SCOPES = ['project', 'fieldwork', 'unknown', 'schematic'];
function voiceProfileFor(answer) {
  const scope = answer?.scope || '';
  if (QILING_SCOPES.includes(scope)) return 'qiling';
  if (!answer?.characterLine || CURATOR_SCOPES.includes(scope)) return 'curator';
  return 'character';
}

export function createGuideAgent({ context = () => ({}), panel, voice, character, onNeedOpen, endpoint } = {}) {
  // 远程接入点：已配置（环境变量或显式传入）且面板开关未关闭时才启用远程流式。
  const EP = String(endpoint ?? ENV_ENDPOINT ?? '').trim();
  let controller = null, lastAnswer = null, narrating = false;
  let remoteOn = true, remoteModel = '', messages = [];

  const ctxNow = () => {
    const c = context() || {};
    return { view: c.view, vessel: c.vessel, hotspot: c.hotspot, mode: c.mode, unlocked: c.unlocked, completed: c.completed, reduced: c.reduced, muted: c.muted };
  };

  // 把当前上下文同步到面板：讲解对象名、推荐问题与联网讲解可用性。
  function sync() {
    const c = context() || {};
    panel?.setObject(c.label || c.vesselName || '');
    panel?.setRecommendations(recommendedQuestions({ vessel: c.vessel, view: c.view }));
  }

  // 联网讲解开关初值：已配置 endpoint 默认开、可关；未配置由面板置灰并提示「当前为本地讲解」。
  panel?.setRemoteAvailable?.(Boolean(EP));
  if (EP) {
    panel?.setRemoteOn?.(remoteOn);
    loadModels();
  }

  // ③ 模型列表（可选能力）：GET endpoint/models；失败静默，面板保持隐藏选择器。
  function loadModels() {
    if (!EP || typeof fetch !== 'function') return;
    fetchModels(EP, fetch).then(list => { if (list.length) panel?.setModels?.(list); }).catch(() => {});
  }

  // 面板「联网讲解」开关回调：仅改本地开关状态，不改任何存档。
  function setRemoteOn(v) { remoteOn = Boolean(v); panel?.setRemoteOn?.(remoteOn); }
  function setRemoteModel(id) { remoteModel = String(id || '').trim(); }

  // 远程流式问答：逐 delta 推给面板；20s 无数据 / 非 2xx / 断网 / 流中断 → 回退本地检索。
  // 发送内容仅：最近 8 条问答文本 + 白名单上下文 + 可选模型 id；不含任何个人数据与密钥。
  async function askRemote(query, ctx, art) {
    const ac = new AbortController();
    controller = ac;
    try {
      const body = buildRequestBody({ messages: pushMessage(messages, 'user', query), context: ctx, model: remoteModel });
      const { text, meta } = await streamRemote({
        endpoint: EP,
        body,
        signal: ac.signal,
        onDelta: d => panel?.streamDelta?.(art, d)
      });
      const verdict = validateRemoteAnswer({ text, meta }, { query });
      // 资料不足 / 越界问题：不采用模型文本，统一回「没有足够依据」，绝不编造。
      if (!verdict.ok) return { ...localAnswer('', {}) };
      return checkAnswer({
        text: verdict.text,
        layer: verdict.layer,
        layers: verdict.layers,
        title: meta.title,
        entryId: meta.entryId,
        characterLine: meta.characterLine,
        sources: meta.sources
      }, { query, context: ctx });
    } catch {
      // 用户主动停止不算故障（不提示）；其余（超时 / 404 / 断网 / error 事件）提示已切换本地。
      if (!ac.signal.aborted) panel?.fallbackNotice?.();
      return localAnswer(query, ctx);
    } finally {
      controller = null;
    }
  }

  async function ask(query) {
    const q = String(query || '').trim();
    if (!q) return;
    const ctx = ctxNow();
    onNeedOpen?.();
    const art = panel?.beginAnswer(q);
    character?.think();
    let answer;
    try {
      // 联网讲解开（已配置且未关闭）→ 远程流式（内含领域与标签校验、失败回退本地）；
      // 开关关 / 未配置 → 纯本地检索，与既有行为一致。
      if (remoteEnabled(EP, { remoteOn })) answer = await askRemote(q, ctx, art);
      else answer = localAnswer(q, ctx);
    } catch {
      answer = { ...localAnswer('', {}), text: UNKNOWN_ANSWER, layers: ['pending'], layer: 'pending', sources: [] };
    }
    lastAnswer = answer;
    // 多轮上下文：只追加问答文本本身（不含昵称 / 存档等任何个人数据），上限 8 条。
    messages = pushMessage(pushMessage(messages, 'user', q), 'assistant', answer.text || '');
    panel?.endAnswer(art, answer, q);
    character?.idle();
    // 回答落定后呈现器灵「阿圆」，下一次讲解无需等待。
    character?.present?.();
    return answer;
  }

  // 讲解：语音与字幕同源（都来自面板可见的 answer.text）。
  // 音色按 scope 路由（显式传入的 profile 优先，兼容既有调用）。
  function narrate(answer = lastAnswer, { profile } = {}) {
    if (!answer) return;
    const text = answer.text || '';
    if (!text) return;
    narrating = true;
    onNeedOpen?.();
    character?.present?.();
    character?.summon();
    character?.speak();
    character?.setLine(answer.characterLine || text.slice(0, 26));
    voice?.setMuted(voice.muted); // 保持用户既有静音选择，绝不自动开声
    const useProfile = profile || voiceProfileFor(answer);
    voice?.speak(text, { profile: useProfile, onEnd: () => { narrating = false; character?.idle(); panel?.resetPlayback(); } });
  }

  function stopNarrate() {
    narrating = false;
    voice?.stop();
    character?.idle();
    panel?.resetPlayback();
  }

  // 停止生成：中止远程请求（AbortController）、停止语音，面板复位。
  function stop() {
    controller?.abort(); controller = null;
    stopNarrate();
    panel?.setBusy(false);
  }

  // 面板「清空」：停止讲解并丢弃多轮上下文。
  function clearConversation() { messages = []; stopNarrate(); }

  function summon() { character?.summon(); }
  function dismiss() { stopNarrate(); character?.dismiss(); }

  return {
    sync, ask, stop, narrate, stopNarrate, summon, dismiss, clearConversation,
    setRemoteOn, setRemoteModel,
    get lastAnswer() { return lastAnswer; },
    get narrating() { return narrating; },
    get endpoint() { return EP; },
    get remoteOn() { return remoteOn; },
    get remoteModel() { return remoteModel; },
    get conversation() { return messages; }
  };
}
