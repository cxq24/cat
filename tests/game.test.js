import test from 'node:test';
import assert from 'node:assert/strict';
import { CATS, GUESTS, SEATS } from '../src/data.js';
import { createProgress, createDay, evaluate, requestMatch, admit, finishDay, wallet, buy, mergeProgress, validateProgress, summaryDetails } from '../src/game.js';

const cat = id => CATS.find(value => value.id === id);
const guest = id => GUESTS.find(value => value.id === id);
const seat = id => SEATS.find(value => value.id === id);
const state = (id, value = 'happy', opponent = null) => ({ id, state: value, opponent });
const emptyDay = () => ({ number: 1, cats: [state('C01'), state('C02'), state('C03')], guests: [1, 2, 3], seats: ['S01', 'S02', 'S03'], results: [] });

test('first day has three distinct guests, three cats and three seats with safe initial states', () => {
  const progress = createProgress(1000);
  progress.seed = 98;
  const day = createDay(progress);
  assert.equal(new Set(day.guests).size, 3);
  assert.ok(day.guests.every(id => id <= 8));
  assert.equal(day.cats.length, 3);
  assert.equal(day.seats.length, 3);
  assert.equal(day.cats[0].state, 'happy');
  assert.ok(day.cats.every(value => value.state !== 'quarrel'));
  assert.deepEqual(createDay(progress), day);
});

test('all hard restrictions are visible scoring penalties and still permit seating', () => {
  const day = emptyDay();
  const result = evaluate(guest(1), cat('C01'), seat('S01'), state('C01'), day, createProgress());
  assert.deepEqual(result.broken, ['只能短毛或无毛']);
  assert.ok(result.events.includes('limit'));
  const child = evaluate(guest(3), cat('C05'), seat('S03'), state('C05'), day, createProgress());
  assert.equal(child.breakdown.limits, 0);
  assert.equal(child.breakdown.match, 0);
  assert.equal(child.broken.length, 2);
  assert.ok(child.events.includes('mischief'));
});

test('sleeping changes companionship score once, camera adjustment caps at 100', () => {
  const day = emptyDay();
  const result = evaluate(guest(2), cat('C01'), seat('S02'), state('C01', 'sleep'), day, createProgress());
  assert.equal(result.breakdown.match, 20);
  assert.equal(result.breakdown.adjustment, 0);
  assert.equal(result.score, 90);
  assert.match(result.breakdown.reasons.match, /正在睡觉/);
  const photo = evaluate(guest(5), cat('C03'), seat('S03'), state('C03', 'camera'), day, createProgress());
  assert.equal(photo.score, 100);
  assert.equal(photo.stars, 5);
  assert.equal(photo.income, Math.floor(30 * 0.85) + 8);
});

test('one-sided quarrel triggers adjacent fight, previous income stays unchanged', () => {
  const day = emptyDay();
  day.cats[0] = state('C01', 'quarrel', 'C02');
  const progress = createProgress();
  const first = admit(day, progress, 'C01', 'S01');
  const originalIncome = first.income;
  const second = admit(day, progress, 'C02', 'S03');
  assert.equal(second.breakdown.atmosphere, 0);
  assert.ok(first.events.includes('fight'));
  assert.ok(second.events.includes('fight'));
  assert.equal(first.income, originalIncome);
  const separate = emptyDay();
  separate.cats[0] = state('C01', 'quarrel', 'C02');
  admit(separate, progress, 'C01', 'S01');
  assert.equal(admit(separate, progress, 'C02', 'S02').breakdown.atmosphere, 15);
});

test('occupied resources cannot be reused and fourth guest can leave without blocking settlement', () => {
  const day = emptyDay();
  const progress = createProgress();
  admit(day, progress, 'C01', 'S01');
  assert.throws(() => admit(day, progress, 'C01', 'S02'));
  assert.throws(() => admit(day, progress, 'C02', 'S01'));
  admit(day, progress, 'C02', 'S02');
  admit(day, progress, 'C03', 'S03');
  day.guests.push(14);
  const final = admit(day, progress, null, null);
  assert.deepEqual(final.events, ['full']);
  assert.equal(final.stars, 1);
  assert.equal(final.income, 5);
  assert.equal(finishDay(progress, day, 100), true);
  assert.equal(finishDay(progress, day, 101), false);
  assert.ok(summaryDetails(progress.summary).best.catId);
});

test('daily income only enters permanent wallet at settlement and purchases survive restarts', () => {
  const progress = createProgress(100);
  const day = emptyDay();
  admit(day, progress, 'C01', 'S01');
  assert.equal(wallet(progress), 20);
  assert.equal(buy(progress, 'C08'), false);
  assert.equal(buy(progress, 'wand', 200), true);
  assert.equal(wallet(progress), 2);
  assert.equal(createDay(progress).results.length, 0);
  assert.equal(buy(progress, 'wand'), false);
  assert.equal(buy(progress, 'made-up-item'), false);
  admit(day, progress, 'C02', 'S02');
  admit(day, progress, 'C03', 'S03');
  finishDay(progress, day, 300);
  assert.equal(wallet(progress), 2 + day.results.reduce((sum, value) => sum + value.income, 0));
  assert.doesNotThrow(() => validateProgress(progress));
});

