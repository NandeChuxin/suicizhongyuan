// 远程大模型适配层（窑火问答）：把「配置开关 / SSE 流式解析 / 请求体组装 / 模型列表 /
// 展示前校验」收敛为可独立单测的纯函数与原生 fetch 流程，不引入任何第三方依赖。
// 合规边界（与 README 约定一致）：
//   · 密钥 / 凭据全部留在自建后端，前端不保存、不透传任何密钥；
//   · 请求只携带最近 8 条问答文本与最少必要上下文（页面 / 器物 / 热点 / 修复方式），
//     绝不发送昵称、存档、设备信息等个人数据；
//   · 流式 20s 无数据判定超时，超时 / 404 / 断网一律由调用方回退本地检索；
//   · 远程回答展示前做领域校验（knowledge-base 打分）与五层标签校验，
//     非法或缺失标签强制标「待人工核实」，正文一律 textContent 化。
import { ANSWER_LAYERS, searchKnowledge, categoryGuidance } from './knowledge-base.js';

// 流式中断 20s 无数据 → 判定超时（每次收到数据即重置计时）。
export const REMOTE_IDLE_TIMEOUT_MS = 20000;

// ① 配置开关：endpoint 已配置 && 面板设置未显式关闭（remoteOn !== false）。
// 开关关 / 未配置时调用方应完全走本地检索，与既有行为一致。
export function remoteEnabled(endpoint, settings = {}) {
  return Boolean(String(endpoint || '').trim()) && settings.remoteOn !== false;
}

// ④ 最少必要上下文（远程协议字段名）：白名单映射，绝不透传其余任何字段。
export const CONTEXT_KEYS = ['page', 'vesselId', 'hotspot', 'repairMode'];
export function remoteContext(ctx = {}) {
  return {
    page: ctx.view || 'unknown',
    vesselId: ctx.vessel || null,
    hotspot: ctx.hotspot || null,
    repairMode: ctx.mode || null
  };
}

// ④ 多轮消息队列：只保留 {role, content} 问答文本，上限 8 条，超出丢最旧；空内容不入队。
export function pushMessage(queue, role, content, max = 8) {
  const text = String(content ?? '').trim();
  if (!text) return [...(queue || [])].slice(-max);
  return [...(queue || []), { role: role === 'assistant' ? 'assistant' : 'user', content: text }].slice(-max);
}

// ② 请求体：messages（≤8 条）+ context（白名单）+ stream:true；model 仅在已选择时携带。
export function buildRequestBody({ messages = [], context = {}, model = '' } = {}) {
  const body = {
    messages: (messages || [])
      .filter(m => m && String(m.content || '').trim())
      .slice(-8)
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).trim() })),
    context: remoteContext(context),
    stream: true
  };
  const id = String(model || '').trim();
  if (id) body.model = id;
  return body;
}

// —— SSE 解析 ——
// 单个事件：多行 data: 合并；[DONE] 视为 done；非 JSON 负载忽略。
function parseSSEEvent(raw) {
  const data = String(raw).split('\n')
    .map(l => l.replace(/\r$/, ''))
    .filter(l => l.startsWith('data:'))
    .map(l => l.replace(/^data:\s?/, ''))
    .join('\n')
    .trim();
  if (!data) return null;
  if (data === '[DONE]') return { done: true };
  try {
    const obj = JSON.parse(data);
    return obj && typeof obj === 'object' ? obj : null;
  } catch { return null; }
}

// 跨块解析器：调用方把每块文本喂给返回的 push，得到 {events, rest}；
// rest 留待与下一块拼接（事件可能被网络分片从中间截断）。
export function sseParser() {
  let buf = '';
  return function push(chunk) {
    buf = (buf + String(chunk ?? '')).replace(/\r\n/g, '\n');
    const events = [];
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const ev = parseSSEEvent(buf.slice(0, idx));
      if (ev) events.push(ev);
      buf = buf.slice(idx + 2);
    }
    return { events, rest: buf };
  };
}

