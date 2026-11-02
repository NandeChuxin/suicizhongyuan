import * as THREE from 'three';
import { gsap } from 'gsap';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import html2canvas from 'html2canvas';
import { createFragments, scatterFragments } from './modules/fragments.js';
import { installInteraction } from './modules/interaction.js';
import { canSnap, normalizeAngle, MAGNET_DISTANCE } from './modules/gameState.js';
import { makeVesselTexture, preloadRealTextures } from './modules/textures.js';
import { buildVesselMesh, vesselProfile, buildSeams, radiusAt } from './modules/vessels3d.js';
import { VESSELS, LOCATIONS, HERO_MODEL, vesselById, locationById, generateSites, outlineBBox } from './data/vessels.js';
import { createAudio } from './modules/audio.js';
import { createFieldwork } from './modules/fieldwork.js';
import { loadProgress, saveProgress, markCompleted, isVesselUnlocked, completedCount, getLocked3D, saveLocked3D, activeSlot, setActiveSlot, SLOT_COUNT, listSlots, exportJSON, exportFileName, parseImport, importIntoSlot, backupBeforeImport, hasImportBackup, restoreImportBackup, toShareCode, fromShareCode } from './modules/progress.js';
import './immersive.css';
import { paintWorkshop, paintLandscape, kilnMemory, sealImage, qrPlaceholder } from './modules/workshop-art.js';
import { loadVesselModel, fitToHeight, extractGlazeSpec } from './modules/vessel-model.js';
import { exportShareCard } from './modules/share-card.js';
import { paintKilnChart, paintKilnFlow } from './modules/kiln-data.js';
import { ONLINE_MODE } from './config.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './reference-ui.css';
import './reference-fit.css';
import './culture.css';
import { CULTURE, CULTURE_SOURCES, REPAIR_LABELS, LAYER_LABELS, TRIANGLE_NOTE, STUDY_THEMES, layerChips, layerDetails } from './data/culture.js';
import { GUIDE_QILING, GUIDE_DISCLAIMER, hotspotByVessel } from './data/guide.js';
import { createGuidePanel } from './modules/guide-panel.js';
import { createGuideVoice } from './modules/guide-voice.js';
import { createGuideSubtitle } from './modules/guide-subtitle.js';
import { loadGuideSettings, saveGuideSettings, nearestRate } from './modules/guide-settings.js';
import { createGuideCharacter } from './modules/guide-character.js';
import { createGuideAgent } from './modules/guide-agent.js';
import { createMuseumTour } from './modules/museum-tour.js';
import { computePatternAngles, composeScanCanvas, makeScanTexture, matchScore } from './modules/scan-preview.js';
import { create3DFragments, magnetStage3D, snapFragment3D, disposeGoldSeams3D, P3D, fragmentAngle3D, fragmentDistance3D, fragmentGlazeMaterial, setFragmentEmissive, fadeFragmentEmissive, disposeFragmentMaterial } from './modules/puzzle3d.js';
import { create3DModelFragments } from './modules/model-fragments.js';
import { createPuzzle3DContext } from './modules/puzzle3d-bench.js';
import { createFinishing } from './modules/finishing.js';
import './guide.css';

const names=['start','cabinet','commission','puzzle','memory','choice','certificate','tour','exhibit'];
const labels=['启程','档案柜','委托','拼合','记忆','修复','重圆','考察','展厅'];
const $=s=>document.querySelector(s);
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile=matchMedia('(pointer: coarse)').matches;
let low=mobile||(navigator.hardwareConcurrency||8)<=4;
const baseLow=low;  // 会话级：初始自动判定结果，[恢复高画质] 以此为界（不写存档）
let slowDowngraded=false; // 会话级：是否因 slow>90ms 运行中降档
let view='start',busy=false,mode='traditional',repaired=0,selected=null,memoryIndex=0,lastAngleReady=false;
let nickname='无名修复师',record=null,exporting=false;
let tapSnap=false;
let saveSlot=activeSlot();
let progress=loadProgress(saveSlot);
let currentVessel=VESSELS[0],currentStories=currentVessel.stories,fragments=[],achievementShown=false;
const audio=createAudio();
// 真实器物照片预载：载入完成后若正展示该器物，重建纹理与器身。
// 拼合进行中（已有归位碎片）不打断；刚进入拼合页照片才到的情况也换上照片纹理，
// 并按拼合视图恢复可见性（器身隐藏、碎片显示）。
preloadRealTextures(id=>{
 if(!renderer||!currentVessel||currentVessel.id!==id)return;
 setVessel3D(currentVessel);
 if(view!=='puzzle'||repaired===0){
  setupPuzzleFragments(currentVessel);
  if(view==='puzzle'){vase.visible=false;ghost.visible=true;for(const f of fragments)f.mesh.visible=true;updateProgress();}
 }
});

$('#app').innerHTML=`
<div id="world" aria-hidden="true"><div class="background" data-depth="0.2"><canvas id="ink"></canvas><div class="lattice left"></div><div class="lattice right"></div><div class="moon"></div><div class="floor"></div></div></div><div id="halo"></div>
<header><a href="./" class="brand"><span class="brand-mark">瓷</span><span>碎瓷重圆<small>PORCELAIN · REUNITED</small></span></a><div class="header-right"><span class="tiny">数字修复室</span><button class="quiet" id="guide-entry" aria-haspopup="dialog">✦ 窑火问答</button><button class="quiet" id="save-entry" aria-haspopup="dialog" aria-label="修复存档：导出导入与多槽位">存档</button><button class="quiet" id="motion">轻触倾斜</button><button class="quiet" id="sound" aria-pressed="false">♫ 声音 · 关</button></div></header>
<main id="stage"><div id="vessel-stage" data-depth="0.5"><div id="fallback-vase"></div><div class="scan"></div><div id="hint-arrow" hidden>➤</div><div class="vessel-caption">青花花鸟纹梅瓶<small>昌江龙窑 · QH-1524</small></div></div>
<section class="screen" data-screen="start"><div class="hero-placard front" data-depth="0.6"><span class="placard-cn">景德镇</span><span class="placard-en">JINGDEZHEN<br>BLUE AND WHITE PORCELAIN</span><i class="placard-seal" aria-hidden="true">昌南</i></div><div class="hero-title front" data-depth="0.8"><div class="vertical-copy">千年之碎 · 今朝重圆<br>以数字之手 · 续写器物的第二次生命</div><h1 aria-label="碎瓷重圆">${[...'碎瓷重圆'].map(c=>`<span>${c}</span>`).join('')}</h1><span class="red-seal">惜物重生</span></div><div class="hero-en">REUNITE<br>THE<br>FRAGMENTS</div><article class="glass hero-card breathe front" data-depth="0.8" data-tilt><span class="card-orn" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21"/><path d="M14 30c0-7 4-11 10-11s10 4 10 11"/><path d="M24 19v-5M19 14h10"/><path d="M12 35h24"/></svg></span><p class="identity-line" id="hero-identity">你将以<b>数字修复师</b>的身份</p><div class="rule"></div><p class="muted">穿越时光，触摸瓷器的记忆<br>在破碎与重圆之间<br>让千年窑火，继续闪耀于数字世界</p><button class="primary" data-go="cabinet">开始修复 <b>→</b></button><button class="quiet exhibit-entry" data-go="exhibit">数字展厅 · 六器巡礼 →</button><button class="quiet guide-inline" id="guide-start" type="button">✦ 旅途中，可随时召唤数字讲解员 · 窑火问答</button><div class="card-foot">${completedCount(progress)}/6 已修复 · 约 5 分钟一器</div></article><ul class="hero-abilities" aria-label="体验四章"><li><span class="ab-icon" aria-hidden="true"><svg viewBox="0 0 44 44"><path d="M9 37V21a13 13 0 0 1 26 0v16"/><path d="M4 37h36"/><path d="M18 37V25a4 4 0 0 1 8 0v12"/></svg></span><b>探索历史</b><span>走进千年瓷都</span></li><li><span class="ab-icon" aria-hidden="true"><svg viewBox="0 0 44 44"><path d="M10 19h24l-3 13a8 8 0 0 1-8 6h-2a8 8 0 0 1-8-6z"/><path d="M6 19h32"/><path d="M22 21l-3 5 3 4-2 5"/></svg></span><b>修复瓷器</b><span>拼合破碎的记忆</span></li><li><span class="ab-icon" aria-hidden="true"><svg viewBox="0 0 44 44"><path d="M22 7c5 6 8 10 8 16a8 8 0 0 1-16 0c0-6 3-10 8-16z"/><path d="M22 23c2 2 3 4 3 6a3 3 0 1 1-6 0c0-2 1-4 3-6z"/></svg></span><b>感受工艺</b><span>体验匠心技艺</span></li><li><span class="ab-icon" aria-hidden="true"><svg viewBox="0 0 44 44"><path d="M12 9h18a4 4 0 0 1 4 4v22H16a4 4 0 0 1-4-4z"/><path d="M16 9v26"/><path d="M22 17h8M22 23h8"/></svg></span><b>传承之美</b><span>让文化重圆新生</span></li></ul><details class="hero-culture glass front" data-depth="0.6"><summary>十秒读懂 · 这是什么体验 →</summary><p class="culture-lead">一件瓷器，经过泥、火、笔与人的双手。当它破碎，我们修复的不只是形状，也在重新阅读它背后的技艺、生活与记忆。</p><ol class="culture-nodes" aria-label="四个内容节点"><li><b>一片瓷</b><span>材料、器型与纹样</span></li><li><b>一群人</b><span>画坯、烧窑、修补与使用者</span></li><li><b>一座城</b><span>景德镇的生产、生活和交流</span></li><li><b>一次选择</b><span>数字时代如何记录、修复和传播</span></li></ol><p class="small-note">真实资料负责解释文化 · 原创人物负责建立情感 · 你的双手负责形成体验</p></details></section>
<section class="screen" data-screen="cabinet" hidden><div class="screen-title"><span class="page-num">00 / ARCHIVE</span><h2>修复档案柜</h2><p class="muted">六件数字器物 · 青花、釉里红、颜色釉与玲珑瓷。修完一件，解锁下一件；每修满两件，开放一处写实考察点。</p><p class="small-note triangle-note">${TRIANGLE_NOTE}</p></div><div class="cabinet-grid" id="cabinet-grid"></div><div class="stage-status" id="cabinet-status"></div></section>
<section class="screen" data-screen="commission" hidden><div class="screen-title"><span class="page-num">01 / COMMISSION</span><h2>修复委托</h2></div><div class="archive-tag">一器一史 · 等候重圆</div><div class="commission-layout"><aside class="commission-rail" id="commission-rail"></aside><figure class="proto-card glass front" data-depth="0.6"><img id="proto-img" alt="器物原型参考：博物馆藏真实器物照片" loading="lazy"><figcaption><span class="overline">原型参考 · 故宫博物院藏</span><b id="proto-caption"></b><small id="proto-source"></small><small class="proto-note">本件数字器物为原创设定 · 图片来源见展签</small></figcaption></figure><article class="glass side-card paper-card front" data-depth="0.8" data-tilt><span class="paper-corner"></span><span class="overline" id="commission-code"></span><h2 id="commission-name"></h2><span class="tag pulse" id="commission-tag"></span><dl><dt>年代 / 类型</dt><dd id="commission-era"></dd><dt id="commission-person">委托人的心愿</dt><dd id="commission-quote"></dd><dt>修复任务</dt><dd id="commission-task"></dd></dl><label for="name" class="overline">修复师署名</label><input id="name" maxlength="20" autocomplete="nickname" placeholder="无名修复师"><p class="small-note">数字示意：器型与纹样为程序化复原 · 叙事为原创编年</p><button class="primary" id="accept-commission">接受委托 <b>→</b></button></article></div><div class="commission-foot"><div class="stage-hint">拖动器物 · 360° 旋转观察釉色与断口</div><button class="quiet knock-btn" id="knock-commission" type="button">轻叩瓷身 · 听声辨器</button></div><details class="craft-note"><summary>工艺注解 · 叩击听声</summary><p>叩击听声是传统辨瓷方法之一。旧时行家常以「声、色、形」综合判断：声以辨胎质的疏密与伤残，色看釉面与青花发色，形察器型与制作痕。声音清越悠长多为完好，沙哑短促常提示暗裂或修复痕。</p><p class="small-note">此处音频为 WebAudio 程序合成的简化示意，不是真实瓷器的录音，也不能替代专业的鉴定与检测。</p></details></section>
<section class="screen" data-screen="puzzle" hidden><div class="screen-title"><span class="page-num">02 / ASSEMBLY</span><h2 id="puzzle-title">拾片，归位。</h2></div><div class="puzzle-left"><span class="overline">THE RESTORER'S DESK</span><h3>它记得<br>自己在哪里。</h3><p>点击碎片即归位；<b>拖动任意位置</b>可 360° 环绕观察——归位瞬间金环标出粘合处，可边转边看接缝与贴合。<br>滚轮 / 双指缩放，右键拖动同样环视。<br>每归位一片，页面底部的修复进度就推进一格；全部归位后，整卷器物记忆才会展开。<br>双击已归位碎片，可查看纹样观察。</p><button class="quiet" id="culture-clue">读懂纹样 · 寻找线索 →</button><button class="quiet" id="pattern-ref">整幅纹样参考 ◎</button><button class="quiet" id="scan-btn" disabled>◎ 扫描成器 · 复原推演</button><button class="quiet" id="locate">✧ 提示位置</button><p class="scan-note" id="scan-note" hidden>数字示意 · 基于归位碎片推演，非考古复原</p><button class="quiet" id="reset">↺ 重新散落</button><button class="quiet" id="reset-view" hidden>⟲ 复位视角</button><button class="quiet tap-toggle" id="tap-mode" aria-pressed="false">点击吸附 · 关</button></div><aside class="glass puzzle-panel front" data-depth="0.8" data-tilt><span class="overline">RESTORATION / PROGRESS</span><div class="progress-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/><circle class="arc" cx="50" cy="50" r="44"/></svg><b id="progress">00 / 08</b></div><h2 id="puzzle-vessel"></h2><p class="muted" id="puzzle-count"></p><div class="tool-row"><button id="turn-left" aria-label="左转15度">↶</button><button id="turn-right" aria-label="右转15度">↷</button><button id="hint" aria-label="寻找归处">◎</button></div><button class="quiet" id="read-memory">翻阅器物长卷 →</button></aside><div class="repair-meter" id="repair-progress" role="progressbar" aria-label="整体修复完成度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="整体修复完成度 0%，已归位 0 片"><div class="rm-head"><span class="rm-label">整体修复完成度</span><b class="rm-value" id="rp-value">0%</b></div><div class="rm-track"><i class="rm-fill" id="rp-fill"></i><span class="rm-ticks" id="rp-ticks" aria-hidden="true"></span></div><div class="rm-foot"><span id="rp-count">0 / 0 片归位</span><span id="rp-hint">全部归位后展开器物长卷</span></div></div><div class="stage-status" id="status" role="status">选中一片瓷，让断开的笔画再次相接。</div></section>
<section class="screen" data-screen="memory" hidden aria-label="器物长卷 · 逐页阅读"><article class="memory-sheet paper-card" id="memory-sheet"><button class="memory-close" id="memory-close" aria-label="收起长卷，回到拼合台">×</button><span class="overline" id="memory-number">MEMORY SCROLL / 01</span><div class="memory-scroll-head"><span class="memory-scroll-label">器物长卷 · <b id="memory-vessel"></b></span><span class="memory-scroll-total" id="memory-total">共 8 页</span></div><div class="memory-content" id="memory-content"><div class="memory-art"><img id="memory-img" src="./patterns/memory-01.svg" alt="原创纹样记忆配图"></div><div><div class="memory-levels"><span>器物</span><span>景德镇</span><span>三百年</span></div><span class="memory-year" id="memory-year"></span><h2 id="memory-title"></h2><p class="memory-text" id="memory-text" aria-live="polite"></p><p class="small-note" id="memory-culture"></p><p class="small-note">器物第一人称 · 原创叙事</p></div></div><div class="memory-foot"><div class="memory-a11y" role="group" aria-label="正文字号"><span class="small-note">字号</span><button class="quiet" data-font="s" aria-pressed="false">小</button><button class="quiet" data-font="m" aria-pressed="true">中</button><button class="quiet" data-font="l" aria-pressed="false">大</button></div><div class="memory-turn" role="group" aria-label="长卷翻页"><button class="quiet memory-turn-btn" id="memory-prev">← 上一页</button><div class="memory-dots" id="memory-dots" role="group" aria-label="长卷页码"></div><span class="memory-pager" id="memory-pager" aria-live="polite">第 1 / 8 页</span><button class="quiet memory-turn-btn" id="memory-next-page">下一页 →</button></div><button class="primary" id="memory-next">读完全卷 · 进入修复抉择 <b>→</b></button></div></article></section>
<section class="screen" data-screen="choice" hidden><div class="choice-header"><span class="page-num">04 / THE DECISION</span><h2>裂痕，该如何留下？</h2><p class="muted" id="choice-kiln"></p><div class="choice-guide"><button class="quiet" id="guide-repair">✦ 引导 · 依次预览三种修复</button><button class="quiet" id="knock-choice">轻叩瓷身 · 先听一听</button><button class="quiet" id="guide-choice">✦ 问讲解员 · 三种修复的分别</button><ol class="guide-steps" aria-label="修复抉择三步"><li class="on">① 悬停或预览</li><li>② 叩声辨器</li><li>③ 落笔决定</li></ol></div></div><div class="choice-stage"><button class="glass choice-option left front" data-depth="0.8" data-mode="traditional" data-tilt><span class="choice-icon">◌</span><h2>隐痕修复</h2><p>尽量还原原貌，<br>让它回到过去。</p><span class="choose">选择此方案 →</span></button><div class="choice-divider"><span>或</span></div><button class="glass choice-option right front" data-depth="0.8" data-mode="kintsugi" data-tilt><span class="choice-icon">✧</span><h2>金线表达</h2><p>以金色线条点缀裂痕，<br>让它成为新的美。</p><span class="choose">选择此方案 →</span></button></div><button class="juci-choice" id="choose-juci">体验中国锔瓷 · 以钉接裂，以手惜物 →</button><button class="preserve-choice" data-mode="preserve">或许……有些伤痕不需要愈合？</button><details class="craft-note juci-craft"><summary>锔瓷 · 真实工序（体验为简化示意）</summary><ol class="craft-steps"><li><b>找碴对缝</b><span>先看清裂纹走向与碎片关系，比对断口，找出能严丝合缝的对位。</span></li><li><b>定位点记</b><span>在下钉处做标记，安排好锔钉的数量、间距与角度。</span></li><li><b>打孔</b><span>以金刚钻在标记处钻出与锔钉相配的浅孔，深浅、角度都要稳。</span></li><li><b>下钉</b><span>把锔钉两端嵌入孔中，轻敲使钉脚咬合，让裂片重新连为一体。</span></li><li><b>补漏</b><span>检查是否渗漏，必要时以黏合材料填缝，再打磨修整。</span></li></ol><p class="small-note">以上为传统工序的顺序性简介。本站互动为简化示意，不涉及真实钻孔、材料与工具，不构成操作指导，也不替代专业修复判断。</p></details><div class="stage-status">数字视觉表达 · 真实修复的每一笔都是承诺</div></section>
<section class="screen" data-screen="certificate" hidden><div class="screen-title"><span class="page-num">05 / REUNITED</span><h2 id="ending-title">青花，重绽。</h2></div><div class="certificate-vessel-note">器有裂 · 情无缺</div><article class="certificate front" id="certificate" data-depth="0.8" data-tilt><svg class="cert-border" preserveAspectRatio="none" viewBox="0 0 360 450"><rect x="1" y="1" width="358" height="448"/></svg><div class="overline">CERTIFICATE OF DIGITAL RESTORATION</div><span class="stamp">重圆</span><h2>修复证书</h2><p class="cert-tagline" id="cert-tagline" hidden></p><p id="cert-story"></p><dl><div><dt>修复师</dt><dd id="cert-name"></dd></div><div><dt>修复方式</dt><dd id="cert-mode"></dd></div><div><dt>器物档案</dt><dd id="cert-origin"></dd></div><div><dt>修复日期</dt><dd id="cert-date"></dd></div></dl><p class="small-note" id="cert-proto"></p><div class="rule"></div><p id="cert-philosophy"></p><label class="cert-note-label" for="cert-note">我的修复手记</label><input id="cert-note" maxlength="48" placeholder="写下一句，你希望它如何被记住"><div class="cert-id" id="cert-id"></div><span class="overline">数字时代，我们如何修复记忆？</span><img class="cert-seal" id="cert-seal" alt="修复师印章"></article><div class="cert-actions"><button class="primary" id="download">下载修复证书 <b>↓</b></button><button class="quiet" id="share-card">生成分享卡 ↓</button><a class="quiet" href="./journal/">阅读《瓷器记忆手记》 →</a><button class="quiet" id="exhibit">我的文化展签</button><button class="quiet" id="archive-card">我读懂的器物档案 ↓</button><button class="quiet" id="ethics">修复师守则</button><button class="quiet" id="guide-summary">✦ 问讲解员 · 总结我读懂的文化</button><button class="quiet" id="knock-cert">轻叩瓷身 · 听修复后的声</button><button class="quiet" id="go-tour">前往考察点 · 写实 3D <b>→</b></button><button class="quiet" id="next-vessel">回到档案柜 · 下一件</button><button class="quiet" data-go="choice">重新选择修复方式</button><small id="unlock-note">你的修复可以一键撤销。真实的文物修复，每一笔都是承诺。</small></div></section>
<section class="screen" data-screen="tour" hidden><div id="tour-stage"></div><div class="screen-title tour-title"><span class="page-num">06 / FIELDWORK</span><h2>景德镇实地考察 · 写实 3D</h2><p class="muted">三处写实景点：御窑厂 / 古窑 / 陶溪川。拖动旋转，对准建筑读取构件溯源。</p></div><div class="tour-map" id="tour-map"></div><div class="tour-console" id="tour-console"></div><div class="tour-hint">拖动旋转 · 滚轮 / 双指缩放 · 对准建筑读取构件溯源</div><button class="quiet tour-gyro" id="gyro">启用倾斜视线</button><button class="quiet tour-gyro" id="guide-tour">✦ 问讲解员 · 这三处考察点</button><aside id="tour-note" hidden></aside></section>
<section class="screen" data-screen="exhibit" hidden><div class="screen-title"><span class="page-num">07 / EXHIBITION</span><h2>数字展厅 · 六器巡礼</h2><p class="muted">无需任何进度即可进入。依次浏览六件器物的完整 3D 模型，拖拽旋转 · 滚轮缩放，右侧为固定展签。</p></div><nav class="exhibit-rail" id="exhibit-rail" aria-label="展厅器物列表"></nav><aside class="glass exhibit-placard front" data-depth="0.8" data-tilt><span class="overline">EXHIBIT / <b id="exhibit-index">01</b> OF 06</span><h2 id="exhibit-name"></h2><dl><div><dt>年代 / 类型</dt><dd id="exhibit-era"></dd></div><div><dt>釉色</dt><dd id="exhibit-glaze"></dd></div><div><dt>文化学习主题</dt><dd id="exhibit-study"></dd></div><div><dt>馆藏原型</dt><dd id="exhibit-proto"></dd></div></dl><figure class="exhibit-proto-figure"><img id="exhibit-proto-img" alt="" loading="lazy"></figure><p class="small-note exhibit-disclaimer">数字器物为原创设定，原型参考见图注出处。器物经历与人物为创作性编年。</p></aside><div class="exhibit-nav"><button class="quiet" id="exhibit-prev" aria-label="上一件器物">← 上一件</button><span id="exhibit-count" aria-live="polite"></span><button class="quiet" id="exhibit-next" aria-label="下一件器物">下一件 →</button><button class="quiet" id="exhibit-near" hidden aria-label="退出近观，恢复展厅照明">退出近观 ×</button></div><p class="exhibit-layers" id="exhibit-layers" aria-live="polite"></p><div class="exhibit-hotspots" id="exhibit-hotspots" aria-label="器物的纹样与工艺热点"></div><div class="tour-bar" id="exhibit-tourbar" hidden><div class="tour-progress"><i id="tour-fill"></i></div><button class="quiet" id="tour-toggle">暂停导览</button><button class="quiet" id="tour-skip">跳过本件</button><button class="quiet" id="tour-mute" aria-pressed="false">导览静音 · 关</button><button class="quiet" id="tour-exit">退出导览</button><span class="tour-count" id="tour-count">1 / 6</span></div><button class="quiet" id="tour-start">✦ 自动导览 · 六器巡礼</button><details class="exhibit-kiln glass"><summary>窑火数据 · 叙事示意 ◎</summary><canvas id="kiln-chart" width="360" height="190" role="img" aria-label="釉里红十窑九不成条形示意图"></canvas><canvas id="kiln-flow" width="360" height="150" role="img" aria-label="御窑落选即碎流程示意图"></canvas><p class="small-note">以上两图为创作示意，数字与步骤用于叙事，非史料统计。</p></details></section>
</main><div id="transition" aria-hidden="true">${Array.from({length:16},(_,i)=>`<i style="left:${i%4*25}%;top:${Math.floor(i/4)*25}%"></i>`).join('')}</div><div id="notice" role="status"></div><aside id="knowledge-drawer" class="knowledge-drawer" hidden><button class="quiet" id="close-drawer">关闭 ×</button><span class="overline" id="drawer-kicker"></span><h2 id="drawer-title"></h2><div id="drawer-body"></div></aside><section id="achievement" hidden role="dialog" aria-modal="true" aria-label="终局成就"><div class="achievement-card glass"><span class="overline">FINAL ACHIEVEMENT</span><h2>一镇瓷魂 · 千年窑火</h2><p class="muted">六件瓷重圆，三处实景走遍。昌江的月光落在展柜里——每一道裂痕都被温柔地回答过。</p><div class="achievement-seals">${VESSELS.map(v=>`<span class="seal-chip">${v.name.slice(2,5)}<i>${v.era}</i></span>`).join('')}</div><div class="rule"></div><p class="small-note">不修一只瓷瓶，复原一座镇。谢谢你，修复师。</p><button class="primary" id="achievement-close">留在这片月光里 <b>→</b></button></div></section><button class="quiet share-fab" id="share-fab" aria-haspopup="dialog">分享给朋友</button><aside id="share-overlay" class="share-overlay" hidden role="dialog" aria-modal="true" aria-label="分享给朋友"><div class="share-panel glass"><button class="quiet share-close" id="share-close" aria-label="关闭分享">×</button><span class="overline">SCAN TO PLAY</span><h2>扫码即玩</h2><img id="share-qr-img" alt="《碎瓷重圆》访问二维码（占位示意）"><p class="muted">扫码或把二维码分享给朋友，一起拾起散落的青花，接续一段生活。</p><p class="small-note">当前为程序化占位二维码；正式域名确定后，替换 public/share-qr.png 即可显示真实地址。</p></div></aside><aside id="save-overlay" class="save-overlay" hidden role="dialog" aria-modal="true" aria-label="修复存档：导出导入与多槽位"><div class="save-panel glass" id="save-panel"><button class="quiet save-close" id="save-close" aria-label="关闭存档面板">×</button><span class="overline">SAVE / SLOTS</span><h2>修复存档</h2><p class="small-note">进度只保存在此浏览器本地，可导出为文件备份，也可在三个槽位间分别记录。全程不上传任何数据。</p><div class="slot-cards" id="slot-cards"></div><div class="save-block"><h3>导出 / 导入</h3><label class="save-check"><input type="checkbox" id="export-keep-name" checked> 导出时包含修复师昵称（取消勾选则连昵称一并剔除）</label><div class="save-row"><button class="primary" id="export-save">导出存档 JSON ↓</button><label class="quiet save-file-label" for="import-file">导入存档文件 ↑</label><input type="file" id="import-file" accept="application/json,.json" hidden><button class="quiet" id="restore-backup" disabled>恢复导入前存档</button></div><p class="small-note">导出内容已剔除 open_id、邮箱、设备标识等个人数据；导入前会自动备份当前槽，随时可还原。</p></div><div class="save-block"><h3>分享码</h3><div class="save-row"><button class="quiet" id="copy-share">复制当前槽分享码</button><button class="quiet" id="import-share">导入分享码</button></div><textarea id="share-code" rows="3" placeholder="在此粘贴分享码，再点「导入分享码」" spellcheck="false" aria-label="分享码文本框"></textarea></div><p class="save-status" id="save-status" role="status"></p></div></aside><div id="model-bar" class="model-bar" hidden role="progressbar" aria-label="模型加载进度" aria-valuemin="0" aria-valuemax="100"><i id="model-bar-fill"></i></div><p class="model-bar-text" id="model-bar-text" hidden><span id="model-bar-label">正在加载模型…</span><button class="quiet" id="model-bar-retry" hidden>重试</button><button class="quiet" id="model-bar-skip" hidden>跳过</button></p><div class="quality-toast" id="quality-toast" hidden role="status"><span>已切换流畅模式（部分特效关闭）</span><button class="quiet" id="quality-restore">恢复高画质</button></div><p class="quality-note" id="quality-note" hidden aria-live="polite"></p>`;
document.body.classList.toggle('low-power',low);
const workshop=document.createElement('canvas');workshop.id='workshop';$('.background').prepend(workshop);paintWorkshop(workshop);
// 月洞拱窗内的青花水墨远山：只在启程页作为主背景，其余屏淡出。
const landscape=document.createElement('canvas');landscape.id='landscape';$('.moon').prepend(landscape);paintLandscape(landscape);
const rail=document.createElement('nav');rail.className='atelier-rail';rail.setAttribute('aria-label','修复流程');rail.innerHTML=names.map((n,i)=>`<button data-preview="${n}"><span>0${i+1}</span>${labels[i]}</button>`).join('');$('header').after(rail);
const portrait=document.createElement('img');portrait.id='cert-portrait';portrait.className='cert-portrait';portrait.alt='本次修复器物的实时渲染图';$('#certificate').prepend(portrait);
$('#motion').hidden=!mobile;
function notice(text){$('#notice').textContent=text;gsap.killTweensOf($('#notice'));gsap.to('#notice',{opacity:1,duration:.3});gsap.to('#notice',{opacity:0,delay:3,duration:.5});}

