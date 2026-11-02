// 《碎瓷重圆》行业知识库：从「六件展品讲解」扩展到整个陶瓷行业的通识层。
// 与 guide.js（展品与工艺讲解层）共用条目 schema，由 knowledge-base.js 合并检索。
// 内容口径与全站一致——五层标签：fact / legend / fiction / schematic / pending；
// 每条带可追溯来源（GUIDE_SOURCES 中的公开机构入口），不引入无法核实的内容；
// keywords 必须写足实义词（领域判据 isInScope 靠它命中，约 4 字词或 2×2 字词）。
// related：条目间联想（可指向本文件或 guide.js 的条目 id），命中时由面板渲染为可点按钮。

// —— 行业分类树：无具体条目命中时返回分类引导，而不是「没有依据」——
export const CERAMIC_CATEGORIES = [
  { id: 'history', name: '陶瓷史', keywords: ['陶瓷史', '彩陶', '青瓷', '白瓷', '名窑', '元青花', '彩瓷', '陶瓷发展', '朝代', '演变'],
    samples: ['陶器是什么时候起源的？', '宋代的五大名窑是哪些？', '元青花为什么珍贵？'] },
  { id: 'kiln', name: '窑口', keywords: ['窑口', '窑系', '汝窑', '官窑', '哥窑', '钧窑', '定窑', '龙泉', '建窑', '德化', '越窑', '磁州窑'],
    samples: ['建窑茶盏有什么特点？', '龙泉青瓷的粉青是什么？', '德化白瓷为什么叫猪油白？'] },
  { id: 'material', name: '原料与工序', keywords: ['高岭土', '瓷石', '釉料', '青料', '工序', '拉坯', '利坯', '烧成', '气氛', '还原焰', '氧化焰', '匣钵'],
    samples: ['高岭土和瓷石有什么区别？', '什么是还原焰？', '匣钵是做什么用的？'] },
  { id: 'form', name: '器型·纹样·釉彩', keywords: ['器型', '纹样', '青花', '釉里红', '五彩', '斗彩', '粉彩', '珐琅彩', '单色釉', '开片'],
    samples: ['什么是粉彩？', '斗彩和五彩有什么区别？', '缠枝莲纹有什么寓意？'] },
  { id: 'repair', name: '修复与伦理', keywords: ['修复', '锔瓷', '金缮', '做旧', '伦理', '粘接', '大漆', '复原'],
    samples: ['锔瓷是怎么修复瓷器的？', '金缮用的是什么材料？', '文物修复为什么要可逆？'] },
  { id: 'industry', name: '现代产业与非遗', keywords: ['产业', '非遗', '传承', '陶溪川', '产区', '潮州', '宜兴', '手工', '当代'],
    samples: ['今天的景德镇是什么样的？', '陶瓷非遗传承人是怎么认定的？'] },
  { id: 'terms', name: '鉴赏与术语', keywords: ['断代', '款识', '鉴定', '术语', '火石红', '棕眼', '民窑', '命名', '作伪'],
    samples: ['瓷器断代看哪些方面？', '年款是什么意思？', '火石红是怎么形成的？'] }
];

