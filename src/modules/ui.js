export function renderUI() {
  document.body.dataset.phase='welcome';
  document.querySelector('#app').innerHTML=`
  <header><a class="brand" href="./">青花 <span>·</span> 修复室</a><div class="edition">JINGDEZHEN / PORCELAIN ATELIER</div><button id="sound" class="quiet" aria-pressed="false">声音 · 关</button></header>
  <main>
    <section class="intro"><div class="eyebrow">一片青花，一段重逢</div><h1>碎瓷<span>重圆</span></h1><p>拾起散落的时光，<br>也为裂痕，留下你的判断。</p><div class="intro-rule"></div><small>拾片 / 记忆 / 抉择 / 重圆</small><div class="intro-caption">景德镇青花意象<br>数字修复伦理习作</div></section>
    <section id="stage">
      <div class="stage-label">青花缠枝纹瓶 <span>数字修复档案 · 壹</span></div>
      <div id="canvas-wrap"></div>
      <div id="welcome" class="overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title"><div class="welcome-card"><span class="seal">惜物</span><h2 id="welcome-title">每一道裂痕，都有归处。</h2><p>你将成为一位数字修复师。<br>拼回八片青花，读八段记忆，<br>决定如何让这只瓶的经历被看见。</p><button id="start" class="primary">接受修复委托 ↗</button><small>鼠标 / 触屏 · 拖拽移动 · Q / E 旋转</small></div></div>
      <div id="commission" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="commission-title"><div class="welcome-card commission-card"><div class="eyebrow">委托档案 / NO. QH-001</div><h2 id="commission-title">青花缠枝纹瓶</h2><dl><dt>年代设定</dt><dd>20 世纪风格 · 数字习作</dd><dt>传世背景</dt><dd>虚构家庭传世器，旧居整理时意外破损。委托人希望保留青花，也保留器物曾被使用的记忆。</dd><dt>当前状态</dt><dd>九块瓷片 / 纹样可辨 / 待拼合</dd></dl><label for="user-name">修复师昵称</label><input id="user-name" maxlength="20" placeholder="无名修复师" autocomplete="nickname"><p class="context-note">委托与手记为创作性叙事；年代未经文物鉴定。纹样为自制素材，未使用真实老照片。</p><button id="begin" class="primary">开始修复 →</button></div></div>
      <div id="choice" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="choice-title"><div class="welcome-card choice-card"><div class="eyebrow">归位之后 / YOUR DECISION</div><h2 id="choice-title">裂痕，应该如何留下？</h2><p>八片已归位。请选择这份数字作品的表达。</p><button id="traditional" class="choice-option"><span class="choice-swatch gray"></span><strong>传统修复</strong><span>浅灰裂线 · 最小干预、可逆、可识别理念</span></button><button id="kintsugi" class="choice-option"><span class="choice-swatch gold"></span><strong>金缮修复</strong><span>金色裂线 · 接受不完美，让经历被看见</span></button><small class="ethical-note">这里比较视觉表达。真实修复需依据器物的价值、材料和状态判断；金缮不等同于文物保护的通用方案。</small></div></div>
      <div id="finish" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="finish-title"><div class="welcome-card"><span class="seal">重圆</span><h2 id="finish-title">为青花，续写新生。</h2><div id="chosen-mode" class="eyebrow"></div><p id="story"></p><button id="glaze" class="primary">上釉并签发证书 →</button><button id="change-mode" class="quiet">重新思考修复方式</button><small>数字补色动画 · 不模拟实际材料工艺</small></div></div>
      <div id="toast" role="status">选择一片瓷，开始你的修复。</div>
    </section>
    <aside>
      <div class="eyebrow">修复手记 / RESTORATION</div><h2>让破碎<br>成为新的纹理。</h2>
      <div class="progress-head"><span>拼合进度</span><b id="count">00 / 08</b></div><div class="progress"><i id="bar"></i></div><div class="progress-info"><span id="state">等待接受委托</span><span id="memory-count">已解锁 0/8 段记忆</span></div>
      <div class="controls"><button id="left" disabled aria-label="左转 15 度">↶ <span>左转 15°</span></button><button id="right" disabled aria-label="右转 15 度">↷ <span>右转 15°</span></button><button id="hint" disabled>◎ <span>寻找归处</span></button><button id="reset">↺ <span>重新开始</span></button></div>
      <div class="secondary-controls"><button id="demo" class="quiet">演示拼合流程 ↗</button><button id="archive-toggle" class="quiet" aria-expanded="false">记忆册 · 展开</button></div>
      <div id="memory-archive" class="hidden" aria-label="已解锁记忆册"></div>
      <section id="completed-summary" class="hidden"><div class="eyebrow">数字修复完成</div><h3 id="summary-mode"></h3><p id="summary-philosophy"></p><dl><dt>修复师</dt><dd id="summary-name"></dd><dt>日期</dt><dd id="summary-date"></dd></dl><div id="summary-id"></div><button id="preview-certificate" class="quiet">预览修复证书 ↗</button><button id="download" class="primary">下载修复证书 ↓</button><button id="rechoose" class="quiet">更改修复方式</button><button id="again" class="quiet">再修复一次</button><div id="export-status" role="status"></div></section>
      <div class="instructions"><span>指尖修复指南</span><p>拖拽 · 移动瓷片<br>Q / E · 左右旋转<br>右键拖动 · 自由调角<br>移动端 · 点击旋转按钮</p></div><div class="note">“器有裂，情无缺。”<small>以金缮意象，致敬惜物之心</small></div>
    </aside>
  </main>
  <section id="memory-layer" class="memory-layer hidden" role="dialog" aria-labelledby="memory-title"><div class="memory-card"><div class="memory-number"></div><img alt="自制青花纹样"><h2 id="memory-title"></h2><p class="memory-text"></p><small>创作手记 · 自制纹样图</small><button id="memory-continue" class="primary">继续修复 →</button><button id="memory-reset" class="quiet">退出当前修复 · 重新开始</button></div></section>
  <section id="certificate-preview" class="hidden" role="dialog" aria-modal="true" aria-label="修复证书预览"><div class="certificate-viewer"><div class="viewer-head"><span>修复证书 · 预览</span><button id="close-preview" class="quiet">关闭 ×</button></div><img alt="修复证书预览"><p>关闭预览后，可下载 PNG 证书。</p></div></section><footer><span>虚构委托 · 自制青花纹样 · 数字修复体验</span><span>CRAFTED WITH TIME & CARE</span></footer><div id="poster" aria-hidden="true"></div>`;
}


