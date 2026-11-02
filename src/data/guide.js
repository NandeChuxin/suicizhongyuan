// 《碎瓷重圆》讲解数据层：本地知识条目、推荐问题、古人讲解员设定与免责声明。
// 内容边界与全站一致——五层标签：fact 史实依据 / legend 民间传说 / fiction 原创叙事 /
// schematic 数字示意 / pending 待人工核实（见 culture.js 的 LAYER_LABELS）。
// 说明：本文件不含任何未经授权的引述、馆藏编号推测、采访或人物生平；
// 器物原型与工艺语境均沿用 vessels.js 已标注的公开来源；摘记条目已于 2026-10-10 全部人工核实（pending: false）。

// —— 统一来源（与 vessels.js / culture.js 同源，避免口径分叉）——
export const GUIDE_SOURCES = {
  dpm_ihchina: { name: '中国非物质文化遗产网 · 景德镇传统手工制瓷技艺', url: 'https://www.ihchina.cn/project_details/10291' },
  dpm_jiuci: { name: '故宫博物院 · 陶瓷锔补工艺研究', url: 'https://www.dpm.org.cn/journal/256084.html' },
  dpm_digicol: { name: '故宫博物院数字文物库 · 器物原型参考', url: 'https://digicol.dpm.org.cn/' },
  attribution: { name: '原型图片来源与许可说明', url: './patterns/real/ATTRIBUTION.md' },
  meiping: { name: '故宫博物院 · 明嘉靖青花花鸟纹梅瓶（故00145714）', url: 'https://www.dpm.org.cn/collection/ceramic/226936.html' },
  yuhuchun: { name: '故宫博物院 · 明永乐青花玉壶春瓶（故00145313）', url: 'https://www.dpm.org.cn/collection/ceramic/226976.html' },
  jiangjun: { name: '故宫博物院 · 元青花缠枝牡丹云龙纹罐（新00196642）', url: 'https://www.dpm.org.cn/collection/ceramic/227554.html' },
  gaozu: { name: '故宫博物院 · 元景德镇窑釉里红转把杯（新00020527）', url: 'https://www.dpm.org.cn/collection/ceramic/226885.html' },
  suantou: { name: '故宫博物院 · 明嘉靖白釉塑贴红蟠螭纹蒜头瓶（故00145720）', url: 'https://www.dpm.org.cn/collection/ceramic/227142.html' },
  linglong: { name: '故宫博物院 · 明永乐影青暗花缠枝莲纹碗（故00145525）', url: 'https://www.dpm.org.cn/collection/ceramic/227639.html' },
  // —— 行业通识层新增来源（陶瓷史 / 窑口 / 材料 / 产业），均为机构官网公开入口 ——
  dpm: { name: '故宫博物院官网 · 陶瓷典藏', url: 'https://www.dpm.org.cn/home.html' },
  chnmuseum: { name: '中国国家博物馆官网 · 古代陶瓷', url: 'https://www.chnmuseum.cn/' },
  sic: { name: '中国科学院上海硅酸盐研究所 · 古陶瓷科学研究', url: 'https://www.sic.ac.cn/' },
  ihchina: { name: '中国非物质文化遗产网', url: 'https://www.ihchina.cn/' },
  kaogu: { name: '中国考古网 · 陶瓷考古', url: 'http://kaogu.cssn.cn/' },
  jdzgov: { name: '景德镇市人民政府 · 陶瓷文化', url: 'https://www.jdz.gov.cn/' }
};

// —— 智能体边界 ——
// 本地资料无依据时使用，不得以肯定语气补全未知内容。
export const UNKNOWN_ANSWER = '现有展览资料中没有足够依据回答这个问题，建议查看资料来源或由人工进一步核实。';
export const GUIDE_DISCLAIMER = '数字讲解依据项目已整理资料生成，不替代专业鉴定与学术研究。';
export const VOICE_LABEL = 'AI 合成角色语音';

