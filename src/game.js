import { CATS, SEATS, ITEMS, GUESTS, ADJACENT, REVIEWS, EVENT_COPY, catById, seatById } from './data.js';

export function createProgress(now = Date.now()) {
  return { version: 1, createdAt: now, updatedAt: now, seed: Math.floor(Math.random() * 2147483646) + 1, day: 1, days: {}, purchases: {}, unlockDays: {}, summary: null };
}

export function validateProgress(value) {
  const integer = number => Number.isSafeInteger(number) && number >= 0;
  if (!value || value.version !== 1 || !integer(value.day) || value.day < 1 || !integer(value.seed) || !integer(value.createdAt) || !integer(value.updatedAt)) throw new Error('存档版本或格式无法识别，请保留原数据。');
  if (!value.days || Array.isArray(value.days) || typeof value.days !== 'object' || !value.purchases || Array.isArray(value.purchases) || typeof value.purchases !== 'object') throw new Error('存档记录格式不完整。');
  Object.entries(value.days).forEach(([day, record]) => {
    if (!/^[1-9]\d*$/.test(day) || !record || !integer(record.revenue) || !integer(record.score) || record.score > 400 || !integer(record.at) || Number(day) > value.day) throw new Error('营业记录无法识别。');
  });
  Object.entries(value.purchases).forEach(([id, at]) => {
    if (!priceOf(id) || !integer(at)) throw new Error('解锁记录无法识别。');
  });
  if (value.unlockDays) Object.entries(value.unlockDays).forEach(([id, day]) => {
    if (!priceOf(id) || !integer(day) || day < 1) throw new Error('解锁生效日期无法识别。');
  });
  if (value.summary) {
    const summary = value.summary;
    if (!integer(summary.day) || !value.days[summary.day] || !Array.isArray(summary.results) || summary.results.length < 3 || summary.results.length > 4) throw new Error('结算记录无法识别。');
    summary.results.forEach(result => {
      if (!result || !GUESTS.some(guest => guest.id === result.guestId) || (result.catId !== null && !catById(result.catId)) || (result.seatId !== null && !seatById(result.seatId)) || !integer(result.score) || result.score > 100 || !integer(result.income) || !integer(result.stars) || result.stars < 1 || result.stars > 5 || typeof result.review !== 'string' || !Array.isArray(result.events) || result.events.some(event => !EVENT_COPY[event])) throw new Error('结算明细无法识别。');
    });
  }
  return value;
}

export function priceOf(id) {
  return (CATS.find(cat => cat.id === id) || ITEMS.find(item => item.id === id) || (id === 'S04' ? { price: 30 } : {})).price || 0;
}

export function wallet(progress) {
  return 20 + Object.values(progress.days).reduce((sum, day) => sum + day.revenue, 0) - Object.keys(progress.purchases).reduce((sum, id) => sum + priceOf(id), 0);
}

export function unlocked(progress, id) {
  return ['C01', 'C02', 'C03', 'S01', 'S02', 'S03'].includes(id) || Object.prototype.hasOwnProperty.call(progress.purchases, id);
}

export function available(progress, id) {
  return unlocked(progress, id) && (!progress.unlockDays || !progress.unlockDays[id] || progress.unlockDays[id] <= progress.day);
}

export function buy(progress, id, now = Date.now()) {
  if (!priceOf(id) || unlocked(progress, id) || wallet(progress) < priceOf(id)) return false;
  progress.purchases[id] = now;
  if (!progress.unlockDays) progress.unlockDays = {};
  progress.unlockDays[id] = progress.day + 1;
  progress.updatedAt = now;
  return true;
}

