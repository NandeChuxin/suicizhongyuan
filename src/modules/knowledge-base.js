// 本地知识检索（纯函数，无 DOM / three 依赖，可在 Node 单测中直接调用）。
// 设计目标：
//   1. 优先返回项目已整理的结构化资料，并为每条回答附内容标签与来源；
//   2. 资料库没有依据时，返回 UNKNOWN_ANSWER，绝不编造史实；
//   3. 检索偏低成本：关键词加权 + 问句相似度 + 上下文加权，不引入外部依赖。
import { KNOWLEDGE, GUIDE_SOURCES, UNKNOWN_ANSWER } from '../data/guide.js';
import { CERAMICS, CERAMIC_CATEGORIES } from '../data/ceramics.js';
import { LAYER_LABELS } from '../data/culture.js';

// 两库合并：guide.js（展品与工艺讲解层）+ ceramics.js（行业通识层），统一检索与标签口径。
export const ALL_KNOWLEDGE = [...KNOWLEDGE, ...CERAMICS];
const ENTRY_BY_ID = new Map(ALL_KNOWLEDGE.map(e => [e.id, e]));

// 命中阈值：低于此分视为「资料库没有依据」，回答未知。
const MIN_SCORE = 3.4;
// 允许出现在回答里的标签（与全站五层标签一致）。
export const ANSWER_LAYERS = Object.keys(LAYER_LABELS);

// 中文按字 + 二元组切分；英文/数字按词切分。用于问句相似度。
export function bigrams(text) {
  const grams = new Set();
  const s = String(text || '').toLowerCase().replace(/[\s\p{P}]/gu, '');
  for (const run of s.match(/[\u4e00-\u9fff]+|[a-z0-9]+/g) || []) {
    if (/[\u4e00-\u9fff]/.test(run)) {
      for (const ch of run) grams.add(ch);
      for (let i = 0; i < run.length - 1; i++) grams.add(run.slice(i, i + 2));
    } else if (run.length >= 2) grams.add(run);
  }
  return grams;
}

function overlap(a, b) {
  let n = 0;
  for (const g of a) if (b.has(g)) n++;
  return n;
}

// 单条知识条目的得分拆分：关键词分 + 问句相似度。
// 分离保存是为了让「是否在领域内」有明确判据（见 isInScope），避免泛词误命中。
export function scoreEntry(entry, query) {
  const q = String(query || '');
  let kw = 0;
  // 每个实义词命中至少 4 分（2 字词=4、4 字词=6），与 isInScope 的「kw≥4」判据严格一致：
  // 命中任一关键词即视为领域内，避免「什么是粉彩」这类正确提问落进分类引导。
  for (const word of entry.keywords || []) {
    if (word && q.includes(word)) kw += 2 + word.length;
  }
  const qg = bigrams(q), eg = bigrams(`${entry.question || ''}${entry.title || ''}`);
  const sim = qg.size ? overlap(qg, eg) / qg.size : 0;
  return { kw: +kw.toFixed(3), sim: +sim.toFixed(3), score: +(kw + sim * 4).toFixed(3) };
}

// 领域内判据：至少命中一个实义关键词（≥4 分，约等于一个 4 字词或两个 2 字词），
// 或问句相似度 ≥ 0.5。二者皆不满足即视为超出资料范围。
function isInScope({ kw, sim }) {
  return kw >= 4 || sim >= 0.5;
}

// 上下文加权：当前器物 / 当前页面 / 当前修复方式。
function contextBoost(entry, context = {}) {
  let boost = 0;
  if (context.vessel && entry.vessel === context.vessel) boost += 3.2;
  if (Array.isArray(entry.view) && context.view && entry.view.includes(context.view)) boost += 2.2;
  if (context.view === 'exhibit' && entry.scope === 'vessel') boost += 0.6;
  if (context.view === 'tour' && entry.scope === 'fieldwork') boost += 1.4;
  if (context.view === 'choice' && entry.scope === 'repair') boost += 1.4;
  if (context.mode === 'preserve' && entry.id === 'repair-keep') boost += 1.2;
  if (context.mode === 'juci' && entry.id === 'repair-diff') boost += 1.2;
  return boost;
}

