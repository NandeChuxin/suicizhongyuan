import { readFile, readdir, writeFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const lock=JSON.parse(await readFile(new URL('package-lock.json',root),'utf8'));
const sections=['碎瓷重圆 — Third-party software notices\nOriginal project assets and software package licenses are separate.\n'];
for(const path of Object.keys(lock.packages).filter(path=>path.startsWith('node_modules/'))) {
  const directory=new URL(path+'/',root);
  try {
    const meta=JSON.parse(await readFile(new URL('package.json',directory),'utf8'));
    sections.push(`\n=== ${meta.name} ${meta.version} ===\nLicense declaration: ${meta.license||'See package documentation'}\n${meta.homepage||''}\n`);
    const files=(await readdir(directory)).filter(file=>/^licen[sc]e(?:\.|$)|^copying(?:\.|$)/i.test(file));
    for(const file of files)sections.push(await readFile(new URL(file,directory),'utf8'));
    if(!files.length)sections.push('No separate license file shipped in this package. Refer to the license declaration above.\n');
  }catch{/* Platform-specific optional packages may not be installed. */}
}
await writeFile(new URL('public/THIRD_PARTY_NOTICES.txt',root),sections.join('\n'));
console.log('已收集安装依赖的许可声明。');