// —— ② 自动降档提示（会话级，不写存档） ——
// slow>90ms 触发运行中降档时顶一条顶部 toast，附 [恢复高画质]；恢复后若仍卡会再次自动降回。
let downgradeToastTimer=0;
function hideDowngradeToast(){
 const el=$('#quality-toast');if(!el||el.hidden)return;
 const done=()=>{el.hidden=true;el.style.opacity='';};
 gsap.killTweensOf(el);clearTimeout(hideDowngradeToast._t);
 gsap.to(el,{opacity:0,duration:.35,onComplete:done});hideDowngradeToast._t=setTimeout(done,550); // rAF 冻结兜底
}
function showDowngradeToast(){
 const el=$('#quality-toast');if(!el)return;
 clearTimeout(downgradeToastTimer);gsap.killTweensOf(el);
 el.hidden=false;el.style.opacity='';gsap.fromTo(el,{opacity:0,y:-8},{opacity:1,y:0,duration:.35,ease:'power2.out'});
 downgradeToastTimer=setTimeout(hideDowngradeToast,9000); // 9s 后自动收起；期间可点 [恢复高画质]
}
// [恢复高画质]：把运行中降档关掉的主通路特效回置。全息系统只有 degrade()、无 restore API，
// 因此全息细节不随恢复回退（低画质用户本也看不到差别），这是已知且可接受的边界。
function restoreHighQuality(){
 if(!renderer||baseLow)return;   // 首帧即判定低画质（移动端/低核心数）不提供恢复
 slowDowngraded=false;low=false;slow=0;frames=0;
 document.body.classList.remove('low-power');
 if(bloom)bloom.enabled=true;
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));
 if(dust&&dust.geometry.attributes.position)dust.geometry.setDrawRange(0,dust.geometry.attributes.position.count);
 renderer.shadowMap.enabled=true;
 if(light)light.castShadow=true;
 scene.traverse(o=>{const ms=Array.isArray(o.material)?o.material:(o.material?[o.material]:[]);for(const m of ms)m.needsUpdate=true;});
 resize();hideDowngradeToast();
 notice('已恢复高画质。若仍卡顿将自动切回流畅模式。');
}
$('#quality-restore').onclick=()=>restoreHighQuality();
// —— ③ 降级可感知文案：low/reduce 下相关屏一行非阻塞小字，2s 淡出（避免误以为故障） ——
let qualityNoteTimer=0;
function showQualityNote(text){
 const el=$('#quality-note');if(!el)return;
 clearTimeout(qualityNoteTimer);gsap.killTweensOf(el);
 el.textContent=text;el.hidden=false;el.style.opacity='';
 gsap.fromTo(el,{opacity:0,y:6},{opacity:1,y:0,duration:.35,ease:'power2.out'});
 qualityNoteTimer=setTimeout(()=>{gsap.to(el,{opacity:0,duration:.4});clearTimeout(showQualityNote._t);showQualityNote._t=setTimeout(()=>{el.hidden=true;el.style.opacity='';},600);},2000);
}
function openDrawer(kicker,title,body){$('#drawer-kicker').textContent=kicker;$('#drawer-title').textContent=title;$('#drawer-body').innerHTML=body;$('#knowledge-drawer').hidden=false;gsap.fromTo('#knowledge-drawer',{x:420},{x:0,duration:.55,ease:'power3.out'});$('#close-drawer').focus();}
$('#close-drawer').onclick=()=>gsap.to('#knowledge-drawer',{x:420,duration:.4,ease:'power2.in',onComplete:()=>{$('#knowledge-drawer').hidden=true;}});
// 真实模型缺失提示：纯网页运行、不依赖离线缓存；同一次会话同一器物只提示一次，避免展厅切换刷屏。
const modelMissingWarned=new Set();
function notifyModelUnavailable(name){
 const key=String(name||'器物');
 if(modelMissingWarned.has(key))return;
 modelMissingWarned.add(key);
 notice(`${key} 的真实 3D 模型暂不可用，已用程序化器身继续。`);
}

// ===== 存档：多槽位 / 导出导入 / 分享码（纯本地，不联网、不写回旧存档结构）=====
// 槽 1 沿用旧 key（旧存档无缝并入），槽 2/3 独立 key；所有读写默认落到「当前槽」。
function setSaveStatus(text,kind=''){const el=$('#save-status');if(!el)return;el.textContent=text;el.dataset.kind=kind;}
function updateHeroFoot(){const el=document.querySelector('.hero-card .card-foot');if(el)el.textContent=`${completedCount(progress)}/6 已修复 · 约 5 分钟一器`;}
function renderSavePanel(){
 const box=$('#slot-cards');if(!box)return;
 box.replaceChildren(...listSlots().map(s=>{
  const card=document.createElement('article');
  card.className='slot-card'+(s.active?' active':'')+(s.empty?' empty':'');
  card.innerHTML=`<span class="overline">SLOT ${String(s.slot).padStart(2,'0')}</span><b>完成 ${s.completed} / ${s.total}</b><p class="slot-meta">${s.userName||'未署名'} · ${s.lastDate||'暂无记录'}</p><button class="quiet slot-pick" data-slot="${s.slot}"${s.active?' disabled':''}>${s.active?'当前槽位':'切换到此槽'}</button>`;
  return card;
 }));
 box.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{applySlot(Number(b.dataset.slot));setSaveStatus(`已切换到槽位 ${b.dataset.slot}，进度已按该槽重载。`,'ok');});
 const rb=$('#restore-backup');if(rb)rb.disabled=!hasImportBackup();
}
// 切换槽位：即时重载 completed / certificates / puzzle3d，并刷新档案柜、拼合态、考察点与首屏计数。
function applySlot(target){
 saveSlot=setActiveSlot(target);
 progress=loadProgress(saveSlot);
 achievementShown=false;record=null;nickname='无名修复师';memoryIndex=0;selected=null;puzzle3DBridge?.select(null);
 // 先归零再按新槽重建：restoreLocked3D 在「新槽无锁定碎片」时会提前返回，必须由这里清零 repaired。
 repaired=0;for(const f of fragments){f.locked=false;f.revealed=false;}
 const nameEl=$('#name');if(nameEl)nameEl.value=progress.userName||'';
 if(renderer&&currentVessel?.fragments3d){setupPuzzleFragments(currentVessel);}
 else{for(const b of document.querySelectorAll('.fallback-fragment')){b.disabled=false;b.style.opacity='1';}}
 if(view==='puzzle'){if(vase)vase.visible=false;if(ghost)ghost.visible=true;for(const f of fragments)f.mesh.visible=true;updateProgress();refreshScanButton();}
 else updateProgress();
 renderCabinet();updateHeroFoot();
 if(view==='exhibit')renderExhibit();
 if(view==='tour'){const t=ensureTour();t.setCompleted(Object.keys(progress.completed));renderTourMap();}
 renderSavePanel();
}
// 导入：校验全部通过才写入；写入前自动备份当前槽（失败即取消，绝不覆盖现有进度）。
function applyImport(result,source){
 if(!result.ok){setSaveStatus(`导入失败：${result.error}（现有进度未改动）`,'err');notice('导入失败，现有存档未改动。');return false;}
 if(!backupBeforeImport(saveSlot)){setSaveStatus('导入前备份失败，已取消导入以保护现有进度。','err');return false;}
 importIntoSlot(result.progress,saveSlot);
 applySlot(saveSlot);
 setSaveStatus(`已从${source}导入到槽位 ${saveSlot}（原进度已备份，可点「恢复导入前存档」还原）。`,'ok');
 notice('导入成功，已覆盖当前槽位。');
 return true;
}
async function copyText(text,fallbackEl){
 try{await navigator.clipboard.writeText(text);return true;}catch{/* 非安全上下文/无权限，走兜底 */}
 try{fallbackEl.value=text;fallbackEl.select();const ok=document.execCommand('copy');fallbackEl.setSelectionRange(0,0);return ok;}catch{return false;}
}
function openSavePanel(){renderSavePanel();setSaveStatus('');$('#save-overlay').hidden=false;gsap.fromTo('#save-panel',{y:18,opacity:0},{y:0,opacity:1,duration:reduce?0:.4,ease:'power3.out'});$('#save-close').focus();}
$('#save-entry').onclick=openSavePanel;
$('#save-close').onclick=()=>{$('#save-overlay').hidden=true;};
$('#save-overlay').onclick=e=>{if(e.target===$('#save-overlay'))$('#save-overlay').hidden=true;};
addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#save-overlay').hidden)$('#save-overlay').hidden=true;});
$('#export-save').onclick=()=>{
 const includeUserName=$('#export-keep-name').checked;
 try{
  const blob=new Blob([exportJSON(progress,{includeUserName})],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=exportFileName();document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  setSaveStatus(includeUserName?'已导出存档（含修复师昵称；个人数据已剔除）。':'已导出存档（昵称与个人数据均已剔除）。','ok');
 }catch(e){console.error('Save export failed:',e);setSaveStatus('导出未完成，请重试。','err');}
};
$('#import-file').onchange=async e=>{
 const file=e.target.files?.[0];e.target.value='';
 if(!file)return;
 let text;try{text=await file.text();}catch{setSaveStatus('文件读取失败，现有进度未改动。','err');return;}
 applyImport(parseImport(text),'存档文件');
};
$('#copy-share').onclick=async()=>{
 const code=toShareCode(progress,{includeUserName:$('#export-keep-name').checked});
 if(!code){setSaveStatus('分享码生成失败。','err');return;}
 const ok=await copyText(code,$('#share-code'));
 setSaveStatus(ok?'分享码已复制到剪贴板（纯文本，无二维码库，不上传任何数据）。':'分享码已生成，请手动复制下方文本框内容。',ok?'ok':'');
};
$('#import-share').onclick=()=>{const box=$('#share-code');applyImport(fromShareCode(box.value),'分享码');};
$('#restore-backup').onclick=()=>{
 const r=restoreImportBackup();
 if(!r.ok){setSaveStatus(r.error,'err');renderSavePanel();return;}
 applySlot(r.slot);
 setSaveStatus(`已恢复槽位 ${r.slot} 导入前的存档。`,'ok');
 notice('已恢复导入前存档。');
};

// 三层 [-1,1] 指针坐标采用 lerp；同一方向的不同速度构成深度视差。
const pointer={x:0,y:0},smooth={x:0,y:0};
if(!mobile)window.addEventListener('pointermove',e=>{pointer.x=e.clientX/innerWidth*2-1;pointer.y=e.clientY/innerHeight*2-1;gsap.to('#halo',{x:e.clientX,y:e.clientY,duration:.45,ease:'power2.out',overwrite:true});});
const layers=[...document.querySelectorAll('[data-depth]')];
for(const card of document.querySelectorAll('[data-tilt]')){
 card.addEventListener('pointermove',e=>{if(mobile||reduce||certFocus)return;const b=card.getBoundingClientRect();const rx=THREE.MathUtils.clamp(-(e.clientY-b.top-b.height/2)/b.height*16,-8,8),ry=THREE.MathUtils.clamp((e.clientX-b.left-b.width/2)/b.width*16,-8,8);gsap.to(card,{rotateX:rx,rotateY:ry,duration:.5,overwrite:'auto'});});
 card.addEventListener('pointerleave',()=>gsap.to(card,{rotateX:0,rotateY:0,duration:.7}));
}
$('#motion').onclick=async()=>{try{if(typeof DeviceOrientationEvent==='undefined')throw new Error();if(DeviceOrientationEvent.requestPermission&&await DeviceOrientationEvent.requestPermission()!=='granted')throw new Error();window.addEventListener('deviceorientation',e=>{pointer.x=THREE.MathUtils.clamp((e.gamma||0)/35,-1,1);pointer.y=THREE.MathUtils.clamp((e.beta||0)/50,-1,1);});$('#motion').textContent='倾斜已开启';}catch{notice('此设备未允许方向感应，可继续触屏修复。');}};

// Canvas 2D 柔边墨斑背景，低透明度多圈叠加，零素材。
function inkPaint(){const c=$('#ink');c.width=1000;c.height=700;const ctx=c.getContext('2d');let seed=27;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<55;i++){const x=rand()*1000,y=rand()*550,r=30+rand()*110;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#2c4a7c35');g.addColorStop(.6,'#2c4a7c17');g.addColorStop(1,'#2c4a7c00');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}ctx.strokeStyle='#c9a96122';for(let j=0;j<3;j++){ctx.beginPath();for(let x=0;x<1000;x+=10){const y=420+Math.sin(x/130+j)*35+j*18;x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}}
inkPaint();if(!reduce)gsap.to('#ink',{rotation:6,duration:35,repeat:-1,yoyo:true,ease:'sine.inOut'});

// 声音：程序合成声景（audio.js）。开启后先铺窑火底噪。
$('#sound').onclick=async()=>{try{if(!audio.enabled){await audio.enable();audio.ambient('kiln');notice('窑火的低响里，偶有远瓷轻鸣。');}else await audio.disable();$('#sound').textContent='♫ 声音 · '+(audio.enabled?'开':'关');$('#sound').setAttribute('aria-pressed',String(audio.enabled));}catch{notice('声音暂不可用，仍可继续修复。');}};

let renderer,scene,camera,composer,bloom,vase,seamGroups={},light,vesselMaterial,interaction,ghost,hints=[],dust,effects=[],comparison;
// 主场景三盏灯提为模块级：拼合屏要整体收敛亮度（启程页仍用基准强度）。
let hemiLight=null,rimLight=null;
const BASE_LIGHT={hemi:2.6,key:4.8,rim:3};
// 真实 GLB：heroModel 只服务启程页，vesselModel 跟随当前器物；未就绪时一律回退程序化 vase。
let heroModel=null,vesselModel=null,heroReady=false,modelReady=false,heroTask=null,vesselHeight=6,envTexture=null;
const modelCache=new Map();
// 当前 3D 展示的器物（主流程为 currentVessel；展厅模式可临时切换而不写存档）。
let displayVessel=null;
// 已挂载进场景的真实模型，切换时统一隐藏，避免多个器型叠加。
const mountedModels=new Set();
let tour=null;
let finishing=null; // 四种修复方式的差异化完成收尾（traditional/juci/preserve；kintsugi 走全息金缮终章）
const wrap=$('#vessel-stage');
function setup3D(){scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-5,5,4.8,-4.8,.1,100);camera.position.set(0,0,18);renderer=new THREE.WebGLRenderer({alpha:true,antialias:!low,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,low?1.25:1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.setClearColor(0x1a2332,0);
// 阴影分级（任务 A4/C7）：桌面档 PCFSoft 软阴影（碎片→碎碴彼此/成品），移动/低电档关闭
renderer.shadowMap.enabled=!low;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.domElement.setAttribute('aria-label','瓷瓶画布：拖动可 360 度旋转查看器型');wrap.prepend(renderer.domElement);composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));bloom=new UnrealBloomPass(new THREE.Vector2(600,600),.45,.4,1.15);bloom.enabled=!low;composer.addPass(bloom);composer.addPass(new OutputPass());hemiLight=new THREE.HemisphereLight(0xe7f0ff,0x2c4a7c,BASE_LIGHT.hemi);scene.add(hemiLight);light=new THREE.DirectionalLight(0xffefce,BASE_LIGHT.key);light.position.set(-3,4,7);scene.add(light);rimLight=new THREE.DirectionalLight(0x9bbbf1,BASE_LIGHT.rim);rimLight.position.set(4,2,-2);scene.add(rimLight);
// 主光投影（任务 A4）：覆盖碎片散落环 + 悬浮拼合面；低画质不开
if(!low){light.castShadow=true;light.shadow.mapSize.set(1024,1024);const sc=light.shadow.camera;sc.left=sc.bottom=-9;sc.right=sc.top=9;sc.near=1;sc.far=40;light.shadow.bias=-.0004;light.shadow.normalBias=.03;light.shadow.radius=4;}
 setVessel3D(currentVessel);
 finishing=createFinishing(scene,{low,reduce});
 ghost=new THREE.Group();scene.add(ghost);ghost.visible=false;
 const count=low?45:110;const pos=new Float32Array(count*3);for(let i=0;i<count;i++)pos.set([(Math.random()-.5)*13,(Math.random()-.5)*10,-2-Math.random()*3],i*3);dust=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(pos,3)),new THREE.PointsMaterial({size:.026,color:0xc9a961,transparent:true,opacity:.35}));scene.add(dust);
 interaction=installInteraction({canvas:renderer.domElement,camera,fragments:()=>fragments,enabled:()=>view==='puzzle'&&!busy&&!puzzle3DBridge,onSelect:f=>{if(selected&&!selected.locked)gsap.to(selected.mesh.scale,{x:1,y:1,z:1,duration:.2});selected=f;if(f&&!f.locked)gsap.to(f.mesh.scale,{x:1.1,y:1.1,z:1.1,duration:.22,ease:'power2.out'});document.body.classList.toggle('dragging',Boolean(f));},onMove:(f,rotating)=>{
   const distance=f.mesh.position.distanceTo(f.correctPosition),angle=Math.abs(normalizeAngle(f.mesh.rotation.z-f.correctRotation));
   // 磁感阶段一：提示性偏向力（不吸附），边缘泛起极淡青光——是器物自己记得位置。
   if(!rotating&&distance<MAGNET_DISTANCE){f.mesh.position.lerp(f.correctPosition,.12);const target=ghost.children[fragments.indexOf(f)];if(target&&!(locateFlash.until>performance.now()&&locateFlash.i===fragments.indexOf(f))){target.material.opacity=.22;target.material.color.set(0x70b7c6);}if(!$('#hint-arrow').hidden)$('#status').textContent='微弱的牵引从断口传来——它记得这里。';}
   if(!rotating)updateDragHint(f);
   const ready=angle<Math.PI/18;if(ready&&!lastAngleReady){audio.chime(1320);$('#status').textContent='纹路接上了——现在把它推回原位。';}lastAngleReady=ready;
 },onRelease:f=>{document.body.classList.remove('dragging');clearDragHint();if(!attemptSnap(f)){gsap.to(f.mesh.scale,{x:1,y:1,z:1,duration:.25});const neighborNear=f.adjacent.some(i=>fragments[i].locked&&f.mesh.position.distanceTo(fragments[i].correctPosition)<.65);if(neighborNear){gsap.fromTo(f.mesh.position,{x:f.mesh.position.x},{x:f.mesh.position.x+.08,duration:.08,yoyo:true,repeat:3});$('#status').textContent='断口相近，却不是它的位置。再看一眼纹样。';}}},tapMode:()=>tapSnap,onTap:f=>{if(!attemptSnap(f)){const neighborNear=f.adjacent.some(i=>fragments[i].locked&&f.mesh.position.distanceTo(fragments[i].correctPosition)<.65);$('#status').textContent=neighborNear?'断口相近，却不是它的位置。再看一眼纹样。':'这里不是它的归处——再靠近纹样投影一点。';}}});
 resize();scatterPuzzle();
 let drag=null;renderer.domElement.addEventListener('pointerdown',e=>{if(view==='puzzle')return;drag={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);});renderer.domElement.addEventListener('pointermove',e=>{if(drag&&view!=='puzzle'){rotateDisplay(e.clientX-drag.x,e.clientY-drag.y);drag={x:e.clientX,y:e.clientY};}});for(const type of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(type,()=>drag=null);
 wrap.addEventListener('pointerenter',()=>wrap.classList.add('scanning'));wrap.addEventListener('pointerleave',()=>wrap.classList.remove('scanning'));
 renderer.domElement.addEventListener('dblclick',event=>{if(view!=='puzzle')return;const rect=renderer.domElement.getBoundingClientRect(),ndc=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);const hit=ray.intersectObjects(fragments.filter(f=>f.locked).map(f=>f.mesh),false)[0];if(!hit)return;showCultureClue();});
}
// 真 3D 瓷瓶：由器型轮廓生成 LatheGeometry；三种修复方式的金/灰/墨缝各备一组。
function setVessel3D(vessel){
 if(!renderer)return;
 finishing?.clear?.(); // 旧器身的收尾动画组随重建一并释放
 displayVessel=vessel;
 if(vase){scene.remove(vase);vase.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.();});}
 seamGroups={};
 // 3D 器身用环绕纹理（花纹镜像平铺包住 360°）；拼图碎片另行使用整幅平面纹理。
 const texture=makeVesselTexture(vessel,{wrap:true});
 const built=buildVesselMesh(vessel,texture,{mode:null,physical:!low});
 vase=built;vesselMaterial=built.userData.material;
 const profile=vesselProfile(vessel.outline);
 for(const m of ['traditional','kintsugi','preserve','juci']){const g=buildSeams(profile,m,vessel.textureSeed,7+vessel.index);g.visible=false;vase.add(g);seamGroups[m]=g;}
 scene.add(vase);
 // 两种修复同时展示，共用器型与纹理；几何只在切换器物时创建。
 if(comparison){scene.remove(comparison);comparison.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.();});}
 comparison=new THREE.Group();
 for(const [i,m] of ['traditional','kintsugi'].entries()){
  const model=buildVesselMesh(vessel,texture,{mode:m,physical:!low});
  model.scale.setScalar(.7);model.position.x=i?1.7:-1.7;model.rotation.y=-.35;
  if(!i)model.userData.material.color?.set(0xd2d9e3);
  comparison.add(model);
 }
 comparison.visible=false;scene.add(comparison);
 // 程序化器身高度作为取景基准：真实 GLB 归一到此高度，换模型后构图不变。
 // 只量器壁本体（LatheGeometry 网格）：seamGroups 虽不可见，但管状缝/锔钉会撑大包围盒，
 // 用整组量会让 vesselHeight 多出 0.4~0.6，GLB 被放大、对花/缝线随之错位。
 const bodyMesh=vase.children.find(o=>o.isMesh);
 vesselHeight=new THREE.Box3().setFromObject(bodyMesh||vase).getSize(new THREE.Vector3()).y||vesselHeight;
 vase.rotation.set(-.045,-.35,0);
 // 装饰碎片只在开始页环绕。
 scene.children.filter(o=>o.userData.decor).forEach(o=>{scene.remove(o);o.geometry?.dispose?.();});
 if(!low)for(let i=0;i<8;i++){const shard=new THREE.Mesh(new THREE.TetrahedronGeometry(.24),vesselMaterial);const angle=i*Math.PI*2/8;shard.position.set(Math.cos(angle)*9,Math.sin(angle)*8,1);scene.add(shard);gsap.to(shard.position,{x:Math.cos(angle)*2.5,y:Math.sin(angle)*3.2,z:.8,duration:reduce?0:1.2,ease:'power3.out',delay:i*.025});gsap.to(shard.rotation,{x:2,y:1,duration:1.2});shard.userData.decor=true;}
 applyModelVisibility();showVesselModel(vessel);ensureHeroModel();
}