// —— 行业条目 ——
export const CERAMICS = [

  // ============ 一、陶瓷史（14 条）============
  {
    id: 'his-origin', cat: 'history', scope: 'history',
    question: '陶器是什么时候起源的？',
    keywords: ['陶器', '起源', '新石器', '什么时候', '最早', '万年'],
    title: '从泥土到陶：两万年前的开始',
    answer: '目前考古发现中，最早的陶器距今约两万年，江西万年仙人洞遗址出土的陶片是世界已知较早的一批。陶器让人类可以煮水、储粮，是农业定居生活的重要基础。中国此后形成了漫长的制陶传统，为后来发明瓷器铺好了路。',
    layer: 'fact', sources: ['kaogu', 'chnmuseum'], related: ['his-caitao', 'his-primitive'],
    spiritLine: '最早的那一团泥，只是想替人盛一点热水。'
  },
  {
    id: 'his-caitao', cat: 'history', scope: 'history',
    question: '彩陶上的图案是什么意思？',
    keywords: ['彩陶', '仰韶', '鱼纹', '旋涡纹', '图案', '史前'],
    title: '彩陶：画在陶器上的早期纹样',
    answer: '仰韶文化等新石器时代的先民在橙红色陶坯上以黑、褐彩绘出鱼纹、花瓣纹、旋涡纹等图案，烧后成器，是现存最早的大宗彩绘装饰之一。这些纹样兼有装饰与记事、信仰意味，是中国纹样传统的源头。',
    layer: 'fact', sources: ['chnmuseum'], related: ['his-longshan', 'frm-chanzhi'],
    spiritLine: '最早的画师没有纸，就把想说的画在水器上。'
  },
  {
    id: 'his-longshan', cat: 'history', scope: 'history',
    question: '蛋壳黑陶为什么那么薄？',
    keywords: ['黑陶', '龙山', '蛋壳', '快轮', '薄胎'],
    title: '龙山蛋壳黑陶',
    answer: '山东龙山文化的蛋壳黑陶杯壁厚最薄处仅约零点几毫米，依托快轮拉坯成型与精细修坯，烧成后乌黑光亮。「薄如纸、黑如漆、亮如镜」说明当时的成型工艺已经非常成熟。',
    layer: 'fact', sources: ['chnmuseum'], related: ['his-caitao']
  },
  {
    id: 'his-primitive', cat: 'history', scope: 'history',
    question: '什么是原始瓷？',
    keywords: ['原始瓷', '商代', '青釉', '过渡', '印纹'],
    title: '原始瓷：瓷的雏形',
    answer: '商代出现以瓷石制胎、施高温石灰釉的「原始瓷」，胎质烧结程度介于陶与瓷之间，吸水率偏高。它是陶向瓷过渡的形态，经过上千年的原料与窑炉积累，才走向成熟的瓷器。',
    layer: 'fact', sources: ['sic', 'chnmuseum'], related: ['his-easthan']
  },
  {
    id: 'his-easthan', cat: 'history', scope: 'history',
    question: '成熟的瓷器是什么时候出现的？',
    keywords: ['东汉', '青瓷', '成熟', '上虞', '瓷器出现'],
    title: '东汉：成熟青瓷登场',
    answer: '考古材料显示，东汉时期浙江上虞一带的龙窑已能烧出胎质致密、吸水率低、胎釉结合良好的青瓷，学界一般视之为成熟瓷器的开端。此后青瓷长期是中国瓷业的主流。',
    layer: 'fact', sources: ['sic', 'kaogu'], related: ['his-primitive', 'kln-yue']
  },
  {
    id: 'his-whiteware', cat: 'history', scope: 'history',
    question: '白瓷是什么时候出现的？',
    keywords: ['白瓷', '北齐', '隋代', '邢窑', '出现'],
    title: '白瓷的出现',
    answer: '白瓷要求胎釉中含铁量极低，技术难度远高于青瓷。北朝晚期到隋代，北方窑场率先烧成较成熟的白瓷，唐代邢窑将其推向「类银似雪」的高峰，形成「南青北白」的格局。',
    layer: 'fact', sources: ['dpm', 'chnmuseum'], related: ['kln-xing', 'his-nanqingbeibai']
  },
  {
    id: 'his-nanqingbeibai', cat: 'history', scope: 'history',
    question: '「南青北白」是什么意思？',
    keywords: ['南青北白', '唐代', '格局', '越窑', '邢窑'],
    title: '唐代的「南青北白」',
    answer: '唐代瓷业形成南方以越窑为代表的青瓷系统与北方以邢窑为代表的白瓷系统并立的局面，此外还有长沙窑釉下彩、唐三彩等。「南青北白」概括的是主流釉色的地域分工，而非绝对的界限。',
    layer: 'fact', sources: ['dpm', 'chnmuseum'], related: ['kln-yue', 'kln-xing', 'his-tangsancai']
  },
  {
    id: 'his-tangsancai', cat: 'history', scope: 'history',
    question: '唐三彩是瓷器吗？',
    keywords: ['唐三彩', '三彩', '低温釉', '陶器', '明器'],
    title: '唐三彩：低温铅釉陶',
    answer: '唐三彩严格说是低温铅釉陶器，以黄、绿、白等色釉交融流淌见长，多作随葬明器与一些日用构件，胎体一般不致密。它绚丽的釉色对后世低温彩釉系统影响很大。',
    layer: 'fact', sources: ['chnmuseum'], related: ['his-nanqingbeibai']
  },
  {
    id: 'his-song', cat: 'history', scope: 'history',
    question: '宋代的五大名窑是哪些？',
    keywords: ['五大名窑', '宋代', '汝官哥钧定', '审美', '名窑'],
    title: '宋瓷与「五大名窑」',
    answer: '汝、官、哥、钧、定合称宋代五大名窑，以素雅的造型与釉色取胜：汝窑天青、官窑粉青带开片、哥窑金丝铁线、钧窑窑变、定窑白釉刻花。宋代尚青尚雅的审美被后世视为中国陶瓷美学的高峰。',
    layer: 'fact', sources: ['dpm', 'chnmuseum'], related: ['kln-ru', 'kln-guan', 'kln-ge', 'kln-jun', 'kln-ding'],
    spiritLine: '那个时代的瓷器不吵，安安静静就很好看。'
  },
  {
    id: 'his-yuanqinghua', cat: 'history', scope: 'history',
    question: '元青花为什么珍贵？',
    keywords: ['元青花', '元代', '苏麻离青', '大罐', '珍贵', '成熟'],
    title: '元青花：青花技术的成熟期',
    answer: '元代景德镇把进口钴料（常称苏麻离青）与本地瓷石—高岭土二元配方结合，烧出发色浓艳、器型硕大的青花瓷，产品远销中东等地。传世与出土的元青花数量有限，大型精品尤受珍视。展厅里的云龙纹罐正属于这一传统。',
    layer: 'fact', sources: ['jiangjun', 'sic'], related: ['frm-qinghua', 'mp-pattern'],
    spiritLine: '从我这一辈起，蓝色开始在白色的身体上流动。'
  },
  {
    id: 'his-mingcai', cat: 'history', scope: 'history',
    question: '明清彩瓷是怎么发展起来的？',
    keywords: ['明清', '彩瓷', '五彩', '斗彩', '粉彩', '珐琅彩', '高峰'],
    title: '明清彩瓷的高峰',
    answer: '明代景德镇先后创烧成熟斗彩与五彩，清代在御窑体系中又发展出粉彩与珐琅彩，釉上釉下彩绘技术叠加成熟，与青花、单色釉共同构成明清瓷业的三大支柱。展柜里的许多名品都出自这条线索。',
    layer: 'fact', sources: ['dpm'], related: ['frm-doucai', 'frm-fencai', 'frm-wucai', 'frm-falangcai']
  },
  {
    id: 'his-maritime', cat: 'history', scope: 'history',
    question: '中国的瓷器是怎么走向世界的？',
    keywords: ['外销瓷', '海上丝绸之路', '出口', '沉船', '贸易'],
    title: '外销瓷与海上丝绸之路',
    answer: '唐宋以来，瓷器经海路大量外销，长沙窑、龙泉、景德镇等产品远销东亚、东南亚、西亚与欧洲；历代沉船（如「南海一号」类沉船）中瓷器常成批出现。外销需求反过来推动了器型、纹样与窑场的变革。',
    layer: 'fact', sources: ['kaogu', 'chnmuseum'], related: ['his-yuanqinghua', 'kln-changsha']
  },
  {
    id: 'his-jdzrise', cat: 'history', scope: 'history',
    question: '景德镇是怎么成为瓷都的？',
    keywords: ['景德镇', '瓷都', '青白瓷', '御窑', '崛起', '昌南'],
    title: '景德镇的崛起',
    answer: '景德镇自宋代以青白瓷知名，元代设浮梁磁局、创烧成熟青花，明代设立御器厂专烧宫廷用瓷，清代御窑技艺更臻完备，逐渐形成「工匠来八方，器成天下走」的瓷都地位。展厅里的六件器物，正好串起这段脉络。',
    layer: 'fact', sources: ['jdzgov', 'dpm'], related: ['kln-jingdezhen', 'his-mingcai'],
    spiritLine: '一座镇子烧了一千年，火气早就长进了每个人骨头里。'
  },
  {
    id: 'his-modern', cat: 'history', scope: 'history',
    question: '近现代中国陶瓷经历了什么？',
    keywords: ['近现代', '转型', '建国', '瓷厂', '当代', '变革'],
    title: '近现代的转型',
    answer: '清末民初传统瓷业受工业化冲击，二十世纪中叶各地组建大型瓷厂并恢复名窑技艺，改革开放后手工作坊与创意园区复兴，当代陶瓷在日用、艺术与材料科学多条线上并行发展。',
    layer: 'fact', sources: ['jdzgov', 'ihchina'], related: ['ind-taoxichuan', 'ind-handmade']
  },

  // ============ 二、窑口（15 条）============
  {
    id: 'kln-yue', cat: 'kiln', scope: 'kiln',
    question: '越窑青瓷有什么特点？',
    keywords: ['越窑', '青瓷', '秘色瓷', '唐代', '浙江'],
    title: '越窑：千峰翠色',
    answer: '越窑位于今浙江地区，是汉唐青瓷的核心窑场，晚唐五代烧造的「秘色瓷」釉色青翠莹润，诗人以「千峰翠色」形容。越窑的釉色与造型深刻影响了北方与南方的青瓷审美。',
    layer: 'fact', sources: ['chnmuseum', 'dpm'], related: ['his-easthan', 'his-nanqingbeibai']
  },
  {
    id: 'kln-xing', cat: 'kiln', scope: 'kiln',
    question: '邢窑白瓷有什么特点？',
    keywords: ['邢窑', '白瓷', '类银似雪', '唐代', '河北'],
    title: '邢窑：类银似雪',
    answer: '邢窑在今河北邢台一带，唐代以精细白瓷著称，「类银、类雪」是唐人对它的评价。邢窑白瓷多素面重造型，与越窑青瓷并列为唐代瓷业两大系统。',
    layer: 'fact', sources: ['dpm', 'chnmuseum'], related: ['his-whiteware', 'his-nanqingbeibai']
  },
  {
    id: 'kln-ru', cat: 'kiln', scope: 'kiln',
    question: '汝窑为什么那么珍贵？',
    keywords: ['汝窑', '天青', '玛瑙', '雨过天青', '宋代', '珍贵'],
    title: '汝窑：雨过天青',
    answer: '汝窑为宋代五大名窑之首，窑址在今河南宝丰清凉寺。天青釉面温润含蓄，多细碎开片，支钉满釉裹足烧；传世整器不足百件，是公认最稀见的名窑瓷器之一。文献中有釉内掺玛瑙末的说法。',
    layer: 'fact', layers: ['legend'], sources: ['dpm'], related: ['his-song', 'frm-kaipian']
  },
  {
    id: 'kln-guan', cat: 'kiln', scope: 'kiln',
    question: '官窑指的是什么？',
    keywords: ['官窑', '南宋', '郊坛下', '紫口铁足', '开片'],
    title: '官窑：为宫廷而烧',
    answer: '广义官窑指官方设置的御用窑场。宋代官窑有北宋与南宋之分，南宋郊坛下官窑产品粉青釉带开片、紫口铁足，承袭汝窑审美而更趋浑厚。明清的御器厂、御窑厂则是更制度化的官办体系。',
    layer: 'fact', sources: ['dpm', 'kaogu'], related: ['trm-gm', 'his-song']
  },
  {
    id: 'kln-ge', cat: 'kiln', scope: 'kiln',
    question: '哥窑的金丝铁线是什么？',
    keywords: ['哥窑', '金丝铁线', '开片', '传世', '之谜'],
    title: '哥窑：金丝铁线',
    answer: '哥窑以大开片套小开片著称：深色的大纹路如「铁线」，细密黄褐的小纹如「金丝」，是釉面多次开裂染色形成的独特装饰。哥窑窑址至今未确证，传世器特征一致，来源仍有研究空间，是名窑中的一桩悬案。',
    layer: 'fact', layers: ['legend'], sources: ['dpm'], related: ['trm-jinsitie', 'frm-kaipian']
  },
  {
    id: 'kln-jun', cat: 'kiln', scope: 'kiln',
    question: '钧窑的窑变是怎么回事？',
    keywords: ['钧窑', '窑变', '入窑一色', '出窑万彩', '红斑', '河南'],
    title: '钧窑：入窑一色，出窑万彩',
    answer: '钧窑在今河南禹州，以铜呈色的天蓝带紫红斑釉与窑变釉闻名，釉色在高温中自然流淌交融，无法完全预设，故有「入窑一色，出窑万彩」之说。钧窑还烧造出戟尊等陈设用器。',
    layer: 'fact', sources: ['dpm', 'chnmuseum'], related: ['frm-yaobian', 'his-song']
  },
  {
    id: 'kln-ding', cat: 'kiln', scope: 'kiln',
    question: '定窑白瓷有什么特点？',
    keywords: ['定窑', '白瓷', '刻花', '覆烧', '泪痕', '河北'],
    title: '定窑：白釉刻花',
    answer: '定窑在今河北曲阳，是宋代著名的白瓷窑场，以精工刻花、印花装饰见长，釉面常带「泪痕」状积釉。它首创覆烧工艺以提高产量，并被宫廷征用，汝窑的支钉满釉或正是对其芒口的改良。',
    layer: 'fact', sources: ['dpm', 'chnmuseum'], related: ['mat-spur', 'his-song']
  },
  {
    id: 'kln-longquan', cat: 'kiln', scope: 'kiln',
    question: '龙泉青瓷的粉青和梅子青是什么？',
    keywords: ['龙泉', '粉青', '梅子青', '青瓷', '浙江'],
    title: '龙泉：粉青与梅子青',
    answer: '龙泉窑在今浙江龙泉，南宋达到鼎盛。粉青釉柔和淡雅如雨过天色，梅子青釉肥厚莹润如初夏青梅，都是多次施釉、强还原焰烧成的结果。龙泉也是外销瓷的主力窑口之一。',
    layer: 'fact', sources: ['chnmuseum', 'dpm'], related: ['mat-atmosphere', 'his-maritime']
  },
  {
    id: 'kln-jian', cat: 'kiln', scope: 'kiln',
    question: '建窑的茶盏为什么受推崇？',
    keywords: ['建窑', '兔毫', '油滴', '茶盏', '斗茶', '福建'],
    title: '建窑：兔毫与油滴',
    answer: '建窑在今福建建阳，宋代以黑釉茶盏名世：釉中析出的铁系结晶呈细长条纹为「兔毫」，呈斑点状为「油滴」，与斗茶风尚相配。日本存有数件被奉为国宝的建盏，称「天目」。',
    layer: 'fact', sources: ['dpm', 'chnmuseum'], related: ['his-song']
  },
  {
    id: 'kln-jizhou', cat: 'kiln', scope: 'kiln',
    question: '木叶盏是怎么回事？',
    keywords: ['吉州窑', '木叶盏', '剪纸', '黑釉', '江西'],
    title: '吉州窑：木叶与剪纸贴花',
    answer: '吉州窑在今江西吉安，黑釉茶盏上以真实树叶经窑火蚀去叶肉、只留叶脉成形，称木叶盏；另有剪纸贴花等巧思。这种把自然物直接化为装饰的做法在陶瓷史上相当独特。',
    layer: 'fact', sources: ['chnmuseum', 'dpm'], related: ['kln-jian']
  },
  {
    id: 'kln-yaozhou', cat: 'kiln', scope: 'kiln',
    question: '耀州窑的刻花有什么特点？',
    keywords: ['耀州窑', '刻花', '青瓷', '陕西', '刀锋'],
    title: '耀州窑：刀刀见锋的刻花',
    answer: '耀州窑在今陕西铜川黄堡镇，金代以前以橄榄绿釉上的刻花、印花装饰著称，刀法犀利、线条深峻，有「刀刀见锋」之誉，图案多牡丹、水波等，犀利风格在北方青瓷中独树一帜。',
    layer: 'fact', sources: ['chnmuseum', 'dpm'], related: ['kln-longquan']
  },
  {
    id: 'kln-cizhou', cat: 'kiln', scope: 'kiln',
    question: '磁州窑是什么风格？',
    keywords: ['磁州窑', '白地黑花', '民间', '河北', '题字'],
    title: '磁州窑：白地黑花的民间气',
    answer: '磁州窑系是北方最大的民窑体系，在灰白胎上施白色化妆土，以黑彩绘花、题诗文，笔意奔放、生活气息浓厚。民窑不受宫廷样式约束，人物故事与书法入瓷都很大胆。',
    layer: 'fact', sources: ['chnmuseum', 'dpm'], related: ['trm-gm']
  },
  {
    id: 'kln-dehua', cat: 'kiln', scope: 'kiln',
    question: '德化白瓷为什么叫猪油白？',
    keywords: ['德化', '猪油白', '白瓷', '观音', '福建'],
    title: '德化：猪油白与瓷圣',
    answer: '德化窑在今福建德化，明清以温润如脂的白瓷著称，釉色细洁有「猪油白」「象牙白」等俗称。德化以塑像见长，何朝宗等匠师所作观音像被誉为东方瓷塑经典，产品也大量外销欧洲。',
    layer: 'fact', sources: ['dpm', 'chnmuseum'], related: ['his-maritime', 'ind-region']
  },
  {
    id: 'kln-jingdezhen', cat: 'kiln', scope: 'kiln',
    question: '景德镇有哪些重要窑口遗产？',
    keywords: ['景德镇', '湖田窑', '御窑厂', '青白瓷', '遗产'],
    title: '景德镇：湖田窑与御窑厂',
    answer: '湖田窑是景德镇宋代青白瓷的代表窑址，影青釉「青中闪白、白里泛青」；明清御窑厂遗址位于市区，出土大量落选贡瓷碎片，是研究宫廷瓷器制度的第一手材料。两者共同构成景德镇申报世界文化遗产的核心遗存。',
    layer: 'fact', sources: ['jdzgov', 'dpm'], related: ['his-jdzrise', 'yhc-kiln']
  },
  {
    id: 'kln-changsha', cat: 'kiln', scope: 'kiln',
    question: '长沙窑在陶瓷史上的意义是什么？',
    keywords: ['长沙窑', '釉下彩', '唐代', '诗文', '外销'],
    title: '长沙窑：釉下彩与诗文入瓷',
    answer: '长沙窑在今湖南长沙，唐代首创大规模釉下彩绘，把诗文、民谚直接写在壶身上，产品大量外销。它证明了青花这类釉下彩工艺在唐代已有技术准备，也留下了极生动的民间文字材料。',
    layer: 'fact', sources: ['chnmuseum', 'kaogu'], related: ['frm-qinghua', 'his-maritime']
  },

  // ============ 三、原料与工序（13 条，由画坯匠阿墨主讲）============
  {
    id: 'mat-kaolin', cat: 'material', scope: 'craft',
    question: '高岭土和瓷石有什么区别？',
    keywords: ['高岭土', '瓷石', '二元配方', '原料', '胎'],
    title: '高岭土与二元配方',
    answer: '瓷石富含助熔成分但耐高温不足，高岭土氧化铝含量高、耐火性强。元代起景德镇把两者按比例配合使用（二元配方），胎体才能做大做薄而不塌，是大器型与高温精细瓷的物质基础。「高岭」本身就是景德镇东郊的地名。',
    layer: 'fact', sources: ['sic', 'jdzgov'], related: ['mat-cangstone', 'his-yuanqinghua']
  },
  {
    id: 'mat-cangstone', cat: 'material', scope: 'craft',
    question: '什么是瓷石？',
    keywords: ['瓷石', '矿', '风化', '原料', '粉碎'],
    title: '瓷石：山中砸出来的瓷之骨',
    answer: '瓷石是含石英、绢云母的天然岩石，经粉碎、淘洗后可直接制坯。早期南方青瓷以瓷石单一配方成型，淘洗的粗细、陈腐的时间都会影响可塑性与成品质量。',
    layer: 'fact', sources: ['sic'], related: ['mat-kaolin']
  },
  {
    id: 'mat-yaohui', cat: 'material', scope: 'craft',
    question: '釉灰是做什么用的？',
    keywords: ['釉灰', '石灰石', '助熔', '配釉', '狼萁柴'],
    title: '釉灰：让釉能熔成玻璃',
    answer: '传统配釉用瓷石加釉灰。釉灰以石灰石与蕨类植物（狼萁柴）叠烧煅烧而成，提供钙质助熔，使釉在高温下熔成透明玻璃层。釉灰比例的高低直接影响釉的透明度与呈色。',
    layer: 'fact', sources: ['sic', 'jdzgov'], related: ['mat-kaolin']
  },
  {
    id: 'mat-qingliao', cat: 'material', scope: 'craft',
    question: '青花用的青料都有哪些？',
    keywords: ['青料', '苏麻离青', '珠明料', '平等青', '钴料'],
    title: '青料的家谱',
    answer: '青花以含钴矿物为呈色剂：元代到明初多用进口「苏麻离青」，发色浓艳带晕散与铁锈斑；明代中期的平等青淡雅稳定，清初的珠明料青翠明快。料性不同，直接决定了各时期青花的「脸色」。',
    layer: 'fact', sources: ['sic', 'dpm'], related: ['frm-qinghua', 'yhc-smco']
  },
  {
    id: 'mat-tongred', cat: 'material', scope: 'craft',
    question: '釉里红的红色是怎么来的？',
    keywords: ['釉里红', '铜', '呈色', '还原焰', '难烧'],
    title: '铜红的脾气',
    answer: '釉里红以氧化铜为呈色剂，必须在强还原气氛中烧成，铜才显出红色；温度气氛稍偏即发灰发绿甚至褪色，成品率远低于青花。所以有「十窑九不成」之说，也是它名贵的原因。',
    layer: 'fact', sources: ['sic', 'dpm'], related: ['gz-youlihong', 'mat-atmosphere']
  },
  {
    id: 'mat-72', cat: 'material', scope: 'craft',
    question: '「过手七十二方克成器」是什么意思？',
    keywords: ['过手七十二', '七十二道', '工序', '天工开物', '分工'],
    title: '过手七十二，方克成器',
    answer: '《天工开物》记载景德镇制瓷「过手七十二，方克成器」：从淘泥、拉坯、利坯到画坯、施釉、烧窑，一件瓷器要经过几十种工种的分工协作。工序数目历代记载有异，此处引述文献，不作精确统计。',
    layer: 'fact', sources: ['ihchina', 'dpm'], related: ['craft-steps', 'mat-throwing']
  },
  {
    id: 'mat-throwing', cat: 'material', scope: 'craft',
    question: '拉坯是怎么进行的？',
    keywords: ['拉坯', '轮车', '成型', '双手', '泥'],
    title: '拉坯：让泥在转轮上站起来',
    answer: '拉坯在转动的辘轳车上进行：揉练好的泥团定位于轮盘中心，双手蘸水找正、开孔、提泥，靠轮转与手的合力把泥拔成器形。力的均匀程度直接决定坯体厚薄与器型的「筋骨」。',
    layer: 'fact', sources: ['ihchina'], related: ['mat-trim', 'mp-craft']
  },
  {
    id: 'mat-trim', cat: 'material', scope: 'craft',
    question: '利坯和拉坯有什么不同？',
    keywords: ['利坯', '修坯', '厚薄', '半刀泥', '刀具'],
    title: '利坯：在半干坯上做减法',
    answer: '利坯是坯体半干时用刀具旋削修整，把器壁修得厚薄得当、器线干净利落，俗称修坯。薄胎瓷全赖利坯功夫，稍一用力过猛整器即废，故有「过手七十二，利坯最惊心」的说法。',
    layer: 'fact', sources: ['ihchina'], related: ['mat-throwing']
  },
  {
    id: 'mat-atmosphere', cat: 'material', scope: 'craft',
    question: '还原焰和氧化焰有什么区别？',
    keywords: ['还原焰', '氧化焰', '气氛', '烧成', '火焰'],
    title: '火焰的化学：还原与氧化',
    answer: '窑内氧气充足时为氧化焰，缺氧燃烧则为还原焰。气氛决定呈色：青瓷的青、釉里红的红都要还原焰；气氛一偏，同一釉料可能完全变色。「一窑火、半窑谜」说的就是它。',
    layer: 'fact', sources: ['sic', 'ihchina'], related: ['mat-tongred', 'kln-longquan']
  },
  {
    id: 'mat-sagger', cat: 'material', scope: 'craft',
    question: '匣钵是做什么用的？',
    keywords: ['匣钵', '装烧', '保护', '窑渣', '支烧'],
    title: '匣钵：瓷器的铠甲',
    answer: '匣钵是耐火材料制成的容器，瓷器装在匣钵内入窑，可以隔绝火焰直接冲击与窑内落灰，保证釉面洁净、温度均匀。明代御窑要求精细匣钵一次一用，成本极高，也反映官作制度的讲究。',
    layer: 'fact', sources: ['kaogu', 'ihchina'], related: ['mat-spur']
  },
  {
    id: 'mat-spur', cat: 'material', scope: 'craft',
    question: '支钉和垫饼是干什么的？',
    keywords: ['支钉', '垫饼', '满釉', '裹足', '烧痕'],
    title: '支钉、垫饼与满釉支烧',
    answer: '瓷器入窑需要垫具支撑：垫饼垫在圈足内，支钉则以数枚小钉支起器身，让通体满釉的器物（如汝窑）不入火直接接触。器底留下的细小支痕，反成了断代与判断装烧方式的依据。',
    layer: 'fact', sources: ['kaogu', 'sic'], related: ['kln-ding', 'trm-shengkeng']
  },
  {
    id: 'mat-glazing', cat: 'material', scope: 'craft',
    question: '瓷器有哪几种上釉方法？',
    keywords: ['施釉', '浸釉', '吹釉', '荡釉', '浇釉'],
    title: '浸、荡、浇、吹：四种上釉',
    answer: '传统施釉主要有：浸釉（把坯浸入釉浆）、荡釉（釉水荡洗内腔，多用于瓶碗内壁）、浇釉与吹釉（用竹管蒙纱吹喷，适合大器与薄坯）。多次施釉是龙泉厚釉、单色釉莹润的秘诀之一。',
    layer: 'fact', sources: ['ihchina', 'sic'], related: ['kln-longquan', 'frm-danse']
  },
  {
    id: 'mat-firetest', cat: 'material', scope: 'craft',
    question: '古时候怎么判断窑温？',
    keywords: ['火照', '窑温', '测温', '经验', '把桩'],
    title: '火照与把桩师傅的眼睛',
    answer: '古代没有测温仪，靠窑内「火照」（试片）随时钩出观察生熟，再由把桩师傅看火焰颜色、听窑内声响判断温度气氛。这种经验极难量化，是传统窑业最核心的「手艺」之一。',
    layer: 'fact', sources: ['ihchina', 'jdzgov'], related: ['mat-atmosphere', 'll-craft']
  },

  // ============ 四、器型·纹样·釉彩（16 条）============
  {
    id: 'frm-qinghua', cat: 'form', scope: 'form',
    question: '青花是一种什么样的工艺？',
    keywords: ['青花', '釉下彩', '钴料', '白地蓝花', '工艺'],
    title: '青花：釉下彩的经典',
    answer: '青花属釉下彩：以钴料在素坯上绘纹，罩透明釉后一次高温烧成，画面被釉层封护，永不褪色。它自元代成熟以来一直是瓷器装饰的主流，展厅里的梅瓶、玉壶春瓶都是青花器。',
    layer: 'fact', sources: ['dpm', 'sic'], related: ['his-yuanqinghua', 'mp-pattern', 'mat-qingliao']
  },
  {
    id: 'frm-youlihong', cat: 'form', scope: 'form',
    question: '釉里红和青花有什么不同？',
    keywords: ['釉里红', '铜红', '釉下彩', '区别', '难烧'],
    title: '釉里红：釉下的另一种火气',
    answer: '釉里红同为釉下彩，呈色剂由钴换成铜，必须在强还原焰中才显红色，成品率低、发色难控。明清还出现青花釉里红合绘一器的技术，两种「火气」要同时到位，难度极高。',
    layer: 'fact', sources: ['dpm', 'sic'], related: ['gz-youlihong', 'mat-tongred']
  },
  {
    id: 'frm-wucai', cat: 'form', scope: 'form',
    question: '五彩是什么样的彩瓷？',
    keywords: ['五彩', '釉上彩', '红绿彩', '明代', '浓艳'],
    title: '五彩：釉上的浓墨重彩',
    answer: '五彩是在烧好的白瓷上以红、黄、绿、紫等彩料二次入窑烤花的釉上彩体系，明代嘉靖万历时期盛极一时。色调浓艳对比强烈，与同一时期淡雅的青花形成两种性格。',
    layer: 'fact', sources: ['dpm'], related: ['his-mingcai', 'frm-doucai']
  },
  {
    id: 'frm-doucai', cat: 'form', scope: 'form',
    question: '斗彩和五彩有什么区别？',
    keywords: ['斗彩', '区别', '釉下', '釉上', '成化', '填彩'],
    title: '斗彩：釉下青花与釉上彩的合奏',
    answer: '斗彩先用青花在坯上勾出纹样轮廓并罩釉高温烧成，再在釉上沿轮廓填彩、低温烤花，形成釉下蓝与釉上彩的「斗」合。创烧于明成化时期，成化斗彩鸡缸杯是陶瓷史上最负盛名的小杯之一。五彩则是纯釉上彩，无此合奏关系。',
    layer: 'fact', sources: ['dpm'], related: ['frm-wucai', 'his-mingcai']
  },
  {
    id: 'frm-fencai', cat: 'form', scope: 'form',
    question: '什么是粉彩？',
    keywords: ['粉彩', '玻璃白', '渲染', '清代', '柔雅'],
    title: '粉彩：带呼吸感的彩',
    answer: '粉彩创于清代康熙晚期，先用含砷的「玻璃白」打底，再在其上晕染各色彩料，色阶柔和、有深浅呼吸感，花鸟人物表现力远胜五彩。雍正、乾隆时期的粉彩是清代彩瓷的代表品种。',
    layer: 'fact', sources: ['dpm'], related: ['frm-wucai', 'his-mingcai'],
    spiritLine: '粉彩的颜色会呼吸——像花瓣上还没干的露水。'
  },
  {
    id: 'frm-falangcai', cat: 'form', scope: 'form',
    question: '珐琅彩和粉彩有什么不同？',
    keywords: ['珐琅彩', '宫廷', '铜胎', '画珐琅', '御用'],
    title: '珐琅彩：宫廷里的极致小品',
    answer: '珐琅彩源自铜胎画珐琅工艺，清代康熙晚期移用于瓷胎，彩料为进口与宫廷自制珐琅料，仅在宫中画彩、烧造，产量极少。它发色鲜艳厚重，多配诗文印章，是御用彩瓷中存世最稀少的品种之一。',
    layer: 'fact', sources: ['dpm'], related: ['frm-fencai', 'his-mingcai']
  },
  {
    id: 'frm-danse', cat: 'form', scope: 'form',
    question: '单色釉都有哪些名品？',
    keywords: ['单色釉', '祭红', '霁蓝', '甜白', '豇豆红', '青釉'],
    title: '单色釉：不画纹样的高级感',
    answer: '单色釉以釉色本身为全部语言：甜白温润、霁蓝深沉、祭红庄重、豇豆红娇嫩、茶叶末古雅。没有纹样遮掩，任何一点胎釉不匀都无处可藏，因此单色釉历来被看作窑工技艺的试金石。',
    layer: 'fact', sources: ['dpm'], related: ['suantou', 'frm-jihong'],
    spiritLine: '不画花纹的时候，光就是花纹。'
  },
  {
    id: 'frm-jihong', cat: 'form', scope: 'form',
    question: '祭红釉有什么讲究？',
    keywords: ['祭红', '霁红', '红釉', '失传', '传说'],
    title: '祭红：最难烧的红',
    answer: '祭红（霁红）是明代永乐宣德时期的高温铜红釉，色泽沉静不流不裂，多用于礼祭器皿，故得此名。铜红呈色极难控制，宣德以后技艺一度失传，清代才逐步恢复。民间流传的「窑神投火」「美人祭」等说法属传说性质。',
    layer: 'fact', layers: ['legend'], sources: ['dpm', 'ihchina'], related: ['frm-danse', 'mat-tongred']
  },
  {
    id: 'frm-yaobian', cat: 'form', scope: 'form',
    question: '窑变釉是人工控制的吗？',
    keywords: ['窑变', '不可控', '流淌', '交融', '偶然'],
    title: '窑变：火与釉的意外之美',
    answer: '窑变指釉料在高温中多种元素自然流淌、交融、析晶形成的色斑与纹理，古时无法完全预设，每一件都独一无二。清代景德镇也发展出一定可控性的仿钧窑变，但「最好的窑变永远在下一次开窑」仍是行内共识。',
    layer: 'fact', sources: ['dpm', 'sic'], related: ['kln-jun']
  },
  {
    id: 'frm-kaipian', cat: 'form', scope: 'form',
    question: '瓷器上的开片是怎么形成的？',
    keywords: ['开片', '裂纹', '胎釉膨胀', '装饰', '哥窑'],
    title: '开片：缺陷长成的美学',
    answer: '开片源于胎与釉膨胀系数不匹配，冷却时釉层开裂。早期是烧造缺陷，宋人却把它化为装饰：哥窑的金丝铁线、官窑的冰裂纹都是刻意控制的结果，甚至有出窑后再人为促使开片、染色养纹的做法。',
    layer: 'fact', sources: ['dpm', 'sic'], related: ['kln-ge', 'trm-jinsitie']
  },
  {
    id: 'frm-vasegene', cat: 'form', scope: 'form',
    question: '梅瓶、玉壶春这些名字是怎么来的？',
    keywords: ['器型谱系', '梅瓶', '玉壶春', '蒜头瓶', '命名'],
    title: '经典器型的谱系',
    answer: '梅瓶小口丰肩、宜插梅枝或储酒，玉壶春瓶撇口细颈、由「玉壶先春」酒名演变而来，蒜头瓶因口部似蒜头得名。经典器型历经数百年比例打磨，各部位名称至今仍是描述与断代的基本词汇。展厅里六件器物正好构成一组小型谱系。',
    layer: 'fact', sources: ['dpm'], related: ['mp-form', 'yhc-form', 'suantou']
  },
  {
    id: 'frm-chanzhi', cat: 'form', scope: 'form',
    question: '缠枝纹有什么寓意？',
    keywords: ['缠枝', '缠枝莲', '卷草', '连续', '寓意'],
    title: '缠枝纹：会生长的纹样',
    answer: '缠枝纹以波状枝蔓把花头串成连续带状，枝蔓首尾相接、循环不断，寓意生生不息。它是瓷器装饰最常用的骨架纹样，也常作为边饰衬托主题纹样，拼瓷器物时顺着枝蔓走，就能找到相邻的碎片。',
    layer: 'fact', sources: ['dpm'], related: ['mp-pattern', 'his-caitao']
  },
  {
    id: 'frm-longfeng', cat: 'form', scope: 'form',
    question: '瓷器上的龙纹有等级含义吗？',
    keywords: ['龙纹', '五爪', '等级', '御用', '凤纹'],
    title: '龙凤纹与器用等级',
    answer: '明清宫廷对龙纹使用有制度约束，双角五爪的龙纹基本为御用，民窑多用三爪、四爪龙或变体龙纹。凤纹常与龙纹成对出现，寓意祥瑞。纹样的「能不能用」本身就是古代器用制度的注脚。',
    layer: 'fact', sources: ['dpm'], related: ['kln-jingdezhen', 'trm-gm']
  },
  {
    id: 'frm-yuxi', cat: 'form', scope: 'form',
    question: '鱼藻纹表达了什么？',
    keywords: ['鱼藻', '鱼纹', '年年有余', '水藻', '谐音'],
    title: '鱼藻纹：水里游出来的吉祥话',
    answer: '鱼与水藻相配的纹样自宋代起流行，取「如鱼得水」「年年有余」的谐音与生机意象，常见鲭、鲌、鲤、鳜四鱼。元代的青花鱼藻纹大罐把水波、莲花与游鱼画得极富动感。',
    layer: 'fact', sources: ['dpm'], related: ['frm-chanzhi', 'kln-jingdezhen']
  },
  {
    id: 'frm-yingxi', cat: 'form', scope: 'form',
    question: '婴戏图画的都是什么？',
    keywords: ['婴戏', '孩童', '玩耍', '多子', '纹样'],
    title: '婴戏图：瓷上的童趣',
    answer: '婴戏纹描绘孩童嬉戏——放风筝、斗草、扑蝶，寄托多子多福、家宅安康的愿望。明代成化斗彩与嘉靖五彩的婴戏图都是名品，孩童的神态比例也是判断画工时代风格的重要细节。',
    layer: 'fact', sources: ['dpm'], related: ['frm-doucai', 'trm-daidai']
  },
  {
    id: 'frm-linglong', cat: 'form', scope: 'form',
    question: '玲珑瓷的「玲珑」是怎么做的？',
    keywords: ['玲珑瓷', '镂空', '填釉', '透光', '米粒'],
    title: '玲珑瓷：把光镂进瓷里',
    answer: '玲珑瓷先在坯体上镂出米粒状小孔，再以釉浆填平孔洞、罩釉烧成，透光处呈半透明的「米粒眼」，灯光下尤美。景德镇青花玲珑把青花纹样与玲珑眼结合，是独树一帜的品种。展厅里的玲珑碗就是这一路。',
    layer: 'fact', sources: ['dpm', 'ihchina'], related: ['ll-craft', 'll-inherit'],
    spiritLine: '我身上的每一个小孔，都是替光留的门。'
  },

  // ============ 五、修复与伦理（11 条）============
  {
    id: 'rep-ciju', cat: 'repair', scope: 'repair',
    question: '传统锔瓷是怎么修复的？',
    keywords: ['锔瓷', '锔钉', '金刚钻', '找碴对缝', '工序'],
    title: '锔瓷：以钉接裂',
    answer: '锔瓷先用细绳绑扎定位、找碴对缝，再用金刚钻在裂缝两侧钻出对称浅孔，把铜或铁制的锔钉两脚跨骑裂缝钉入，使碎片咬合，最后以腻子补漏。民间有「没有金刚钻，别揽瓷器活」的行话，正源于此。',
    layer: 'fact', sources: ['dpm_jiuci', 'ihchina'], related: ['repair-diff', 'his-jdzrise']
  },
  {
    id: 'rep-jinshan', cat: 'repair', scope: 'repair',
    question: '金缮用的是什么材料？',
    keywords: ['金缮', '大漆', '金粉', '日本', '漆艺'],
    title: '金缮：以漆胶裂、以金饰痕',
    answer: '金缮以天然大漆粘接碎片，漆层阴干后反复打磨补平，最后在漆缝上敷金粉或贴金箔。它源自漆艺传统，在日本称「金继」。金缮不掩饰裂痕，反而把伤痕变成器物经历的一部分。',
    layer: 'fact', sources: ['ihchina'], related: ['rep-qi', 'repair-diff'],
    spiritLine: '金线不是遮丑，是把伤疤别成勋章。'
  },
  {
    id: 'rep-qi', cat: 'repair', scope: 'repair',
    question: '大漆是什么？',
    keywords: ['大漆', '生漆', '漆树', '阴干', '过敏'],
    title: '大漆：东方的天然胶黏剂',
    answer: '大漆是从漆树割取的天然树脂，阴干后硬度高、耐酸碱，是锔瓷补漏与金缮粘接的传统材料。漆须在特定温湿度下阴干而非晒干，匠人接触生漆还常引起皮肤过敏，「漆锋」是入门第一关。',
    layer: 'fact', sources: ['ihchina'], related: ['rep-jinshan']
  },
  {
    id: 'rep-reversible', cat: 'repair', scope: 'repair',
    question: '文物修复为什么强调可逆？',
    keywords: ['可逆', '原则', '材料', '未来', '重新处理'],
    title: '可逆：给未来留一次重新判断',
    answer: '现代修复伦理要求使用的粘接与补配材料尽可能可逆——今天的最佳方案未必是明天的，若材料不可移除，未来更先进的技术将无从介入。可逆性是判断修复方案是否专业的重要标尺。',
    layer: 'fact', sources: ['dpm_jiuci', 'dpm'], related: ['rep-minimal', 'repair-keep']
  },
  {
    id: 'rep-minimal', cat: 'repair', scope: 'repair',
    question: '什么是最小干预原则？',
    keywords: ['最小干预', '原则', '少动', '依据', '伦理'],
    title: '最小干预：能不动，就不动',
    answer: '最小干预指修复只处理必要的部分：稳固结构、消除继续劣化的隐患，而不追求「看起来像新的一样」。干预越少，原始历史信息保留越多。缺失部分不做无依据的凭空补全。',
    layer: 'fact', sources: ['dpm_jiuci', 'dpm'], related: ['rep-reversible', 'rep-notrestore']
  },
  {
    id: 'rep-identify', cat: 'repair', scope: 'repair',
    question: '修复过的部分为什么要让人看出来？',
    keywords: ['可识别', '补配', '不作旧', '诚实', '原则'],
    title: '可识别：诚实的接缝',
    answer: '现代修复要求补配、补色部分与原物保持可识别——近看能分辨哪些是原存、哪些是补配，避免以假乱真误导研究。这与民间「修旧如旧甚至做旧」的做法，是两种不同的伦理取向。',
    layer: 'fact', sources: ['dpm_jiuci'], related: ['rep-distinguish', 'repair-keep']
  },
  {
    id: 'rep-distinguish', cat: 'repair', scope: 'repair',
    question: '怎么做旧？怎么辨旧？',
    keywords: ['做旧', '辨旧', '作伪', '高锰酸钾', '皮壳'],
    title: '做旧与辨旧：一对孪生行当',
    answer: '做旧是人为制造皮壳、火石红、磨损以冒充年代，常见手段包括药水浸泡、打磨做旧、老胎新彩等。辨旧则靠胎釉手感、釉光「生熟」、纹样画意与工艺痕迹综合判断。此处仅作常识介绍，不构成任何鉴定指导。',
    layer: 'fact', sources: ['dpm'], related: ['trm-jianbie', 'rep-identify']
  },
  {
    id: 'rep-arch', cat: 'repair', scope: 'repair',
    question: '考古修复和陈列修复有什么不同？',
    keywords: ['考古修复', '陈列修复', '石膏', '信息', '目的'],
    title: '两种修复，两种目的',
    answer: '考古（研究性）修复以保存信息为要，碎片拼接后常用石膏素面补配、不追求美观；陈列（展览性）修复在保证信息准确的前提下兼顾观感，可做适度补色。目的不同，手段与「完成度」标准也不同。',
    layer: 'fact', sources: ['dpm', 'kaogu'], related: ['rep-minimal', 'rep-identify']
  },
  {
    id: 'rep-glue', cat: 'repair', scope: 'repair',
    question: '拼瓷器用什么胶？',
    keywords: ['粘接', '环氧', '鱼鳔胶', '材料', '可逆'],
    title: '从鱼鳔胶到现代树脂',
    answer: '传统粘接曾用鱼鳔胶等动物胶，可逆但强度有限；现代修复多用环氧树脂等高强度材料，需按可逆性原则评估使用，或以可移除的隔离层过渡。材料选择永远在「强度」与「可逆」之间权衡。',
    layer: 'fact', sources: ['dpm_jiuci', 'sic'], related: ['rep-reversible', 'rep-ciju']
  },
  {
    id: 'rep-notrestore', cat: 'repair', scope: 'repair',
    question: '修复就是把瓷器变回原来的样子吗？',
    keywords: ['复原', '变回', '经历', '态度', '不是'],
    title: '修复不是抹去经历',
    answer: '修复的目标是让器物稳定、可读、可传承，而不是抹掉它经历过的破碎与修补。每一道裂痕都是它生命史的一部分——修复者为它接续未来，而不是替它否认过去。这也是本项目把「裂痕如何留下」交给玩家决定的原因。',
    layer: 'fact', sources: ['dpm_jiuci'], related: ['repair-keep', 'rep-identify'],
    spiritLine: '别替我把故事删掉——裂开过，也是我。'
  },
  {
    id: 'rep-project', cat: 'repair', scope: 'repair',
    question: '这个项目里的三种修复方式是什么？',
    keywords: ['三种修复', '隐痕', '金线', '锔瓷', '本项目'],
    title: '本项目的三种修复选择',
    answer: '本项目提供三种数字修复方式：隐痕修复代表最小干预、尽量还原原貌；金线表达借鉴金缮理念，把裂痕变成可见的经历；锔瓷体验则演示以钉接裂的传统工序。三者均为数字示意，不构成真实修复指导。',
    layer: 'fact', layers: ['schematic'], sources: ['dpm_jiuci'], related: ['repair-diff', 'repair-keep']
  },

  // ============ 六、现代产业与非遗（11 条）============
  {
    id: 'ind-taoxichuan', cat: 'industry', scope: 'industry',
    question: '陶溪川是什么地方？',
    keywords: ['陶溪川', '宇宙瓷厂', '文创', '街区', '夜市'],
    title: '陶溪川：老瓷厂的新生',
    answer: '陶溪川由原国营宇宙瓷厂改造而成，锯齿形厂房、烟囱与隧道窑遗存被保留，如今聚集着工作室、美术馆与周末创意集市，大批年轻人（「景漂」）在此以陶瓷创业，是老工业区更新的样本。考察点里的第三站就是它。',
    layer: 'fact', sources: ['jdzgov'], related: ['ind-sanbao', 'ind-jingpiao'] 
  },
  {
    id: 'ind-sanbao', cat: 'industry', scope: 'industry',
    question: '三宝村为什么出名？',
    keywords: ['三宝', '国际瓷谷', '工作室', '艺术家', '景漂'],
    title: '三宝：从瓷石矿到艺术村',
    answer: '三宝村历史上因瓷石矿与水碓作坊得名，如今沿山谷聚集了来自国内外的陶艺家工作室与小型作坊，被称为「三宝国际瓷谷」。传统矿冶遗存与当代创作在这里混生。',
    layer: 'fact', sources: ['jdzgov'], related: ['ind-taoxichuan']
  },
  {
    id: 'ind-region', cat: 'industry', scope: 'industry',
    question: '现在中国的主要陶瓷产区有哪些？',
    keywords: ['产区', '潮州', '德化', '佛山', '宜兴', '醴陵', '分工'],
    title: '今天的产区地图',
    answer: '当代陶瓷产区各有分工：广东潮州以日用与工艺瓷著称，福建德化重雕塑白瓷，佛山以建筑陶瓷规模最大，江苏宜兴专精紫砂，湖南醴陵为釉下五彩重镇，江西景德镇则以手工艺术瓷与文创见长。',
    layer: 'fact', sources: ['ihchina', 'jdzgov'], related: ['kln-dehua', 'ind-handmade']
  },
  {
    id: 'ind-ich', cat: 'industry', scope: 'industry',
    question: '陶瓷技艺是怎么列入非遗的？',
    keywords: ['非遗', '非物质文化遗产', '认定', '名录', '传承人'],
    title: '陶瓷与非物质文化遗产',
    answer: '景德镇手工制瓷技艺等数十项传统制瓷技艺已列入国家级非物质文化遗产代表性项目名录，由各级认定代表性传承人与保护单位开展传习。非遗保护强调技艺、工具与知识体系的整体传承，而非只保护器物本身。',
    layer: 'fact', sources: ['ihchina'], related: ['ind-apprentice', 'll-inherit']
  },
  {
    id: 'ind-apprentice', cat: 'industry', scope: 'industry',
    question: '现在怎么学制瓷手艺？',
    keywords: ['学徒', '院校', '传习', '教育', '年轻人'],
    title: '师徒相授与院校教育并行',
    answer: '今天学瓷有两条路：传统的作坊师徒制，从打杂磨泥开始耳濡目染；以及景德镇陶瓷大学等院校的系统教育，兼顾材料科学与设计。许多年轻匠人两条路径都走过，再回作坊里慢慢「养手感」。',
    layer: 'fact', sources: ['ihchina', 'jdzgov'], related: ['ind-ich', 'll-inherit']
  },
  {
    id: 'ind-handmade', cat: 'industry', scope: 'industry',
    question: '手工瓷和工业瓷有什么区别？',
    keywords: ['手工', '工业', '注浆', '机制', '区别'],
    title: '手作与机器的两条路线',
    answer: '工业瓷以注浆、滚压等标准化工艺大批量生产，尺寸一致、价格亲民；手工瓷由匠人逐件成型绘制，器与器之间有细微差异。两者服务不同需求，并非对立——日用离不开工业瓷，艺术表达则更多发生在手作里。',
    layer: 'fact', sources: ['jdzgov', 'ihchina'], related: ['ind-region', 'mat-72']
  },
  {
    id: 'ind-contemporary', cat: 'industry', scope: 'industry',
    question: '当代陶瓷艺术是什么样的？',
    keywords: ['当代艺术', '观念', '材料', '表达', '实验'],
    title: '当代陶瓷：从器物到观念',
    answer: '当代陶瓷艺术不再只以「器」为目标，陶瓷被当作一种可塑、可烧、有文化记忆的材料，进入雕塑、装置与实验领域。与此同时，传统器物类的技艺传承仍在并行生长，构成当代瓷业的两翼。',
    layer: 'fact', sources: ['jdzgov'], related: ['ind-handmade', 'his-modern']
  },
  {
    id: 'ind-kilnreform', cat: 'industry', scope: 'industry',
    question: '现在的窑和古代一样吗？',
    keywords: ['气窑', '电窑', '环保', '柴窑', '控温'],
    title: '从柴窑到气窑、电窑',
    answer: '现代窑炉以液化气窑与电窑为主，测温、控氛可仪表化，成品率与环保性大幅提升；柴窑因成本与环保限制日渐稀少，更多作为文化遗产与特殊釉色的存续方式被保留。气氛控制的传统经验仍有价值。',
    layer: 'fact', sources: ['jdzgov', 'sic'], related: ['mat-atmosphere', 'mat-firetest']
  },
  {
    id: 'ind-wenchuang', cat: 'industry', scope: 'industry',
    question: '什么是陶瓷文创？',
    keywords: ['文创', '衍生', '设计', 'IP', '日用'],
    title: '文创：让老瓷说新话',
    answer: '陶瓷文创把传统纹样、器型与博物馆IP转译为茶器、首饰、文具等现代日用设计，让年轻人以更低门槛接触瓷文化。设计需要尊重原作的纹样谱系与工艺逻辑，而不是简单印花。',
    layer: 'fact', sources: ['jdzgov'], related: ['frm-chanzhi', 'ind-taoxichuan']
  },
  {
    id: 'ind-jci', cat: 'industry', scope: 'industry',
    question: '有专门研究陶瓷的大学吗？',
    keywords: ['陶瓷大学', '教育', '研究', '材料', '景德镇'],
    title: '景德镇陶瓷大学',
    answer: '景德镇陶瓷大学是国内以陶瓷为特色的综合性高校，覆盖材料科学、艺术设计、机械与文化传播等学科，一个多世纪以来为全球陶瓷行业输送了大量工程师、设计师与艺术家。',
    layer: 'fact', sources: ['jdzgov'], related: ['ind-apprentice', 'sic']
  },
  {
    id: 'ind-jingpiao', cat: 'industry', scope: 'industry',
    question: '「景漂」是什么？',
    keywords: ['景漂', '外来', '年轻人', '聚集', '创业'],
    title: '景漂：被窑火吸引的年轻人',
    answer: '「景漂」指从各地来景德镇长期从事陶瓷创作与经营的外来群体，人数以万计。他们中有美院毕业生、独立设计师与手艺人，低廉的作坊成本与完整的产业链是吸引他们的原因，也是当代瓷都最具活力的部分。',
    layer: 'fact', sources: ['jdzgov'], related: ['ind-taoxichuan', 'ind-apprentice']
  },

  // ============ 七、鉴赏与术语（14 条）============
  {
    id: 'trm-daidai', cat: 'terms', scope: 'appreciation',
    question: '瓷器断代主要看哪些方面？',
    keywords: ['断代', '依据', '造型', '纹样', '釉彩', '款识'],
    title: '断代的五个抓手',
    answer: '专业断代通常综合五类信息：造型（器身的比例与线条）、纹样（画意与笔法）、釉彩（釉面质感与呈色）、胎足（胎质与修足工艺）、款识（书款格式与字体）。任何单一项都可能被模仿，综合判断才是正道。',
    layer: 'fact', sources: ['dpm'], related: ['trm-kuan', 'trm-jianbie']
  },
  {
    id: 'trm-kuan', cat: 'terms', scope: 'appreciation',
    question: '年款是什么意思？',
    keywords: ['年款', '款识', '大明', '堂名款', '寄托款'],
    title: '款识：瓷器上的签名',
    answer: '年款是标明烧造年代的款识，如「大明成化年制」六字双行；此外还有堂名款、吉言款、人名款等。款识字体与排列是断代的重要参考，也历来是仿制的重点对象，故「看款」必须与胎釉纹样互相印证。',
    layer: 'fact', sources: ['dpm'], related: ['trm-daidai', 'trm-jianbie']
  },
  {
    id: 'trm-gm', cat: 'terms', scope: 'appreciation',
    question: '官窑和民窑有什么区别？',
    keywords: ['官窑', '民窑', '区别', '制度', '御用'],
    title: '官窑与民窑：两套系统',
    answer: '官窑由官府督造、供宫廷与官府使用，选料做工不计成本，纹样受制度约束；民窑面向市场，风格自由、产量巨大。两者长期并存互动——民窑的活泼画意也会反过来影响官窑样式。注意「官窑」一词既指窑口也指制度，需看语境。',
    layer: 'fact', sources: ['dpm'], related: ['kln-guan', 'kln-cizhou', 'kln-jingdezhen']
  },
  {
    id: 'trm-naming', cat: 'terms', scope: 'appreciation',
    question: '博物馆里瓷器的名字是怎么起的？',
    keywords: ['命名', '规则', '朝代', '纹样', '器名'],
    title: '瓷器命名的公式',
    answer: '博物馆藏瓷的命名通常遵循「朝代＋窑口或款识＋釉彩或纹样＋器型」的公式，例如「明嘉靖青花花鸟纹梅瓶」。看懂命名公式，读到名字就能大致还原一件器物的档案。',
    layer: 'fact', sources: ['dpm'], related: ['trm-daidai', 'frm-vasegene']
  },
  {
    id: 'trm-huoshihong', cat: 'terms', scope: 'appreciation',
    question: '火石红是什么？',
    keywords: ['火石红', '胎釉结合', '氧化铁', '自然', '做旧'],
    title: '火石红：胎里的铁说了话',
    answer: '火石红是瓷器出窑后沿胎釉结合处析出的橘黄或橙红色痕，源于胎中氧化铁的渗出与氧化，一般自然、由深渐浅。真火石红与胎体过渡自然；做旧的假红常浮于表面、颜色死板——这也是辨旧的一个小抓手。',
    layer: 'fact', sources: ['dpm', 'sic'], related: ['trm-jianbie', 'rep-distinguish']
  },
  {
    id: 'trm-zongyan', cat: 'terms', scope: 'appreciation',
    question: '棕眼和缩釉是怎么回事？',
    keywords: ['棕眼', '缩釉', '气泡', '釉面', '瑕疵'],
    title: '棕眼与缩釉：釉面的呼吸孔',
    answer: '棕眼是釉面细小的针状凹点，源于坯内气泡在高温中破裂后釉未能流平；缩釉则是釉层局部回缩露出胎骨。古代工艺条件下难免出现，分布自然者反是老器的旁证；过分工整的釉面反而要留心。',
    layer: 'fact', sources: ['dpm', 'sic'], related: ['trm-daidai']
  },
  {
    id: 'trm-qiumin', cat: 'terms', scope: 'appreciation',
    question: '「蚯蚓走泥纹」是什么？',
    keywords: ['蚯蚓走泥纹', '钧窑', '釉裂', '特征'],
    title: '蚯蚓走泥纹：钧窑的胎记',
    answer: '蚯蚓走泥纹是部分钧窑器釉面出现的蜿蜒曲折的细线，一般认为与素烧后釉层干裂、再次浸釉烧成时釉料填裂有关。它被视为鉴定宋钧的参考特征之一，但并非所有真钧都有。',
    layer: 'fact', sources: ['dpm'], related: ['kln-jun', 'trm-daidai']
  },
  {
    id: 'trm-jinsitie', cat: 'terms', scope: 'appreciation',
    question: '金丝铁线具体指什么纹路？',
    keywords: ['金丝铁线', '哥窑', '大开片', '小开片', '染色'],
    title: '金丝铁线的构造',
    answer: '哥窑器出窑后釉面开的大裂纹被渗入的深色物质染成「铁线」，日久后细密的小开片又染成黄褐色「金丝」，两层网络叠套成哥窑标志性的纹理。它是开片由缺陷转为自觉装饰的代表作。',
    layer: 'fact', sources: ['dpm'], related: ['kln-ge', 'frm-kaipian']
  },
  {
    id: 'trm-shengkeng', cat: 'terms', scope: 'appreciation',
    question: '传世、出土、出水分别是什么意思？',
    keywords: ['传世', '出土', '出水', '来源', '生坑'],
    title: '三种来源，三种面貌',
    answer: '传世品经代代使用收藏，釉光「熟」；出土器带土沁、锈蚀等「生坑」面貌；出水器（如沉船瓷器）常被海洋凝结物覆盖、脱盐处理后釉面另有一态。判断来源需结合埋藏环境，不能只看表面。',
    layer: 'fact', sources: ['kaogu', 'chnmuseum'], related: ['his-maritime', 'trm-daidai']
  },
  {
    id: 'trm-tech', cat: 'terms', scope: 'appreciation',
    question: '有科学仪器给瓷器做鉴定吗？',
    keywords: ['科技检测', '热释光', 'X荧光', '科学', '鉴定'],
    title: '科技检测：眼睛之外的证据',
    answer: '科技检测为断代与研究提供辅助证据：热释光测年可判断最后一次受热年代，X射线荧光可分析胎釉元素组成，与传统目鉴互相印证。但每种方法都有适用范围与误差，结论仍需与考古与器物学结合。',
    layer: 'fact', sources: ['sic', 'kaogu'], related: ['trm-daidai', 'his-primitive']
  },
  {
    id: 'trm-jianbie', cat: 'terms', scope: 'appreciation',
    question: '常见的作伪手法有哪些？',
    keywords: ['作伪', '接底', '后加彩', '老胎新彩', '手法'],
    title: '几种典型的作伪路数',
    answer: '常见作伪包括：接底（真圈足配新身）、老胎新彩（在旧白瓷上后加彩重烧）、复窑提色、以真款仿伪器等。识别要回到胎釉、画意、工艺痕迹的综合证据链。本条仅作常识科普，鉴定请以专业机构为准。',
    layer: 'fact', sources: ['dpm'], related: ['rep-distinguish', 'trm-kuan']
  },
  {
    id: 'trm-kuanxi', cat: 'terms', scope: 'appreciation',
    question: '「窑系」这个概念是什么意思？',
    keywords: ['窑系', '概念', '传播', '工艺', '体系'],
    title: '窑系：一片技术圈',
    answer: '窑系指以某个中心窑场为核心、工艺与产品风格向周边辐射形成的群体，如磁州窑系、龙泉窑系跨越数省。它描述的是技术传播与市场关系，而不只是某一座窑。',
    layer: 'fact', sources: ['chnmuseum', 'sic'], related: ['kln-cizhou', 'kln-longquan']
  },
  {
    id: 'trm-mingyuan', cat: 'terms', scope: 'appreciation',
    question: '御器厂和御窑厂是一回事吗？',
    keywords: ['御器厂', '御窑厂', '明代', '清代', '称呼'],
    title: '御器厂与御窑厂',
    answer: '明代洪武年间景德镇设御器厂，专烧宫廷用瓷；清代沿设并习称御窑厂，督陶官制度下康熙、雍正、乾隆三朝技艺登峰。厂址在今景德镇市区，考古出土的落选贡瓷碎片是研究官作制度的重要材料。',
    layer: 'fact', sources: ['jdzgov', 'dpm'], related: ['yhc-kiln', 'kln-jingdezhen']
  },
  {
    id: 'trm-china', cat: 'terms', scope: 'appreciation',
    question: '为什么英文里「瓷器」和「中国」是同一个词？',
    keywords: ['china', '昌南', '欧洲', '命名', '传说'],
    title: 'China：一条名字的来路',
    answer: '英文 china 既指中国也指瓷器，反映瓷器作为中国大宗外销品在欧洲的深刻印象。一说是「昌南」（景德镇旧地名）的音转，此说流传甚广但学术上并无定论，姑且作为一个美丽的注脚。',
    layer: 'fact', layers: ['legend'], sources: ['dpm', 'jdzgov'], related: ['his-maritime', 'his-jdzrise']
  }
];

// —— 分类引导：命中分类但无具体条目时，把用户接进可回答的问句里 ——
export function categoryGuidance(query) {
  const q = String(query || '');
  const hit = CERAMIC_CATEGORIES.find(cat => (cat.keywords || []).some(k => q.includes(k)));
  if (!hit) return null;
  return {
    ok: true,
    inScope: true,
    entryId: `ceramics-cat:${hit.id}`,
    title: `这属于「${hit.name}」范畴`,
    text: `你问的内容属于「${hit.name}」的范畴，现有资料可以回答这类问题。可以先问问我：${hit.samples.slice(0, 3).join('、')}——展厅里的六件器物也串在这些知识线上，随时可以联想过去。`,
    layer: 'schematic',
    layers: ['schematic'],
    sources: [],
    characterLine: '',
    spiritLine: '',
    scope: 'ceramics',
    pending: false,
    related: hit.samples.map((question, i) => ({ id: `${hit.id}-sample-${i}`, title: question.replace(/？$/, ''), question }))
  };
}