export function mergeProgress(left, right) {
  validateProgress(left);
  validateProgress(right);
  const first = left.createdAt < right.createdAt || (left.createdAt === right.createdAt && left.seed < right.seed) ? left : right;
  const merged = { ...first, days: {}, purchases: {}, unlockDays: {}, day: Math.max(left.day, right.day), updatedAt: Math.max(left.updatedAt, right.updatedAt) };
  const dayKeys = new Set([...Object.keys(left.days), ...Object.keys(right.days)]);
  dayKeys.forEach(day => {
    const a = left.days[day];
    const b = right.days[day];
    // A finished day is credited once, including after retries and multi-device play.
    merged.days[day] = !a ? b : !b ? a : a.at > b.at || (a.at === b.at && JSON.stringify(a) > JSON.stringify(b)) ? a : b;
  });
  const purchases = new Map();
  [left, right].forEach(progress => Object.entries(progress.purchases).forEach(([id, at]) => purchases.set(id, Math.min(purchases.get(id) || Infinity, at))));
  Array.from(purchases).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).forEach(([id, at]) => {
    // Concurrent purchases must still fit the merged wallet.
    if (wallet(merged) >= priceOf(id)) {
      merged.purchases[id] = at;
      const dates = [left, right].filter(progress => progress.purchases[id] === at).map(progress => progress.unlockDays && progress.unlockDays[id] || 1);
      merged.unlockDays[id] = Math.min(...dates);
    }
  });
  const summaries = [left.summary, right.summary].filter(summary => summary && merged.days[summary.day] && summary.at === merged.days[summary.day].at);
  summaries.sort((a, b) => b.day - a.day || b.at - a.at || JSON.stringify(b).localeCompare(JSON.stringify(a)));
  merged.summary = summaries[0] || null;
  return merged;
}

export function seeded(seed) {
  let state = seed % 2147483647;
  return () => { state = state * 16807 % 2147483647; return (state - 1) / 2147483646; };
}