// —— 瓷器展示分级 ——
// 启程页保留原有亮度；其余所有页都降一档：降低曝光、环境反射、高光与绒光（sheen），
// 同时把釉面粗糙度略作放大，让高光从"镜面亮点"变成"柔和釉光"，避免过曝与塑料感，
// 但保留贴图上的青花纹样与釉面细节。
// 分两档：display = 档案柜 / 委托 / 记忆 / 抉择 / 证书 / 展厅（真实 GLB 展示）；
//        puzzle = 拼合屏成品（程序化碎片，自带 clearcoat + sheen + 对花投影，需更狠一档）。
// 只作用于瓷器自身材质与泛光强度，不动界面层与金缮光效；启程页保持原值不动。
const PORCELAIN_GRADE={
 start:{exposure:1,env:.55,specular:1,roughness:1,metalness:1,sheen:1,bloom:.45,light:1},
 display:{exposure:.6,env:.08,specular:.26,roughness:1.5,metalness:.8,sheen:.42,bloom:.45,light:1},
 puzzle:{exposure:.7,env:.12,specular:.22,roughness:1.35,metalness:.9,sheen:.22,bloom:.16,light:.5}
};
const PORCELAIN_GRADE_VIEWS=new Set(['cabinet','commission','memory','choice','certificate','exhibit']);
const gradeOf=()=>PORCELAIN_GRADE_VIEWS.has(view)?PORCELAIN_GRADE.display:(view==='start'?PORCELAIN_GRADE.start:PORCELAIN_GRADE.puzzle);
// 釉面材质统一收敛：环境反射 / 高光 / 粗糙度 / 金属度。
// 粗糙度与金属度按"基值 × 倍数"处理（GLB 基值 1；碎片基值约 .24），
// 首次分级时记下基值，回到启程页即可精确还原，不破坏每片碎片自身的微差。
function gradeGlazeMaterial(m,grade){
 if(!m)return;
 if('envMapIntensity' in m)m.envMapIntensity=grade.env;
 if('specularIntensity' in m)m.specularIntensity=grade.specular;
 if('roughness' in m){m.userData.__baseRoughness??=m.roughness;m.roughness=m.userData.__baseRoughness*(grade.roughness??1);}
 if('metalness' in m){m.userData.__baseMetalness??=m.metalness;m.metalness=m.userData.__baseMetalness*(grade.metalness??1);}
}
function gradePorcelain(){
 if(!renderer)return;
 const grade=gradeOf();
 renderer.toneMappingExposure=grade.exposure;
 // 主光收敛：瓷面反射主要由三盏灯驱动，拼合屏降档后才能从"一片白"回到可读的釉面。
 // （choice / certificate 屏的 light.intensity 由 repairVisual 再覆盖，不受影响）
 if(hemiLight)hemiLight.intensity=BASE_LIGHT.hemi*(grade.light??1);
 if(light)light.intensity=BASE_LIGHT.key*(grade.light??1);
 if(rimLight)rimLight.intensity=BASE_LIGHT.rim*(grade.light??1);
 // 泛光只按"启程 / 拼合"两档收敛；展示页的强度由 repairVisual 按修复方式驱动，不在这里抢
 if(bloom&&!low&&(view==='start'||!PORCELAIN_GRADE_VIEWS.has(view)))bloom.strength=grade.bloom;
 // ① 真实 GLB 瓷器：环境反射、高光、釉面粗糙度收敛
 for(const root of mountedModels)root.traverse(node=>{
  if(!node.isMesh)return;
  for(const m of (Array.isArray(node.material)?node.material:[node.material]))gradeGlazeMaterial(m,grade);
 });
 // ② 拼合屏的碎片成品：同一档收敛（这些材质不走 GLB 那条路，必须单独处理）
 for(const f of fragments){
  const m=fragmentGlazeMaterial(f);
  if(!m)continue;
  gradeGlazeMaterial(m,grade);
  if(typeof m.sheen==='number')m.sheen=grade.sheen;
 }
}

// —— 真实 GLB 接入 ——
// 程序化器身始终先建好：它既是加载失败时的兜底，也是拼合页的碎片来源。
// GLB 就绪后按当前视图接管显示，两者互斥。
function applyModelVisibility(){
 if(!renderer)return;
 // 抉择/工序/证书屏统一用当前器物的真实 GLB，保证"修什么、证书上就是什么"；仅拼合/考察/启程屏不用。
 const on=!['puzzle','tour'].includes(view);
 const heroOn=on&&view==='start'&&heroReady;
 const modelOn=on&&view!=='start'&&modelReady;
 if(heroModel)heroModel.visible=heroOn;
 if(vesselModel)vesselModel.visible=modelOn;
 if(vase)vase.visible=on&&!heroOn&&!modelOn;
 // 环绕装饰碎片只属于启程页：换屏后它们会飘在展柜/展厅画面里，像无端飞散的碎碴。
 scene.children.forEach(o=>{if(o.userData.decor)o.visible=view==='start';});
 gradePorcelain();
 fitDisplay();   // 展示对象变了就重新取景：换器/换屏都保证整器入画
}

// 一次加载，多处复用：同一条路径只下载/解析一次；进度按路径记录，供顶部进度条读取。
const modelProgress=new Map(); // path -> { started, frac, done, ok }
function getModel(path){
 if(!modelCache.has(path)){
  const rec={started:false,frac:null,done:false,ok:false};modelProgress.set(path,rec);
  modelCache.set(path,loadVesselModel(path,{onProgress:frac=>{rec.started=true;rec.frac=frac;}}).then(res=>{rec.done=true;rec.ok=res.ok;return res;}));
 }
 return modelCache.get(path);
}
function modelDone(path){const rec=modelProgress.get(path);return Boolean(rec&&rec.done&&rec.ok);}
// 重试：清缓存后按同一条路径重新 load（进度记录一并重置）。
function clearModelTask(path){modelCache.delete(path);modelProgress.delete(path);}

// —— ① 模型加载进度条 ——
// 只在「需要真实 GLB 的屏」且该器物未缓存时显示：抉择/证书屏走进度条，其余展示屏静默预取。
// total=0 时用不确定进度动画；完成 0.4s 淡出；失败/15s 无完成回调判定失败 → [重试]（一次）/[跳过]（程序化兜底）。
const GLB_VIEWS=new Set(['commission','memory','choice','certificate','exhibit']); // 展示真实 GLB 的屏
const GLB_BAR_VIEWS=new Set(['choice','certificate']);                          // 显示进度条的屏
const modelSkipped=new Set(); // 本会话内用户选择跳过 → 不再打扰（会话级，不写存档）
let modelUi=null;
const modelBar=()=>$('#model-bar'), modelBarText=()=>$('#model-bar-text');
function showModelBar(label){
 const bar=modelBar(),text=modelBarText();if(!bar||!text)return;
 gsap.killTweensOf(bar);bar.hidden=false;bar.style.opacity='';bar.classList.add('indeterminate');bar.classList.remove('failed');
 $('#model-bar-fill').style.width='';$('#model-bar-label').textContent=label;
 $('#model-bar-retry').hidden=true;$('#model-bar-skip').hidden=true;text.hidden=false;
}
function hideModelBar(){
 const bar=modelBar(),text=modelBarText();if(!bar||bar.hidden)return;
 // 收起后复位：0.4s 淡出，另加超时兜底——rAF 被节流/后台标签冻结时 gsap 的 onComplete 不触发，
 // 若无兜底进度条会一直挂着（与转场看门狗同一类问题）。
 const done=()=>{bar.hidden=true;bar.style.opacity='';bar.classList.remove('indeterminate','failed');$('#model-bar-fill').style.width='0';if(text)text.hidden=true;};
 gsap.killTweensOf(bar);
 clearTimeout(hideModelBar._t);gsap.to(bar,{opacity:0,duration:.4,onComplete:done});hideModelBar._t=setTimeout(done,600);
}
function settleModelUi(ok){
 const st=modelUi;if(!st)return;
 st.settled=true;clearInterval(st.ticker);clearTimeout(st.watchdog);
 if(ok)hideModelBar();
}
function showModelFail(timeout){
 const st=modelUi;
 if(st){st.settled=true;clearInterval(st.ticker);clearTimeout(st.watchdog);}
 // 已离开需要进度条的屏：不弹失败条（模型失败由程序化器身静默兜底，避免无关屏被打扰）。
 if(!GLB_BAR_VIEWS.has(view))return;
 const bar=modelBar(),text=modelBarText();if(!bar)return;
 bar.hidden=false;bar.style.opacity='';bar.classList.remove('indeterminate');bar.classList.add('failed');
 $('#model-bar-fill').style.width='100%';
 $('#model-bar-label').textContent=timeout?'模型加载失败：超时未完成':'模型加载失败';
 $('#model-bar-retry').hidden=!st||st.retries>=1;   // 允许单次重试
 $('#model-bar-skip').hidden=false;if(text)text.hidden=false;
}
function beginModelLoad(vessel){
 const bar=modelBar();if(!bar)return;
 const same=modelUi&&modelUi.path===vessel.model;
 if(same&&!modelUi.settled)return; // 同一器物正在加载：不重复顶条
 modelUi={path:vessel.model,vessel,retries:same?modelUi.retries:0,ticker:0,watchdog:0,settled:false};
 showModelBar(`正在加载${vessel.name}模型…`);
 modelUi.ticker=setInterval(()=>{
  const st=modelUi;if(!st||st.settled)return;
  const rec=modelProgress.get(st.path),el=modelBar();if(!el||el.hidden)return;
  const ind=!(rec&&rec.started);el.classList.toggle('indeterminate',ind);
  const fill=$('#model-bar-fill');
  if(ind||rec.frac==null)fill.style.width='';                       // 不确定进度：交给 CSS 动画
  else fill.style.width=(Math.min(1,rec.frac)*100).toFixed(1)+'%';
 },140);
 clearTimeout(modelUi.watchdog);
 modelUi.watchdog=setTimeout(()=>{if(modelUi&&!modelUi.settled)showModelFail(true);},15000);
}
// 载入并挂载当前器物的真实 GLB；ui=true 时承担进度条与失败提示。
function attachVesselModel(vessel,ui){
 const path=vessel.model;
 getModel(path).then(res=>{
  if(!res.ok){
   if(ui)showModelFail(false);
   else if(displayVessel?.model===path)notifyModelUnavailable(vessel.name);
   return;
  }
  if(displayVessel?.model!==path){if(ui)settleModelUi(true);return;}
  vesselModel=mountModel(res.root);modelReady=true;applyModelVisibility();
  resize(); // 真实 GLB 挂载后按实际器身包围盒重算取景，保证窄屏下整器四边不被裁切
  if(ui)settleModelUi(true);
 });
}
$('#model-bar-retry').onclick=()=>{
 const st=modelUi;if(!st||st.retries>=1)return;   // 允许单次重试
 const retries=st.retries+1, vessel=st.vessel;
 st.settled=true;clearInterval(st.ticker);clearTimeout(st.watchdog); // 停掉上一轮计时
 clearModelTask(st.path);           // 清 modelCache / 进度记录后重新 load
 beginModelLoad(vessel);            // 同路径 → retries 顺延
 if(modelUi)modelUi.retries=retries;
 attachVesselModel(vessel,true);
};
$('#model-bar-skip').onclick=()=>{
 const st=modelUi;
 if(st){modelSkipped.add(st.path);st.settled=true;clearInterval(st.ticker);clearTimeout(st.watchdog);}
 hideModelBar();notice('已改用程序化器身继续，修复流程不受影响。');
};
// ④ 预取：进入拼合屏后按空闲时段加载当前器物 GLB 并挂到全息工作台（低画质不预取；失败静默忽略）。
// 低画质：不做空闲预取，仅在本屏按需挂载（保证金缮终章成品仍可用，不改变原有画面）。
function prefetchVesselModel(vessel){
 if(!renderer||!vessel?.model)return;
 const path=vessel.model;
 if(puzzleModelAttached&&puzzleModelPath===path)return;  // 全息成品已挂载
 if(modelSkipped.has(path))return;                       // 用户已在证书屏选择程序化兜底
 const run=()=>attachPuzzleVesselModel(vessel);          // 加载 + 挂载（getModel 内部缓存去重，res.ok=false 静默）
 if(low){run();return;}
 if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:2500});
 else setTimeout(run,700);
}

// 挂载 GLB 到场景：居中、缩放、与程序化器身同角度；envMap 提升釉面反射。
function ensureEnvTexture(){
 if(envTexture||!renderer)return envTexture;
 const pmrem=new THREE.PMREMGenerator(renderer);envTexture=pmrem.fromScene(new RoomEnvironment(),.04).texture;pmrem.dispose();
 return envTexture;
}
function mountModel(root){
 if(root.userData.mounted)return root;
 root.userData.mounted=true;
 fitToHeight(root,vesselHeight);
 root.rotation.set(-.045,-.35,0);
 // 记录居中后的基准高度：呼吸浮动必须相对它叠加，否则会把居中位移覆盖掉。
 root.userData.baseY=root.position.y;
 root.traverse(node=>{
  if(!node.isMesh)return;
  for(const m of (Array.isArray(node.material)?node.material:[node.material])){
   if(!m||!('envMap'in m))continue;
   m.envMap=ensureEnvTexture();m.envMapIntensity=.55;m.needsUpdate=true;
  }
 });
 scene.add(root);
 mountedModels.add(root);
 root.userData.__boxDirty=true;
 gradePorcelain(); // 挂载时材质刚被设为原亮度 → 立即按当前视图分级
 fitDisplay();     // 模型刚挂上：按它的真实包围盒重新取景（整器完整入画）
 return root;
}

// 启程页主角：只尝试一次，失败即静默沿用程序化器身。
function ensureHeroModel(){
 if(heroTask||!renderer)return;
 heroTask=getModel(HERO_MODEL).then(res=>{
  if(!res.ok)return;
  heroModel=mountModel(res.root);
  heroReady=true;
  applyModelVisibility();
 });
}

// 当前器物的真实模型：切换器物时只换可见对象，缓存不重复下载。
// 视图门控：仅真正展示真实 GLB 的屏（GLB_VIEWS）才触发加载；启程/拼合/考察保留程序化兜底，
// 拼合屏改为进入后空闲预取（prefetchVesselModel），使拼合→抉择切换不再等待下载。
function showVesselModel(vessel){
 if(!renderer||!vessel?.model)return;
 const path=vessel.model;
 // 同一路径的模型已挂载：只同步可见性，不重复处理（也避免重复挂载/闪烁）。
 if(vesselModel&&vesselModel.name===path){modelReady=true;applyModelVisibility();return;}
 // 切换期间先隐藏所有已挂载模型，避免上一个器型残留可见。
 for(const m of mountedModels)m.visible=false;
 modelReady=false;applyModelVisibility();
 if(!GLB_VIEWS.has(view))return;
 // 首次进入且未缓存、用户未跳过 → 顶起进度条；其余情况静默加载/等待预取完成。
 const ui=GLB_BAR_VIEWS.has(view)&&!modelDone(path)&&!modelSkipped.has(path);
 if(ui)beginModelLoad(vessel);
 attachVesselModel(vessel,ui);
}

// 拖拽旋转作用在当前可见的器身上（程序化或真实模型）。
function displayTarget(){return [heroModel,vesselModel,vase].find(o=>o&&o.visible);}
function rotateDisplay(dx,dy){
 const target=displayTarget();
 if(!target)return;
 target.rotation.y+=dx*.008;
 target.rotation.x=THREE.MathUtils.clamp(target.rotation.x+dy*.003,-.5,.5);
}
// 3D 沉浸式拼合：优先启用 3D 碎片与工作台；低性能或 WebGL 不可用时自动回退 2D。
let puzzle3DBridge=null;
// 3D 碎片共享纹理（3D 路径专属）。注意：vesselTex 在 3D/2D 两路径是同一对象，
// 不能因 3D 路径失败就 dispose 掉它——2D 回退路径仍要复用 vesselTex。
// 纹理的真正生命周期由 fragments 集合决定：setupPuzzleFragments 开头清上一轮 3D 工作台时，
// 随 3D 碎片 mesh 一并释放（见下方 disposePuzzle3DResources 内对 f.mesh.material.map 的处理）。
function disposePuzzle3DResources(){
  // 幂等：重复调用不崩（bridge.dispose 内部 _cleanup 已 delete、scene.remove / dispose 均可重复）。
  // 离开拼合屏前记下观众当前的观察角度（缩放/平移/环绕）——去记忆屏看完再回来仍是同一个视角，
  // 便于继续端详刚粘上的那片（视角只在本器物内沿用，切换器物或重新散落会重新取景）。
  if(puzzle3DBridge){
    savedPuzzleView={
      vesselId:currentVessel?.id??null,
      zoom:puzzle3DBridge.view?.zoom??1,
      panX:puzzle3DBridge.view?.panX??0,
      panY:puzzle3DBridge.view?.panY??0,
      yaw:puzzle3DBridge.orbit?.yaw??0,
      pitch:puzzle3DBridge.orbit?.pitch??0
    };
  }
  disposeGoldSeams3D(fragments);   // 金线折线几何 + 共享金线材质（任务 C9）
  try{puzzle3DBridge?.dispose?.();}catch(e){console.warn('3D 工作台清理异常（已忽略）：',e);}
  puzzle3DBridge=null;
}
// 保存的观察角度（{vesselId, zoom, panX, panY, yaw, pitch} | null）：仅同器物的切屏往返沿用。
let savedPuzzleView=null;
// 拼合屏全息成品 GLB 的挂载状态：改为进入拼合屏后再加载（见 prefetchVesselModel / attachPuzzleVesselModel），
// 避免在启程/委托屏就把 GLB 预载完——否则「首次进证书屏」永远看不到加载进度条。
let puzzleModelPath=null,puzzleModelPending=false,puzzleModelAttached=false;
let puzzleSetupSeq=0;
async function setupPuzzleFragments(vessel){
 const setupSeq=++puzzleSetupSeq;
 disposePuzzle3DResources();
 puzzleModelPath=null;puzzleModelPending=false;puzzleModelAttached=false; // 新工作台/碎片：全息成品 GLB 需重新挂载
 if(interaction)interaction.clear();
 for(const f of fragments){
  // 先释放上一轮 3D 碎片的共享纹理（3D 碎片 material.map 与对花投影 outline.material.map 都引用它）；
  // 2D 碎片 material.map 也引用 vesselTex，但 2D 路径会重建 material，这里统一 dispose 安全。
  scene.remove(f.mesh);f.mesh.geometry.dispose();disposeFragmentMaterial(f.mesh.material);
  f.ghost?.material?.dispose?.();f.ghost?.geometry?.dispose?.();
 }
 hideScanPreview();
 ghost.clear();
 // 3D 碎片必须用「环绕纹样」纹理（wrap:true）：3D 碎片 UV 按整周周向角映射，
 // 若混入带馆藏照片底图的整幅平面纹理，照片的灰色摄影背景与纹样带会被错误平铺到器身，
 // 呈现为杂乱的“鱼鳞纹”。整幅纹理（含照片底图）仅保留给 2D 回退路径。
 const vesselTex=makeVesselTexture(vessel);
 const vesselTexWrap=makeVesselTexture(vessel,{wrap:true});

 // 3D 路径（WebGL 可用即启用；低画质只降材质/粒子/阴影，不再退回 2D 平面碎片——
 // 移动端与桌面呈现的碎片形态特征必须一致，几何/裂纹/断面完全同源）
 const enable3D = renderer && !reduce && vessel.fragments3d;
  if (enable3D) {
   try {
     // 碎片优先从「用户 GLB 模型本体」切割：几何/贴图/断面全部来自模型自身，
     // 拼合结果与展柜里的模型严格同源；GLB 加载失败或切割异常才回退程序化碎片。
     let built = null;
     if (vessel.model) {
       try {
         const res = await getModel(vessel.model);
         if (setupSeq !== puzzleSetupSeq) return; // 期间被新的装配请求取代
         if (res.ok) built = create3DModelFragments(vessel, res.root, { low, quality: low ? 'low' : 'high' });
       } catch (err) { console.warn('模型本体碎片构建失败，回退程序化碎片：', err); }
     }
     if (!built) built = create3DFragments(vessel, vesselTexWrap, { low, quality: low ? 'low' : 'high' });
     if (setupSeq !== puzzleSetupSeq) { built.fragments.forEach(f => { f.mesh.geometry.dispose(); }); return; }
     fragments = built.fragments;
     vesselTex.dispose?.(); // 3D 成功：整幅纹理不再使用，及时释放（2D 回退时才会用到它）
     if (built.fromModel) vesselTexWrap.dispose?.();
     // 存档兼容：旧 2D / 既有 3D 进度加载后，把已归位碎片索引映射进 3D 锁定态（安全回退，缺字段/未知器物/越界索引均忽略）。
     restoreLocked3D(vessel);
     // 全息抬升：拼合操作面从散落平面抬到悬浮全息瓶处（≈一个瓶高，参照方案A构图）；
     // 已全部归位的重访不抬升、不建全息——散落平面处直接呈现成品（台面圆盘已移除）。
     const allLocked3D = fragments.every(f => f.locked);
     const holoLift = allLocked3D ? 0 : (built.maxY - built.minY);
     if (holoLift > 0) {
       for (const f of fragments) f.correctPosition.y += holoLift;
       restoreLocked3D(vessel); // 已归位碎片跟随抬升后的 correctPosition
     }
     // 对花投影：3D 路径也复用 ghost（器身对应区域的水印轮廓，cyan 半透明 → 金色），不引入外部图片/新史实。
     for (const f of fragments) {
       const outline = new THREE.Mesh(f.mesh.geometry, new THREE.MeshBasicMaterial({ map: fragmentGlazeMaterial(f)?.map ?? null, transparent: true, opacity: .12, color: 0x9fd4e6, depthWrite: false, side: THREE.DoubleSide }));
       outline.position.copy(f.correctPosition);
       outline.quaternion.copy(f.correctQuaternion);
       outline.scale.setScalar(.995);
       outline.renderOrder = 1;
       outline.visible = !f.locked;  // 已归位的片不再盖对花投影（否则成品上叠一层 12% 青纱，发白）
       ghost.add(outline);
       f.ghost = outline;
     }
    puzzle3DBridge = createPuzzle3DContext(scene, camera, renderer, fragments, {
      quality: low ? 'low' : 'high', lowPower: low, vessel,
      active: view === 'puzzle', // 全息系统只在拼合屏可见（openVessel 可能发生在委托屏）
      holoLift,
      // 同器物切屏往返（拼合↔记忆）沿用上次的观察角度；换器物或重新散落则重新取景。
      initialView: savedPuzzleView?.vesselId === vessel.id ? savedPuzzleView : null,
      onFragmentPicked: f => { selected = f; document.body.classList.toggle('dragging', Boolean(f)); },
      onFragmentRotated: f => { updatePuzzle3DStatus(f); },
      onConfirm: (f, opts) => { attempt3DSnap(f, opts); }
    });
     // 点击即归位：3D 模式下吸附开关无意义；左右旋转按钮复用为「环绕视角」步进，
     // 并提供复位视角（B3）——均作用于拼合工作台相机，不再旋转碎片。
     const tl3 = $('#turn-left'), tr3 = $('#turn-right'), rv3 = $('#reset-view'), tm3 = $('#tap-mode');
     if (tl3) { tl3.hidden = false; tl3.onclick = () => puzzle3DBridge?.rotateView?.(-Math.PI / 6); }
     if (tr3) { tr3.hidden = false; tr3.onclick = () => puzzle3DBridge?.rotateView?.(Math.PI / 6); }
     if (rv3) { rv3.hidden = false; rv3.onclick = () => puzzle3DBridge?.resetView?.(); }
     if (tm3) tm3.hidden = true;
     for (const f of fragments) { scene.add(f.mesh); f.mesh.visible = view === 'puzzle'; }
     // 存档恢复的已归位碎片：保持与原器完全一致的釉面，不叠任何金光/金线
     //（金线只在用户显式选择「金线表达」后的收尾里出现，不随归位自动浮现）
     // 全息成品 GLB 与碎片釉面对齐改为延迟加载：见 attachPuzzleVesselModel（进入拼合屏后挂载）。
     return;
   } catch (err) {
     console.warn('3D 拼合不可用，回退 2D：', err);
     // 3D 失败：清掉已挂到场景的 3D 工作台（碎片/对花投影/碎碴/事件监听），保留 vesselTex 给 2D 路径复用。
     for (const f of fragments) { scene.remove(f.mesh); f.mesh.geometry?.dispose?.(); disposeFragmentMaterial(f.mesh.material); f.ghost?.material?.dispose?.(); f.ghost?.geometry?.dispose?.(); }
     try{puzzle3DBridge?.dispose?.();}catch(e){}
     puzzle3DBridge = null;
     fragments = [];
   }
 }

 // 2D 回退路径（保留原实现）
 for (const id of ['#turn-left', '#turn-right', '#tap-mode']) { const el = $(id); if (el) el.hidden = false; }
 // 2D 模式没有 3D 工作台视角：左右旋转恢复为旋转碎片本身，隐藏复位视角按钮
 $('#turn-left').onclick=()=>interaction?.rotate(Math.PI/12);$('#turn-right').onclick=()=>interaction?.rotate(-Math.PI/12);
 const rv2=$('#reset-view'); if(rv2)rv2.hidden=true;
 fragments=createFragments(vesselTex,vessel.stories,{outline:vessel.outline,sites:generateSites(vessel.outline,vessel.fragmentCount,vessel.siteSeed),rotationMap:vessel.rotationMap,bbox:outlineBBox(vessel.outline)});
 try{computePatternAngles(fragments,vesselTex.image,outlineBBox(vessel.outline));}catch(e){/* 梯度采样失败不阻塞拼合，匹配分退化为位置+角度 */}
 for(const f of fragments){scene.add(f.mesh);f.mesh.visible=false;f.mesh.material=new THREE.MeshPhysicalMaterial({map:f.mesh.material.map,side:THREE.DoubleSide,roughness:.3,clearcoat:1,clearcoatRoughness:.18,color:0xf5f2ea});
  const outline=new THREE.Mesh(f.mesh.geometry,new THREE.MeshBasicMaterial({map:f.mesh.material.map,transparent:true,opacity:.12,color:0x9fd4e6,depthWrite:false,side:THREE.DoubleSide}));outline.position.copy(f.correctPosition);outline.position.z=-.15;ghost.add(outline);}
 if(low)for(const f of fragments)f.mesh.material=new THREE.MeshBasicMaterial({map:f.mesh.material.map,side:THREE.DoubleSide,color:0xf5f2ea});
 scatterPuzzle();
}

