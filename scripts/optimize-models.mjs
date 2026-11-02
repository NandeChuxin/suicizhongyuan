// 真实瓷器 GLB → 网页优化副本。
// 原始文件保留在项目根目录不动；产物写入 public/models/，供运行时按需加载。
// 优化内容：几何简化到约 20% 顶点 + 贴图降到 2K WebP。
// 关键：不用 meshopt/Draco/quantize 压缩——这些压缩方法会把 float32 顶点转 int16，
// Three.js 对 KHR_mesh_quantization 的 dequantize 需要精确参数匹配，
// 版本不匹配会导致 int16 被当成 raw float32 读取，坐标爆到 ±32768 → 模型七零八落错位。
// 直接保留 float32 顶点（文件稍大但绝对正确），纹理用 WebP 压缩。
//
// 用法：
//   npm run models -- --force   # 全部重做
//   node scripts/optimize-models.mjs --force 玲珑  # 只处理文件名含「玲珑」的一件
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 中文原名 → 网页 ASCII 名。首页主角单独一份，六件器物按 id 归到 vessels/。
const MODELS = [
  ['首页瓷器.glb', 'models/hero.glb'],
  ['器灵阿圆.glb', 'models/qiling.glb'],
  ['青花花鸟纹梅瓶.glb', 'models/vessels/meiping.glb'],
  ['青花缠枝莲纹玉壶春瓶.glb', 'models/vessels/yuhuchun.glb'],
  ['青花云龙纹罐.glb', 'models/vessels/jiangjun.glb'],
  ['釉里红高足转杯.glb', 'models/vessels/gaozu.glb'],
  ['祭红釉蒜头瓶.glb', 'models/vessels/suantou.glb'],
  ['青花玲珑镂空碗.glb', 'models/vessels/linglong.glb']
];

// 简化后保留的顶点比例。原始 78 万面 → 约 30 万面（20%），曲面完整度好。
const SIMPLIFY_RATIO = '0.2';
const SIMPLIFY_ERROR = '0.0005';
const TEXTURE_SIZE = '2048';

const force = process.argv.includes('--force');
const filter = process.argv.slice(2).find(arg => !arg.startsWith('--'));

const mb = bytes => (bytes / 1048576).toFixed(1) + 'MB';

let failed = 0;
for (const [source, target] of MODELS) {
  if (filter && !source.includes(filter)) continue;
  const input = join(ROOT, source);
  const output = join(ROOT, 'public', target);

  if (!existsSync(input)) { console.error(`✗ 缺少源文件：${source}`); failed += 1; continue; }
  if (existsSync(output) && !force) { console.log(`· 跳过（已存在，加 --force 覆盖）：${target}`); continue; }

  mkdirSync(dirname(output), { recursive: true });
  const before = statSync(input).size;
  const started = Date.now();
  // --compress false：禁用 meshopt/draco/quantize 压缩，保留 float32 顶点。
  // --flatten false --join false：保留节点层级，避免未来多部件模型被合并。
  const args = [
    '--yes', '@gltf-transform/cli@4', 'optimize', input, output,
    '--compress', 'false',
    '--simplify-ratio', SIMPLIFY_RATIO,
    '--simplify-error', SIMPLIFY_ERROR,
    '--texture-compress', 'webp',
    '--texture-size', TEXTURE_SIZE,
    '--flatten', 'false',
    '--join', 'false',
    '--palette', 'false'
  ];
  const run = spawnSync('npx', args, { stdio: 'inherit', cwd: ROOT, shell: true });
  if (run.status !== 0 || !existsSync(output)) { console.error(`✗ 优化失败：${source}`); failed += 1; continue; }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`✓ ${source} → ${target}  ${mb(before)} → ${mb(statSync(output).size)}  ${seconds}s`);
}

if (failed) {
  console.error(`\n${failed} 个模型未完成。若失败发生在贴图处理阶段，请先安装 sharp：npm i -D sharp`);
  process.exit(1);
}
console.log('\n优化完成 → public/models/');