test('new unlocks only affect newly generated day and cushion caps request score', () => {
  const progress = createProgress();
  const day = createDay(progress);
  progress.days[1] = { revenue: 120, score: 300, at: 2000 };
  assert.equal(buy(progress, 'C04'), true);
  assert.equal(buy(progress, 'S04'), true);
  assert.equal(buy(progress, 'cushion'), true);
  assert.equal(day.cats.some(value => value.id === 'C04'), false);
  assert.equal(createDay(progress).cats.some(value => value.id === 'C04'), false);
  assert.equal(createDay(progress).seats.includes('S04'), false);
  progress.day = 2;
  const next = createDay(progress);
  assert.ok(next.cats.some(value => value.id === 'C04'));
  assert.ok(next.seats.includes('S04'));
  const result = evaluate(guest(4), cat('C03'), seat('S02'), state('C03'), emptyDay(), progress);
  assert.equal(result.breakdown.match, 28);
});

test('cloud merge credits same day once and resolves concurrent purchases without negative wallet', () => {
  const first = createProgress(100);
  const second = structuredClone(first);
  first.purchases.wand = 200;
  second.purchases.cushion = 201;
  const merged = mergeProgress(first, second);
  assert.equal(wallet(merged), 2);
  assert.deepEqual(merged.purchases, { wand: 200 });
  first.days[1] = { revenue: 70, score: 200, at: 1000 };
  second.days[1] = { revenue: 80, score: 230, at: 1001 };
  const result = mergeProgress(first, second);
  assert.equal(result.days[1].revenue, 80);
  assert.equal(wallet(result), 64);
  assert.deepEqual(mergeProgress(first, second), mergeProgress(second, first));
  assert.deepEqual(mergeProgress(result, result), result);
});

test('summary best pair uses the last tie and prioritizes event review', () => {
  const results = [
    { guestId: 1, catId: 'C01', seatId: 'S01', score: 80, income: 10, stars: 4, events: [], review: '好评' },
    { guestId: 2, catId: 'C02', seatId: 'S02', score: 80, income: 10, stars: 4, events: [], review: '另一个好评' },
    { guestId: 3, catId: 'C03', seatId: 'S03', score: 40, income: 5, stars: 2, events: ['fight'], review: '事件评价' },
  ];
  const details = summaryDetails({ results });
  assert.equal(details.best.catId, 'C02');
  assert.equal(details.review, '事件评价');
});

test('corrupt progress is rejected before it can replace existing data', () => {
  assert.throws(() => validateProgress({ version: 200 }));
  const broken = createProgress();
  broken.days[1] = { revenue: -100, score: 20, at: 300 };
  assert.throws(() => validateProgress(broken));
});

test('basic match is 20 and explains which part of a quiet visit is satisfied', () => {
  const result = evaluate(guest(7), cat('C03'), seat('S02'), state('C03'), emptyDay(), createProgress());
  assert.equal(result.breakdown.limits, 40);
  assert.equal(result.breakdown.match, 20);
  assert.equal(result.breakdown.seat, 15);
  assert.equal(result.breakdown.atmosphere, 15);
  assert.equal(result.score, 90);
  assert.match(result.breakdown.reasons.match, /米粒/);
  assert.match(result.breakdown.reasons.match, /安静角落/);
  assert.equal(result.scoringVersion, 2);
});

test('photography, children and allergy only use relevant, stated requirements', () => {
  assert.equal(requestMatch(guest(5), cat('C06'), seat('S03'), state('C06', 'sleep')).score, 20);
  assert.equal(requestMatch(guest(5), cat('C06'), seat('S03'), state('C06', 'happy')).score, 20);
  assert.equal(requestMatch(guest(3), cat('C01'), seat('S02'), state('C01', 'camera')).score, 30);
  assert.equal(requestMatch(guest(9), cat('C02'), seat('S02'), state('C02')).score, 30);
  assert.equal(requestMatch(guest(9), cat('C01'), seat('S02'), state('C01')).score, 0);
});

test('unspecified seat preference is full credit without unrelated double penalty', () => {
  const result = evaluate(guest(9), cat('C01'), seat('S02'), state('C01'), emptyDay(), createProgress());
  assert.equal(result.breakdown.limits, 0);
  assert.equal(result.breakdown.seat, 15);
  assert.match(result.breakdown.reasons.seat, /没有座位偏好/);
});

test('existing settled records retain old scores when new rules are installed', () => {
  const progress = createProgress(1000);
  const day = emptyDay();
  admit(day, progress, 'C01', 'S01');
  admit(day, progress, 'C02', 'S02');
  admit(day, progress, 'C03', 'S03');
  finishDay(progress, day, 2000);
  const old = progress.summary.results[0];
  old.score = 82;
  old.breakdown.match = 12;
  delete old.scoringVersion;
  delete old.breakdown.reasons;
  assert.equal(validateProgress(JSON.parse(JSON.stringify(progress))).summary.results[0].score, 82);
});