function shuffle(values, random) {
  const copy = values.slice();
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

export function createDay(progress) {
  const random = seeded((progress.seed + progress.day * 104729) % 2147483646 + 1);
  const present = CATS.filter(cat => available(progress, cat.id) && (cat.id !== 'C08' || random() < 0.3));
  const cats = present.map(cat => {
    const roll = random();
    const state = roll < 0.4 ? 'happy' : roll < 0.65 ? 'sleep' : roll < 0.85 || cat.id === 'C08' ? 'camera' : 'quarrel';
    const others = present.filter(other => other.id !== cat.id);
    return { id: cat.id, state, opponent: state === 'quarrel' && others.length ? others[Math.floor(random() * others.length)].id : null };
  });
  if (progress.day === 1) cats.forEach(cat => {
    cat.state = cat.id === 'C01' ? 'happy' : cat.id === 'C02' ? (random() < 0.5 ? 'happy' : 'sleep') : cat.state === 'quarrel' ? 'happy' : cat.state;
    cat.opponent = null;
  });
  const pool = GUESTS.filter(guest => progress.day <= 2 ? guest.id <= 8 : guest.id <= 13);
  const guests = shuffle(pool, random).slice(0, 3).map(guest => guest.id);
  if (progress.day >= 5 && random() < 0.2) {
    const rare = GUESTS.filter(guest => [13, 14].includes(guest.id) && !guests.includes(guest.id));
    guests.push(rare[Math.floor(random() * rare.length)].id);
  }
  return { number: progress.day, cats, seats: SEATS.filter(seat => available(progress, seat.id)).map(seat => seat.id), guests, results: [], wandUsed: false };
}

export function isAdjacent(first, second) {
  return ADJACENT.some(pair => pair.includes(first) && pair.includes(second));
}

export function unmetLimits(guest, cat, seat) {
  return guest.limits.filter(limit => {
    if (limit === '只能短毛或无毛') return cat.fur === '长毛';
    if (limit === '不能被抓') return cat.scratch;
    if (limit === '不要太吵') return seat.tags.includes('较吵');
    if (limit === '不要靠近猫树') return seat.tree;
    if (limit === '不要太粘') return cat.tags.includes('粘人');
    return false;
  });
}

export function requestMatch(guest, cat, seat, status) {
  const has = tag => cat.tags.includes(tag);
  const result = (score, reason) => ({ score, reason });
  switch (guest.need) {
    case '想被粘':
      if (has('粘人')) return status.state === 'sleep' ? result(20, `${cat.name}性格粘人，但今天正在睡觉，陪伴感稍弱。`) : result(30, `${cat.name}性格粘人，今天也醒着，能主动陪伴。`);
      if (!has('高冷') && status.state === 'happy') return result(20, `${cat.name}今天心情好，愿意接近人，性格里没有主动粘人的特质。`);
      return result(0, `${cat.name}${status.state === 'sleep' ? '今天正在睡觉' : '性格偏高冷'}，难以回应主动陪伴的心愿。`);
    case '只想拍照':
      if (has('爱拆家') && seat.tree) return result(0, `${cat.name}爱拆家，又坐在猫树旁，难以安稳完成拍摄。`);
      if (has('上镜') || has('会抢镜') || status.state === 'camera') return result(30, `${cat.name}${status.state === 'camera' ? '今天想抢镜' : '有' + (has('上镜') ? '上镜' : '会抢镜') + '特质'}，很适合这次拍摄。`);
      return result(20, `${cat.name}可以配合普通拍摄，性格中没有上镜或抢镜特质；睡觉、毛长均不额外扣拍照分。`);
    case '带小孩':
      if (cat.scratch || has('爱拆家')) return result(0, `${cat.name}${cat.scratch ? '可能抓人' : '爱拆家'}，难以满足小朋友需要的稳妥陪伴。`);
      return result(30, `${cat.name}不会抓人，也没有拆家特质，符合陪伴小朋友的需求。`);
    case '第一次来怕猫':
      if (has('爱拆家') || (has('粘人') && status.state === 'camera')) return result(0, `${cat.name}${has('爱拆家') ? '爱拆家' : '粘人又想抢镜'}，对第一次来、怕猫的客人过于热情。`);
      if ((has('安静') || has('高冷') || has('温和')) && status.state !== 'camera') return result(30, `${cat.name}的${cat.tags.join('、')}性格，给第一次来的客人留出了空间。`);
      if (has('怕生') || has('安静') || has('高冷') || has('温和')) return result(20, `${cat.name}${has('怕生') ? '也有些怕生，能保持距离，陪伴感稍弱' : '平时性格合适，但今天想抢镜'}。`);
      return result(0, `${cat.name}性格偏主动，暂时难以让怕猫的客人放松。`);
    case '要安静': {
      const calm = (has('安静') || has('高冷')) && status.state !== 'camera';
      if (calm && seat.quiet) return result(30, `${cat.name}今天安静，${seat.name}也是安静座位，能专心歇一会儿。`);
      if (seat.quiet) return result(20, `${seat.name}很安静，${cat.name}${status.state === 'camera' ? '今天想抢镜' : '的性格里没有安静或高冷特质'}，本次符合安静环境，猫咪状态仅基本合适。`);
      if (calm) return result(20, `${cat.name}今天安静，${seat.name}属于${seat.tags.join('、')}的座位，环境还不够安静。`);
      return result(0, '猫咪状态和座位环境都不符合安静诉求。');
    }
    case '过敏，但还是想来': return cat.fur !== '长毛' ? result(30, `${cat.name}是${cat.fur}，符合这位客人明确提出的游戏内毛类需求。`) : result(0, `${cat.name}是长毛，与这位客人的毛类需求冲突。`);
    case '点名伯爵': return cat.id === 'C08' ? result(30, '见到了点名的伯爵，心愿达成。') : result(0, `客人点名伯爵，本次安排的是${cat.name}。`);
    case '不要太粘': return has('粘人') ? result(0, `${cat.name}性格粘人，与想保持距离的心愿冲突。`) : result(30, `${cat.name}没有粘人特质，符合各自安静相处的心愿。`);
    default: return result(0, '这项心愿尚没有对应的匹配规则。');
  }
}

export function evaluate(guest, cat, seat, status, day, progress) {
  const has = tag => cat.tags.includes(tag);
  const broken = unmetLimits(guest, cat, seat);
  const limitScore = guest.limits.length ? 40 * (guest.limits.length - broken.length) / guest.limits.length : 40;
  const request = requestMatch(guest, cat, seat, status);
  let match = request.score;
  if (guest.need === '第一次来怕猫' && available(progress, 'cushion') && match < 30) {
    const bonus = Math.min(8, 30 - match);
    match += bonus;
    request.reason += ` 软垫增加 ${bonus} 分。`;
  }
  const seatScore = !guest.preferences.length || guest.preferences.includes(seat.type) ? 15 : 0;
  const fightingWith = day.results.filter(result => {
    if (!result.catId || !isAdjacent(seat.id, result.seatId)) return false;
    const other = day.cats.find(entry => entry.id === result.catId);
    return status.opponent === other.id || other.opponent === cat.id;
  });
  const atmosphere = fightingWith.length ? 0 : 15;
  const adjustment = status.state === 'camera' ? guest.need === '只想拍照' ? 10 : guest.need === '第一次来怕猫' ? -10 : 0 : 0;
  const score = Math.max(0, Math.min(100, Math.round(limitScore + match + seatScore + atmosphere + adjustment)));
  const stars = score >= 90 ? 5 : score >= 75 ? 4 : score >= 60 ? 3 : score >= 40 ? 2 : 1;
  const rates = [0, 0.2, 0.35, 0.55, 0.7, 0.85];
  const income = Math.floor(guest.budget * rates[stars]) + (stars === 5 ? 8 : stars === 4 ? 4 : 0);
  const events = [];
  if (fightingWith.length) events.push('fight');
  if (broken.length) events.push('limit');
  if (guest.need === '想被粘' && (status.state === 'sleep' || has('高冷')) && score < 60) events.push('cold');
  if (has('爱拆家') || (cat.scratch && guest.limits.includes('不能被抓'))) events.push('mischief');
  if (cat.id === 'C08' && stars >= 4) events.push('rare');
  if (guest.need === '点名伯爵' && cat.id !== 'C08') events.push('missing');
  const review = events.length ? EVENT_COPY[events[0]][0] : REVIEWS[stars][(day.number + guest.id + Number(cat.id.slice(1))) % REVIEWS[stars].length];
  const reasons = {
    limits: guest.limits.length ? broken.length ? `未满足${broken.join('、')}；${guest.limits.length} 项限制均分 40 分。` : `符合${guest.limits.join('、')}，限制项得满分。` : '客人没有额外限制，限制项计满分。',
    match: request.reason,
    seat: !guest.preferences.length ? '客人没有座位偏好，本项计满分。' : seatScore ? `${seat.name}命中了${guest.preferences.join(' / ')}的偏好。` : `偏好${guest.preferences.join(' / ')}，本次安排了${seat.name}。`,
    atmosphere: fightingWith.length ? `与${fightingWith.map(result => catById(result.catId).name).join('、')}相邻，触发了当天的争吵关系。` : '在店气氛平稳，计满分。',
    adjustment: adjustment > 0 ? '今天想抢镜，拍照诉求额外 +10 分，总分最高 100。' : adjustment < 0 ? '今天想抢镜，让怕猫的客人有些紧张，额外 -10 分。' : '',
  };
  return { guestId: guest.id, catId: cat.id, seatId: seat.id, score, stars, income, events, review, broken, scoringVersion: 2, breakdown: { limits: limitScore, match, seat: seatScore, atmosphere, adjustment, reasons }, fightingWith: fightingWith.map(result => result.catId) };
}

export function admit(day, progress, catId, seatId) {
  if (day.results.length >= day.guests.length) throw new Error('今天已打烊。');
  const guest = GUESTS.find(entry => entry.id === day.guests[day.results.length]);
  const freeCats = day.cats.filter(cat => !day.results.some(result => result.catId === cat.id));
  const freeSeats = day.seats.filter(id => !day.results.some(result => result.seatId === id));
  if (!freeCats.length || !freeSeats.length) {
    const result = { guestId: guest.id, catId: null, seatId: null, score: 0, stars: 1, income: Math.floor(guest.budget * 0.1), events: ['full'], review: EVENT_COPY.full[0], broken: [] };
    day.results.push(result);
    return result;
  }
  const status = freeCats.find(cat => cat.id === catId);
  if (!status || !freeSeats.includes(seatId)) throw new Error('请选择一只空闲猫和一个空闲座位。');
  const result = evaluate(guest, catById(catId), seatById(seatId), status, day, progress);
  result.fightingWith.forEach(id => {
    const previous = day.results.find(entry => entry.catId === id);
    if (!previous.events.includes('fight')) previous.events.push('fight');
    previous.review = EVENT_COPY.fight[0];
  });
  day.results.push(result);
  return result;
}

export function finishDay(progress, day, now = Date.now()) {
  if (day.results.length !== day.guests.length || progress.days[day.number]) return false;
  const summary = { day: day.number, at: now, results: JSON.parse(JSON.stringify(day.results)) };
  progress.days[day.number] = { revenue: day.results.reduce((sum, result) => sum + result.income, 0), score: day.results.reduce((sum, result) => sum + result.score, 0), at: now };
  progress.summary = summary;
  progress.updatedAt = now;
  return true;
}

export function summaryDetails(summary) {
  const best = summary.results.filter(result => result.catId).reduce((previous, result) => !previous || result.score >= previous.score ? result : previous, null);
  const event = summary.results.find(result => result.events.length);
  const lowest = summary.results.reduce((previous, result) => result.score <= previous.score ? result : previous);
  return { best, review: (event || (lowest.stars < 4 ? lowest : best) || lowest).review, revenue: summary.results.reduce((sum, result) => sum + result.income, 0) };
}
