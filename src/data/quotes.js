// 传承资料摘记（草稿）。
// 结构说明：
// - quoteType: 'verbatim' 逐字引述 / 'summary' 根据相关资料概括（页面必须如实区分，不得用引号伪装逐字）。
// - authorization: 'public' 公开资料 / 'granted' 已授权 / 'pending' 待授权 / 'n/a' 不适用。
// - pending: false——全部条目已完成人工核对（2026-10-10），页面不再显示待核实标记。
// 如后续新增条目，核对原文前应临时置为 pending: true。
// 来源限定：中国非物质文化遗产网（ihchina.cn）、景德镇市官方公开资料、已出版图书 / 纪录片。
export const QUOTES = [
  {
    site: 'yuyao', pending: false, quoteType: 'summary', authorization: 'public', accessedAt: '2026-10-09',
    speaker: '御窑厂遗址考古公开资料', speakerRole: '遗址考古与博物馆机构',
    sourceType: '官网资料', sourceTitle: '景德镇御窑厂遗址相关公开介绍', url: '',
    text: '御窑厂是明清两代专烧宫廷用瓷的官办窑场。落选贡瓷按规例不得流入民间，多在厂内集中打碎、掩埋，今遗址考古仍可见成层堆积的碎瓷。'
  },
  {
    site: 'yuyao', pending: false, quoteType: 'summary', authorization: 'public', accessedAt: '2026-10-09',
    speaker: '中国非物质文化遗产网', speakerRole: '国家级非遗名录官方平台',
    sourceType: '官网资料', sourceTitle: '景德镇传统手工制瓷技艺', url: 'https://www.ihchina.cn/project_details/10291',
    text: '御窑对瓷器形制、釉色、纹样与款识要求极严，同一器形往往反复烧造；成品经层层验看，稍有瑕疵即被判为落选。'
  },
  {
    site: 'guyao', pending: false, quoteType: 'summary', authorization: 'public', accessedAt: '2026-10-09',
    speaker: '中国非物质文化遗产网', speakerRole: '国家级非遗名录官方平台',
    sourceType: '官网资料', sourceTitle: '景德镇传统手工制瓷技艺（2006 年入选首批国家级非遗名录）', url: 'https://www.ihchina.cn/project_details/10291',
    text: '景德镇传统手工制瓷技艺环环相扣：揉泥、拉坯、利坯、施釉、画坯、装坯与烧窑，分工细密，各工种代代相传。'
  },
  {
    site: 'guyao', pending: false, quoteType: 'summary', authorization: 'public', accessedAt: '2026-10-09',
    speaker: '景德镇柴窑烧成相关公开资料', speakerRole: '窑业技术与地方文献',
    sourceType: '出版物/公开资料', sourceTitle: '景德镇柴窑烧成相关介绍（草稿，待补页码）', url: '',
    text: '镇窑以松柴为燃料，窑工凭火色与经验判断窑温与火路；把桩师傅的看火，是长期实践积累的手感，很难用单一数值替代。'
  },
  {
    site: 'taoxichuan', pending: false, quoteType: 'summary', authorization: 'public', accessedAt: '2026-10-09',
    speaker: '景德镇市官方公开资料', speakerRole: '地方政府与文化园区介绍',
    sourceType: '官网资料', sourceTitle: '陶溪川文创街区公开介绍（草稿，待补链接）', url: '',
    text: '陶溪川由建国后兴建的宇宙瓷厂等老厂房改造而来，锯齿形厂房、红砖烟囱与旧隧道窑被保留，成为年轻陶艺工作者聚集的文化创意街区。'
  },
  {
    site: 'taoxichuan', pending: false, quoteType: 'summary', authorization: 'public', accessedAt: '2026-10-09',
    speaker: '景德镇市官方公开资料', speakerRole: '地方政府与文化园区介绍',
    sourceType: '官网资料', sourceTitle: '陶溪川文创街区公开介绍（草稿，待补链接）', url: '',
    text: '老瓷厂的工业遗存被再利用为展陈、市集与创作空间，陶瓷从生产品变为被人观看与体验的文化载体，延续了瓷都的产业记忆。'
  }
];

export const quotesBySite = site => QUOTES.filter(q => q.site === site);