// 拼合屏全息成品 GLB 的挂载（从 setupPuzzleFragments 中拆出，改为进入拼合屏后再加载）：
// 目的——不让启程/委托屏就把 GLB 预载完，使「首次进证书屏」仍能看到加载进度条；
// 同时 GLB 仍在拼合屏内加载，金缮终章成品接管与碎片釉面对齐不受影响。
// 碎片釉面质地对齐真实 GLB（光泽与模型完全一致）：GLB 就绪后采样其 PBR 参数
//（粗糙度/金属度取 metallicRoughness 贴图均值、高光色取 specular），并叠加与挂载模型同款的环境反射。
// 纹理仍用环绕纹样——照片扫描贴图是 UV 图集，映射到碎片的环绕 UV 会花斑错乱，且会破坏对花与扫描推演的纹样同源系统。
function attachPuzzleVesselModel(vessel){
 if(!vessel?.model||!puzzle3DBridge)return; // 无 3D 工作台（reduce/回退路径）不挂载、不对齐釉面
 const path=vessel.model;
 if(puzzleModelAttached&&puzzleModelPath===path)return;   // 已挂载
 if(puzzleModelPending&&puzzleModelPath===path)return;    // 正在挂载（getModel 已缓存去重）
 puzzleModelPending=true;puzzleModelPath=path;
 getModel(path).then(res=>{
  puzzleModelPending=false;
  if(!res.ok||currentVessel!==vessel)return;
  // A1/A2：拼合屏修复对象的视觉呈现升级为用户 GLB——
  // 线框全息参照（与程序化 Lathe 壳互斥）+ 金缮终章成品接管（挂 kGroup 随金线落回拼合面）；
  // 红线：GLB 仅承担视觉，碎片拾取/吸附/aCover 判定仍全部走程序化 profile。
  const root=res.root.clone(true);
  root.rotation.set(0,0,0);root.position.set(0,0,0);root.scale.setScalar(1);
  root.updateMatrixWorld(true);
  const prof=vesselProfile(vessel.outline);
  fitToHeight(root,prof[prof.length-1].y-prof[0].y); // 高度对齐程序化器身，rim/锥光/金线口径不变
  // 金缮终章的成品 GLB 也走同一档收敛：照片扫描材质自带高光，原值直接上场会白到发光。
  const g=PORCELAIN_GRADE.puzzle;
  root.traverse(node=>{
   if(!node.isMesh)return;
   for(const m of (Array.isArray(node.material)?node.material:[node.material])){
    if(!m)continue;
    gradeGlazeMaterial(m,g);
    if(typeof m.sheen==='number')m.sheen=g.sheen;
   }
  });
  puzzle3DBridge?.setModel?.(root);
  puzzleModelAttached=true;
  const spec=extractGlazeSpec(res.root);
  if(!spec)return;
  const env=ensureEnvTexture();
  for(const f of fragments){
   const m=fragmentGlazeMaterial(f);
   if(!m||!m.isMeshPhysicalMaterial)continue;
   m.roughness=spec.roughness*(m.userData?.varRough??1);m.metalness=spec.metalness; // 釉面微差因子（任务②）对齐后保留
   m.userData.__baseRoughness=m.roughness;m.userData.__baseMetalness=m.metalness; // 基值更新：分级按新基值再乘
   if(spec.specularColor&&m.specularColor){m.specularColor.copy(spec.specularColor);m.specularIntensity=1;}
   if(env&&!m.envMap){m.envMap=env;m.envMapIntensity=.55;m.needsUpdate=true;}
  }
  gradePorcelain(); // GLB 对齐会把 envMapIntensity/specularIntensity 拉回原值 → 再套一次展示分级
 });
}

// 3D 拼合：磁感阶段一提示（青光 + 轻微弹性偏向，不自动归位），阶段二执行吸附。
// 对花投影：选中碎片的 ghost 水印在角度达标时转金色，不达标时青色。
function updatePuzzle3DStatus(f) {
  if (!f || !puzzle3DBridge) return;
  const stage = magnetStage3D(f);
  const status = $('#status');
  // 对花投影水印：仅对当前选中碎片响应，stage2 转金色
  if (f === selected && f.ghost) {
    f.ghost.visible = true;
    f.ghost.material.color.set(stage.stage2 ? 0xe8e2d2 : 0x9fd4e6);
    f.ghost.material.opacity = stage.stage2 ? .42 : .12;
  }
  if (stage.stage1 && !stage.stage2) {
    f.mesh.position.lerp(f.correctPosition, P3D.glow ? 0.08 : 0.05);
    setFragmentEmissive(f.mesh.material, P3D.glow.color, P3D.glow.intensity * 0.6);
    if (status) status.textContent = '微弱的牵引从断口传来——它记得这里（3D）。';
  } else if (stage.stage2) {
    // 吸附提示：只用中性的冷白提亮，不再给碎片染金（归位后要回到常规釉面）
    setFragmentEmissive(f.mesh.material, P3D.glow.color, P3D.glow.intensity * 0.35);
    if (status) status.textContent = '断口贴合中——再靠一点。';
  } else {
    fadeFragmentEmissive(f.mesh.material, 0.04);
  }
}

// 长故事以「卷」为单位：八段编年记忆按页排列，与碎片数（8/10/12）解耦。

// 碎片在器身上的部位 + 相对当前视角的方位（归位提示用，如"腹部 · 右前"）：
// 方位以「当前相机朝向」为基准（前 = 正对镜头），观众转到哪一侧，提示就说哪一侧。
const PART_BANDS=[[.10,'底足'],[.26,'近足'],[.60,'腹部'],[.82,'肩部'],[.94,'颈部'],[1.01,'口沿']];
const SIDE_LABELS=['前','右前','右','右后','后','左后','左','左前'];
function fragmentSpotLabel(f){
 try{
  const profile=vesselProfile(currentVessel.outline);
  const minY=profile[0].y,H=Math.max(1e-3,profile[profile.length-1].y-minY);
  const g=f.mesh.geometry;if(!g.boundingBox)g.computeBoundingBox();
  const c=g.boundingBox.getCenter(new THREE.Vector3());
  const h=(c.y+f.mesh.position.y-minY)/H;
  const part=(PART_BANDS.find(([k])=>h<k)||PART_BANDS[PART_BANDS.length-1])[1];
  const az=Math.atan2(c.x,c.z),yaw=puzzle3DBridge?.orbit?.yaw??0;
  let rel=az-yaw;rel=((rel%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
  return `${part} · ${SIDE_LABELS[Math.round(rel/(Math.PI/4))%8]}`;
 }catch{return '器身';}
}
// —— 器物长卷（翻页式长故事）——
// 交互口径：单片归位只推进进度条，不再单独弹小故事；八片（或十片 / 十二片）全部归位后，
// 才统一展开一整卷可逐页阅读的器物记忆，读毕进入修复抉择。长故事只在全部完成时触发。
const FALLBACK_TOTAL=8; // 无 WebGL 的 CSS 回退拼合固定 8 片按钮
function allRepaired(){
 if(!fragments.length)return repaired>=FALLBACK_TOTAL; // 回退模式没有碎片对象，以进度计数为准
 return fragments.every(f=>f.locked);
}
function remainingPieces(){const total=fragments.length||FALLBACK_TOTAL;return Math.max(0,total-repaired);}
function openLongStory({auto=false}={}){
 if(!allRepaired())return false;
 if(auto)memoryIndex=0;
 if(view==='memory'){renderMemoryPage();return true;}
 go('memory');
 return true;
}

// 3D 两阶段归位：阶段一双双达标时自动吸附（opts.force = 点击即归位，跳过阈值判定），
// 并触发瓷鸣。单片归位只点亮修复进度；全部归位后统一展开「器物长卷」。
function attempt3DSnap(fragment, opts = {}) {
  if (fragment.locked) return true;
  const stage = magnetStage3D(fragment);
  if (!stage.stage2 && !opts.force) return false;
  snapFragment3D(fragment, () => {
    fragment.locked = true; fragment.revealed = true;
    if (fragment.ghost) fragment.ghost.visible = false; // 对花投影只服务未归位的片
    audio.tick(); audio.chime(); audio.vibrate(30);   // 咔哒（极短瓷片碰撞）+ 瓷鸣
    repaired++;
    updateProgress(); refreshScanPreview();
    // 归位后的瓷片保持最常规的釉面状态：不浮现金线、不叠自发光（金线仅属用户选定的修复方式）
    // 归位标记：金环脉冲标出"粘到哪儿" + 该片常驻一层淡光 + 落在背面时视角轻推过去；
    // 全程不锁输入——拖动任意位置即 360° 环绕，可一边转一边看接缝与贴合效果。
    const spot=puzzle3DBridge?.flagSnap?.(fragment)?fragmentSpotLabel(fragment):null;
    // 存档兼容：3D 归位时写回与 2D 兼容的已归位索引集合（可选字段，刷新续玩不丢进度）。
    persistLocked3D();
    puzzle3DBridge?.select(null);
    $('#status').textContent=spot?`第 ${String(repaired).padStart(2,'0')} 片 · ${spot} · 已归位（拖动任意处可 360° 环绕查看）`:'这一片，回家了（3D）。';
    if (repaired === fragments.length) {
      audio.chord();
      // 全部归位：全息金缮终章（裂缝透金→金纹蔓延→成品回落拼合面）播完后，统一展开器物长卷；
      // 无全息时走同一入口。这是长故事唯一的自动触发点。
      const holo = puzzle3DBridge?.hologram;
      const nav = () => setTimeout(() => { if (view === 'puzzle') openLongStory({ auto: true }); }, 350);
      // 完成分发：按当前修复方式选择状态传递给终章（kintsugi=金缮全流程；其余方式全息静默退场后接专属收尾）。
      if (holo?.onSettled) holo.onSettled(nav, { mode });
      else setTimeout(() => { if (view === 'puzzle') openLongStory({ auto: true }); }, 550);
    }
  }, { quality: low ? 'low' : 'high' });
  return true;
}

// —— 3D 存档兼容（可选字段 progress.puzzle3d，旧存档无此字段时安全回退）——
// 读：把已归位碎片索引映射进 3D 锁定态（已归位的复原到正确位置，repaired 同步），不触碰旧字段。
function restoreLocked3D(vessel) {
  const locked = getLocked3D(progress, vessel.id, VESSELS);
  if (!locked.size) return;
  for (const f of fragments) {
    if (f.index >= vessel.fragmentCount || !locked.has(f.index)) continue;
    f.locked = true; f.revealed = true;
    f.mesh.position.copy(f.correctPosition);
    if (f.correctQuaternion) f.mesh.quaternion.copy(f.correctQuaternion);
  }
  repaired = fragments.filter(f => f.locked).length;
  memoryIndex = 0; // 长卷页码：续玩回到第 1 页
  updateProgress();
  // 同步展示：器身隐藏、已归位碎片不再参与拖拽
  ghost.visible = false;
}

// 写：把当前 3D 已归位碎片索引集合回写存档（向后兼容可选字段，越界索引丢弃）。
function persistLocked3D() {
  if (!currentVessel || !progress) return;
  saveLocked3D(progress, currentVessel.id, fragments.filter(f => f.locked).map(f => f.index), currentVessel.fragmentCount);
}
function scatterPuzzle(){if(camera&&fragments.length){scatterFragments(fragments,camera);for(const f of fragments)f.scatterY=f.mesh.position.y;}}
// ===== 扫描成器 · 复原推演（数字示意）=====
// 归位数达标后可触发：约 2 秒扫描光带扫过碎片 → 在器身位置生成半透明「大致复原外观」。
// 已实拼区域为不透明原纹理，推测区域（由轴对称与纹样连续性延拓）半透明冷调呈现。
let scanPreview=null,scanBusy=false;
function scanThreshold(){return Math.max(0,fragments.length-2);} // 8 片器物 = 归位 6/8 起可扫描
function refreshScanButton(){const b=$('#scan-btn');if(!b)return;const ok=Boolean(renderer)&&fragments.length&&repaired>=scanThreshold()&&!scanBusy;
 b.disabled=!ok;
 b.title=renderer?(repaired>=scanThreshold()?'扫描已归位碎片，推演器物大致外观':'碎片还差一些——再归位 '+Math.max(0,scanThreshold()-repaired)+' 片即可扫描'):'当前为无 3D 预览模式，扫描不可用';}
function hideScanPreview(){if(scanPreview){scene.remove(scanPreview.mesh);scanPreview.mesh.geometry.dispose();scanPreview.mesh.material.dispose();scanPreview.texture.dispose();scanPreview=null;}
 $('#scan-btn')&&($('#scan-btn').textContent='◎ 扫描成器 · 复原推演');$('#scan-note')&&($('#scan-note').hidden=true);}
function showScanPreview(){if(!renderer||scanPreview)return;
 const canvas=composeScanCanvas(currentVessel,fragments),texture=makeScanTexture(canvas);
 const mesh=buildVesselMesh(currentVessel,texture,{mode:null,physical:!low});
 mesh.userData.material=mesh.userData.material.clone();mesh.userData.material.transparent=true;mesh.userData.material.opacity=.97;mesh.userData.material.depthWrite=true;mesh.userData.material.needsUpdate=true;
 mesh.position.copy(vase.position);mesh.rotation.copy(vase.rotation);mesh.scale.copy(vase.scale);mesh.renderOrder=60;
 scene.add(mesh);scanPreview={mesh,texture};
 $('#scan-btn').textContent='关闭推演 ×';$('#scan-note').hidden=false;}
function runScan(){if(scanBusy||!renderer)return;
 if(repaired<scanThreshold()){notice('再归位 '+Math.max(0,scanThreshold()-repaired)+' 片，扫描才有足够的依据。');return;}
 if(scanPreview){hideScanPreview();$('#status').textContent='推演收起——剩下的碎片仍在等你。';return;}
 scanBusy=true;refreshScanButton();$('#status').textContent='正在扫描归位碎片……';
 guideSpiritSay('这些碎片边缘的弧度，是同一只瓶子的记忆。扫描一下，帮我把它们想起来的顺序理顺。','扫描只是把它们想起来的顺序理顺 · 数字示意，非考古复原');
 if(low||reduce){finishScan();return;} // 低性能/减少动态：跳过光带动效直接出预览
 wrap.classList.add('scanning');
 const beam=new THREE.Mesh(new THREE.PlaneGeometry(6.4,.09),new THREE.MeshBasicMaterial({color:0xc9a961,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));
 beam.position.set(0,camera.bottom+.3,.6);scene.add(beam);
 gsap.to(beam.position,{y:camera.top-.3,duration:1.8,ease:'power1.inOut'});
 gsap.to(beam.material,{opacity:.15,duration:1.8,ease:'power1.in',onComplete:()=>{scene.remove(beam);beam.geometry.dispose();beam.material.dispose();wrap.classList.remove('scanning');finishScan();}});}
function finishScan(){scanBusy=false;showScanPreview();refreshScanButton();$('#status').textContent='推演完成——冷色半透明处是推测区域，实色处已实拼。';
 audio.chime&&audio.chime();}
function refreshScanPreview(){if(!scanPreview)return;const canvas=composeScanCanvas(currentVessel,fragments);scanPreview.texture.image=canvas;scanPreview.texture.needsUpdate=true;}
$('#scan-btn').onclick=runScan;
// ===== 循痕识位 · 提示位置（淡金水印，不自动放置）=====
let locateFlash={i:-1,until:0};
$('#locate').onclick=()=>{if(!selected){notice('先选中一片瓷，我再把它的归处照出来。');return;}
 const index=fragments.indexOf(selected),target=ghost.children[index];if(!target)return;
 gsap.killTweensOf(target.material);locateFlash={i:index,until:performance.now()+2600};
 target.material.color.set(0xc9a961);
 gsap.fromTo(target.material,{opacity:.6},{opacity:.08,duration:2.6,ease:'power2.out',onComplete:()=>{target.material.color.set(0x9fd4e6);target.material.opacity=.12;locateFlash={i:-1,until:0};}});
 $('#status').textContent='淡金水印是它最可能的落点——对照纹样，再落手。';
 guideSpiritSay('淡金的水印，是这片瓷最可能的家。你对照纹样再落手——真正的归处，仍由你亲手决定。','提示位置 · 数字示意');};
// ===== 循痕识位 · 拖动匹配分与方向箭头 =====
let strongHintShown=false;
function updateDragHint(f){const arrow=$('#hint-arrow');if(!arrow)return;
 if(!f||f.locked||!camera){arrow.hidden=true;return;}
 const m=matchScore(f),strong=m.score>.55&&m.dist<MAGNET_DISTANCE*1.35;
 if(!strong){arrow.hidden=true;return;}
 const dx=f.correctPosition.x-f.mesh.position.x,dy=f.correctPosition.y-f.mesh.position.y;
 const p=new THREE.Vector3(f.mesh.position.x,f.mesh.position.y,0).project(camera);
 const px=(p.x+1)/2*wrap.clientWidth,py=(1-p.y)/2*wrap.clientHeight;
 arrow.style.left=px+'px';arrow.style.top=py+'px';
 arrow.style.transform='translate(-50%,-50%) rotate('+Math.atan2(-dy,dx)+'rad)';
 arrow.hidden=false;
 $('#status').textContent='循痕：匹配分 '+Math.round(m.score*100)+'% —— 朝箭头方向，此处最贴合';
 if(!strongHintShown){strongHintShown=true;guideSpiritSay('断口对上的时候，青光会亮。箭头只是我的直觉——落手的是你。','循痕识位 · 数字示意');}}
function clearDragHint(){$('#hint-arrow').hidden=true;}
// 模块讲解：复用角色/语音，不打开问答面板，不新增史实（均为数字示意口径）。
function guideSpiritSay(text,line){guideAgent.stopNarrate&&guideAgent.stopNarrate();guideCharacter.summon();guideCharacter.speak();guideCharacter.setLine(line||text.slice(0,26));guideVoice.speak(text,{profile:'qiling',onEnd:()=>guideCharacter.idle()});}
function resize(){if(!renderer)return;const w=wrap.clientWidth,h=wrap.clientHeight;if(!w||!h)return;renderer.setSize(w,h);composer.setSize(w,h);
 if(view==='puzzle'){const aspect=w/h;const half=Math.max(5.4,4.6/aspect);camera.top=half;camera.bottom=-half;camera.left=-half*aspect;camera.right=half*aspect;camera.updateProjectionMatrix();puzzle3DBridge?.reframe?.();return;}
 fitDisplay();}
// —— 展示取景：任何屏、任何器型都把整器放进画布中央 ——
// 以当前展示对象（真实 GLB / 程序化器身）的世界包围盒反算正交视野，并把相机平移到包围盒中心：
// ① 高度方向按器高、宽度方向按器身半径（旋转不变，环绕查看时取景不抖）；
// ② 留 12% 余量，口沿/圈足不会被裁；③ 宽体器型（云龙罐宽高比 1.24）也能整器入画。
// 拼合屏不在此列——那里的取景由 3D 工作台（frameView）负责。
// 包围盒按展示对象缓存：15 万面的 GLB 每次重新量一遍太贵，挂载/换器时量一次即可；
// 取景只用"器高 + 水平半径"两个数，环绕旋转不改变它们，所以旋转时无需重量。
let displayBox={target:null,size:null,center:null};
// 取景只用「模型自身坐标系里的包围盒」：模型带 -0.35 偏航时，世界 AABB 会被旋转撑大约 28%，
// 宽体器型（云龙罐 / 玲珑碗）因此被缩成小半只；反过来，若按手写轮廓估宽，模型与轮廓比例稍有出入
// 就会顶出画布（玲珑碗曾压到右侧展签底下）。原地量一次、旋转不变，两种毛病一起消掉。
function measureDisplay(target){
 if(!target)return null;
 if(displayBox.target===target&&displayBox.size&&!target.userData.__boxDirty)return displayBox;
 target.updateMatrixWorld(true);
 const inv=new THREE.Matrix4().copy(target.matrixWorld).invert();
 const m=new THREE.Matrix4(), v=new THREE.Vector3();
 const box=new THREE.Box3();
 target.traverse(node=>{
  const g=node.geometry;
  if(!g?.attributes?.position||node.visible===false)return;
  m.multiplyMatrices(inv,node.matrixWorld);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(m);box.expandByPoint(v);}
 });
 if(box.isEmpty()){const wb=new THREE.Box3().setFromObject(target);if(wb.isEmpty())return null;box.copy(wb);}
 // 上面量的是「去掉自身变换后」的局部尺寸（GLB 是等比缩放，去掉的就是那个缩放），
 // 这里再乘回世界缩放，得到真实占据空间；中心用局部中心过一遍 matrixWorld 还原。
 const ws=target.getWorldScale(new THREE.Vector3());
 const size=box.getSize(new THREE.Vector3()).multiply(ws);
 const center=box.getCenter(new THREE.Vector3()).applyMatrix4(target.matrixWorld);
 displayBox={target,size,center};
 target.userData.__boxDirty=false;
 return displayBox;
}
function fitDisplay(){
 if(!renderer||!camera||view==='puzzle')return;
 const w=wrap.clientWidth,h=wrap.clientHeight;if(!w||!h)return;
 const aspect=w/h;
 let half=view==='start'?5.15:4.65;
 camera.position.x=0;camera.position.y=0;
 const target=displayTarget();
 const m=measureDisplay(target);
 if(m){
  // 量的是模型自身坐标系里的尺寸（measureDisplay），已经不受偏航影响 → 直接用它取景：
  // 器高、器身最大水平半径都按真实几何来，宽体器（云龙罐/玲珑碗）既不会被 AABB 缩成小半只，
  // 也不会因为"轮廓估宽"偏小而顶出画布压到展签。
  const radius=Math.max(m.size.x,m.size.z)/2, height=m.size.y;
  // 12% 余量 + 竖屏窄列按宽度收敛；小件不低于 3.2，避免被放到顶天立地
  half=Math.max(3.2,Math.max(height/2,radius/aspect)*1.12);
  // 委托页：器物是"待修的委托品"，不是全屏背景——再留 45% 头顶，
  // 让口沿/圈足完整入画，落在原型卡与委托卡之间的空区，不压两侧信息卡。
  if(view==='commission')half*=1.45;
  camera.position.x=m.center.x;camera.position.y=m.center.y;
 }
 camera.top=half;camera.bottom=-half;camera.left=-half*aspect;camera.right=half*aspect;camera.updateProjectionMatrix();
}
function installJuciInteraction(){
 if(!renderer)return;
 renderer.domElement.addEventListener('pointerdown',e=>{
  if(view!=='choice'||exporting)return;
  const rect=renderer.domElement.getBoundingClientRect();
  const ndc=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
  const ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);
  if(repairBench?.active){
   const mh=ray.intersectObjects(workMarkers,false)[0];
   if(!mh)return;
   const bt=displayTarget();
   const vh=bt?ray.intersectObject(bt,true)[0]:null;
   if(!vh||mh.distance<=vh.distance+.2)workshopHit(mh);
   return;
  }
  if(!juci3d?.active)return;
  const bt2=displayTarget();if(!bt2)return;
  const hit=ray.intersectObject(bt2,true)[0];
  if(hit)placeStapleOnVessel(hit);
 });
}
try{setup3D();
 // Bloom 默认把透明背景合成为黑色；末级恢复背景 alpha，保留网页的墨蓝景深。
 composer.addPass(new ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){vec4 c=texture2D(tDiffuse,vUv);float a=smoothstep(0.14,0.42,max(c.r,max(c.g,c.b)));gl_FragColor=vec4(c.rgb,a);}'}));
 scene.children.find(o=>o.isHemisphereLight).intensity=1.5;light.intensity=2.3;
 new ResizeObserver(resize).observe(wrap);}catch(e){renderer?.domElement.remove();renderer=null;document.body.classList.add('fallback');notice('已切换为 CSS 立体预览与触屏拼合。');setupFallback();}
installJuciInteraction();
function emit(pos,count=20){if(!scene)return;const active=effects.reduce((n,e)=>n+e.points.geometry.attributes.position.count,0);count=Math.min(count,150-active);if(count<=0)return;const p=new Float32Array(count*3),v=[];for(let i=0;i<count;i++){p.set([pos.x,pos.y,1],i*3);v.push(new THREE.Vector2((Math.random()-.5)*2,(Math.random()-.5)*2));}const points=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(p,3)),new THREE.PointsMaterial({color:0xc9a961,size:.07,transparent:true,depthWrite:false}));scene.add(points);effects.push({points,v,life:1});}
function attemptSnap(f){if(f.locked||!canSnap(f))return false;f.locked=true;const diff=normalizeAngle(f.mesh.rotation.z-f.correctRotation);gsap.to(f.mesh.position,{x:f.correctPosition.x,y:f.correctPosition.y,z:0,duration:.2});gsap.to(f.mesh.rotation,{z:f.mesh.rotation.z-diff,duration:.2});gsap.fromTo(f.mesh.scale,{x:1.08,y:1.08,z:1.08},{x:1,y:1,z:1,duration:.5,ease:'elastic.out(1,.4)'});f.seams.line.material.opacity=.25;emit(f.correctPosition,low?16:38);audio.chime();audio.vibrate(30);repaired++;updateProgress();refreshScanPreview();interaction.clear();selected=null;clearDragHint();$('#status').textContent='这一片，回家了。';
 const total=fragments.length,mid=Math.ceil(total/2);
 if(repaired===mid)setTimeout(()=>notice(currentVessel.voices.painter),400);
 if(repaired===total){audio.chord();setTimeout(()=>notice(currentVessel.voices.keeper),500);
  // 长故事只在全部完成时触发：末片归位后统一展开器物长卷（单片不再弹小故事）。
  setTimeout(()=>{if(view==='puzzle')openLongStory({auto:true});},550);}
 return true;}
