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

export function evaluate(guest, cat, seat, status, day, progress) {
  const has = tag => cat.tags.includes(tag);
  const broken = unmetLimits(guest, cat, seat);
  const limitScore = guest.limits.length ? 40 * (guest.limits.length - broken.length) / guest.limits.length : 40;
  let match = 0;
  switch (guest.need) {
    case '想被粘': match = has('粘人') ? status.state === 'sleep' ? 12 : 30 : !has('高冷') && status.state === 'happy' ? 12 : 0; break;
    case '只想拍照': match = has('爱拆家') && seat.tree ? 0 : has('上镜') || has('会抢镜') || status.state === 'camera' ? 30 : cat.fur !== '长毛' && status.state !== 'sleep' ? 12 : 0; break;
    case '带小孩': match = cat.scratch || has('爱拆家') ? 0 : has('会抢镜') || status.state === 'camera' ? 12 : 30; break;
    case '第一次来怕猫': match = has('爱拆家') ? 0 : (has('安静') || has('高冷')) && status.state !== 'camera' ? 30 : has('温和') || has('怕生') ? 12 : 0; break;
    case '要安静': {
      const calm = (has('安静') || has('高冷')) && status.state !== 'camera';
      match = calm && seat.quiet ? 30 : calm || seat.quiet ? 12 : 0;
      break;
    }
    case '过敏，但还是想来': match = cat.fur === '无毛' ? 30 : cat.fur === '短毛' ? 12 : 0; break;
    case '点名伯爵': match = cat.id === 'C08' ? 30 : 0; break;
    case '不要太粘': match = has('粘人') ? 0 : 30; break;
  }
  if (guest.need === '第一次来怕猫' && available(progress, 'cushion')) match = Math.min(30, match + 8);
  const seatScore = guest.preferences.length ? guest.preferences.includes(seat.type) ? 15 : 0 : broken.length ? 0 : 10;
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
  return { guestId: guest.id, catId: cat.id, seatId: seat.id, score, stars, income, events, review, broken, breakdown: { limits: limitScore, match, seat: seatScore, atmosphere, adjustment }, fightingWith: fightingWith.map(result => result.catId) };
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
