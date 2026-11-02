import { FFMPEG, ROOT } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const take = process.argv[2];
const step = Number(process.argv[3] || 2);      // 每 step 秒一张
const cols = 8, rows = 5;
const src = path.join(ROOT, 'takes', take, 'take.mp4');
const out = path.join(ROOT, 'review', 'sheets');
fs.mkdirSync(out, { recursive: true });
const font = 'C\\:/Windows/Fonts/arial.ttf';
const vf = `fps=1/${step},scale=300:-1,drawtext=fontfile='${font}':text='%{pts\\:hms}':x=6:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6:boxborderw=4,tile=${cols}x${rows}:padding=4:color=black`;
execFileSync(FFMPEG, ['-y', '-i', src, '-vf', vf, '-frames:v', '99', path.join(out, `${take}-%02d.jpg`)], { stdio: 'ignore' });
console.log('ok', out);