// 底部修复进度条：整体完成度 = 已归位片数 / 总片数，每次归位实时推进；全部归位后转为完成态。
function updateRepairMeter(done,total){
 const meter=$('#repair-progress');if(!meter)return;
 const pct=total>0?Math.round(done/total*100):0;
 $('#rp-value').textContent=pct+'%';
 $('#rp-count').textContent=`${done} / ${total} 片归位`;
 $('#rp-hint').textContent=total>0&&done>=total?'全部归位 · 长卷可翻阅':`还差 ${Math.max(0,total-done)} 片`;
 const ticks=$('#rp-ticks');
 if(ticks&&ticks.children.length!==total)ticks.replaceChildren(...Array.from({length:total},(_,i)=>{const tick=document.createElement('i');tick.style.left=(total<=1?0:i/(total-1)*100)+'%';return tick;}));
 if(ticks)for(const [i,tick] of [...ticks.children].entries())tick.classList.toggle('on',i<done);
 meter.setAttribute('aria-valuenow',String(pct));
 meter.setAttribute('aria-valuetext',`整体修复完成度 ${pct}%，已归位 ${done} / ${total} 片`);
 meter.classList.toggle('complete',total>0&&done>=total);
 gsap.to('#rp-fill',{width:pct+'%',duration:reduce?0:.6,ease:'power2.out'});
}
function updateProgress(){const total=fragments.length||FALLBACK_TOTAL,done=Math.min(repaired,total);$('#progress').textContent=`${String(done).padStart(2,'0')} / ${String(total).padStart(2,'0')}`;
 $('#puzzle-count').textContent=total>0&&done>=total?'全部归位 · 器物长卷可翻阅':`整卷记忆 · 全部归位后展开（还差 ${Math.max(0,total-done)} 片）`;
 gsap.to('.arc',{strokeDashoffset:276.46*(1-(total?done/total:0)),duration:.6,ease:'power2.out'});
 updateRepairMeter(done,total);refreshScanButton();}
function reset(){repaired=0;memoryIndex=0;record=null;hideScanPreview();strongHintShown=false;clearDragHint();for(const f of fragments){gsap.killTweensOf(f.mesh.position);f.locked=false;f.revealed=false;f.mesh.scale.setScalar(1);}if(renderer){setupPuzzleFragments(currentVessel);}for(const b of document.querySelectorAll('.fallback-fragment')){b.disabled=false;b.style.opacity='1';}
 // 存档兼容：重新散落 = 清除 3D 已归位记录（旧 2D 字段不动），避免续玩残留
 persistLocked3D();updateProgress();}
$('#reset').onclick=reset;
$('#turn-left').onclick=()=>interaction?.rotate(Math.PI/12);$('#turn-right').onclick=()=>interaction?.rotate(-Math.PI/12);
$('#hint').onclick=()=>{if(!selected){notice('先选择一片瓷，再寻找归处。');return;}const index=fragments.indexOf(selected),target=ghost.children[index];if(target)gsap.fromTo(target.material,{opacity:.55},{opacity:.06,duration:2});};
// 器物长卷入口：仅在全部归位后可读；未完成时给出还差几片的提示，不提前泄露记忆。
$('#read-memory').onclick=()=>{if(!allRepaired()){notice(`整卷记忆还在等最后 ${remainingPieces()} 片归位——全部拼合后会自动展开。`);return;}openLongStory();};
$('#memory-prev').onclick=()=>turnMemoryPage(-1);
$('#memory-next-page').onclick=()=>turnMemoryPage(1);
$('#memory-next').onclick=()=>{if(!allRepaired()){notice('器物长卷会在全部瓷片归位后展开。');return;}go('choice');};
$('#memory-close').onclick=()=>go('puzzle');
// ===== 无障碍基础项 =====
// 点击吸附替代模式：复用同一套 gameState 距离 + 角度判定，供不便拖拽的玩家使用。
$('#tap-mode').onclick=()=>{tapSnap=!tapSnap;$('#tap-mode').textContent=`点击吸附 · ${tapSnap?'开':'关'}`;$('#tap-mode').setAttribute('aria-pressed',String(tapSnap));$('#status').textContent=tapSnap?'点击吸附已开启：先点一片瓷，再点它的归处。':'已切回拖动模式：按住碎片拖到归处。';};
// 记忆正文字号三档（小 / 中 / 大），并让读屏随翻页朗读。
const MEMORY_FONTS={s:19,m:22,l:26};
for(const b of document.querySelectorAll('.memory-a11y [data-font]'))b.onclick=()=>{$('#memory-text').style.fontSize=MEMORY_FONTS[b.dataset.font]+'px';document.querySelectorAll('.memory-a11y [data-font]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));};
// ===== 数字展厅：独立浏览模式，不读写任何游戏进度 =====
let exhibitIndex=0;
function exhibitVesselAt(i){return VESSELS[((i%VESSELS.length)+VESSELS.length)%VESSELS.length];}
function renderExhibitRail(){
 const rail=$('#exhibit-rail');if(!rail)return;rail.innerHTML='';
 VESSELS.forEach((v,i)=>{
  const b=document.createElement('button');
  b.className='exhibit-rail-item'+(i===exhibitIndex?' active':'');
  b.setAttribute('aria-current',i===exhibitIndex?'true':'false');
  b.innerHTML=`<i style="--glaze:${{'青花':'#3d6a9e','釉里红':'#a03a30','颜色釉':'#8f231c','玲珑瓷':'#6b8cae'}[v.glaze]}"></i><span>${v.name}<small>${v.era} · ${v.glaze}</small></span>`;
  b.onclick=()=>{exitNear();exhibitIndex=i;renderExhibit();};
  rail.append(b);
 });
}
function renderExhibit(){
 const v=exhibitVesselAt(exhibitIndex);
 $('#exhibit-index').textContent=String(exhibitIndex+1).padStart(2,'0');
 $('#exhibit-name').textContent=v.name;
 $('#exhibit-era').textContent=`${v.era} · ${v.intro||v.glaze}`;
 $('#exhibit-glaze').textContent=v.glaze;
 $('#exhibit-study').textContent=STUDY_THEMES[v.id]||'—';
 $('#exhibit-proto').textContent=v.proto?v.proto.caption:'—';
 const img=$('#exhibit-proto-img'),fig=img.closest('.exhibit-proto-figure');
 // 两个分支都只增删图注、绝不重写 figure 的 innerHTML——否则会抹掉 img 本身，下次切换直接崩溃。
 fig.querySelector('.exhibit-proto-source')?.remove();
 const cap=document.createElement('figcaption');cap.className='exhibit-proto-source';
 if(v.proto&&!ONLINE_MODE){
  img.src=v.proto.img;img.alt=`原型参考：${v.proto.caption}`;img.hidden=false;
  cap.textContent=v.proto.source;
 }else{
  img.hidden=true;img.removeAttribute('src');
  cap.textContent=`${v.proto?v.proto.source:'暂无馆藏原型图注'}${ONLINE_MODE?'（线上公开版仅保留文字出处，不展示馆藏照片）':''}`;
 }
 fig.append(cap);
 $('#exhibit-count').textContent=`${exhibitIndex+1} / ${VESSELS.length}`;
 // 切换 3D 展示对象（程序化重建 + 真实 GLB 接管）；不写 currentVessel，不写 progress。
 if(renderer){setVessel3D(v);showVesselModel(v);}
 // 讲解面板开着时，讲解对象与推荐问题跟随当前展品实时更新。
 guideAgent?.sync();
 renderExhibitRail();
 // 内容属性标签（五层）+ 热点（可点击/键盘/触屏的等价入口）。
 const layersBox=$('#exhibit-layers');if(layersBox)layersBox.innerHTML=layerChips(v);
 renderExhibitHotspots(v);
}
$('#exhibit-prev').onclick=()=>{exitNear();exhibitIndex=(exhibitIndex-1+VESSELS.length)%VESSELS.length;renderExhibit();};
$('#exhibit-next').onclick=()=>{exitNear();exhibitIndex=(exhibitIndex+1)%VESSELS.length;renderExhibit();};
$('#kiln-chart')&&paintKilnChart($('#kiln-chart'));
$('#kiln-flow')&&paintKilnFlow($('#kiln-flow'));
// 展厅缩放：正交相机调 zoom，不改变主流程取景。
function zoomExhibit(factor){if(!renderer||view!=='exhibit')return;camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,.6,2.6);camera.updateProjectionMatrix();}
if(renderer)renderer.domElement.addEventListener('wheel',e=>{if(view!=='exhibit')return;e.preventDefault();zoomExhibit(e.deltaY<0?1.08:1/1.08);},{passive:false});
// ===== 讲解体验：窑火问答 + 双原创角色（全部本地资源，按需创建）=====
// 单例约束：同一时间只有一个活动角色、一套语音；关闭角色即停止发声。
// 分工：器灵 · 阿圆（3D）讲器物生命史与修复记忆；画坯匠 · 阿墨（2D 剪影）讲工序与工艺。
let guideSubtitleOn=true,guideHotspot=null,exhibitTour=null;
// —— 讲解语音/字幕偏好（guide-settings-v1，与主线存档完全分开；读不到就用默认值）——
let guideSettings=loadGuideSettings();
function persistGuideSettings(){guideSettings=saveGuideSettings(guideSettings);}
// 字幕条：与 guideVoice 的 onSubtitle 同源（同一段文本 / 同一条 timeline）
const guideSub=createGuideSubtitle({mount:document.body,size:guideSettings.subtitleSize,position:guideSettings.subtitlePos,enabled:guideSettings.subtitleOn});
const guideCharacter=createGuideCharacter({mount:document.body,reduced:reduce,low,motion:true,
 onActivate:()=>{guidePanel.open();guideAgent.sync();},
 avatars:{qiling:{name:GUIDE_QILING.name,disclaimer:GUIDE_QILING.disclaimer}}});
const guideVoice=createGuideVoice({onSubtitle:seg=>{guideSub.update(seg);}});
// 恢复上次的语速/音色/语音开关（音色在无语音服务时由面板置灰，取值仍保留）
guideVoice.setRate(guideSettings.rate);
guideVoice.setTone(guideSettings.tone);
guideVoice.setVoiceEnabled(guideSettings.voiceOn);
const guidePanel=createGuidePanel({mount:document.body,
 onAsk:q=>guideAgent.ask(q),
 onStop:()=>guideAgent.stop(),
 onPlay:answer=>guideAgent.narrate(answer),
 onStopPlay:()=>guideAgent.stopNarrate(),
 onClear:()=>guideAgent.clearConversation(), // 清空：停讲解并丢弃多轮上下文；器灵（知识库入口）保持可见
 onRemoteToggle:v=>guideAgent.setRemoteOn(v), // 「联网讲解」开关：已配置远程服务时可用，未配置置灰
 onModelChange:id=>guideAgent.setRemoteModel(id),
 onSubtitle:on=>{guideSubtitleOn=on;guideSettings.subtitleOn=on;guideSub.setOptions({enabled:on});persistGuideSettings();},
 onRateChange:r=>{guideSettings.rate=nearestRate(r);guideVoice.setRate(r);persistGuideSettings();},
 onToneChange:t=>{guideSettings.tone=t;guideVoice.setTone(t);persistGuideSettings();},
 onSubtitleSize:n=>{guideSettings.subtitleSize=n;guideSub.setOptions({size:n});persistGuideSettings();},
 onSubtitlePosition:p=>{guideSettings.subtitlePos=p;guideSub.setOptions({position:p});persistGuideSettings();},
 onVoiceToggle:on=>{guideSettings.voiceOn=on;guideVoice.setVoiceEnabled(on);persistGuideSettings();}});
// 把持久化设置与「当前环境是否支持语音」回显到面板（无语音服务 → 音色置灰）
guidePanel.setVoiceSettings({...guideSettings,supported:guideVoice.supported});
// 上下文：当前页面 / 器物 / 热点 / 修复方式 / 已完成器物 / 是否减少动态与静音。
function guideContext(){const v=view==='exhibit'?exhibitVesselAt(exhibitIndex):currentVessel;
 const label=view==='tour'?'景德镇写实考察':view==='exhibit'?'数字展厅 · '+(v?.name||''):(v?.name||'');
 return{view,vessel:v?v.id:null,vesselName:v?v.name:'',label,hotspot:guideHotspot,mode,reduced:reduce,muted:guideVoice.muted,completed:completedCount(progress)};}
const guideAgent=createGuideAgent({context:guideContext,panel:guidePanel,voice:guideVoice,character:guideCharacter,onNeedOpen:()=>guidePanel.open()});
// 器灵常驻：它就是知识库的入口——任何页面都能看到它，点一下即打开窑火问答。
guideCharacter.present();
guideCharacter.summon();
// 展厅热点：可点击的点位，同时是键盘与触屏的等价入口（悬停以外皆有替代）。
function renderExhibitHotspots(v){const box=$('#exhibit-hotspots');if(!box)return;box.innerHTML='';
 hotspotByVessel(v.id).slice(0,4).forEach((h,i)=>{const b=document.createElement('button');b.type='button';b.className='hotspot-btn';b.textContent=h.label;b.style.left=(13+i*12.5)+'%';b.style.top=(26+i*12)+'%';b.onclick=()=>openHotspot(h,v);box.append(b);});}
function openHotspot(h,v){guideHotspot=h.id;setExhibitFocus(true);guideCharacter.summon();guideCharacter.emphasize();guidePanel.open();guidePanel.setObject(v.name+' · '+h.label);guideAgent.ask(h.question)?.then?.(()=>guideCharacter.focus?.());}
// 聚焦：靠近/点击展品时环境光变暗、器物获重点照明（正交场景以灯光与 bloom 模拟）。
function setExhibitFocus(on){const active=Boolean(on)&&view==='exhibit';const near=$('#exhibit-near');if(near)near.hidden=!active;document.body.classList.toggle('exhibit-focus',active);if(!renderer||!light)return;
 if(on){gsap.to(light,{intensity:2.8,duration:.5});if(bloom)gsap.to(bloom,{strength:low?0:.55,duration:.5});}
 else{gsap.to(light,{intensity:2.3,duration:.5});repairVisual(mode);}}
// 退出近观：恢复展厅照明、停止讲解、清空热点高亮——「退出近观」的明确可控入口。
function exitNear(){if(!guideHotspot)return;guideHotspot=null;setExhibitFocus(false);guideAgent?.stopNarrate();renderExhibitHotspots(exhibitVesselAt(exhibitIndex));}
// 自动导览：逐件巡礼，30~60 秒一件，可暂停 / 继续 / 跳过 / 静音 / 退出。
function ensureExhibitTour(){if(exhibitTour)return exhibitTour;
 exhibitTour=createMuseumTour({count:VESSELS.length,duration:45,reduced:reduce,
  onFocus:i=>{exhibitIndex=i;renderExhibit();const v=exhibitVesselAt(i);
   guideAgent.narrate({text:`${v.name}，${v.era} · ${v.glaze}。${v.intro||''}${STUDY_THEMES[v.id]?'文化学习主题：'+STUDY_THEMES[v.id]+'。':''}`,scope:'vessel',characterLine:''});},
  onTick:t=>{const f=$('#tour-fill');if(f)f.style.width=(t.progress*100)+'%';const c=$('#tour-count');if(c)c.textContent=`${t.index+1} / ${t.total}`;},
  onState:s=>{const bar=$('#exhibit-tourbar');if(bar)bar.hidden=!s.active;const b=$('#tour-toggle');if(b)b.textContent=s.paused?'继续导览':'暂停导览';},
  onEnd:()=>{notice('六器巡礼结束——你可以自由浏览，或向讲解员提问。');}});
 return exhibitTour;}
$('#tour-start').onclick=()=>{const t=ensureExhibitTour();t.setMuted(guideVoice.muted);t.start({from:exhibitIndex});};
$('#tour-toggle').onclick=()=>exhibitTour?.toggle();
$('#tour-skip').onclick=()=>exhibitTour?.skip();
$('#tour-exit').onclick=()=>exhibitTour?.stop();
$('#exhibit-near').onclick=exitNear;
$('#tour-mute').onclick=()=>{const on=!guideVoice.muted;guideVoice.setMuted(on);guideSettings.voiceOn=!on;guidePanel.setVoiceSettings({voiceOn:!on});persistGuideSettings();exhibitTour?.setMuted(on);$('#tour-mute').textContent='导览静音 · '+(on?'开':'关');$('#tour-mute').setAttribute('aria-pressed',String(on));};
// 入口：所有节点都能召唤讲解员；上下文随页面与器物自动切换。
$('#guide-entry').onclick=()=>{guidePanel.toggle();if(guidePanel.isOpen)guideAgent.sync();};
guidePanel.fab.addEventListener('click',()=>{if(guidePanel.isOpen)guideAgent.sync();});
$('#guide-start').onclick=()=>{guidePanel.open();guideAgent.sync();};
$('#guide-choice').onclick=()=>{guidePanel.open();guideAgent.sync();guideAgent.ask('隐痕修复、金线表达和现状保存各是什么？');};
$('#guide-summary').onclick=()=>{guidePanel.open();guideAgent.sync();guideAgent.ask('这个项目想让人理解什么？');};
$('#guide-tour').onclick=()=>{guidePanel.open();guideAgent.sync();guideAgent.ask('御窑厂考察点看到的是什么？');};
// ===== 分享入口：程序化二维码浮层 =====
function openShare(){
 const img=$('#share-qr-img'),overlay=$('#share-overlay');
 const usePlaceholder=()=>{img.src=qrPlaceholder(240,20251009).toDataURL('image/png');};
 const probe=new Image();probe.onload=()=>{img.src='./share-qr.png';};probe.onerror=usePlaceholder;probe.src='./share-qr.png';
 overlay.hidden=false;gsap.fromTo(overlay,{opacity:0},{opacity:1,duration:.3});gsap.fromTo('.share-panel',{y:24,opacity:0,scale:.96},{y:0,opacity:1,scale:1,duration:.5,ease:'power3.out'});$('#share-close').focus();
}
function closeShare(){gsap.to('#share-overlay',{opacity:0,duration:.25,onComplete:()=>{$('#share-overlay').hidden=true;}});}
$('#share-fab').onclick=openShare;
$('#share-close').onclick=closeShare;
$('#share-overlay').onclick=e=>{if(e.target===$('#share-overlay'))closeShare();};
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#share-overlay').hidden)closeShare();});
function repairVisual(m){if(!seamGroups)return;finishing?.style?.(m,{target:displayTarget()||vase,vessel:currentVessel});for(const key of Object.keys(seamGroups))seamGroups[key].visible=key===m;if(bloom){bloom.enabled=!low&&m!=='preserve'&&view!=='tour';gsap.to(bloom,{strength:m==='kintsugi'?.55:m==='preserve'?0:.1,duration:.5});}gsap.to(light,{intensity:m==='kintsugi'?2.2:m==='preserve'?1.7:2.0,duration:.5});}
for(const b of document.querySelectorAll('[data-mode]')){b.onpointerenter=()=>repairVisual(b.dataset.mode);b.onpointerleave=()=>repairVisual(mode);b.onfocus=()=>repairVisual(b.dataset.mode);b.onclick=()=>{mode=b.dataset.mode;record=null;repairVisual(mode);if(mode==='preserve'){audio.note(174,1.8,.035);go('certificate');return;}if(renderer){enterWorkshop(mode);return;}document.querySelectorAll('[data-mode]').forEach(x=>x.disabled=true);notice('上釉补彩：釉色正在从灰白里重新显现。');if(mode==='kintsugi')audio.chord();else audio.note(147,1.8,.035);if(vesselMaterial){vesselMaterial.color.set(0x8f9693);vesselMaterial.clearcoat=.2;gsap.to(vesselMaterial.color,{r:1,g:.985,b:.93,duration:.95,ease:'power2.inOut'});gsap.to(vesselMaterial,{clearcoat:1,duration:.95});}setTimeout(()=>{document.querySelectorAll('[data-mode]').forEach(x=>x.disabled=false);go('certificate');},1050);};}
$('#ethics').onclick=()=>openDrawer('修复师守则','每一次介入，都要能被说明。','<ol class="ethics-list"><li><b>最小干预</b><span>能不动，就不动。</span></li><li><b>可逆</b><span>今天做的，明天要能收回。</span></li><li><b>可识别</b><span>修复过的部分，要让人看得出来。</span></li></ol>');
// 听瓷辨器：声、色、形里先听的那一味。完好清越、破碎沙哑、修复后居中。
async function knockVessel(state){try{if(!audio.enabled){await audio.enable();$('#sound').textContent='♫ 声音 · 开';$('#sound').setAttribute('aria-pressed','true');}audio.knock(state);}catch{notice('声音暂不可用，仍可继续修复。');return;}
 notice(state==='broken'?'轻叩残片：声沙哑、余韵极短。破碎之处，藏着它经历过的火与土。':state==='repaired'?'轻叩重圆之器：比残片清亮，却又不同于完好的旧瓷——这是修复留下的、诚实的声音。':'轻叩瓷身：完好之器，声如磬、余韵悠长。辨瓷讲究「声、色、形」，先听它的声音。');}
$('#knock-commission').onclick=()=>knockVessel('intact');
$('#knock-cert').onclick=()=>knockVessel(mode==='preserve'?'broken':'repaired');
// 修复抉择引导：像拼合页一样给台阶——预览、叩声、再决定。
const guideSteps=document.querySelectorAll('.guide-steps li');
$('#guide-repair').onclick=async()=>{
 const b=document.getElementById('guide-repair');if(b.dataset.busy)return;b.dataset.busy='1';b.disabled=true;
 const seq=[['traditional','隐痕修复','最小干预、可逆、可识别——尽量还原原貌，也为未来留出重新判断的空间。'],
            ['kintsugi','金线表达','以金线承接破碎——让经历成为新的纹理，而不是被掩饰。'],
            ['juci','锔瓷体验','以锔钉接裂——记住修补的手艺，也记住惜物的心意。下方可展开真实工序。']];
 for(const [m,label,story] of seq){
  document.querySelectorAll('.choice-option').forEach(o=>o.classList.toggle('guiding',o.dataset.mode===m));
  repairVisual(m);
  notice('预览 · '+label+'：'+story);
  await new Promise(r=>setTimeout(r,2600));
 }
 document.querySelectorAll('.choice-option').forEach(o=>o.classList.remove('guiding'));
 repairVisual(mode);
 guideSteps[0].classList.add('done');
 b.disabled=false;delete b.dataset.busy;
 notice('预览结束。悬停卡片可再看；落笔之前，先轻叩瓷身听一听它的声音。');
};
$('#knock-choice').onclick=()=>{knockVessel('broken');guideSteps[1].classList.add('done');guideSteps[2].classList.add('on');};
function issue(){const saved=progress.certificates[currentVessel.id];record??={name:nickname,date:new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),id:saved||`瓷 · ${crypto.randomUUID().replace(/-/g,'').slice(0,4).toUpperCase()}`,note:progress.exhibitNotes?.[currentVessel.id]||''};const profiles={traditional:['隐痕修复','以最小干预和可识别的浅灰线记录改变，也为未来的重新判断留下空间。'],juci:['锔瓷体验','以金属锔钉的数字示意连接裂痕，记住惜物的心意与修补的手艺。'],kintsugi:['金线表达','以金线承接破碎，让器物的经历成为新的纹理。'],preserve:['现状保存 · 不修复','有些破碎本身就是完整的证据。今天你让它以破碎的样子，说了真话。']};progress.certificates[currentVessel.id]=record.id;markCompleted(progress,currentVessel.id,mode,record.id);renderCabinet();$('#cert-name').textContent=record.name;const sealName=!record.name||record.name==='无名修复师'?'惜物重生':record.name;$('#cert-seal').src=sealImage(sealName);$('#cert-seal').alt=`修复师印章 · ${sealName}`;$('#cert-mode').textContent=profiles[mode][0];$('#cert-date').textContent=record.date;$('#cert-origin').textContent=`${currentVessel.origin} · ${currentVessel.archive}`;$('#cert-proto').textContent=currentVessel.proto?`器型原型参考：${currentVessel.proto.caption}（${currentVessel.proto.source}）`:'';$('#cert-philosophy').textContent=profiles[mode][1];const taglines={traditional:'隐痕修复 · 留白即完整',juci:'锔瓷 · 钉住光阴',preserve:'现状保存 · 器物以原貌存续'};const certEl=$('#certificate');for(const c of [...certEl.classList])if(c.startsWith('mode-'))certEl.classList.remove(c);if(taglines[mode]){certEl.classList.add('mode-'+mode);$('#cert-tagline').textContent=taglines[mode];$('#cert-tagline').hidden=false;}else $('#cert-tagline').hidden=true;$('#cert-note').value=record.note||'';const total=fragments.length;$('#ending-title').textContent=mode==='preserve'?'让破碎，说真话。':'瓷重圆，情接续。';$('#cert-story').innerHTML=mode==='preserve'?`兹记录数字修复师对${currentVessel.name}的现状保存。<br>${total}片并未被抹平，岁月证据得以留存。`:`兹记录数字修复师对${currentVessel.name}的修复。<br>${total}片归位，${currentStories.length}段记忆留存。`;$('#unlock-note').textContent=completedCount(progress)<6?`已解锁考察点：${locationById(currentVessel.location)?.name??'暂无'} · 还差 ${6-completedCount(progress)} 件走完全程`:'六件全修 · 三处写实考察点已开放';$('#cert-id').textContent='';if(reduce)$('#cert-id').textContent=record.id;else{const t={n:0};gsap.to(t,{n:record.id.length,duration:1.2,ease:'none',onUpdate:()=>$('#cert-id').textContent=record.id.slice(0,Math.floor(t.n))});}gsap.fromTo('.cert-border rect',{strokeDashoffset:1800},{strokeDashoffset:0,duration:reduce?0:1.8,ease:'power2.inOut'});}
$('#cert-note').addEventListener('input',event=>{if(record){record.note=event.target.value;progress.exhibitNotes??={};progress.exhibitNotes[currentVessel.id]=record.note;saveProgress(progress);}});