// ② 流式请求：POST endpoint → text/event-stream；事件格式 {delta} / {done} / {error}，
// done 及任意事件可附带 title / layer / layers / sources / entryId / characterLine / insufficient 元数据。
// 空闲超时（默认 20s 无数据）抛 TimeoutError；HTTP 非 2xx / error 事件抛错，由调用方回退本地。
export async function streamRemote({ endpoint, body, signal, fetchImpl, idleTimeoutMs = REMOTE_IDLE_TIMEOUT_MS, onDelta } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!endpoint || !doFetch) throw new Error('remote-unavailable');
  const res = await doFetch(String(endpoint), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    signal,
    body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error('remote-' + res.status);

  const push = sseParser();
  let text = '', failure = null, finished = false;
  const meta = {};
  const handleEvent = ev => {
    if (!ev) return;
    if (ev.error) { failure = new Error(String(ev.error)); return; }
    if (ev.done) finished = true;
    if (typeof ev.delta === 'string' && ev.delta) { text += ev.delta; onDelta?.(ev.delta); }
    for (const k of ['title', 'entryId', 'characterLine', 'insufficient']) if (ev[k] != null) meta[k] = ev[k];
    if (ev.layer != null) meta.layer = ev.layer;
    if (Array.isArray(ev.layers)) meta.layers = ev.layers;
    if (Array.isArray(ev.sources)) meta.sources = ev.sources;
  };

  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const decoder = typeof TextDecoder === 'function' ? new TextDecoder() : null;
    // 单次 read 包一层空闲计时：超过 idleTimeoutMs 无数据即抛 TimeoutError。
    const readIdle = () => new Promise((resolve, reject) => {
      if (!idleTimeoutMs) return reader.read().then(resolve, reject);
      const t = setTimeout(() => {
        const err = new Error('remote-idle-timeout');
        err.name = 'TimeoutError';
        reject(err);
      }, idleTimeoutMs);
      reader.read().then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
    try {
      for (;;) {
        const { value, done } = await readIdle();
        if (done) break;
        for (const ev of push(decoder ? decoder.decode(value, { stream: true }) : String(value)).events) handleEvent(ev);
        if (failure || finished) break;
      }
      // 冲刷解码器余量（多字节字符可能跨块）。
      if (decoder) for (const ev of push(decoder.decode()).events) handleEvent(ev);
    } finally {
      try { reader.cancel?.(); } catch { /* ignore */ }
    }
  } else {
    // 无流式体的环境（或后端未按 SSE 分片）：整体读取后按单块解析。
    for (const ev of push(await res.text()).events) handleEvent(ev);
  }
  if (failure) throw failure;
  return { text, meta, finished };
}

// ③ 模型列表：GET endpoint/models → [{id,name,desc}]；任何失败返回 []（调用方静默隐藏选择器）。
export async function fetchModels(endpoint, fetchImpl) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const base = String(endpoint || '').replace(/\/+$/, '');
  if (!base || !doFetch) return [];
  try {
    const res = await doFetch(base + '/models', { headers: { accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data) ? data : Array.isArray(data?.models) ? data.models : [];
    return list
      .filter(m => m && (m.id || m.model))
      .map(m => ({ id: String(m.id ?? m.model), name: String(m.name || m.id || m.model), desc: String(m.desc || '') }))
      .slice(0, 12);
  } catch { return []; }
}

// 回答文本一律 textContent 化：剥掉脚本 / 样式块、HTML 标签与 Markdown 链接语法。
// 链接仅保留安全协议（http(s) 与站内相对路径）的链接文字，其余链接整体剥离，防注入。
export function sanitizeRemoteText(raw) {
  let s = String(raw ?? '');
  s = s.replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  s = s.replace(/\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g, (m, t, url) => (/^(https?:\/\/|\.?\/)/i.test(String(url).trim()) ? t : ''));
  s = s.replace(/<[^>]*>/g, '');
  return s.trim();
}

// ⑤ 领域校验：问题必须落在资料库领域内（关键词命中 / 问句高度相似，或命中行业分类）。
// 越界问题（天气 / 拍卖价等）即便模型作答也不采用，统一回「没有足够依据」。
export function domainCheck(query) {
  const best = searchKnowledge(String(query || ''))[0];
  if (best?.inScope) return { inScope: true, matched: best.entry.id };
  const cat = categoryGuidance(query);
  if (cat) return { inScope: true, category: cat.category };
  return { inScope: false };
}

// ⑤ 展示前校验：后端声明资料不足 / 文本为空 / 越界问题 → 不采用（ok:false）；
// 五层标签非法或缺失 → 强制「待人工核实」（文本合法性由调用方 checkAnswer 最终把关）。
export function validateRemoteAnswer({ text, meta = {} } = {}, { query = '' } = {}) {
  if (meta.insufficient) return { ok: false, reason: 'insufficient' };
  const clean = sanitizeRemoteText(text);
  if (!clean) return { ok: false, reason: 'insufficient' };
  if (!domainCheck(query).inScope) return { ok: false, reason: 'out-of-domain' };
  const layers = (Array.isArray(meta.layers) ? meta.layers : [meta.layer]).filter(k => ANSWER_LAYERS.includes(k));
  return {
    ok: true,
    text: clean,
    layer: layers[0] || 'pending',
    layers: layers.length ? [...new Set(layers)] : ['pending'],
    meta
  };
}
