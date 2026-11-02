import { FFMPEG, ROOT } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const take = process.argv[2] || 'A-main';
const times = (process.argv[3] || '5,25,35,50,60,85,100,120,140,165,175,195,210,230,245,255,262').split(',').map(Number);
const src = path.join(ROOT, 'takes', take, 'take.mp4');
const out = path.join(ROOT, 'review', take);
fs.mkdirSync(out, { recursive: true });
for (const t of times) {
  const name = path.join(out, `t${String(t).padStart(3, '0')}.png`);
  execFileSync(FFMPEG, ['-y', '-ss', String(t), '-i', src, '-frames:v', '1', '-update', '1', name], { stdio: 'ignore' });
}
console.log('ok', out);