function escapeText(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function sourceLinks(){return '<p class="small-note">延伸阅读</p>'+CULTURE_SOURCES.map(([label,url])=>'<p><a href="'+url+'" target="_blank" rel="noopener noreferrer">'+label+' ↗</a></p>').join('');}
function showCultureClue(){const c=CULTURE[currentVessel.id],cu=currentVessel.culture;openDrawer('纹样观察 · 数字器物',currentVessel.name,layerChips(currentVessel)+'<p class="culture-lead">'+c.clue+'</p><p>'+c.detail+'</p>'+(cu?.culturalContext?'<h3>文化语境</h3><p class="small-note">'+cu.culturalContext+'</p>':'')+'<p class="small-note">观察提示用于本项目拼合；人物与器物经历为原创叙事。</p>'+(cu?.uncertainty?'<p class="small-note">'+cu.uncertainty+'</p>':'')+sourceLinks());}
$('#culture-clue').onclick=showCultureClue;
// 整幅纹样参考：导出当前器物的整幅平面纹样（与碎片同源的平面图，非器身环绕贴图），供循纹拼合对照。
$('#pattern-ref').onclick=()=>{const url=makeVesselTexture(currentVessel).image.toDataURL('image/png');openDrawer('整幅纹样参考 · 数字示意',currentVessel.name,'<p class="small-note">这是该器物的整幅纹样平面示意，用于对照碎片位置与「对花」走向。纹样为程序化复原的数字示意，不是实物拓印，也不代表原件全貌。</p><img class="pattern-ref-img" src="'+url+'" alt="'+currentVessel.name+' 整幅纹样参考">');};
function showExhibit(v=currentVessel){const c=CULTURE[v.id],done=progress.completed[v.id];openDrawer('我的小型瓷器展 · 原创叙事',v.name,'<span class="tag">'+c.theme+'</span>'+layerChips(v)+'<p class="small-note">文化学习主题 · '+(STUDY_THEMES[v.id]||'—')+'</p><p>'+c.detail+'</p>'+(v.proto?(ONLINE_MODE?'<p class="small-note">原型参考：'+v.proto.caption+'（'+v.proto.source+'）</p>':'<div class="exhibit-proto"><img src="'+v.proto.img+'" alt="原型参考照片"><p class="small-note">原型参考：'+v.proto.caption+'（'+v.proto.source+'）</p></div>'):'')+'<h3>委托人的回信</h3><p>'+c.ending+'</p><h3>修复记录</h3><p>'+escapeText(REPAIR_LABELS[done?.mode]||'尚未完成')+' · '+escapeText(done?.date||'')+'</p><blockquote>'+escapeText(progress.exhibitNotes?.[v.id]||'修复一件瓷器，接续一段生活。')+'</blockquote><p class="small-note">展签与手记保存在此浏览器。完成的档案卡可随时打开回看。</p><button class="primary" id="download-exhibit">下载文化展签 ↓</button>'+sourceLinks());$('#download-exhibit').onclick=()=>downloadExhibit(v);}
$('#exhibit').onclick=()=>showExhibit();
// ===== 我读懂的器物档案：把这次修复沉淀为一份文化学习记录（复用现有数据与导出逻辑）=====
function archiveContent(v){
 const done=progress.completed[v.id];
 const m=(mode&&REPAIR_LABELS[mode])||REPAIR_LABELS[done?.mode];
 const ethics={traditional:'最小干预 · 可逆 · 可识别：尽量还原原貌，也为未来的重新判断留出空间。',juci:'惜物修补：以锔钉连接裂痕，记住修补的手艺与惜物的心意。',kintsugi:'以金线承接破碎：让经历成为新的纹理，而非掩饰。',preserve:'现状保存：有些破碎本身就是证据，不修复也是一种诚实。'};
 return{done,m:m||'尚未完成',ethicsText:ethics[mode]||ethics[done?.mode]||'完成修复后，这里会记录你选择的修复方式及其伦理含义。'};
}
$('#archive-card').onclick=()=>{
 const v=currentVessel,c=CULTURE[v.id],a=archiveContent(v);
 openDrawer('我读懂的器物档案 · 文化学习记录',v.name,
  layerChips(v)
  +'<dl class="archive-dl"><div><dt>器物</dt><dd>'+v.name+'（'+v.era+' · '+v.archive+'）</dd></div>'
  +'<div><dt>文化学习主题</dt><dd>'+(STUDY_THEMES[v.id]||'—')+'</dd></div>'
  +'<div><dt>相关工种</dt><dd>'+(v.culture?.craftRoles?.join(' · ')||'—')+'</dd></div>'
  +'<div><dt>纹样 / 器型线索</dt><dd>'+c.clue+'</dd></div>'
  +'<div><dt>我的修复方式</dt><dd>'+a.m+'</dd></div>'
  +'<div><dt>选择的伦理含义</dt><dd>'+a.ethicsText+'</dd></div></dl>'
  +'<h3>内容分层说明</h3>'+layerDetails(v).map(t=>'<p class="small-note">'+t+'</p>').join('')
  +'<p class="small-note">【数字示意】所有交互均为数字转译，不构成对真实文物的操作指导。</p>'
  +(v.culture?.uncertainty?'<p class="small-note">'+v.culture.uncertainty+'</p>':'')
  +'<button class="primary" id="download-archive">下载器物档案 ↓</button>'+sourceLinks());
 $('#download-archive').onclick=()=>downloadArchive(v);
};
function downloadArchive(v){
 const c=CULTURE[v.id],a=archiveContent(v);
 const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1600;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#faf8f1';ctx.fillRect(0,0,1000,1600);
 ctx.strokeStyle='#b69a63';ctx.lineWidth=3;ctx.strokeRect(40,40,920,1520);
 let y=120;
 function text(t,size=28,color='#284b65'){ctx.fillStyle=color;ctx.font=size+'px "Microsoft YaHei", sans-serif';let line='';for(const ch of t){if(ctx.measureText(line+ch).width>810){ctx.fillText(line,90,y);y+=size*1.8;line='';}line+=ch;}ctx.fillText(line,90,y);y+=size*1.8+20;}
 text('碎瓷重圆 · 我读懂的器物档案',36);
 text(v.name+'（'+v.era+' · '+v.archive+'）',42);
 text('文化学习主题：'+(STUDY_THEMES[v.id]||'—'),24);
 text('相关工种：'+(v.culture?.craftRoles?.join(' · ')||'—'),24,'#8a7a55');
 text('纹样 / 器型线索',30);text(c.clue);
 text('我的修复方式',30);text(a.m+' — '+a.ethicsText);
 text('内容分层说明',30);
 for(const t of layerDetails(v))text(t,24,'#5a6b7d');
 text('【数字示意】所有交互均为数字转译，不构成对真实文物的操作指导。',22,'#8a7a55');
 if(v.culture?.uncertainty)text(v.culture.uncertainty,22,'#8a7a55');
 if(v.proto)text('原型参考：'+v.proto.caption+'（'+v.proto.source+'）',20,'#8a7a55');
 text('修复日期：'+(a.done?.date||'暂无'),22,'#8a7a55');
 text('资料来源见游戏内展签与《素材与内容来源》· 非商业教育演示',20,'#8a7a55');
 canvas.toBlob(blob=>{
  if(!blob){notice('档案卡生成失败，请重试。');return;}
  const url=URL.createObjectURL(blob),a2=document.createElement('a');
  a2.href=url;a2.download='碎瓷重圆-'+v.id+'-器物档案.png';document.body.append(a2);a2.click();a2.remove();
  notice('器物档案已生成。');setTimeout(()=>URL.revokeObjectURL(url),30000);
 },'image/png');
}
function downloadExhibit(v){const c=CULTURE[v.id],canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1200;const ctx=canvas.getContext('2d');ctx.fillStyle='#faf8f1';ctx.fillRect(0,0,1000,1200);ctx.strokeStyle='#b69a63';ctx.lineWidth=3;ctx.strokeRect(40,40,920,1120);let y=115;function text(t,size=28,color='#284b65'){ctx.fillStyle=color;ctx.font=size+'px "Microsoft YaHei", sans-serif';let line='';for(const ch of t){if(ctx.measureText(line+ch).width>810){ctx.fillText(line,90,y);y+=size*1.8;line='';}line+=ch;}ctx.fillText(line,90,y);y+=size*1.8+22;}text('碎瓷重圆 · 我的文化展签',36);text(v.name,42);text(v.era+' / '+v.glaze+' / '+c.theme,24);text(c.detail);text('委托人的回信',30);text(c.ending);text('我的修复手记',30);text(progress.exhibitNotes?.[v.id]||'修复一件瓷器，接续一段生活。');text('数字体验：'+(REPAIR_LABELS[progress.completed[v.id]?.mode]||'尚未完成'),24);if(v.proto)text('原型参考：'+v.proto.caption+'（'+v.proto.source+'）',20,'#8a7a55');text('器物与人物为原创设定 · 原型图片来源：故宫博物院官网',20,'#8a7a55');// 尽量把原型参考照片画进展签（同源资源，不污染画布）
 const draw=()=>{canvas.toBlob(blob=>{if(!blob){notice('展签生成失败，请重试。');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='碎瓷重圆-'+v.id+'-文化展签.png';document.body.append(a);a.click();a.remove();notice('文化展签已生成。');setTimeout(()=>URL.revokeObjectURL(url),30000);},'image/png');};if(v.proto&&!ONLINE_MODE){const img=new Image();img.onload=()=>{const w=230,h=w*img.naturalHeight/img.naturalWidth;ctx.save();ctx.strokeStyle='#b69a63';ctx.lineWidth=2;ctx.drawImage(img,660,905,w,Math.min(h,220));ctx.strokeRect(660,905,w,Math.min(h,220));ctx.restore();draw();};img.onerror=draw;img.src=v.proto.img;}else draw();}
let juciStep=0,juciPlaced=new Set(),juci3d=null,staples=[];
$('#choose-juci').onclick=()=>{if(renderer)enterJuci3D();else{juciStep=0;juciPlaced.clear();renderJuci();}};
// ===== 锔瓷核心互动（3D 器身布钉）=====
// 与 buildSeams 保持同一 LCG，复现七条裂线的方位角，让锔钉真正落在裂缝上。
function seamAngles(seed,count){let a=seed>>>0;const rng=()=>{a=(a*1664525+1013904223)>>>0;return a/4294967296;};return Array.from({length:count},(_,k)=>k*Math.PI*2/count+rng()*.6);}
function enterJuci3D(){
 juci3d={active:true,need:4};staples.forEach(s=>{s.parent?.remove(s);});staples=[];
 comparison.visible=false;applyModelVisibility();repairVisual('juci');
 document.querySelector('.choice-stage')?.classList.add('juci-hidden');
 document.querySelector('.preserve-choice')?.classList.add('juci-hidden');
 document.querySelector('.juci-choice')?.classList.add('juci-hidden');
 $('#juci-bar')?.remove();
 const bar=document.createElement('div');bar.className='juci-bar';bar.id='juci-bar';
 bar.innerHTML='<span class="overline">中国锔瓷 · 数字示意</span><p id="juci-tip">观察器身上的裂缝走向，然后沿裂缝点击器身，放置锔钉（<b id="juci-count">0</b>/4）。锔钉横跨裂痕，把分开的部分重新连起来。</p><button class="quiet" id="juci-cancel">返回修复方案</button>';
 $('#stage').append(bar);
 $('#juci-cancel').onclick=()=>exitJuci3D();
 notice('锔瓷：先看清裂缝，再落钉。');
}
function exitJuci3D(){
 if(!juci3d)return;juci3d=null;
 staples.forEach(s=>{s.parent?.remove(s);s.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.();});});staples=[];
 $('#juci-bar')?.remove();
 document.querySelector('.choice-stage')?.classList.remove('juci-hidden');
 document.querySelector('.preserve-choice')?.classList.remove('juci-hidden');
 document.querySelector('.juci-choice')?.classList.remove('juci-hidden');
 repairVisual(mode);
}
function placeStapleOnVessel(hit){
 if(!juci3d?.active||staples.length>=juci3d.need)return;
 const target=displayTarget()||vase;
 const profile=vase.userData.profile||vesselProfile(currentVessel.outline);
 const localPoint=target.worldToLocal(hit.point.clone());
 const y=THREE.MathUtils.clamp(localPoint.y,profile[0].y+.15,profile[profile.length-1].y-.15);
 const count=7+currentVessel.index,angles=seamAngles(currentVessel.textureSeed,count);
 // 取与点击方位最近的裂缝角
 const phi=Math.atan2(localPoint.x,localPoint.z);
 const norm=a=>Math.atan2(Math.sin(a-phi),Math.cos(a-phi));
 const th=angles.slice(0,count).reduce((best,a)=>Math.abs(norm(a))<Math.abs(norm(best))?a:best,angles[0]);
 const r=Math.hypot(localPoint.x,localPoint.z);
 const n=new THREE.Vector3(Math.sin(th),0,Math.cos(th));
 const t=new THREE.Vector3(-Math.cos(th),0,Math.sin(th));
 const mat=new THREE.MeshStandardMaterial({color:0xb08a45,metalness:.85,roughness:.3});
 const g=new THREE.Group();
 const legGeo=new THREE.CylinderGeometry(.02,.013,.15,8);
 for(const s of [-1,1]){
  const leg=new THREE.Mesh(legGeo,mat);
  leg.position.copy(n).multiplyScalar(.045).addScaledVector(t,.085*s);
  leg.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),n);
  g.add(leg);
 }
 const bridge=new THREE.Mesh(new THREE.CylinderGeometry(.017,.017,.21,8),mat);
 bridge.position.copy(n).multiplyScalar(.115);
 bridge.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),t);
 g.add(bridge);
 g.position.set(Math.sin(th)*r,y,Math.cos(th)*r);
 target.add(g);staples.push(g);
 gsap.from(g.scale,{x:.4,y:.4,z:.4,duration:.4,ease:'back.out(2.2)'});
 audio.chime();audio.vibrate(20);emit(g.position.clone(),14);
 $('#juci-count').textContent=staples.length;
 if(staples.length>=juci3d.need){
  juci3d.active=false;audio.chord();
  $('#juci-tip').innerHTML='四枚锔钉落定，裂痕被轻轻接住。<b>惜物 · 修补 · 接续</b>——这是中国锔瓷的心意。';
  setTimeout(()=>{exitJuci3D();mode='juci';record=null;go('certificate');},1500);
 }
}