// —— 器灵「阿圆」设定（原创数字角色，全站唯一讲解形象）——
// 讲器物的生命史、纹样记忆与修复故事，也讲陶瓷行业通识并联想回展厅。
export const GUIDE_QILING = {
  id: 'qiling-ayuan',
  name: '器灵 · 阿圆',
  role: '瓷器知识讲解员（数字角色）',
  signature: '空灵、年轻的瓷器灵声线；讲器物记忆，也讲陶瓷行业通识，并联想回展厅',
  // 首次出现前必须展示的原创声明。
  disclaimer: '「器灵 · 阿圆」为原创数字角色，不是真实历史人物复原，也不代表任何器灵信仰；3D 形象为程序化数字资产。',
  // 阿圆的知识边界：器物记忆 + 陶瓷行业通识（史、窑、料、彩、修复、产业、术语），
  // 可给出条目间联想；现代研究与来源仍与数字策展员同源标注。
  forbidden: [
    '冒充真实历史人物、传承人或公众人物的声音、姓名与生平',
    '以器物口吻编造未经标注的史实、年代或机构背书',
    '替用户做修复决定、改写答案或绕过任何流程'
  ]
};

// —— 知识条目 ——
// 字段：
//   id          唯一标识
//   scope       vessel / craft / history / repair / life / fieldwork / project
//   vessel      关联器物 id（无则 null）
//   view        建议出现的页面（用于推荐问题与上下文加权）
//   question    该条对应的典型提问（也是推荐问题来源）
//   keywords    中文检索词（分词后命中计分）
//   title       回答标题
//   answer      回答正文（须与标签、来源一致）
//   layer       主标签（五层之一）
//   layers      附加标签（可选）
//   sources     来源数组（取自 GUIDE_SOURCES）
//   characterLine 古人角色的口语补充（可选，仅用于可承载情感/劳动的条目）
//   pending     true 时正文须自带「待人工核实」字样（仅用于未核对的个别新内容）
export const KNOWLEDGE = [
  // —— 一号 花鸟纹梅瓶 ——
  {
    id: 'mp-form', scope: 'vessel', vessel: 'meiping', view: ['commission', 'exhibit', 'cabinet'],
    question: '这件器物为什么采用这种器型？',
    keywords: ['梅瓶', '器型', '为什么', '造型', '小口', '丰肩', '花鸟纹梅瓶'], related: ['frm-vasegene', 'his-yuanqinghua'],
    title: '梅瓶的器型由来',
    answer: '梅瓶小口、短颈、丰肩、长腹，是宋代以来成型的经典器型，明清多作陈设与盛器。它的比例让肩部线条饱满、下腹收敛，便于立稳也更显挺拔。本件数字梅瓶的器型比例参考故宫藏明嘉靖青花花鸟纹梅瓶。',
    layer: 'fact', sources: ['meiping', 'dpm_digicol'],
    characterLine: '这梅瓶的肩要圆得匀，收得稳——手一偏，整只瓶的脾气就变了。'
  },
  {
    id: 'mp-pattern', scope: 'vessel', vessel: 'meiping', view: ['commission', 'exhibit'],
    question: '这处纹样有什么含义？',
    keywords: ['纹样', '花鸟', '含义', '寓意', '缠枝莲', '青花'], related: ['frm-chanzhi', 'frm-qinghua', 'his-yuanqinghua'],
    title: '花鸟与缠枝莲',
    answer: '嘉靖民窑青花常见花鸟题材，近足多饰缠枝莲带。花鸟寄托生机与日常情趣，缠枝莲的枝蔓首尾相连，寓意延续不断。观察时可从一朵花追到下一朵花，体会重复中的变化——这正是「对花」拼合的线索。',
    layer: 'fact', layers: ['schematic'], sources: ['meiping', 'dpm_ihchina'],
    characterLine: '落笔虽轻，入窑之后却再无修改余地。青花的浓淡，一半看画工手法，一半看青料与窑火。'
  },
  {
    id: 'mp-craft', scope: 'vessel', vessel: 'meiping', view: ['commission', 'exhibit'],
    question: '它可能经过哪些制瓷工序？',
    keywords: ['工序', '制瓷', '流程', '拉坯', '画坯', '施釉', '烧窑', '怎么做的'],
    title: '一件梅瓶的制瓷工序',
    answer: '一件手工瓷大致要经过淘泥、拉坯、利坯、画坯（青花）、施釉、装匣与烧窑等环节，分工细密、各工种代代相传。梅瓶这类器物对拉坯与利坯的弧度要求较高，青花则须在坯体上完成绘制。本项目中的拼合与绘制均为数字示意。',
    layer: 'fact', layers: ['schematic'], sources: ['dpm_ihchina'],
    characterLine: '泥、火、笔、手，缺一样都成不了器。我们画坯的只管一笔青花，可前面还有多少双手，才把这只瓶送到我面前。'
  },

  // —— 二号 玉壶春瓶 ——
  {
    id: 'yhc-form', scope: 'vessel', vessel: 'yuhuchun', view: ['commission', 'exhibit'],
    question: '这件器物为什么采用这种器型？',
    keywords: ['玉壶春', '器型', '撇口', '细颈', '为什么'],
    title: '玉壶春瓶的器型',
    answer: '玉壶春瓶撇口、细颈、垂腹、圈足，线条从上到下由收转放，是元代以来常见的酒器与陈设器。它的比例与缠枝莲纹相配，适合环绕观赏。本件数字器物器型与纹样参考故宫藏明永乐青花玉壶春瓶。',
    layer: 'fact', sources: ['yuhuchun', 'dpm_digicol'],
    characterLine: '玉壶春的颈最考人手——瘦一分站不住，胖一分就没了精神。'
  },
  {
    id: 'yhc-smco', scope: 'vessel', vessel: 'yuhuchun', view: ['exhibit', 'memory'],
    question: '苏麻离青是什么？',
    keywords: ['苏麻离青', '青料', '钴', '晕散', '永乐', '郑和'],
    title: '苏麻离青与晕散',
    answer: '永乐青花中常用一种含铁较高的进口青料（俗称苏麻离青），烧成后发色浓艳，线条边缘常有自然晕散、并见铁锈斑。这一效果既与青料成分有关，也受窑温与釉层影响，是永乐青花被人辨识的特征之一。本项目仅作工艺语境说明。',
    layer: 'fact', layers: ['schematic'], sources: ['yuhuchun', 'dpm_ihchina'],
    characterLine: '苏麻离青遇火会晕，像墨落进宣纸。你越想追着笔锋跑，它越不听你的。'
  },
  {
    id: 'yhc-kiln', scope: 'vessel', vessel: 'yuhuchun', view: ['memory', 'choice', 'exhibit'],
    question: '御窑为什么「落选即碎」？',
    keywords: ['御窑', '落选', '打碎', '掩埋', '官窑', '为什么碎'],
    title: '御窑制度与落选贡瓷',
    answer: '御窑（御器厂）专为宫廷烧造，对形制、釉色、纹样要求极严；成品经层层验看，稍有瑕疵便判落选。落选贡瓷按规例不得流入民间，多在厂内集中打碎、掩埋，今御窑厂遗址考古仍可见成层堆积的碎瓷。本件「因颈上细纹落选」的个体经历为原创叙事；具体规例与地层细节以考古报告为准。',
    layer: 'fact', layers: ['fiction'], sources: ['dpm_ihchina'],
    characterLine: '锤落下来之前，执锤的人叹了口气——他碎了我，却把我每一片都放得整整齐齐。'
  },

  // —— 三号 云龙纹罐 ——
  {
    id: 'jj-trade', scope: 'vessel', vessel: 'jiangjun', view: ['commission', 'exhibit'],
    question: '瓷器怎样走向远方？',
    keywords: ['外销', '贸易', '海上', '丝路', '海外', '交流', '沉船'],
    title: '元青花的外销之路',
    answer: '元代景德镇青花大量外销，常按订户图样烧造，经海路远销西亚、东南亚等地。元青花多用多层带状装饰，云龙与缠枝牡丹是经典组合；海外馆藏与沉船出水文物都佐证了这条贸易路线。本件的沉没海域、商行与集市见闻为原创叙事。',
    layer: 'fact', layers: ['fiction'], sources: ['jiangjun', 'dpm_ihchina'],
    characterLine: '出海的瓷，一船九凶都要去。海那边的人隔着万里看不清留白，所以纹样要画得满。'
  },
  {
    id: 'jj-pattern', scope: 'vessel', vessel: 'jiangjun', view: ['commission', 'exhibit'],
    question: '这处纹样有什么含义？',
    keywords: ['云龙', '龙纹', '牡丹', '纹样', '缠枝', '含义'],
    title: '云龙与缠枝牡丹',
    answer: '云龙与缠枝牡丹同为元代青花常见组合：龙在中国文化中象征权威与祥瑞，缠枝牡丹富丽、连绵不断，适合大器腹部的环绕布局。辨认时应先定云龙主体方向，再连接上下卷曲的枝蔓与莲瓣，密集处尤其要核对旋转角度。',
    layer: 'fact', layers: ['schematic'], sources: ['jiangjun', 'dpm_digicol'],
    characterLine: '画龙要看它飞的方向——龙一顺，满器的气就通了。'
  },
  {
    id: 'jj-water', scope: 'vessel', vessel: 'jiangjun', view: ['memory', 'exhibit'],
    question: '沉船出水的瓷器怎么保护？',
    keywords: ['沉船', '出水', '脱盐', '保护', '海水', '盐'],
    title: '出水瓷器的脱盐处置',
    answer: '长期浸泡海水的陶瓷，胎釉孔隙中会渗入可溶盐；出水后若不处理，盐分结晶会造成釉面剥落，因此通常要经过较长时间的淡水脱盐等保护处置。这是出水文物保护的常见原则性做法，具体方案须由专业机构依文物状况确定。本项目仅作数字示意，具体脱盐时长与工艺细节以专业机构方案为准。',
    layer: 'fact', layers: ['schematic'], sources: ['dpm_ihchina'],
    characterLine: '脱盐池里的水一天天换，我身上的盐霜化成细小的白雾——像散了几百年的一口咸气。'
  },

  // —— 四号 釉里红高足转杯 ——
  {
    id: 'gz-youlihong', scope: 'vessel', vessel: 'gaozu', view: ['commission', 'choice', 'exhibit', 'memory'],
    question: '釉里红为什么难以烧制？',
    keywords: ['釉里红', '铜红', '为什么', '难', '烧制', '呈色', '窑火', '十窑九不成', '失败'],
    title: '釉里红的呈色难处',
    answer: '釉里红以铜为呈色剂，须在高温还原气氛中才能显红，对窑温与气氛极为敏感：温度或气氛偏差，颜色就可能发黑、发绿或烧飞，因此历史成品率很低。「十窑九不成」是形容成品率之低的民间说法，不是统计数据。本项目不对釉方与烧成温度作具体数值表述。',
    layer: 'fact', layers: ['legend', 'schematic'], sources: ['gaozu', 'dpm_ihchina'],
    characterLine: '差一分是黑，过一分是绿。点完这一片红，手心全是汗——火里的赌，谁都输过。'
  },
  {
    id: 'gz-form', scope: 'vessel', vessel: 'gaozu', view: ['commission', 'exhibit'],
    question: '高足杯的「转把」是什么？',
    keywords: ['高足杯', '转把', '转杯', '器型', '高足'],
    title: '高足杯与「转把」做法',
    answer: '高足杯在元代十分流行，杯身置于高足之上，便于持握。有的高足杯杯身与足之间可相对转动，被称为「转把」或「转杯」，是元瓷的一种特色做法。本件数字器物器型与釉里红呈色参考故宫藏元景德镇窑釉里红转把杯。',
    layer: 'fact', sources: ['gaozu', 'dpm_digicol'],
    characterLine: '杯身能转，人心不能散。转把转得再顺，也得两只手都稳住。'
  },
  {
    id: 'gz-experience', scope: 'vessel', vessel: 'gaozu', view: ['memory', 'choice'],
    question: '匠人怎么面对失败的一窑？',
    keywords: ['失败', '匠人', '经验', '再来一窑', '心态', '勇气'],
    title: '失败与匠人经验',
    answer: '釉里红这类难烧的品种，靠的是长期积累的对火色与火路的判断，很难用单一数值替代。失败一窑并不等于白费——窑位、火路、釉层的变化都会被记下来，成为下一次的依据。本件「再来一窑」的经历为原创叙事。',
    layer: 'fiction', layers: ['fact'], sources: ['gaozu', 'dpm_ihchina'],
    characterLine: '我们那代人十窑九不成。可我们从来没说过不烧——学手艺，先学记住失败那一窑。'
  },

  // —— 五号 祭红釉蒜头瓶 ——
  {
    id: 'st-jihong', scope: 'vessel', vessel: 'suantou', view: ['commission', 'exhibit'],
    question: '祭红釉是什么？',
    keywords: ['祭红', '霁红', '颜色釉', '红釉', '铜红', '蒜头瓶', '釉色'],
    title: '祭红（霁红）与蒜头瓶',
    answer: '祭红（霁红）属高温铜红釉，与釉里红同为铜呈色，烧成极难，明清文献多记其难得。蒜头瓶因口部形似蒜头而得名，是常见的瓶式。本件红色为数字釉色表达，器型参考故宫藏明嘉靖白釉塑贴红蟠螭纹蒜头瓶，并非复制该馆藏器物的颜色。',
    layer: 'fact', layers: ['schematic'], sources: ['suantou', 'dpm_ihchina'],
    characterLine: '祭红无纹可循，拼它靠的是断口的弧度，不是眼睛。'
  },
  {
    id: 'st-legend', scope: 'vessel', vessel: 'suantou', view: ['memory', 'exhibit', 'choice'],
    question: '跳窑女传说是真的吗？',
    keywords: ['传说', '跳窑', '窑工之女', '是真的吗', '民间', '故事', '真假'],
    title: '「跳窑成红」是民间传说',
    answer: '关于窑工之女纵身入火、满窑霞色的说法，属于地方民间传说，寄托了乡人对难成之红的想象与心意，不可考。红釉的真正成因来自铜在高温还原气氛中的呈色，与传说无关——区分传说与工艺事实，正是理解这类器物的关键。本项目在展签中同时保留两者并分别标注。',
    layer: 'legend', layers: ['fact'], sources: ['suantou'],
    characterLine: '传说寄托的是乡人的心意，成色靠的却是材料与火候。两样都值得记住，可不能混作一谈。'
  },
  {
    id: 'st-truth', scope: 'vessel', vessel: 'suantou', view: ['exhibit', 'memory'],
    question: '祭红釉的内容里哪些是史实、哪些是传说？',
    keywords: ['史实', '创作', '原创', '真假', '祭红', '传说', '分开讲', '两张展签'],
    title: '本件的内容分层',
    answer: '【史实依据】祭红属铜红釉、烧成困难，为公开馆藏资料支持；蒜头瓶器型可参考故宫藏实物。【民间传说】跳窑女故事不可考。【原创叙事】配釉之女、九十一窑成红等情节为本项目创作。【数字示意】红色釉面与交互均为数字转译。',
    layer: 'schematic', layers: ['fact', 'legend', 'fiction'], sources: ['suantou', 'attribution'],
    characterLine: '你愿意听传说，也愿意问它的真假——这就对了。'
  },

  // —— 六号 玲珑瓷碗 ——
  {
    id: 'll-craft', scope: 'vessel', vessel: 'linglong', view: ['commission', 'exhibit'],
    question: '玲珑瓷是怎么做出来的？',
    keywords: ['玲珑', '玲珑眼', '镂空', '米通', '填釉', '透光', '怎么做'],
    title: '玲珑瓷的「镂」与「填」',
    answer: '玲珑瓷是在坯体上刻镂出米粒状的孔眼（习称玲珑眼），再填入釉料，与器身一同施釉烧成，成器后孔眼透光如星，旧有「米通」之称，常与青花结合为青花玲珑。名字里的「镂」指坯体加工阶段，并非成器后每个孔都敞开。本件器型与薄胎透光工艺参考故宫藏明永乐影青暗花缠枝莲纹碗，玲珑眼布局为数字纹样原创。',
    layer: 'fact', layers: ['schematic'], sources: ['linglong', 'dpm_ihchina'],
    characterLine: '刻眼的时候手要稳，填釉的时候心要静——心里有一粒躁，釉就堵一粒光。'
  },
  {
    id: 'll-division', scope: 'vessel', vessel: 'linglong', view: ['exhibit', 'certificate'],
    question: '景德镇制瓷有多少道工序？',
    keywords: ['分工', '工序', '七十二', '过手七十二', '工种', '师徒', '传承'],
    title: '「过手七十二」与分工传承',
    answer: '《天工开物》有「过手七十二方克成器」之说，形容景德镇制瓷分工之细：揉泥、拉坯、利坯、刻眼、填釉、画坯、施釉、装坯、烧窑等各司其职、代代相传。工序数目历代记载有异，此处引述文献，不作精确统计，工序名目以文献原文为准。今天这些技艺仍有人传习，并进入非遗保护体系。',
    layer: 'fact', layers: ['fact'], sources: ['dpm_ihchina'],
    characterLine: '一只碗要过多少手，你知道吗？刻眼的、填釉的、画边的、看火的……我只是其中一双。'
  },
  {
    id: 'll-inherit', scope: 'vessel', vessel: 'linglong', view: ['certificate', 'exhibit'],
    question: '这门手艺今天由谁传承？',
    keywords: ['传承', '今天', '当代', '谁', '学徒', '年轻', '非遗'],
    title: '当代传承',
    answer: '景德镇传统手工制瓷技艺已列入国家级非物质文化遗产名录，通过作坊传习、院校教育与文创街区等方式延续。本项目中的师傅、学徒与委托人形象均为原创设定，不代表任何真实传承人，也不替代传承人口述与正式采访。「传承资料摘记」已完成人工核对，出处与访问日期随条目登记。',
    layer: 'fact', layers: ['fiction'], sources: ['dpm_ihchina',],
    characterLine: '我这一手早晚要交出去。交给谁不打紧，交得下去，才算没白学。'
  },

  // —— 跨器物的工艺 / 修复 / 生命史 ——
  {
    id: 'craft-steps', scope: 'craft', vessel: null, view: ['commission', 'puzzle', 'exhibit'],
    question: '景德镇传统制瓷有哪些主要工序？',
    keywords: ['工序', '制瓷', '流程', '分工', '淘泥', '拉坯', '利坯', '施釉', '烧窑', '七十二'],
    title: '从泥到器的工序',
    answer: '手工制瓷大致分三段：成坯（淘泥、揉泥、拉坯、利坯、修坯）、装饰（画坯、刻花、上釉）、烧成（装匣、烧窑、开窑）。每一段又分若干工种，环环相扣。不同器型（如梅瓶、玉壶春、高足杯）对拉坯与利坯的要求各不相同。本项目交互为数字示意，不构成操作指导。',
    layer: 'fact', layers: ['schematic'], sources: ['dpm_ihchina'],
    characterLine: '我最认得的是「画坯」这一手，可没有前面那些手，我这枝花也没处落笔。'
  },
  {
    id: 'craft-porcelain-types', scope: 'craft', vessel: null, view: ['exhibit', 'cabinet'],
    question: '青花、釉里红、颜色釉、玲珑瓷有什么不同？',
    keywords: ['青花', '釉里红', '颜色釉', '玲珑', '区别', '不同', '釉色', '分类'],
    title: '四类釉彩的区别',
    answer: '青花用钴料在釉下绘纹，烧后呈蓝；釉里红以铜为呈色剂在釉下显红，烧成极难；颜色釉是以釉本身的颜色取胜的品种（祭红即其一）；玲珑瓷则在坯上镂孔填釉，靠透光成美，常与青花并用。四者分别对应本项目六件器物的釉彩谱系。',
    layer: 'fact', sources: ['dpm_ihchina', 'dpm_digicol'], related: ['mp-pattern', 'frm-qinghua', 'frm-linglong'],
    characterLine: '蓝难过火，红更难。一样是瓷，脾气各不相同。'
  },
  {
    id: 'repair-diff', scope: 'repair', vessel: null, view: ['choice', 'certificate', 'exhibit'],
    question: '锔瓷与金缮有什么不同？',
    keywords: ['锔瓷', '金缮', '区别', '不同', '修补', '金线', '钉子', '怎么修'],
    title: '锔瓷与金缮的区别',
    answer: '锔瓷是中国传统修补工艺，以金属锔钉跨接裂痕、把分开的瓷片重新连起来；金缮源自日本，用漆黏合后以金粉饰于接缝。两者都选择「看得见」的修复，但材料、工具与审美不同。本项目对两者均作简化数字示意，不涉及真实钻孔、材料与工具操作。',
    layer: 'fact', layers: ['schematic'], sources: ['dpm_jiuci'],
    characterLine: '锔钉是给裂痕打一副骨头；金线是给裂痕描一道眉。修好了，都算惜物。'
  },
  {
    id: 'repair-keep', scope: 'repair', vessel: null, view: ['choice', 'certificate'],
    question: '为什么修复时可以选择保留裂痕？',
    keywords: ['保留', '裂痕', '现状保存', '不修复', '为什么', '伤痕', '证据'],
    title: '现状保存与保留裂痕',
    answer: '现代文物保护讲究最小干预、可逆与可识别：能不动就不动，今天做的明天应能收回，修补过的部分要让人看得出来。对某些器物而言，破碎本身也是真实信息——因此「现状保存」（不修复）是一种完整而诚实的选择，而不是偷懒。本项目以此呈现不同修复方式背后的文保伦理。',
    layer: 'fact', layers: ['schematic'], sources: ['dpm_jiuci'],
    characterLine: '有些裂痕，留着比补上更真。肯留着，也是一种本事。'
  },
  {
    id: 'repair-methods', scope: 'repair', vessel: null, view: ['choice'],
    question: '隐痕修复、金线表达和现状保存各是什么？',
    keywords: ['隐痕', '金线', '金缮', '现状保存', '修复方式', '三种', '怎么选'],
    title: '四种修复取向',
    answer: '隐痕修复尽量还原原貌、以浅灰细线记录改变；金线表达以金色线条承接破碎，让经历成为新的纹理；锔瓷体验用金属锔钉连接裂痕，记住修补的手艺；现状保存则选择不修复，保留破碎作为证据。四者没有对错，差别在于对「器物生命史」的不同态度。',
    layer: 'schematic', layers: ['fact'], sources: ['dpm_jiuci'],
    characterLine: '补不补、怎么补，是你的道理。我只提醒一句：手上的轻重，都是承诺。'
  },
  {
    id: 'life-history', scope: 'life', vessel: null, view: ['memory', 'certificate'],
    question: '什么是「器物生命史」？',
    keywords: ['生命史', '器物生命', '经历', '一生', '故事', '记忆'],
    title: '器物生命史',
    answer: '器物生命史指一件器物从制作、使用、破损到修补、流传的完整过程。它关注的不只是「它是什么」，还有「它经历过什么、由谁照料」。本项目六件器物的编年记忆即为原创的第一人称生命史写作，用于帮助理解工艺与生活，不代表任何真实馆藏器物。',
    layer: 'fiction', layers: ['schematic'], sources: ['attribution'],
    characterLine: '一只瓶记得的事，比人想的多了。它记得谁的手心凉，谁的手心暖。'
  },
  {
    id: 'field-yuyao', scope: 'fieldwork', vessel: null, view: ['tour'],
    question: '御窑厂考察点看到的是什么？',
    keywords: ['御窑厂', '考察', '遗址', '探方', '掩埋坑', '实景'],
    title: '御窑厂（写实 3D 考察）',
    answer: '御窑厂是明清两代专烧宫廷用瓷的官办窑场，落选贡瓷多在厂内集中打碎、掩埋，遗址考古仍可见成层堆积的碎瓷。本项目的御窑厂为写实风格的 3D 数字重建，用于空间与工序示意。相关手记引自公开资料概括，以「传承资料摘记 · 已核实」注明出处。',
    layer: 'fact', layers: ['schematic'], sources: ['dpm_ihchina',],
    characterLine: '红墙下的匣钵堆了半人高。这里的碎瓷按年代分层——一层，就是一个朝代的手抖与心虚。'
  },
  {
    id: 'field-guyao', scope: 'fieldwork', vessel: null, view: ['tour'],
    question: '古窑考察点在讲什么？',
    keywords: ['古窑', '镇窑', '龙窑', '柴窑', '窑房', '考察', '实景'],
    title: '古窑（写实 3D 考察）',
    answer: '古窑一端是穿斗木构的镇窑窑房与双砖烟囱，一端是沿坡而上的宋代龙窑敞廊。镇窑以松柴为燃料，窑工凭火色与经验判断窑温与火路，把桩师傅的看火手感很难用单一数值替代。本项目为写实风格的 3D 数字重建，用于窑业空间示意，窑房与龙窑的构件细节以现场公开资料为准。',
    layer: 'fact', layers: ['schematic'], sources: ['dpm_ihchina',],
    characterLine: '看火的人，一辈子就盯着那一线火色。火不骗人，你糊弄它一次，它就糊弄你一窑。'
  },
  {
    id: 'field-taoxichuan', scope: 'fieldwork', vessel: null, view: ['tour'],
    question: '陶溪川为什么是陶瓷文化街区？',
    keywords: ['陶溪川', '老厂房', '宇宙瓷厂', '烟囱', '文创', '考察', '实景'],
    title: '陶溪川（写实 3D 考察）',
    answer: '陶溪川由建国后兴建的宇宙瓷厂等老厂房改造而来，锯齿形厂房、红砖烟囱与旧隧道窑被保留，成为年轻陶艺工作者聚集的文化创意街区。工业遗存被再利用为展陈与创作空间，延续了瓷都的产业记忆。本项目为写实风格的 3D 数字重建，引自公开资料概括，已注明出处。',
    layer: 'fact', layers: ['schematic'], sources: ['dpm_ihchina',],
    characterLine: '老厂房的锯齿屋顶下，从前是流水般的生产；如今是年轻人摆摊、拉坯、开窑。瓷没停过。'
  },
  {
    id: 'project-layers', scope: 'project', vessel: null, view: ['start', 'cabinet', 'exhibit', 'certificate', 'memory'],
    question: '这段内容是史实还是项目创作？',
    keywords: ['史实', '创作', '标签', '分层', '内容属性', '真实性', '项目', '原创'],
    title: '本项目的内容分层',
    answer: '全站统一使用五种标签：【史实依据】来自公开资料；【民间传说】明确标注叙事性质；【原创叙事】器物、人物与经历为本项目创作；【数字示意】所有交互与视觉均为数字转译。如个别新内容尚未核对原文，会单独标注【待人工核实】。我们不使用「真实故事」「真实还原」等称谓。',
    layer: 'schematic', layers: ['fact', 'legend', 'fiction', 'pending'], sources: ['attribution'],
    characterLine: '我做的是画坯的活，讲不了三百年后的事。要听考古和文献，得请那位「数字策展员」开口。'
  },
  {
    id: 'project-origin', scope: 'project', vessel: null, view: ['start', 'exhibit'],
    question: '这些器物是真实的馆藏文物吗？',
    keywords: ['真实', '馆藏', '文物', '原件', '是不是真的', '复制', '原型'],
    title: '数字器物与原型参考',
    answer: '六件器物均为本项目原创设定的数字器物，不是真实馆藏文物的复原：器型与纹样参考了故宫博物院公开藏品资料（出处见展签与 ATTRIBUTION），而器物的经历、委托人与人物均为创作。因此不要把它当作馆藏档案或鉴定依据。',
    layer: 'fiction', layers: ['fact', 'schematic'], sources: ['attribution', 'dpm_digicol'],
    characterLine: '我不是什么馆里的旧物。我是照着一件件真东西，重新捏出来的影子——可影子也认真。'
  },
  {
    id: 'project-role', scope: 'project', vessel: null, view: ['start', 'cabinet', 'exhibit'],
    question: '这个项目想让人理解什么？',
    keywords: ['项目', '主题', '想表达', '理解什么', '意义', '六件', '学习路径'],
    title: '六件器物连成的学习路径',
    answer: '六件器物串起一条文化学习路径：纹样与日常使用（花鸟梅瓶）→ 官窑制度与考古记录（玉壶春瓶）→ 瓷器贸易与交流（云龙罐）→ 窑火控制与匠人经验（釉里红杯）→ 传说与工艺事实的区分（祭红瓶）→ 分工与当代传承（玲珑碗）。修复一件瓷器，就是接续一段生活与一群人的劳动。',
    layer: 'schematic', layers: ['fiction'], sources: ['attribution'],
    characterLine: '一件器物，一项手艺，一群人，一座城，一次选择——你走完这一趟，就都懂了。'
  }
];

