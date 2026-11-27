import test from 'node:test';
import assert from 'node:assert/strict';
import { platformFor, SaveStore, Rankings } from '../src/platform.js';
import { createProgress, wallet, buy } from '../src/game.js';

function fakePlatform(options = {}) {
  let local = options.local || null;
  let records = options.records || [];
  const calls = { local: 0, add: 0, update: 0, query: 0 };
  const api = {
    getStorage: async () => { if (options.readError) throw new Error('read failed'); return { data: local }; },
    setStorage: async ({ data }) => { calls.local++; local = data; return { errMsg: 'setStorage:ok' }; },
    queryCloudStorage: async () => { calls.query++; if (options.denied) throw { errCode: 1006 }; return { items: records }; },
    addCloudStorage: async ({ items }) => { calls.add++; if (options.networkFailure) throw new Error('result unknown'); if (!options.unknown) records = [{ id: 'a'.repeat(24), content: items[0].content }]; return { data: [{ id: options.unknown ? '' : 'a'.repeat(24), status: options.unknown ? 'UNKNOWN' : 'SUCCESS' }] }; },
    updateCloudStorage: async ({ items }) => { calls.update++; records = [{ id: items[0].id, content: items[0].content }]; return { data: [{ id: items[0].id, status: 'SUCCESS' }] }; },
  };
  return { api, version: 9550, supports: (_version, methods) => methods.every(method => typeof api[method] === 'function'), calls, getLocal: () => local, setRecords: value => { records = value; } };
}

test('client version strips build suffix, unknown versions never gain capabilities', async () => {
  const good = await platformFor({ xhs: { launchOptions: { miniToolEnv: { buildVersion: '9462004' } }, miniTool: { getStorage() {} } } });
  assert.equal(good.version, 9462);
  assert.equal(good.supports(9460, ['getStorage']), true);
  assert.equal(good.supports(9510, ['getStorage']), false);
  const unknown = await platformFor({ xhs: { miniTool: { getStorage() {}, setStorage() {} } } });
  assert.equal(unknown.version, null);
  assert.equal(unknown.supports(9460, ['getStorage']), false);
  const store = new SaveStore(unknown);
  await store.load();
  assert.equal(store.localState, 'unavailable');
});

test('local read failure blocks all writes and preserves old data', async () => {
  const platform = fakePlatform({ readError: true, local: 'old-data' });
  const store = new SaveStore(platform);
  await store.load();
  assert.equal(store.readBlocked, true);
  await assert.rejects(() => store.save(createProgress()));
  await store.sync();
  assert.equal(platform.calls.local, 0);
  assert.equal(platform.calls.add, 0);
  assert.equal(platform.getLocal(), 'old-data');
});

test('invalid local JSON cannot silently initialize a new game', async () => {
  const platform = fakePlatform({ local: '{invalid' });
  const store = new SaveStore(platform);
  await store.load();
  assert.equal(store.localState, 'read-error');
  assert.equal(platform.calls.local, 0);
});

test('cloud sync merges before writing and repeats without duplicate creation', async () => {
  const local = createProgress(100);
  const remote = structuredClone(local);
  remote.days[1] = { revenue: 80, score: 230, at: 300 };
  buy(remote, 'C04', 400);
  const platform = fakePlatform({ local: JSON.stringify({ progress: local }), records: [{ id: 'a'.repeat(24), content: { kind: 'cat-cafe-save', progress: remote } }] });
  const store = new SaveStore(platform);
  await store.load();
  await store.sync();
  assert.equal(store.cloudState, 'synced');
  assert.equal(wallet(store.progress), 60);
  assert.ok(store.progress.purchases.C04);
  await store.sync();
  assert.equal(platform.calls.add, 0);
  assert.equal(platform.calls.update, 2);
});

test('unknown add is persisted across restart and only queried, never blindly replayed', async () => {
  const platform = fakePlatform({ unknown: true });
  let store = new SaveStore(platform);
  await store.load();
  await store.sync();
  assert.equal(store.cloudState, 'pending');
  assert.ok(JSON.parse(platform.getLocal()).pending.writeId);
  store = new SaveStore(platform);
  await store.load();
  await store.sync();
  await store.sync();
  assert.equal(platform.calls.add, 1);
  assert.equal(platform.calls.update, 0);
  assert.equal(platform.calls.query, 3);
});