// ===== 修复工序工作台：隐痕 / 金线的分步交互（与锔瓷同一骨架）=====
// ① 清创：点去断口浮尘；② 落胶/落金：沿裂缝逐点落胶，集齐后缝线成形；
// ③ 上釉：按住充能，釉色苏醒后签发证书。全部为数字示意，不构成真实操作指导。
let repairBench=null;const workMarkers=[];const workDots=[];
// 工序台内把当前可见模型的釉面临时置灰（清创感），完成/退出时恢复原釉色。
function workGlazeMaterials(){const t=displayTarget();const mats=new Set();t?.traverse(o=>{if(o.isMesh&&o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(m.color)mats.add(m);});});return [...mats];}
function tintWorkGlaze(hex){for(const m of workGlazeMaterials()){if(!m.userData.__tint)m.userData.__tint=m.color.clone();m.color.set(hex);}}
function untintWorkGlaze(){for(const m of workGlazeMaterials()){const o=m.userData.__tint;if(o){m.color.copy(o);delete m.userData.__tint;}}}
function workSeamAngles(){const count=7+currentVessel.index;return seamAngles(currentVessel.textureSeed,count).slice(0,count);}
function enterWorkshop(m){
 repairBench={active:true,mode:m,step:1};
 workMarkers.forEach(x=>{x.parent?.remove(x);});workMarkers.length=0;
 workDots.forEach(x=>{x.parent?.remove(x);});workDots.length=0;
 comparison.visible=false;applyModelVisibility();
 for(const k of Object.keys(seamGroups))seamGroups[k].visible=false;
 if(vesselMaterial)vesselMaterial.color.set(0x9a9b94);
 tintWorkGlaze(0x9a9b94);
 for(const sel of ['.choice-stage','.preserve-choice','.juci-choice','.choice-guide','.juci-craft','.stage-status'])
  document.querySelector(sel)?.classList.add('juci-hidden');
 $('#work-bar')?.remove();
 const bar=document.createElement('div');bar.className='juci-bar';bar.id='work-bar';
 bar.innerHTML='<span class="overline">修复工序 · 数字示意 — '+REPAIR_LABELS[m]+'</span>'
  +'<div class="work-steps" id="work-steps"><i class="on">① 清创</i><i>② '+(m==='kintsugi'?'落金':'落胶')+'</i><i>③ 上釉</i></div>'
  +'<p id="work-tip"></p>'
  +'<div id="work-glaze-row" hidden><button class="primary" id="work-glaze">按住上釉 · 让釉色重新醒来</button><div class="glaze-track"><i id="glaze-fill"></i></div></div>'
  +'<button class="quiet" id="work-cancel">返回修复方案</button>';
 $('#stage').append(bar);
 $('#work-cancel').onclick=()=>exitWorkshop(true);
 workStep1();
 notice(REPAIR_LABELS[m]+'：像拼瓷一样，一步一步来。');
 if(import.meta.env?.DEV){window.__workshopDebug=()=>{const rect=renderer.domElement.getBoundingClientRect();return workMarkers.map(mk=>{const p=mk.getWorldPosition(new THREE.Vector3()).project(camera);return{x:Math.round(rect.left+(p.x+1)/2*rect.width),y:Math.round(rect.top+(1-p.y)/2*rect.height)};});};
  window.__workshopRay=(x,y)=>{const rect=renderer.domElement.getBoundingClientRect();const ndc=new THREE.Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);const mh=ray.intersectObjects(workMarkers,false)[0];const vm=vase?.children.find(o=>o.isMesh);const vh=vm?ray.intersectObject(vm,false)[0]:null;const wp=workMarkers[0]?workMarkers[0].getWorldPosition(new THREE.Vector3()):null;const cp={x:camera.position.x,y:camera.position.y,z:camera.position.z};const dir=new THREE.Vector3();ray.ray.direction.clone()?null:null;return{marker:mh?workMarkers.indexOf(mh.object):-1,markerD:mh?.distance,vaseD:vh?.distance,view,active:repairBench?.active,vaseRot:{x:+vase.rotation.x.toFixed(4),y:+vase.rotation.y.toFixed(4)},rect:{w:rect.width,h:rect.height},camPos:cp,camType:camera.isOrthographicCamera?'ortho':'persp',markerWorld:wp,rayOrigin:{x:ray.ray.origin.x,y:ray.ray.origin.y,z:ray.ray.origin.z},rayDir:{x:ray.ray.direction.x,y:ray.ray.direction.y,z:ray.ray.direction.z},canvasBuf:{w:renderer.domElement.width,h:renderer.domElement.height},canvasCss:{w:renderer.domElement.clientWidth,h:renderer.domElement.clientHeight}};};}
}
function workStepsUI(done,current){document.querySelectorAll('#work-steps i').forEach((el,i)=>{el.classList.toggle('done',i<done);el.classList.toggle('on',i===current);});}
function workBarTip(html){const t=document.getElementById('work-tip');if(t)t.innerHTML=html;}
function placeWorkMarkers(n,color){
 // 标记落在"当前可见模型"（真实 GLB 或程序化兜底）表面：从器外沿裂缝方位角向轴线投射取命中点。
 const target=displayTarget()||vase;
 const profile=vase.userData.profile||vesselProfile(currentVessel.outline);
 const angles=workSeamAngles();
 const yMin=profile[0].y+.55,yMax=profile[profile.length-1].y-.55;
 const bbox=new THREE.Box3().setFromObject(target);
 const R=Math.max(Math.abs(bbox.max.x),Math.abs(bbox.max.z),1)*2+.6;
 const ray=new THREE.Raycaster();
 const front=[],back=[];
 // 标记只落在面向镜头的一侧：背面标记在展示旋转接管下永远转不到正面，反而形成可及性死角。
 for(let i=0;i<angles.length*6&&front.length<n;i++){
  const th=angles[(i*3+repairBench.step*2)%angles.length];
  const y=yMin+(yMax-yMin)*(.22+.56*((i%(n||1))/Math.max(1,n-1)));
  ray.set(new THREE.Vector3(Math.sin(th)*R,y,Math.cos(th)*R),new THREE.Vector3(-Math.sin(th),0,-Math.cos(th)));
  const hit=ray.intersectObject(target,true)[0];
  if(!hit)continue;
  if(hit.point.z<=.02)continue;
  front.push({pos:target.worldToLocal(hit.point.clone())});
 }
 for(const it of front.slice(0,n)){
  const mk=new THREE.Mesh(new THREE.SphereGeometry(.075,14,14),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.5,roughness:.45}));
  mk.position.copy(it.pos);
  target.add(mk);workMarkers.push(mk);
  gsap.from(mk.scale,{x:.2,y:.2,z:.2,duration:.5,delay:(workMarkers.length-1)*.12,ease:'back.out(2)'});
 }
 // 不自动转器身：背面标记交给修复师手动拖动旋转寻找（与真实工序一致）。
 if(workMarkers.some(mk=>mk.getWorldPosition(new THREE.Vector3()).z<.12)){
  workBarTip((document.getElementById('work-tip')?.innerHTML||'')+'<br><span style="color:#c9a961">✦ 有的标记在背面——按住器身拖动，把它转过来。</span>');
 }
}
function workStep1(){
 repairBench.step=1;workStepsUI(0,0);
 workBarTip('断口还蒙着尘。逐个点去这三处浮尘（<b id="work-count">0</b>/3），让裂缝看清自己。');
 placeWorkMarkers(3,0x8a7a5c);
}
function workStep2(){
 repairBench.step=2;workStepsUI(1,1);
 workBarTip('尘去缝清。沿裂缝'+(repairBench.mode==='kintsugi'?'落金':'落胶')+'（<b id="work-count">0</b>/4）——'+(repairBench.mode==='kintsugi'?'每一枚都是金线的一段骨。':'每一针都落在断口上。'));
 placeWorkMarkers(4,repairBench.mode==='kintsugi'?0xc9a961:0xd8d3c8);
}
function workshopHit(hit){
 if(!repairBench?.active)return;
 const idx=workMarkers.indexOf(hit.object);
 if(idx<0)return;
 const mk=workMarkers.splice(idx,1)[0];
 if(repairBench.step===1){
  gsap.to(mk.scale,{x:.01,y:.01,z:.01,duration:.3,onComplete:()=>{mk.parent?.remove(mk);mk.geometry?.dispose();mk.material?.dispose();}});
  emit(mk.getWorldPosition(new THREE.Vector3()),12);audio.chime();audio.vibrate(15);
  workBarTip('尘去了一处。还剩 <b>'+workMarkers.length+'</b> 处。');
  if(!workMarkers.length){audio.chord();workStep2();}
  return;
 }
 // 第二步：标记处留下永久的胶点/金点
 const dotParent=mk.parent;
 dotParent?.remove(mk);mk.geometry?.dispose();mk.material?.dispose();
 const gold=repairBench.mode==='kintsugi';
 const dot=new THREE.Mesh(new THREE.SphereGeometry(.05,12,12),new THREE.MeshStandardMaterial({color:gold?0xc9a961:0xd8d3c8,metalness:gold?.8:.1,roughness:gold?.3:.6,emissive:gold?0x6b531f:0x000000}));
 dot.position.copy(mk.position);dotParent?.add(dot);workDots.push(dot);
 gsap.from(dot.scale,{x:.3,y:.3,z:.3,duration:.4,ease:'back.out(2)'});
 audio.note(gold?392:330,.5,.05);audio.vibrate(15);emit(dot.getWorldPosition(new THREE.Vector3()),10);
 if(workDots.length<4){workBarTip('落'+(gold?'金':'胶')+' '+workDots.length+' / 4。'+(gold?'金线正在长出骨节。':'线正在一针针缝合。'));return;}
 seamGroups[repairBench.mode].visible=true;audio.chord();
 workStepsUI(2,2);
 workBarTip((gold?'金线贯通。':'裂痕合拢。')+'最后一步——按住下方按钮上釉，让釉色重新醒来。');
 $('#work-tip').hidden=true;
 $('#work-glaze-row').hidden=false;
 repairBench.step=3;
 armGlazeHold();
}
function armGlazeHold(){
 const btn=document.getElementById('work-glaze'),fill=document.getElementById('glaze-fill');
 if(!btn||!fill)return;
 let holding=false,p=0,raf=0;
 const tick=()=>{
  if(!holding){raf=0;return;}
  p=Math.min(1,p+.016);fill.style.width=(p*100)+'%';
  if(p>=.999){holding=false;finishGlaze();return;}
  if(Math.random()<.12)audio.note(460+p*320,.12,.018);
  raf=requestAnimationFrame(tick);
 };
 btn.addEventListener('pointerdown',e=>{if(repairBench?.step!==3)return;e.preventDefault();try{btn.setPointerCapture(e.pointerId);}catch{}holding=true;audio.note(392,.3,.03);if(!raf)raf=requestAnimationFrame(tick);});
 const stop=()=>{holding=false;};
 for(const ev of ['pointerup','pointercancel','pointerleave'])btn.addEventListener(ev,stop);
}
function finishGlaze(){
 if(!repairBench?.active||repairBench.step!==3)return;
 repairBench.active=false;
 const m=repairBench.mode;
 audio.chord();
 if(vesselMaterial){vesselMaterial.color.set(0x8f9693);vesselMaterial.clearcoat=.2;gsap.to(vesselMaterial.color,{r:1,g:.985,b:.93,duration:.95,ease:'power2.inOut'});gsap.to(vesselMaterial,{clearcoat:1,duration:.95});}
 // 真实 GLB 的釉色也从灰里醒来：由置灰色渐变回原色。
 for(const mt of workGlazeMaterials()){const o=mt.userData.__tint;if(o){gsap.to(mt.color,{r:o.r,g:o.g,b:o.b,duration:.95,ease:'power2.inOut',onComplete:()=>{delete mt.userData.__tint;}});}}
 emit(new THREE.Vector3(0,vesselHeight*.45,1.5),26);
 const bar=document.getElementById('work-bar');
 if(bar)bar.querySelector('.overline').textContent='修复工序 · 完成 — '+REPAIR_LABELS[m];
 workBarTip('釉色醒了。<b>这道裂痕，如今由你作证。</b>');
 setTimeout(()=>{exitWorkshop(false);mode=m;record=null;go('certificate');},1500);
}
function exitWorkshop(cancelled){
 if(!repairBench)return;repairBench=null;
 if(import.meta.env?.DEV)delete window.__workshopDebug;
 untintWorkGlaze();
 workMarkers.forEach(x=>{x.parent?.remove(x);x.geometry?.dispose();x.material?.dispose?.();});workMarkers.length=0;
 workDots.forEach(x=>{x.parent?.remove(x);x.geometry?.dispose();x.material?.dispose?.();});workDots.length=0;
 $('#work-bar')?.remove();
 for(const sel of ['.choice-stage','.preserve-choice','.juci-choice','.choice-guide','.juci-craft','.stage-status'])
  document.querySelector(sel)?.classList.remove('juci-hidden');
 for(const k of Object.keys(seamGroups))seamGroups[k].visible=false;
 repairVisual(mode||'traditional');
}
function renderJuci(){const titles=['观察裂缝','布置锔钉','记录与接续'];const c=CULTURE[currentVessel.id];openDrawer('中国锔瓷 · 数字示意',titles[juciStep],'<p>'+['沿着裂缝观察两侧。锔钉横跨裂痕，把分开的部分联系起来。','点击三处位置，逐一放置锔钉。此处为简化示意，不涉及真实钻孔与材料操作。',c.ending][juciStep]+'</p><div class="juci-demo"><svg viewBox="0 0 300 180" aria-hidden="true"><path d="M25 20H275V155Q150 185 25 155Z" fill="#eee9da" stroke="#365c7a"/><path d="M160 20L135 62L163 100L145 166" fill="none" stroke="#647080" stroke-width="2"/></svg>'+[0,1,2].map(i=>'<button class="juci-pin '+(juciPlaced.has(i)?'placed':'')+'" data-pin="'+i+'" style="top:'+(24+i*25)+'%" aria-label="'+(juciPlaced.has(i)?'已放置':'放置')+'第'+(i+1)+'枚锔钉" '+(juciStep!==1||juciPlaced.has(i)?'disabled':'')+'>'+(juciPlaced.has(i)?'━':'＋')+'</button>').join('')+'</div><p role="status">'+(juciStep===1?'已放置 '+juciPlaced.size+' / 3 枚锔钉':'惜物 · 修补 · 接续')+'</p><button class="primary" id="juci-next" '+(juciStep===1&&juciPlaced.size<3?'disabled':'')+'>'+['开始布钉 →','查看修补后的故事 →','完成锔瓷体验 →'][juciStep]+'</button><p class="small-note">锔补是一种历史修补工艺；具体器物是否适用，需由专业人员判断。</p>'+sourceLinks());$('#drawer-body').querySelectorAll('[data-pin]').forEach(b=>b.onclick=()=>{juciPlaced.add(Number(b.dataset.pin));audio.chime();renderJuci();});$('#juci-next').onclick=()=>{if(juciStep<2){juciStep++;renderJuci();}else{mode='juci';record=null;$('#close-drawer').click();go('certificate');}};}

// 档案柜：六张档案卡，完成印章 / 待修复 / 未解锁。
function renderCabinet(){
 const grid=$('#cabinet-grid');grid.innerHTML='';
 VESSELS.forEach(v=>{
  const done=progress.completed[v.id],unlocked=isVesselUnlocked(progress,v,VESSELS);
  const card=document.createElement('article');
  card.className='glass cabinet-card'+(done?' done':unlocked?' available':' locked');
  card.innerHTML=`<img class="card-thumb" src="${ONLINE_MODE?'':(v.proto?.img||'')}" alt="" loading="lazy"><span class="overline">${String(v.index+1).padStart(2,'0')} · ${v.archive}</span><h3>${v.name}</h3><div class="card-tags"><span>${v.era}</span><span>${v.glaze}</span><span>${v.origin}</span></div><p class="muted">${v.storyline}</p><p class="card-study">文化学习主题 · ${STUDY_THEMES[v.id]}</p><div class="card-state">${done?`<span class="seal">${done.mode==='preserve'?'存真':'重圆'}</span><small>${done.date} · ${REPAIR_LABELS[done.mode]}</small>`:unlocked?`<small>${v.breakdown}</small>`:'<small>🔒 完成上一件后解锁</small>'}</div>${done?'':unlocked?'<button class="primary" data-vessel="'+v.id+'">接受委托 →</button>':''}`;
  grid.append(card);
  card.onclick=e=>{
    if(e.target.closest('[data-vessel]'))return;
    if(done)showExhibit(v);
    else if(!unlocked)notice(`「${v.name}」尚未解锁——完成「${VESSELS[v.index-1].name}」后开放。`);
  };
 });
 const n=completedCount(progress);
 $('#cabinet-status').textContent=n===0?'选一件瓷器，开始你的第一份修复委托。':n<6?`已修复 ${n}/6 件 · 每修满两件，解锁一处写实考察点`:'六件全修 · 三处写实考察点全部开放';
 grid.querySelectorAll('[data-vessel]').forEach(b=>b.onclick=()=>{openVessel(vesselById(b.dataset.vessel));go('commission');});
}
// 考察导览。
const tourNote=$('#tour-note');
function renderTourMap(){
 const map=$('#tour-map');map.innerHTML='';
 LOCATIONS.forEach((loc,i)=>{
  const open=completedCount(progress)>=loc.unlockAt;
  const chip=document.createElement('button');
  chip.className='tour-chip'+(open?' open':'')+(tour?.currentStop===i?' active':'');
  chip.innerHTML=`<i></i>${loc.name}<small>${loc.timeLabel}${open?'':' · 未解锁'}</small>`;
  chip.disabled=!open||!tour||tour.moving;
  chip.onclick=()=>{if(tour&&!tour.moving)tour.travel(i);};
  map.append(chip);
 });
}
function ensureTour(){
 if(tour)return tour;
 tour=createFieldwork({container:$('#tour-stage'),noteLayer:tourNote,consoleHost:$('#tour-console'),audio,onArrive:(index)=>{
   renderTourMap();
   if(index===LOCATIONS.length-1&&completedCount(progress)===6&&!achievementShown){achievementShown=true;setTimeout(()=>{$('#achievement').hidden=false;gsap.fromTo('#achievement .achievement-card',{scale:.9,opacity:0},{scale:1,opacity:1,duration:.8,ease:'power3.out'});audio.chord();},900);}
 }});
 tour.setCompleted(Object.keys(progress.completed));
 return tour;
}
$('#gyro').onclick=async()=>{try{if(typeof DeviceOrientationEvent==='undefined')throw new Error();if(DeviceOrientationEvent.requestPermission&&await DeviceOrientationEvent.requestPermission()!=='granted')throw new Error();ensureTour().enableGyro();$('#gyro').textContent='倾斜已开启';}catch{notice('此设备未允许方向感应，可拖动画面改变视线。');}};
$('#achievement-close').onclick=()=>{$('#achievement').hidden=true;tour?.leave();renderCabinet();go('cabinet');};
function openVessel(v){
 currentVessel=v;currentStories=v.stories;
 renderCommissionRail(v);
 $('#commission-code').textContent=`CHANGJIANG ARCHAEOLOGY / ${v.archive}`;
 $('#commission-name').textContent=v.name;
 $('#commission-tag').textContent=`${v.fragmentCount} 片 · ${v.storyline}`;
 $('#commission-era').textContent=`${v.era} · ${v.glaze} · ${v.intro}`;
 $('#commission-person').textContent=CULTURE[v.id].person;
 $('#commission-quote').textContent=CULTURE[v.id].wish;
 $('#commission-task').textContent=v.breakdown.replace('待拼合','循着纹样与磁感拼合归位');
 if(v.proto){const showPhoto=!ONLINE_MODE;$('#proto-img').src=showPhoto?v.proto.img:'';$('#proto-img').hidden=!showPhoto;$('#proto-caption').textContent=v.proto.caption;$('#proto-source').textContent=v.proto.source;$('#proto-img').alt=`原型参考：${v.proto.caption}，${v.proto.source}`;}
 $('#puzzle-title').textContent=`拾片，归位 · ${v.name}`;
 $('#puzzle-vessel').textContent=`${v.fragmentCount} 片，${v.era.replace(/\s/g,'')}。`;
 $('#choice-kiln').textContent=v.voices.kilnWorker;
 $('.vessel-caption').innerHTML=`${v.name}<small>${v.origin} · ${v.archive}</small>`;
 // 器物长卷：换器物即换卷——页数随该器物的记忆段数，页码点阵重新生成。
 $('#memory-vessel').textContent=v.name;$('#memory-total').textContent=`共 ${v.stories.length} 页 · 翻页阅读`;$('#memory-dots').replaceChildren();
 if(renderer){setVessel3D(v);setupPuzzleFragments(v);}
 // 3D 存档兼容：若 restoreLocked3D 已恢复已归位碎片（3D 路径），repaired 保留其计数；
 // 否则（2D 路径或无 3D 进度）重新散落 = 0。setupPuzzleFragments 内部已调用 restoreLocked3D。
 if(!(puzzle3DBridge&&fragments.some(f=>f.locked))){repaired=0;record=null;mode='traditional';}updateProgress();
}
function renderCommissionRail(active){
 const rail=$('#commission-rail');rail.innerHTML='';
 VESSELS.forEach(item=>{
  const unlocked=isVesselUnlocked(progress,item,VESSELS),done=progress.completed[item.id];
  const b=document.createElement('button');
  b.className='rail-item'+(item.id===active.id?' active':'')+(done?' done':unlocked?'':' locked');
  b.innerHTML=`<i style="--glaze:${{'青花':'#3d6a9e','釉里红':'#a03a30','颜色釉':'#8f231c','玲珑瓷':'#6b8cae'}[item.glaze]}"></i><span>${item.name.slice(0,4)}<small>${done?'已修复':unlocked?'待修复':'未解锁'}</small></span>`;
  b.disabled=!unlocked;
  b.onclick=()=>{openVessel(item);};
  rail.append(b);
 });
}
// —— 器物长卷：逐页渲染 / 翻页 ——
// 长卷只在全部瓷片归位后展开（openLongStory），一页一段编年记忆；可点页码、按钮或方向键翻页。
function renderMemoryPage({dir=0}={}){
 const total=currentStories.length;if(!total)return;
 memoryIndex=Math.max(0,Math.min(total-1,memoryIndex));
 const story=currentStories[memoryIndex];
 $('#memory-number').textContent=`MEMORY SCROLL / ${String(memoryIndex+1).padStart(2,'0')}`;
 $('#memory-year').textContent=story.year;
 $('#memory-title').textContent=story.title;
 $('#memory-text').textContent=story.text;
 $('#memory-culture').textContent='观察一处细节：'+CULTURE[currentVessel.id].clue;
 $('#memory-img').src=kilnMemory(memoryIndex);
 $('#memory-img').alt='原创 Canvas 窑坊记忆插图，非历史照片';
 $('#memory-pager').textContent=`第 ${memoryIndex+1} / ${total} 页`;
 $('#memory-prev').disabled=memoryIndex===0;
 $('#memory-next-page').disabled=memoryIndex>=total-1;
 // 最后一页的主动作是「读完全卷、进入修复抉择」；中途也可直接进入，不强迫逐页。
 $('#memory-next').textContent=memoryIndex>=total-1?'读完全卷 · 进入修复抉择 →':'随时可进入修复抉择 →';
 renderMemoryDots();
 if(dir&&!reduce){
  gsap.killTweensOf('#memory-content');
  // 翻页：新页自书脊方向摆入，像掀过一张纸。
  gsap.fromTo('#memory-content',{rotateY:dir>0?26:-26,transformOrigin:dir>0?'0% 50%':'100% 50%',opacity:.35},{rotateY:0,opacity:1,duration:.55,ease:'power2.out'});
 }
}
function renderMemoryDots(){
 const box=$('#memory-dots');if(!box)return;
 if(box.children.length!==currentStories.length){
  box.replaceChildren(...currentStories.map((story,i)=>{
   const dot=document.createElement('button');
   dot.type='button';dot.className='memory-dot';
   dot.setAttribute('aria-label',`第 ${i+1} 页 · ${story.title}`);
   dot.onclick=()=>turnMemoryPage(i-memoryIndex);
   return dot;
  }));
 }
 [...box.children].forEach((dot,i)=>{dot.classList.toggle('on',i===memoryIndex);dot.setAttribute('aria-current',i===memoryIndex?'page':'false');});
}
function turnMemoryPage(delta){
 const total=currentStories.length;if(!total)return;
 if(!allRepaired()){notice('器物长卷会在全部瓷片归位后展开。');return;}
 const next=Math.max(0,Math.min(total-1,memoryIndex+delta));
 if(next===memoryIndex)return;
 memoryIndex=next;renderMemoryPage({dir:delta});
 audio.note(560,.24,.008,'sine'); // 极轻的翻页声（程序合成；未开声音时静默）
}
function show(next){if(next==='memory'&&!allRepaired())next='puzzle';const prev=view;view=next;document.body.dataset.view=view;
 gradePorcelain(); // 页面级瓷器展示分级：启程页原亮度，其余展示页收敛高光
 // 讲解体验随页面切换：停止朗读、退出导览、复位聚焦，再同步上下文（不改动任何存档）。
 if(prev!==view){guideAgent.stopNarrate();exhibitTour?.stop();setExhibitFocus(false);guideHotspot=null;}
 // ③ 降级可感知：低画质 / 减少动效下切屏给一行非阻塞小字说明，避免误以为故障（2s 淡出）。
 if(prev!==view&&(low||reduce)&&view!=='start')showQualityNote(view==='puzzle'?'全息特效已简化，拼合与操作不受影响。':'动画已减少，操作不受影响。');
 // 离开拼合屏：解绑 3D 拼合台事件监听、移除碎碴（保留 3D 碎片 mesh 供证书截图），统一清理避免监听残留。
 if(prev==='puzzle'&&view!=='puzzle')disposePuzzle3DResources();
 // 回到拼合屏：工作台在上次离开时已清理，重建 3D 拼合上下文（含全息系统；已归位碎片由存档恢复）。
 if(view==='puzzle'&&renderer&&currentVessel?.fragments3d&&!puzzle3DBridge&&fragments.length&&fragments[0]?.correctQuaternion)setupPuzzleFragments(currentVessel);
 if(view==='puzzle'){
  // 重访拼合屏（全部归位后）：终章曾把碎片釉面淡出为半透明（transparent/opacity 已改动），
  // 这里统一复位为"实心釉面"——修复完成的器物必须保持模型原貌，不能是一层透明壳。
  for(const f of fragments){const ms=Array.isArray(f.mesh?.material)?f.mesh.material:(f.mesh?.material?[f.mesh.material]:[]);for(const m of ms){if(!m)continue;if(m.transparent||m.opacity<1){m.transparent=false;m.opacity=1;m.depthWrite=true;m.needsUpdate=true;}}}
  puzzle3DBridge?.reframe?.();prefetchVesselModel(currentVessel);
 } // B4：复位取景；④ 空闲预取当前器物 GLB（低画质不预取、失败静默）
 if(view!=='puzzle'){hideScanPreview();clearDragHint();}document.querySelectorAll('[data-screen]').forEach(s=>s.hidden=s.dataset.screen!==view);document.querySelectorAll('[data-preview]').forEach(b=>{b.classList.toggle('active',b.dataset.preview===view);b.setAttribute('aria-current',b.dataset.preview===view?'page':'false');});history.replaceState(null,'','#'+view);
 // 离开展厅：复位缩放并把 3D 器身还原为当前游戏器物（展厅不写存档，这里只是恢复显示）。
 if(prev==='exhibit'&&view!=='exhibit'){if(camera){camera.zoom=1;camera.updateProjectionMatrix();}if(renderer){setVessel3D(currentVessel);showVesselModel(currentVessel);}}
 // ① 进入需要真实 GLB 的屏（委托/记忆/抉择/证书/展厅）→ 触发加载；首次未缓存时顶起进度条。
 if(prev!==view&&GLB_VIEWS.has(view)&&currentVessel)showVesselModel(currentVessel);
 // 离开需要进度条的屏：收起进度条（模型继续静默加载，再次进入若未好会重新顶起）。
 if(prev!==view&&!GLB_BAR_VIEWS.has(view))hideModelBar();
 if(view==='cabinet')renderCabinet();
 if(view==='exhibit')renderExhibit();
 if(view==='commission'){const railEmpty=!$('#commission-rail').children.length;if(railEmpty)openVessel(currentVessel);}
 if(vase){applyModelVisibility();comparison.visible=false;ghost.visible=view==='puzzle';for(const f of fragments)f.mesh.visible=view==='puzzle';puzzle3DBridge?.setVisible?.(view==='puzzle');scene.children.filter(o=>o.userData.decor).forEach(o=>o.visible=view==='start');}
 $('#fallback-vase').style.opacity=view==='puzzle'?'.2':'1';
 document.querySelectorAll('.fallback-fragment').forEach(b=>b.hidden=view!=='puzzle');
 $('.vessel-caption').style.display=['puzzle','memory','tour','exhibit'].includes(view)?'none':'block';
 if(view==='puzzle'&&fragments.length)updateProgress();
 if(view==='memory'){renderMemoryPage();gsap.fromTo('#memory-sheet',{rotateY:reduce?0:-75,opacity:0},{rotateY:0,opacity:1,duration:reduce?0:.8,ease:'power3.out'});gsap.fromTo('.memory-text',{opacity:0,y:8},{opacity:1,y:0,duration:reduce?0:1.2,delay:reduce?0:.3});}
 if(view==='certificate'){issue();repairVisual(mode);capturePortrait();runFinishing();if(!certHintShown){certHintShown=true;notice('小贴士：点击证书本身可放大到屏幕正中，再点一次还原。');}}
 if(view==='choice'||view==='certificate')repairVisual(mode);
 if(view!=='certificate'){setCertFocus(false);finishing?.clear?.();} // 离开证书屏即收走专属收尾动画，保证四方式只在完成时各播一次
 if(view==='tour'){if(renderer)renderer.domElement.style.visibility='hidden';const t=ensureTour();t.setCompleted(Object.keys(progress.completed));const startIdx=t.currentStop>=0?t.currentStop:Math.max(0,LOCATIONS.findIndex(l=>completedCount(progress)>=l.unlockAt));t.enter(Math.max(0,startIdx));renderTourMap();}
 else{if(renderer)renderer.domElement.style.visibility='visible';tour?.leave();}
 // 离开拼合屏必须复位主相机取景：3D 工作台（puzzle3DBridge.applyView）会抬高相机 position.y、
 // 缩小 zoom，并让相机绕器身公转；若不复位，后续证书 / 展厅 / 抉择等屏的瓷身会被推出容器底部
 // （#vessel-stage 的 overflow:hidden）而只显示上半截。拼合屏自身由工作台取景，不在此复位。
 if(prev!==view&&camera&&view!=='puzzle'){camera.position.set(0,.4,18);camera.rotation.set(0,0,0);camera.zoom=1;camera.updateProjectionMatrix();}
 resize();
 const s=$(`[data-screen="${view}"]`);
 if(view!=='memory'){gsap.fromTo(s.querySelectorAll('article,.choice-option,.screen-title,.hero-title,.cabinet-card'),{opacity:0,y:view==='certificate'?40:12,rotateY:view==='commission'?16:0},{opacity:1,y:0,rotateY:0,duration:reduce?0:.8,stagger:.07,ease:'power3.out'});}
 if(view==='start')gsap.fromTo('.hero-title h1 span',{opacity:0,filter:'blur(6px)',y:12},{opacity:1,filter:'blur(0px)',y:0,duration:reduce?0:1,stagger:.17,ease:'power2.out'});
 // 同步讲解上下文：把当前页面/器物/内容层级交给智能体，并刷新推荐问题（只读，不写存档）。
 guideAgent.sync();
}
// 证书聚焦：点击证书本身 → 弹到屏幕正中放大（器灵/问答按钮全部让位）；再点或 Esc 还原。
// 注意：#stage 带 perspective，会成为内部 fixed 元素的包含块——所以聚焦时把证书临时
// 移到 body 直属，才能以整个视口居中；退出时放回原位。
let certFocus=false,certHintShown=false,certHome=null;
function setCertFocus(on){
 certFocus=Boolean(on);
 document.body.classList.toggle('cert-focus',certFocus);
 const el=document.getElementById('certificate');
 if(!el)return;
 if(on){
  certHome??=el.parentElement;
  gsap.killTweensOf(el);
  // 直接内联赋值（不用 gsap.set，避免其缓存 transform 在下一帧回写 translate:none）
  el.style.transform='none';el.style.translate='-50% -50%';el.style.rotate='none';el.style.scale='none';el.style.opacity='1';
  document.body.append(el);
 }else if(certHome&&el.parentElement!==certHome){
  certHome.append(el);
  el.style.transform='';el.style.translate='';el.style.rotate='';el.style.scale='';
 }
}
$('#certificate').addEventListener('click',e=>{
 if(view!=='certificate')return;
 if(e.target.closest('input,button,a,label,select,textarea,summary'))return;
 setCertFocus(!certFocus);
});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&certFocus)setCertFocus(false);});
// 拼合屏 3D 视角键盘入口（鼠标/触屏/键盘三通道对齐）：←/→ 偏航环绕，↑/↓ 俯仰
window.addEventListener('keydown',e=>{
 if(view!=='puzzle'||!puzzle3DBridge||busy)return;
 if(e.key==='ArrowLeft')puzzle3DBridge.rotateView(-Math.PI/12);
 else if(e.key==='ArrowRight')puzzle3DBridge.rotateView(Math.PI/12);
 else if(e.key==='ArrowUp')puzzle3DBridge.rotateView(0,Math.PI/24);
 else if(e.key==='ArrowDown')puzzle3DBridge.rotateView(0,-Math.PI/24);
 else return;
 e.preventDefault();
});
// 器物长卷键盘入口：←/→ 或 PageUp/PageDown 翻页，Esc 收起长卷回到拼合台。
window.addEventListener('keydown',e=>{
 if(view!=='memory'||busy)return;
 if(e.key==='ArrowLeft'||e.key==='PageUp')turnMemoryPage(-1);
 else if(e.key==='ArrowRight'||e.key==='PageDown')turnMemoryPage(1);
 else if(e.key==='Escape')go('puzzle');
 else return;
 e.preventDefault();
});
function capturePortrait(){ if(!renderer)return;
 // 沿用当前修复方式，临时方形取景后恢复交互相机；PNG 不依赖外部素材。
 const old={left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom,x:camera.position.x,y:camera.position.y,width:wrap.clientWidth,height:wrap.clientHeight};
 puzzle3DBridge?.setVisible?.(false); // 证书小像不带碎片/碎碴/全息幽灵
 finishing?.hide?.(); // 证书小像不带专属收尾动画痕迹（微尘/锔钉/白缝渐变/渐晕）
 // 480×600 画幅按展示对象自身包围盒取景：宽体器型（云龙罐）过去用固定 ±3.2 会把左右裁掉，
 // 现在按器高/器身半径等比收敛，口沿到圈足完整入画。
 const m=measureDisplay(displayTarget());
 const aspect=480/600;
 let halfH=4;
 // 同 fitDisplay：用小像对应器型的轮廓半径/器高取景（AABB 会被偏航撑大，导致整器缩在框中央）
 const v=currentVessel;
 if(v?.outline){
  try{
   const prof=vesselProfile(v.outline);
   halfH=Math.max((prof[prof.length-1].y-prof[0].y)/2,Math.max(...prof.map(p=>p.x))/aspect)*1.08;
  }catch{ halfH=m?Math.max(m.size.y/2,Math.max(m.size.x,m.size.z)/2/aspect)*1.08:4; }
 } else if(m) halfH=Math.max(m.size.y/2,Math.max(m.size.x,m.size.z)/2/aspect)*1.08;
 const halfW=halfH*aspect;
 camera.left=-halfW;camera.right=halfW;camera.top=halfH;camera.bottom=-halfH;
 if(m){camera.position.x=m.center.x;camera.position.y=m.center.y;}
 camera.updateProjectionMatrix();renderer.setSize(480,600,false);composer.setSize(480,600);composer.render();portrait.src=renderer.domElement.toDataURL('image/png');
 Object.assign(camera,{left:old.left,right:old.right,top:old.top,bottom:old.bottom,x:old.x,y:old.y});camera.updateProjectionMatrix();resize();puzzle3DBridge?.setVisible?.(view==='puzzle');
 finishing?.show?.(); // 渲染后按 view 恢复（仅证书屏存在动画组）
}
// 四种修复方式的差异化完成收尾：证书屏按当前方式分发（各播一次、互不叠加）。
// kintsugi 的金缮终章由全息系统承担，这里直接跳过；其余三方式接 finishing 模块的专属动画。
function runFinishing(){
 if(!renderer||!finishing)return;
 // 四种方式都在真实模型上收尾（金线表达已从全息终章下沉到 finishing，证书屏同样可见金线与金铆点）
 finishing.run(mode,{ target:displayTarget()||vase, vessel:currentVessel, stage:$('#stage')||wrap, audio });
}
let transitionTl=null,goGuard=0;
function go(next){if(exporting||!names.includes(next))return;
 // 长故事只在全部瓷片归位后可读：未完成时统一拦在门口，给出还差几片的提示。
 if(next==='memory'&&!allRepaired()){notice(`器物长卷会在全部瓷片归位后自动展开——还差 ${remainingPieces()} 片。`);return;}
 if(busy&&transitionTl)transitionTl.progress(1);// 强制完成上一个转场，点击永不丢失
 if(next===view)return;nickname=$('#name')?.value?.trim()||nickname||'无名修复师';if(nickname==='无名修复师'&&progress.userName){$('#name').value=progress.userName;nickname=progress.userName;}if($('#name')?.value?.trim()){progress.userName=nickname;saveProgress(progress);}busy=true;interaction?.clear();if(reduce){show(next);busy=false;return;}const parts=document.querySelectorAll('#transition i');$('#transition').style.display='block';gsap.set(parts,{opacity:0,scale:.35,x:()=>gsap.utils.random(-250,250),y:()=>gsap.utils.random(-200,200),rotation:()=>gsap.utils.random(-35,35)});transitionTl=gsap.timeline({onComplete:()=>{$('#transition').style.display='none';busy=false;transitionTl=null;}});const tl=transitionTl;clearTimeout(goGuard);goGuard=setTimeout(()=>{if(transitionTl===tl)tl.progress(1);},1600);// rAF 被节流（嵌入面板/后台标签）时 gsap 时间线冻结、转场不推进，按钮会「看似点不动」：超时强制完成转场，保证视图必达
 tl.to(parts,{opacity:1,scale:1.1,x:0,y:0,rotation:0,duration:.38,stagger:{each:.008,from:'random'},ease:'power2.in'}).call(()=>{show(next);window.scrollTo({top:0,behavior:'instant'});}).to(parts,{opacity:0,scale:.4,x:()=>gsap.utils.random(-350,350),y:()=>gsap.utils.random(-250,250),rotation:()=>gsap.utils.random(-60,60),duration:.55,stagger:.009,ease:'power3.out'});}
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
document.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>{if(b.dataset.preview==='memory'&&!allRepaired()){notice('器物长卷会在全部瓷片归位后自动展开。');return;}if(['choice','certificate'].includes(b.dataset.preview)&&repaired!==fragments.length&&fragments.length)notice('当前为界面预览；正式流程需先完成拼合。');go(b.dataset.preview);});
$('#accept-commission').onclick=()=>{if(!currentVessel)openVessel(VESSELS[0]);reset();go('puzzle');};
$('#next-vessel').onclick=()=>{renderCabinet();go('cabinet');};
$('#go-tour').onclick=()=>{const loc=locationById(currentVessel.location);const idx=loc?LOCATIONS.indexOf(loc):0;go('tour');setTimeout(()=>{if(tour&&!tour.moving)tour.travel(Math.max(0,idx));},700);};
window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(names.includes(next))go(next);});
// 证书导出：离屏副本 + 实时 3D 器物截图。
$('#download').onclick=async()=>{if(exporting)return;exporting=true;$('#download').disabled=true;$('#download').textContent='正在绘制证书…';let copy;try{gsap.killTweensOf('#cert-id');$('#cert-id').textContent=record.id;const image=document.createElement('img');if(renderer){const prevView=view;applyModelVisibility();puzzle3DBridge?.setVisible?.(false);for(const f of fragments)f.mesh.visible=false;finishing?.hide?.();composer.render();image.src=renderer.domElement.toDataURL('image/png');applyModelVisibility();puzzle3DBridge?.setVisible?.(prevView==='puzzle');for(const f of fragments)f.mesh.visible=prevView==='puzzle';finishing?.show?.();}else{const c=document.createElement('canvas');c.width=320;c.height=360;const ctx=c.getContext('2d');ctx.fillStyle='#faf8f3';ctx.fillRect(0,0,320,360);ctx.fillStyle='#2c4a7c';ctx.font='24px SimSun';ctx.fillText('碎瓷重圆 · 数字复原',35,180);image.src=c.toDataURL();}
 copy=$('#certificate').cloneNode(true);copy.removeAttribute('id');Object.assign(copy.style,{position:'fixed',top:'0',left:'-10000px',right:'auto',bottom:'auto',width:'830px',minHeight:'480px',padding:'42px 42px 42px 350px',transform:'none',translate:'none',opacity:'1'});copy.querySelector('.cert-border').remove();copy.style.border='10px double #c9a961';copy.style.background='#faf8f3';copy.querySelectorAll('.rule').forEach(el=>el.style.background='#c9a961');const exportPortrait=copy.querySelector('.cert-portrait');exportPortrait.src=portrait.src||image.src;exportPortrait.style.cssText='position:absolute;left:30px;top:35px;width:280px;height:380px;object-fit:contain';document.body.append(copy);await exportPortrait.decode();const canvas=await html2canvas(copy,{scale:2,backgroundColor:'#faf8f3'});const a=document.createElement('a');a.download=`碎瓷重圆-${currentVessel.id}-${record.id.replace(/[^\w\u4e00-\u9fff]+/g,'')}.png`;const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));a.href=URL.createObjectURL(blob);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),30000);notice('证书已生成，请查看下载列表。');}catch(e){console.error('Certificate export failed:',e);notice('导出未完成，请重试。');}finally{copy?.remove();exporting=false;$('#download').disabled=false;$('#download').textContent='下载修复证书 ↓';}};