// —— 推荐问题说明 ——
// 推荐问题不在此处维护：由 knowledge-base.js 的 recommendedQuestions() 直接从
// KNOWLEDGE 的问句字段按「当前器物 → 当前页面 → 跨器物」生成，保证每条可被检索命中。

// 展厅「热点」：可点击的观察点，同时供 3D 标记与键盘/触屏按钮使用。
export const EXHIBIT_HOTSPOTS = {
  _default: [
    { id: 'form', label: '器型', question: '这件器物为什么采用这种器型？' },
    { id: 'pattern', label: '纹样', question: '这处纹样有什么含义？' },
    { id: 'craft', label: '工序', question: '它可能经过哪些制瓷工序？' },
    { id: 'layer', label: '内容性质', question: '这段内容是史实还是项目创作？' }
  ],
  gaozu: [
    { id: 'glaze', label: '釉色 · 釉里红', question: '釉里红为什么难以烧制？' },
    { id: 'craft', label: '工序', question: '它可能经过哪些制瓷工序？' },
    { id: 'form', label: '器型 · 高足', question: '高足杯的「转把」是什么？' }
  ],
  suantou: [
    { id: 'glaze', label: '釉色 · 祭红', question: '祭红釉是什么？' },
    { id: 'legend', label: '传说', question: '跳窑女传说是真的吗？' },
    { id: 'layer', label: '内容性质', question: '这段内容是史实还是项目创作？' }
  ],
  linglong: [
    { id: 'craft', label: '玲珑眼', question: '玲珑瓷是怎么做出来的？' },
    { id: 'division', label: '分工与传承', question: '景德镇制瓷有多少道工序？' },
    { id: 'inherit', label: '当代传承', question: '这门手艺今天由谁传承？' }
  ]
};

export const hotspotByVessel = id => EXHIBIT_HOTSPOTS[id] || EXHIBIT_HOTSPOTS._default;