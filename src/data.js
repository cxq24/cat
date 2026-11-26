export const CATS = [
  { id: 'C01', name: '豆皮', fur: '长毛', tags: ['粘人', '会抢镜'], scratch: false, price: 0, color: '#d99141', description: '一团会主动靠过来的小太阳。' },
  { id: 'C02', name: '霜降', fur: '短毛', tags: ['高冷'], scratch: false, price: 0, color: '#9ba9a3', description: '看起来没在听，其实全听见了。' },
  { id: 'C03', name: '米粒', fur: '短毛', tags: ['怕生', '上镜'], scratch: false, price: 0, color: '#454c48', description: '躲在角落，也能偷偷占据镜头。' },
  { id: 'C04', name: '月亮', fur: '无毛', tags: ['安静'], scratch: false, price: 40, color: '#c9958d', description: '安安静静，像一颗暖乎乎的月亮。' },
  { id: 'C05', name: '闯祸', fur: '短毛', tags: ['爱拆家', '粘人'], scratch: true, price: 28, color: '#a98563', description: '很会交朋友，也很会拆朋友的袖口。' },
  { id: 'C06', name: '夜游', fur: '长毛', tags: ['安静', '高冷'], scratch: false, price: 32, color: '#424b58', description: '一片会呼吸的、安静的小夜色。' },
  { id: 'C07', name: '土豆', fur: '短毛', tags: ['温和'], scratch: false, price: 36, color: '#bb9e72', description: '腿短一点，耐心多一点。' },
  { id: 'C08', name: '伯爵', fur: '短毛', tags: ['上镜', '高冷'], scratch: false, price: 55, color: '#817d8e', description: '每天有 30% 概率赏脸来店。' },
];
export const SEATS = [
  { id: 'S01', name: '靠窗', tags: ['较亮', '较吵'], type: '靠窗', quiet: false, tree: false },
  { id: 'S02', name: '安静角落', tags: ['安静', '少人经过'], type: '安静角落', quiet: true, tree: false },
  { id: 'S03', name: '拍照角', tags: ['拍照', '靠近猫树'], type: '拍照角', quiet: false, tree: true },
  { id: 'S04', name: '吧台', tags: ['安静', '可看店员'], type: '吧台', quiet: true, tree: false },
];
export const STATES = { happy: '心情好', sleep: '正在睡觉', camera: '想抢镜', quarrel: '刚吵过' };
export const ADJACENT = [['S01', 'S03'], ['S02', 'S04']];
export const ITEMS = [
  { id: 'wand', name: '逗猫棒', price: 18, text: '每天可叫醒一只睡觉的猫，让它心情好。' },
  { id: 'cushion', name: '软垫', price: 18, text: '怕猫客人的诉求匹配分 +8，最高 30 分。' },
];
// Names, dialogue and review copy were written for this game.
export const GUESTS = [
  { id: 1, name: '小禾', look: '背着相机的姑娘', quote: '想带几张猫片回去。我的鼻子比较挑毛。', need: '只想拍照', limits: ['只能短毛或无毛'], preferences: ['靠窗', '拍照角'], budget: 28, hue: '#b68566' },
  { id: 2, name: '阿宁', look: '抱着纸巾的上班族', quote: '今天想找个地方坐坐，有猫陪着就更好了。', need: '想被粘', limits: [], preferences: ['安静角落'], budget: 32, hue: '#869c89' },
  { id: 3, name: '果果一家', look: '牵着小朋友的家长', quote: '小朋友第一次来，想认识一位温柔的新朋友。', need: '带小孩', limits: ['不能被抓', '不要靠近猫树'], preferences: [], budget: 30, hue: '#c59652' },
  { id: 4, name: '小满', look: '站在门边轻轻张望', quote: '我有一点怕猫，可以从安静的那只开始吗？', need: '第一次来怕猫', limits: ['不要太吵'], preferences: ['安静角落', '吧台'], budget: 26, hue: '#8e8ca5' },
  { id: 5, name: '阿照', look: '捧着拍立得的学生', quote: '今天专心拍照，猫猫做自己就好。', need: '只想拍照', limits: [], preferences: ['拍照角'], budget: 30, hue: '#bd8278' },
  { id: 6, name: '林先生', look: '穿着干净的白衬衫', quote: '想和一只酷酷的猫，各坐各的发一会儿呆。', need: '不要太粘', limits: ['不要太粘'], preferences: ['靠窗'], budget: 28, hue: '#7b929a' },
  { id: 7, name: '周周', look: '夹着笔记本的自由职业者', quote: '赶一份小稿子，希望这一角能安静一点。', need: '要安静', limits: ['不要太吵'], preferences: ['安静角落', '吧台'], budget: 34, hue: '#a49676' },
  { id: 8, name: '桃桃', look: '戴着生日发箍的朋友', quote: '生日合照就差一只愿意抢镜的猫啦。', need: '只想拍照', limits: [], preferences: ['拍照角', '靠窗'], budget: 36, hue: '#bf8e99' },
  { id: 9, name: '小苏', look: '小心收好外套的客人', quote: '我对毛比较敏感，今天想和月亮打个招呼。', need: '过敏，但还是想来', limits: ['只能短毛或无毛'], preferences: [], budget: 32, hue: '#92a59c' },
  { id: 10, name: '陈姨一家', look: '带亲戚来歇脚', quote: '大家只想平平安安喝杯东西，别太热闹。', need: '带小孩', limits: ['不能被抓', '不要太吵'], preferences: ['安静角落'], budget: 38, hue: '#aa937a' },
  { id: 11, name: '小屿', look: '戴着耳机的独行客', quote: '想把今天调成静音，在角落坐一会儿。', need: '要安静', limits: ['不要太吵'], preferences: ['安静角落'], budget: 24, hue: '#859896' },
  { id: 12, name: '阿迟', look: '刚下班还没摘工牌', quote: '猫猫如果愿意路过我一下，今天就算圆满。', need: '想被粘', limits: [], preferences: [], budget: 22, hue: '#b4a07c' },
  { id: 13, name: '可可', look: '带着迷你摄影包', quote: '想拍一组店里的日常，背景别太闹腾就好。', need: '只想拍照', limits: ['不要靠近猫树'], preferences: ['拍照角'], budget: 40, hue: '#b28779' },
  { id: 14, name: '白先生', look: '特地绕路来的熟客', quote: '听说伯爵偶尔会来。今天能遇见它吗？', need: '点名伯爵', limits: [], preferences: ['靠窗', '吧台'], budget: 50, hue: '#7b8c79' },
];
export const REVIEWS = {
  5: ['这张合照，准备当半年的头像。', '本来来喝咖啡，结果被猫续了杯。', '它一靠过来，今天就变轻了。', '这一桌的幸福浓度刚刚好。', '猫没说话，但我觉得我们聊得很好。', '想给今天的接待多加一颗星。'],
  4: ['咖啡还温着，猫也刚好醒着。', '小小的猫咖，接住了一个普通下午。', '它允许我坐在它旁边，荣幸。', '今天的猫片库存够用一周。', '没有很热闹，刚好有一点陪伴。', '这只猫有自己的营业节奏。'],
  3: ['猫在上班，但好像在等下班。', '我们相视一眼，各自喝了口空气。', '来之前想摸猫，最后摸了摸杯子。', '合照里，猫比我更懂留白。', '今天先混个脸熟，下次再约。', '猫很有想法，我还在理解。'],
  2: ['它在看窗外，我在看它的后脑勺。', '这桌的气氛，主打各忙各的。', '照片里只有半只猫，也算来过。', '我带了期待，它带了起床气。', '感觉自己坐进了猫的午休时间。', '这次没对上频道，下次换一桌。'],
  1: ['猫的营业时间，和我的不太一致。', '我们唯一的默契，是同时转过头。', '来接我的，似乎只有这把椅子。', '猫走了，留下我和完整的咖啡。', '这一桌，猫比客人更想打烊。', '今天的相遇有一点点不合拍。'],
};
export const EVENT_COPY = {
  fight: ['隔桌对视三秒，两位猫同事吵起来了。', '邻桌气氛有点炸毛'],
  limit: ['需求写在纸上，猫把纸当成了装饰。', '这一桌踩到了限制'],
  cold: ['我等它回头，它等我下班。', '猫咪开启了免打扰'],
  mischief: ['袖口被热情招待，线头先认识了猫。', '袖口遇上了拆迁队'],
  rare: ['今天的惊喜，是伯爵真的来上班了。', '稀有同事赏脸营业'],
  missing: ['伯爵没来，今天先和它的同事认识。', '没见到点名的那只猫'],
  full: ['今天的位置都被幸福占满了，下次早来。', '客满 / 猫不够'],
};
export const catById = id => CATS.find(cat => cat.id === id);
export const seatById = id => SEATS.find(seat => seat.id === id);
