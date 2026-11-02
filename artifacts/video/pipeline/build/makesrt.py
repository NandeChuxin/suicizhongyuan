# -*- coding: utf-8 -*-
"""由时间线生成 SRT 字幕与章节索引（交付用）"""
import json
import os
import sys
import importlib
sys.path.insert(0, r'D:\数字媒体\_videotools\build')
import edl
importlib.reload(edl)

OUT = r'D:\数字媒体\_videotools\out'
tag = sys.argv[1] if len(sys.argv) > 1 else 'full'
meta = json.load(open(os.path.join(OUT, f'{tag}.chapters.json'), encoding='utf-8'))
chs = meta['chapters']
for i, c in enumerate(chs):
    if c['dur'] <= 0.01:
        nxt = chs[i + 1]['start'] if i + 1 < len(chs) else meta['total']
        c['dur'] = max(0.5, nxt - c['start'])


def ts(t):
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f'{h:02d}:{m:02d}:{s:06.3f}'.replace('.', ',')


lines = []
n = 0
cues_abs = []
for c in chs:
    for (off, dur, text) in edl.CUES.get(c['key'], []):
        n += 1
        t0, t1 = c['start'] + off, c['start'] + off + dur
        cues_abs.append((t0, t1, text))
        lines.append(f'{n}\n{ts(t0)} --> {ts(t1)}\n{text}\n')
srt = os.path.join(OUT, '碎瓷重圆_项目评审展示_字幕.srt')
open(srt, 'w', encoding='utf-8-sig').write('\n'.join(lines))

# 章节索引
rows = ['| 章节 | 时间码 | 时长 | 内容 |', '| --- | --- | --- | --- |']
names = {
    'intro': '片头：题字与实拍首页', 'start': '启程页 · 九屏导航 · 十秒读懂', 'archive': '修复档案柜 · 六器解锁链',
    'commission': '修复委托 · 原型出处 · 署名 · 叩声', 'puzzle': '拾片归位 · 全息拼合 · 扫描推演',
    'scroll': '器物长卷 · 八页编年记忆', 'choice': '修复抉择 · 四种修复伦理', 'workshop': '金线工序 · 清创/落金/上釉',
    'cert': '修复证书 · 篆印 · 分享卡', 'fieldwork': '三处写实 3D 考察 · 构件溯源', 'exhibit': '数字展厅 · 窑火问答',
    'system': '存档三槽 · 移动端 · 性能自适应', 'finale': '终局成就 · 一镇瓷魂', 'outro': '项目亮点与技术优势',
}
for c in chs:
    t0 = c['start']
    t1 = t0 + c['dur']
    rows.append(f"| {c['no'] or '—'} {c['name']} | {int(t0//60):02d}:{int(t0%60):02d}–{int(t1//60):02d}:{int(t1%60):02d} | {c['dur']:.1f}s | {names.get(c['key'], '')} |")
md = os.path.join(OUT, 'chapters.md')
open(md, 'w', encoding='utf-8').write('\n'.join(rows) + '\n')
print(f'[srt] {srt}  {n} 条')
print('\n'.join(rows))