test('network failure after dispatch retains unknown write marker', async () => {
  const platform = fakePlatform({ networkFailure: true });
  const store = new SaveStore(platform);
  await store.load();
  await store.sync();
  await store.sync();
  assert.equal(platform.calls.add, 1);
  assert.equal(store.cloudState, 'pending');
});

test('denied cloud capability becomes unavailable while local save remains functional', async () => {
  const platform = fakePlatform({ denied: true });
  const store = new SaveStore(platform);
  await store.load();
  await store.sync();
  assert.equal(store.cloudAvailable, false);
  assert.equal(store.localState, 'saved');
  assert.equal(await store.save(store.progress), true);
});

test('rankings submit average score and never substitute failed requests with empty results', async () => {
  let submitted;
  const platform = fakePlatform();
  platform.api.submitScore = async value => { submitted = value; return { score: value.score }; };
  platform.api.getRankList = async () => { throw { errCode: 1005 }; };
  platform.api.getMyRank = async () => ({ status: 'NO_SCORE' });
  const rankings = new Rankings(platform);
  await rankings.submit({ results: [{ score: 90 }, { score: 100 }, { score: 80 }, { score: 100 }] });
  assert.equal(submitted.score, 92.5);
  await assert.rejects(() => rankings.list('week'));
  assert.equal(rankings.available, false);
});

test('a denied score submission must not disable public leaderboard reads', async () => {
  const platform = fakePlatform();
  platform.api.submitScore = async () => { throw { errCode: 1005 }; };
  platform.api.getRankList = async () => ({ data: [{ rank: 1, score: 90, nickname: '猫咖来客' }] });
  platform.api.getMyRank = async () => ({ status: 'NOT_PARTICIPATING' });
  const rankings = new Rankings(platform);
  assert.equal(await rankings.submit({ results: [{ score: 90 }] }), false);
  assert.equal(rankings.available, true);
  const result = await rankings.list('week');
  assert.equal(result.rows.length, 1);
});

test('public leaderboard stays visible when personal rank fails', async () => {
  const platform = fakePlatform();
  platform.api.submitScore = async () => ({ score: 90 });
  platform.api.getRankList = async () => ({ data: [{ rank: 1, score: 90, nickname: '猫咖来客' }] });
  platform.api.getMyRank = async () => { throw { errCode: 1005 }; };
  const rankings = new Rankings(platform);
  const result = await rankings.list('week');
  assert.equal(result.rows.length, 1);
  assert.equal(result.mine, null);
  assert.equal(result.personalIssue.code, '1005');
});

test('public leaderboard only requires its own SDK method', async () => {
  const platform = fakePlatform();
  platform.api.getRankList = async () => ({ data: [] });
  const rankings = new Rankings(platform);
  assert.equal(rankings.supported, true);
  const result = await rankings.list('week');
  assert.equal(result.rows.length, 0);
  assert.equal(result.personalIssue.code, 'METHOD_MISSING');
});

test('invalid native submission response is not reported as confirmed success', async () => {
  const platform = fakePlatform();
  platform.api.submitScore = async () => undefined;
  const rankings = new Rankings(platform);
  assert.equal(await rankings.submit({ results: [{ score: 90 }] }), false);
  assert.equal(rankings.submitIssue.code, 'INVALID_RESPONSE');
  assert.equal(rankings.submissionStatus, 'error');
});

test('native allowlist rejection retains exact error code and method', async () => {
  const platform = fakePlatform();
  platform.api.getRankList = async () => { throw { errCode: 10003, errMsg: 'native rejection' }; };
  const rankings = new Rankings(platform);
  await assert.rejects(() => rankings.list('week'));
  assert.equal(rankings.readIssue.method, 'getRankList');
  assert.equal(rankings.readIssue.code, '10003');
  assert.match(rankings.readIssue.reason, /白名单/);
});
