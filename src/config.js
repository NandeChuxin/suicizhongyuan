// 构建模式开关。
// VITE_ONLINE_MODE=1：线上公开版，规避故宫馆藏照片的授权风险——器身与碎片纹理走程序化兜底层，
// 参考卡只显示文字出处不放照片。缺省（未设置）为线下演示版，保留馆藏照片底图与非商业教育演示口径。
// Node 测试环境没有 import.meta.env，回退为线下演示模式。
const env = import.meta.env || {};
export const ONLINE_MODE = env.VITE_ONLINE_MODE === '1' || env.VITE_ONLINE_MODE === 'true';