// 分享卡：复用证书页的实时 3D 截图与篆印，导出 1080×1920 竖版。
$('#share-card').onclick=async()=>{if(exporting)return;exporting=true;$('#share-card').disabled=true;$('#share-card').textContent='正在生成分享卡…';try{if(!portrait.src)capturePortrait();await exportShareCard({vessel:currentVessel,modeLabel:REPAIR_LABELS[mode]||'数字修复',record:record??{name:nickname,date:''},portraitSrc:portrait.src});notice('分享卡已生成，请查看下载列表。');}catch(e){console.error('Share card failed:',e);notice('分享卡生成未完成，请重试。');}finally{exporting=false;$('#share-card').disabled=false;$('#share-card').textContent='生成分享卡 ↓';}};
function setupFallback(){for(let i=0;i<8;i++){const b=document.createElement('button');b.className='fallback-fragment';b.setAttribute('aria-label',`瓷片 ${i+1}，拖动到器身`);b.style.left=(i%4)*22+5+'%';b.style.top=Math.floor(i/4)*35+16+'%';b.hidden=true;wrap.append(b);let drag=false;b.onpointerdown=e=>{drag=true;b.setPointerCapture(e.pointerId);};b.onpointermove=e=>{if(!drag)return;const r=wrap.getBoundingClientRect();b.style.left=e.clientX-r.left-30+'px';b.style.top=e.clientY-r.top-45+'px';};b.onpointerup=e=>{drag=false;const r=wrap.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;if(x>.25&&x<.75&&y>.12&&y<.85){b.disabled=true;gsap.to(b,{opacity:0,scale:1.1,duration:.4});repaired++;updateProgress();audio.chime();if(repaired>=FALLBACK_TOTAL)setTimeout(()=>{if(view==='puzzle')openLongStory({auto:true});},550);}};b.onpointercancel=()=>drag=false;}}
let last=performance.now(),slow=0,frames=0;
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;smooth.x+=(pointer.x-smooth.x)*.055;smooth.y+=(pointer.y-smooth.y)*.055; if(!reduce&&!exporting){for(const layer of layers){if(certFocus&&layer.id==="certificate")continue;// 证书聚焦时冻结视差，translate 专用于居中
// z 分层（translate 的第三个分量）会让「层内子元素」在透视场景中被投影到与视觉盒不同的位置命中：
// 症状是按钮/输入框看得见却点不到，越靠近层边缘偏得越多（卡片底部的「接受委托」偏出最多、完全失效）。
// 含交互控件的视差层不做 z 分层，只保留平面视差与呼吸——视觉上仅少一点透视放大，肉眼几乎不可辨。
if(layer.dataset.flat===undefined)layer.dataset.flat=layer.querySelector('button,input,a,select,textarea,summary')?'1':'';
const f=Number(layer.dataset.depth),z=layer.dataset.flat==='1'?0:f===.2?-200:f===.5?-50:50;// 证书以 translate:-50% 水平居中：视差改写时保留该偏移（v4 修复：此前整帧覆盖导致证书偏出右缘）
const certDoc=layer.id==='certificate'&&innerWidth>760&&innerHeight<980;
 const xo=layer.id==='certificate'&&!certDoc?`calc(-50% + ${smooth.x*f*28}px)`:`${smooth.x*f*28}px`;layer.style.translate=`${xo} calc(${smooth.y*f*20}px + var(--breath, 0px)) ${z}px`;}}
 if(!renderer||document.hidden||view==='tour')return;if(light){light.position.x=-3+smooth.x*3;light.position.y=4-smooth.y*2;}if(dust&&!reduce)dust.rotation.z+=dt*.009;const bob=displayTarget();if(bob&&!reduce)bob.position.y=(bob.userData.baseY??0)+Math.sin(now/4000*Math.PI*2)*.015;
 if(view==='puzzle'&&selected&&!selected.locked&&selected.correctPosition instanceof THREE.Vector3&&typeof selected.correctRotation==='number'){const index=fragments.indexOf(selected),target=ghost.children[index],distance=selected.mesh.position.distanceTo(selected.correctPosition),aligned=Math.abs(normalizeAngle(selected.mesh.rotation.z-selected.correctRotation))<Math.PI/15;if(target&&!(locateFlash.until>performance.now()&&locateFlash.i===index)){target.material.opacity=aligned?.42:distance<.8?.3:.12;target.material.color.set(aligned?0xc9a961:0x9fd4e6);}}
 if(view==='puzzle'&&!reduce)for(const f of fragments)if(!f.locked&&f!==selected&&Number.isFinite(f.scatterY))f.mesh.position.y+=Math.sin(now/2000+f.storyId.length)*dt*.005;
 if(view==='puzzle'&&puzzle3DBridge)puzzle3DBridge.update(dt); // 全息投影系统每帧驱动
 for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;const a=e.points.geometry.attributes.position;for(let j=0;j<a.count;j++){a.array[j*3]+=e.v[j].x*dt;a.array[j*3+1]+=e.v[j].y*dt;}a.needsUpdate=true;e.points.material.opacity=Math.max(0,e.life);if(e.life<=0){scene.remove(e.points);e.points.geometry.dispose();e.points.material.dispose();effects.splice(i,1);}}
 if(!exporting)composer.render();if(!low&&++frames>180){slow+=dt>.028?1:0;if(slow>90){low=true;slowDowngraded=true;document.body.classList.add('low-power');bloom.enabled=false;renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));dust.geometry.setDrawRange(0,40);
// 运行中降档（任务 C7）：阴影整体关闭（材质需重编译）
renderer.shadowMap.enabled=false;if(light)light.castShadow=false;scene.traverse(o=>{const ms=Array.isArray(o.material)?o.material:(o.material?[o.material]:[]);for(const m of ms)m.needsUpdate=true;});
puzzle3DBridge?.hologram?.degrade?.();resize();showDowngradeToast();}}}
requestAnimationFrame(frame);
openVessel(currentVessel);
{const nameEl=$('#name');if(nameEl)nameEl.value=progress.userName||'';}
const initial=location.hash.slice(1)||document.body.dataset.initial||'start';show(names.includes(initial)?initial:'start');
// —— 视口填充（2026-10-17 重做）——
// 旧实现：innerHeight<800 时给 <html> 加 zoom=innerHeight/800 做整页等比缩小。两个致命副作用：
//   ① zoom 只缩放入流元素，`position:fixed` 的左侧导航 / 背景层不跟着缩 → 侧栏比例过大，压住标题与正文
//      （用户截图里 1080×450 的展厅就是这种"挤在左上角"的样子）；
//   ② `100svh` 会随 zoom 一起被缩小（450 → 253），页面因此比视口矮一截，底部留出一大块空白。
// 现在改为：不做整页缩放，屏幕高度直接按视口撑满（`#stage/.screen` 的 min-height 见 CSS），
// 短屏由 `@media (max-height:...)` 收紧留白，内容超长时纵向滚动——任何尺寸都不会再出现底部空白。
// 短屏（内嵌预览面板 / 半屏窗口）用 transform 整体缩放 #app：
// 关键差别在于 transform 会为 position:fixed 后代创建包含块——侧栏、背景层、浮层与正文一起缩放，
// 不会出现"侧栏按原尺寸压住缩小后的标题"；同时 #stage 的 min-height 用 100svh/缩放比 反算，
// 缩放后正好等于视口高度，底部不会留白。
// 缩放时还必须把 #app 的布局盒子也限定成「视口/缩放比」并锁住页面滚动：
// transform 不改变布局尺寸，若仍按 100vw/100vh 排布，文档会比视口高出一截（450 高窗口 → 800 高文档），
// 浏览器于是给出一条滚动条和一整块空白——用户看到的"底部多余空白"就是它。
const UI_DESIGN_H=800;
function fitViewport(){
  const app=$('#app');if(!app)return;
  const z=innerHeight<UI_DESIGN_H?Math.max(.5,innerHeight/UI_DESIGN_H):1;
  const root=document.documentElement;
  root.style.setProperty('--ui-scale',String(z));
  if(z>.999){
    app.style.transform='';app.style.transformOrigin='';app.style.width='';app.style.height='';app.style.minHeight='';
    root.style.overflow='';document.body.style.overflow='';
    return;
  }
  app.style.transformOrigin='0 0';
  app.style.transform=`scale(${z})`;
  app.style.width=`${100/z}vw`;
  app.style.height=`${100/z}vh`;
  app.style.minHeight=`${100/z}vh`;
  // 缩放后整页正好铺满视口：页面级滚动关掉，滚动交给各屏自己的内层容器（长卷正文等）。
  root.style.overflow='hidden';document.body.style.overflow='hidden';
}
fitViewport();addEventListener('resize',fitViewport);
// 浏览器验收接口：只读状态与实际事件使用的吸附函数。
window.porcelain={get view(){return view;},get repaired(){return repaired;},get lowPower(){return low;},get mode(){return mode;},get currentVessel(){return currentVessel;},get progress(){return progress;},get slot(){return saveSlot;},get slots(){return listSlots();},exportText:()=>exportJSON(progress),exportTextNoName:()=>exportJSON(progress,{includeUserName:false}),parseImportText:t=>parseImport(t),fromShareCodeText:t=>fromShareCode(t),switchSlot:n=>applySlot(n),openSavePanel,get fragments(){return fragments;},get renderer(){return renderer;},get camera(){return camera;},get vase(){return vase;},get bridge(){return puzzle3DBridge;},get allRepaired(){return allRepaired();},get memoryPage(){return memoryIndex+1;},get memoryPages(){return currentStories.length;},go,attemptSnap,reset,openVessel,renderCabinet,ensureTour,VESSELS,LOCATIONS,displayTarget,debugMatch:f=>matchScore(f),debugDragHint:f=>updateDragHint(f),debugProgress:()=>({text:$('#rp-value')?.textContent,value:$('#repair-progress')?.getAttribute('aria-valuenow'),complete:$('#repair-progress')?.classList.contains('complete')}),get guideVoice(){return guideVoice;},get guideSub(){return guideSub;},setGuideSettings:s=>{guideSettings={...guideSettings,...s};guideVoice.setRate(guideSettings.rate);guideVoice.setTone(guideSettings.tone);guideVoice.setVoiceEnabled(guideSettings.voiceOn);guideSub.setOptions({size:guideSettings.subtitleSize,position:guideSettings.subtitlePos,enabled:guideSettings.subtitleOn});guidePanel.setVoiceSettings({...guideSettings,supported:guideVoice.supported});persistGuideSettings();},get modelBarVisible(){const b=$('#model-bar');return Boolean(b&&!b.hidden);},get modelBarFailed(){const b=$('#model-bar');return Boolean(b&&b.classList.contains('failed'));},get modelBarLabel(){return $('#model-bar-label')?.textContent||'';},get modelState(){const p=displayVessel?.model||null;return {path:p,done:modelDone(p),skipped:modelSkipped.has(p),retries:modelUi?.retries??0,settled:modelUi?.settled??false};},retryModel:()=>$('#model-bar-retry').click(),skipModel:()=>$('#model-bar-skip').click(),get lowPowerDowngraded(){return slowDowngraded;},restoreHighQuality,get qualityToastVisible(){const e=$('#quality-toast');return Boolean(e&&!e.hidden);},get qualityNoteText(){const e=$('#quality-note');return e&&!e.hidden?e.textContent:'';}};