// 检索：按上下文加权后排序，返回 {entry, score, kw, sim, inScope} 列表。
// 默认在两库合并池中检索；也可显式传入条目子集（测试用）。
export function searchKnowledge(query, context = {}, entries = ALL_KNOWLEDGE) {
  return entries
    .map(entry => {
      const base = scoreEntry(entry, query);
      const score = +(base.score + contextBoost(entry, context)).toFixed(3);
      return { entry, ...base, score, inScope: isInScope(base) };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

// 标签安全检查：无标签或来源结构异常的条目一律降级为「待人工核实」。
export function sanitizeEntry(entry) {
  const layers = (Array.isArray(entry.layers) ? entry.layers.slice() : []).filter(k => ANSWER_LAYERS.includes(k));
  const layer = ANSWER_LAYERS.includes(entry.layer) ? entry.layer : 'pending';
  if (!layers.includes(layer)) layers.unshift(layer);
  return { ...entry, layer, layers: [...new Set(layers)] };
}

export function sourcesOf(entry) {
  return (entry.sources || []).map(id => GUIDE_SOURCES[id]).filter(Boolean);
}

export function layerTexts(entry) {
  const safe = sanitizeEntry(entry);
  return safe.layers.map(k => ({ key: k, label: LAYER_LABELS[k] }));
}

// 条目间联想：把 related id 解析为可点击的轻量条目（含展厅器物条目，跨库联想）。
function relatedOf(entry, max = 2) {
  const out = [];
  for (const id of entry.related || []) {
    const e = ENTRY_BY_ID.get(id);
    if (!e || e.id === entry.id) continue;
    out.push({ id: e.id, title: e.title, question: e.question, vessel: e.vessel || null, cat: e.cat || null });
    if (out.length >= max) break;
  }
  return out;
}

// 分类引导：问题命中行业分类关键词但没有具体条目命中时，
// 返回该分类的「可以问我」引导，而不是直接落到「没有依据」。
export function categoryGuidance(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const cat = CERAMIC_CATEGORIES.find(c => (c.keywords || []).some(k => q.includes(k)));
  if (!cat) return null;
  const samples = (cat.samples || []).map((question, i) => ({ id: `${cat.id}-sample-${i}`, title: question.replace(/？$/, ''), question }));
  return {
    ok: true,
    inScope: true,
    entryId: `ceramics-cat:${cat.id}`,
    title: `这属于「${cat.name}」范畴`,
    text: `你问的内容属于「${cat.name}」的范畴，现有资料可以回答这类问题。可以先问问我：${cat.samples.slice(0, 3).join('、')}——展厅里的六件器物也串在这些知识线上，随时可以联想过去。`,
    layer: 'schematic',
    layers: ['schematic'],
    sources: [],
    characterLine: '',
    scope: 'ceramics',
    pending: false,
    related: samples,
    category: cat.id
  };
}

// 主回答函数。返回统一结构，供面板 / 语音 / 测试共用。
export function answerQuestion(query, context = {}, entries = ALL_KNOWLEDGE) {
  const q = String(query || '').trim();
  if (!q) return unknownAnswer('empty');
  const ranked = searchKnowledge(q, context, entries);
  const best = ranked[0];
  // 双重门槛：既要在领域内（命中实义关键词或问句高度相似），又要有足够得分。
  if (!best || !best.inScope || best.score < MIN_SCORE) {
    // 领域内但无具体条目：返回分类引导（不伪装成已查证事实，属导航性回答）。
    const guidance = categoryGuidance(q);
    if (guidance) return guidance;
    return unknownAnswer('no-match', ranked);
  }
  const entry = sanitizeEntry(best.entry);
  const related = relatedOf(entry);
  return {
    ok: true,
    inScope: true,
    entryId: entry.id,
    title: entry.title,
    text: entry.answer,
    layer: entry.layer,
    layers: entry.layers,
    sources: sourcesOf(entry),
    characterLine: entry.characterLine || entry.spiritLine || '',
    scope: entry.scope,
    pending: Boolean(entry.pending),
    related: related.length ? related : undefined,
    score: best.score
  };
}

function unknownAnswer(reason, ranked = []) {
  return {
    ok: true,
    inScope: false,
    entryId: null,
    title: '暂无依据',
    text: UNKNOWN_ANSWER,
    layer: 'pending',
    layers: ['pending'],
    sources: [],
    characterLine: '',
    scope: 'unknown',
    pending: true,
    reason,
    score: ranked[0]?.score ?? 0
  };
}

// 推荐问题：3~5 条，全部直接取自知识条目的问句，保证每条都能被检索命中。
// 优先级：当前器物专属 → 当前页面相关 → 跨器物的工艺/修复/项目条目 → 行业分类入口。
export function recommendedQuestions(context = {}, max = 5) {
  const pool = [];
  const push = list => list.forEach(e => e.question && pool.push(e.question));
  if (context.vessel) push(ALL_KNOWLEDGE.filter(e => e.vessel === context.vessel));
  if (context.view) push(ALL_KNOWLEDGE.filter(e => e.vessel !== context.vessel && e.view?.includes(context.view)));
  push(ALL_KNOWLEDGE.filter(e => !e.vessel));
  // 行业分类入口：每个分类抽一条样例问句排在尾部，让「整个陶瓷行业」都有入口。
  for (const cat of CERAMIC_CATEGORIES) {
    if (cat.samples?.length) push([{ question: cat.samples[0] }]);
  }
  const seen = new Set();
  const out = [];
  for (const q of pool) {
    if (seen.has(q)) continue;
    seen.add(q);
    out.push(q);
    if (out.length >= max) break;
  }
  return out.length >= 3 ? out : pool.slice(0, 3);
}

export const KNOWLEDGE_MIN_SCORE = MIN_SCORE;