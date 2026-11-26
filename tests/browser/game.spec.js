import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createProgress } from '../../src/game.js';

async function bridge(page, { full = false, readError = false, progress = null, windowInfo = null, windowInfoFailure = false } = {}) {
  const initial = progress || createProgress(1000);
  initial.seed = 713;
  await page.addInitScript(({ initial, full, readError, windowInfo, windowInfoFailure }) => {
    const key = 'cat-cafe-test-save';
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ progress: initial }));
    window.__calls = { writes: 0, shares: [], scores: [], cloud: [] };
    window.__windowInfo = windowInfo;
    window.xhs = {
      launchOptions: { miniToolEnv: { buildVersion: 9550001, windowInfo } },
      miniTool: {
        getStorage: async () => { if (readError) throw new Error('test read failure'); return { data: localStorage.getItem(key) }; },
        setStorage: async ({ data }) => { window.__calls.writes++; localStorage.setItem(key, data); return { errMsg: 'setStorage:ok' }; },
      }
    };
    if (windowInfo) window.xhs.miniTool.getWindowInfo = async () => {
      if (windowInfoFailure) throw new Error('window info not available');
      return window.__windowInfo;
    };
    if (full) {
      Object.assign(window.xhs.miniTool, {
        queryCloudStorage: async () => ({ items: window.__calls.cloud }),
        addCloudStorage: async ({ items }) => { window.__calls.cloud = [{ id: 'abcdef0123456789abcdef01', content: items[0].content }]; return { data: [{ id: 'abcdef0123456789abcdef01', status: 'SUCCESS' }] }; },
        updateCloudStorage: async ({ items }) => { window.__calls.cloud = [{ id: items[0].id, content: items[0].content }]; return { data: [{ id: items[0].id, status: 'SUCCESS' }] }; },
        submitScore: async value => { window.__calls.scores.push(value); return { score: value.score }; },
        getRankList: async () => ({ data: [{ rank: 1, score: 99, nickname: '<img src=x onerror=alert(1)>' }, { rank: 2, score: 92.5, nickname: '今天也是好接待' }] }),
        getMyRank: async () => ({ status: 'EXACT', rank: 2, score: 92.5 }),
        share: async value => { window.__calls.shares.push(value); return {}; },
      });
    }
  }, { initial, full, readError, windowInfo, windowInfoFailure });
}

async function startDay(page) {
  await page.locator('[data-action="open"]').click();
  await expect(page.getByText('今天，谁来上班？')).toBeVisible();
  await page.locator('[data-action="guest"]').click();
}

async function seatNext(page, cat, seat) {
  await page.locator('[data-action="arrange"]').click();
  await expect(page.locator('[data-action="admit"]')).toBeDisabled();
  await page.locator(`[data-action="cat"][data-id="${cat}"]`).click();
  await page.locator(`[data-action="seat"][data-id="${seat}"]`).click();
  await page.locator('[data-action="admit"]').click();
  await expect(page.locator('.feedback-income')).toBeVisible();
}

test('complete first day, enforce occupancy, persist purchases and start next day', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await bridge(page);
  await page.goto('/');
  await mkdir('artifacts', { recursive: true });
  await expect(page.locator('.hero img')).toBeVisible();
  await page.screenshot({ path: 'artifacts/home-mobile.png', fullPage: true });
  await startDay(page);
  await seatNext(page, 'C01', 'S01');
  await page.locator('[data-action="continue"]').click();
  await page.locator('[data-action="arrange"]').click();
  await expect(page.locator('[data-action="cat"][data-id="C01"]')).toBeDisabled();
  await expect(page.locator('[data-action="seat"][data-id="S01"]')).toBeDisabled();
  await expect(page.locator('.demand.compact')).toBeInViewport();
  await expect(page.locator('.cat-picker')).toBeInViewport();
  await expect(page.locator('[data-action="admit"]')).toBeInViewport();
  await page.screenshot({ path: 'artifacts/arrangement-mobile.png', fullPage: true });
  await page.locator('[data-action="cat"][data-id="C02"]').click();
  await page.locator('[data-action="seat"][data-id="S03"]').click();
  await page.locator('[data-action="admit"]').click();
  await page.locator('[data-action="continue"]').click();
  await seatNext(page, 'C03', 'S02');
  await expect(page.locator('.match-explanation')).toContainText('基本合拍 · 诉求 20 / 30');
  await expect(page.locator('.match-explanation')).toContainText('米粒');
  await page.locator('[data-action="details"]').click();
  await expect(page.locator('.score-detail')).toHaveCount(4);
  await expect(page.locator('.score-details')).toContainText('安静角落');
  await page.screenshot({ path: 'artifacts/scoring-v0.1.1.png', fullPage: true });
  await page.locator('[data-action="continue"]').click();
  await expect(page.getByText('今天最合拍的一对。')).toBeVisible();
  await expect(page.locator('.receipt-totals')).toBeInViewport();
  await expect(page.locator('.review-note')).toBeInViewport();
  await page.screenshot({ path: 'artifacts/settlement-mobile.png', fullPage: true });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cat-cafe-test-save')).progress);
  expect(Object.keys(saved.days)).toEqual(['1']);
  expect(saved.summary.results).toHaveLength(3);
  await page.locator('[data-action="shop"]').click();
  await page.locator('[data-action="buy"][data-id="wand"]').click();
  await expect(page.locator('[data-action="buy"][data-id="wand"]')).toBeDisabled();
  await page.reload();
  await page.locator('[data-action="shop"]').click();
  await expect(page.locator('[data-action="buy"][data-id="wand"]')).toHaveText('已解锁');
  await page.locator('[data-action="shop-back"]').click();
  await page.locator('[data-action="summary"]').click();
  await page.locator('[data-action="next-day"]').click();
  await expect(page.locator('.eyebrow')).toContainText('第 2 天');
  expect(errors).toEqual([]);
});

test('partial day reload keeps base wallet and restarts with all cats free', async ({ page }) => {
  await bridge(page);
  await page.goto('/');
  await startDay(page);
  await seatNext(page, 'C01', 'S01');
  await page.reload();
  await expect(page.locator('.wallet-balance')).toContainText('20');
  await startDay(page);
  await page.locator('[data-action="arrange"]').click();
  await expect(page.locator('[data-action="cat"][data-id="C01"]')).toBeEnabled();
  await expect(page.locator('[data-action="seat"][data-id="S01"]')).toBeEnabled();
});

test('failed reads show retry screen and never write over existing progress', async ({ page }) => {
  await bridge(page, { readError: true });
  await page.goto('/');
  await expect(page.getByText('营业手册暂时没翻开')).toBeVisible();
  expect(await page.evaluate(() => window.__calls.writes)).toBe(0);
  await page.locator('[data-action="retry-load"]').click();
  expect(await page.evaluate(() => window.__calls.writes)).toBe(0);
});

test('cloud, leaderboard and share use SDK under restrictive CSP without external requests', async ({ page }) => {
  const external = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4174/')) external.push(request.url()); });
  await bridge(page, { full: true });
  await page.goto('/');
  await startDay(page);
  for (const [cat, seat] of [['C01', 'S01'], ['C02', 'S03'], ['C03', 'S02']]) {
    await seatNext(page, cat, seat);
    await page.locator('[data-action="continue"]').click();
  }
  await expect(page.locator('.summary-print')).toBeVisible();
  const scoreCalls = await page.evaluate(() => window.__calls.scores);
  expect(scoreCalls).toHaveLength(1);
  expect(scoreCalls[0].score).toBeGreaterThanOrEqual(0);
  expect(scoreCalls[0].score).toBeLessThanOrEqual(100);
  await page.locator('[data-action="share-menu"]').click();
  await page.locator('[data-action="share-image"]').click();
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  const share = await page.evaluate(() => window.__calls.shares[0]);
  expect(share.type).toBe('image');
  expect(share.image_resource).toMatch(/^data:image\/png;base64,/);
  await page.evaluate(() => { window.xhs.miniTool.share = () => new Promise(resolve => { window.__finishShare = resolve; }); });
  await page.locator('[data-action="share-menu"]').click();
  await page.locator('[data-action="share-card"]').click();
  await expect(page.locator('[data-action="close-modal"]')).toBeEnabled();
  await page.locator('[data-action="close-modal"]').click();
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  await page.evaluate(() => window.__finishShare({}));
  await expect(page.locator('.summary-page')).toBeVisible();
  await page.locator('[data-action="ranks"]').click();
  await expect(page.locator('.my-rank')).toContainText('92.5');
  await expect(page.locator('.rank-list li')).toHaveCount(2);
  await expect(page.locator('.rank-list img')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/ranking-mobile.png', fullPage: true });
  await page.getByRole('tab', { name: '总榜' }).click();
  await expect(page.getByRole('tab', { name: '总榜' })).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(() => { window.xhs.miniTool.submitScore = () => new Promise(resolve => { window.__finishScore = resolve; }); });
  await page.locator('[data-action="submit-rank"]').click();
  await expect(page.locator('[data-action="submit-rank"]')).toBeDisabled();
  await page.locator('.nav-back').click();
  await expect(page.locator('.summary-page')).toBeVisible();
  await page.evaluate(() => window.__finishScore({ score: 90 }));
  await expect(page.locator('.summary-page')).toBeVisible();
  await page.locator('.nav-back').click();
  await expect(page.locator('.home-page')).toBeVisible();
  await page.locator('[data-action="ranks"]').click();
  await page.locator('.nav-back').click();
  await expect(page.locator('.home-page')).toBeVisible();
  expect(external).toEqual([]);
});

for (const width of [320, 375, 430]) {
  test(`arrangement fits ${width}px mobile width with eight cats and four seats`, async ({ page }) => {
    const progress = createProgress(1000);
    progress.day = 5;
    progress.days[1] = { revenue: 500, score: 300, at: 2000 };
    progress.purchases = { C04: 3000, C05: 3001, C06: 3002, C07: 3003, C08: 3004, S04: 3005 };
    await bridge(page, { progress });
    await page.setViewportSize({ width, height: Math.round(width * 16 / 9) });
    await page.goto('/');
    await startDay(page);
    await page.locator('[data-action="arrange"]').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await expect(page.locator('.cat-picker')).toBeVisible();
    await expect(page.locator('.floorplan')).toBeVisible();
    await expect(page.locator('.demand.compact')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.cat-picker')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('[data-action="admit"]')).toBeInViewport({ ratio: 1 });
    const bounds = await page.locator('.demand.compact').boundingBox();
    const end = await page.locator('.cat-picker').boundingBox();
    expect(end.y + end.height - bounds.y).toBeLessThan(Math.round(width * 16 / 9));
  });
}

const rectangle = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

test('notched screen clears status bar and capsule on home, roster, guest and arrangement', async ({ page }) => {
  const windowInfo = { windowWidth: 390, windowHeight: 844, statusBarHeight: 47, screenTop: 0, safeArea: rectangle(0, 47, 390, 763), menuButtons: { capsule: rectangle(281, 54, 99, 34) } };
  await bridge(page, { windowInfo });
  await page.goto('/');
  await expect(page.locator('.brand')).toBeVisible();
  const top = await page.locator('.topbar').boundingBox();
  expect(top.y).toBe(49);
  const style = await page.locator('#app').evaluate(node => ({ top: getComputedStyle(node).paddingTop, bottom: getComputedStyle(node).paddingBottom }));
  expect(style).toEqual({ top: '49px', bottom: '34px' });
  const brand = await page.locator('.brand').boundingBox();
  expect(brand.x + brand.width).toBeLessThan(281);
  expect(Math.abs(brand.y + brand.height / 2 - 71)).toBeLessThanOrEqual(1);
  await expect(page.locator('.topbar [data-action="settings"]')).toHaveCount(0);
  await expect(page.locator('.topbar .wallet-balance')).toHaveCount(0);
  await page.evaluate(() => {
    const status = document.createElement('div');
    status.style.cssText = 'position:fixed;top:0;left:0;right:0;height:47px;background:#f7f3e9;z-index:999;display:flex;align-items:center;justify-content:space-between;padding:0 25px;font:bold 13px sans-serif';
    status.innerHTML = '<span>09:41</span><span>▂▄▆　Wi-Fi　▰</span>';
    const capsule = document.createElement('div');
    capsule.style.cssText = 'position:fixed;right:10px;top:54px;width:99px;height:34px;background:#eeeadd;border:1px solid #c8ceb5;border-radius:20px;z-index:999;text-align:center;line-height:32px';
    capsule.textContent = '···　│　×';
    document.body.append(status, capsule);
  });
  await page.screenshot({ path: 'artifacts/safe-area-v0.1.2.png', fullPage: true });
  await page.locator('[data-action="open"]').click();
  expect((await page.locator('h1').boundingBox()).y).toBeGreaterThan(88);
  await page.locator('[data-action="guest"]').click();
  expect((await page.locator('h1').boundingBox()).y).toBeGreaterThan(88);
  await page.locator('[data-action="arrange"]').click();
  expect((await page.locator('h1').boundingBox()).y).toBeGreaterThan(88);
  await expect(page.locator('.nav-back')).toBeInViewport({ ratio: 1 });
  const back = await page.locator('.nav-back').boundingBox();
  expect(back.x + back.width).toBeLessThan(281);
  await expect(page.locator('.demand.compact')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.cat-picker')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('[data-action="admit"]')).toBeInViewport({ ratio: 1 });
  await page.evaluate(() => {
    window.__windowInfo.menuButtons.capsule = { left: 321, top: 30, width: 99, height: 37, right: 420, bottom: 67 };
    window.__windowInfo.windowWidth = 430;
    window.__windowInfo.windowHeight = 800;
    window.__windowInfo.safeArea.bottom = 766;
    window.__windowInfo.safeArea.top = 24;
  });
  await page.setViewportSize({ width: 430, height: 800 });
  await expect.poll(() => page.locator('#app').evaluate(node => getComputedStyle(node).paddingTop)).toBe('26.5px');
});

test('launch snapshot remains safe when live window information fails', async ({ page }) => {
  const windowInfo = { windowWidth: 390, windowHeight: 844, safeArea: rectangle(0, 24, 390, 820), menuButtons: { back: rectangle(10, 28, 32, 32), me: null, share: rectangle(345, 28, 32, 32) } };
  await bridge(page, { windowInfo, windowInfoFailure: true });
  await page.goto('/');
  await expect(page.locator('.brand')).toBeVisible();
  expect((await page.locator('.topbar').boundingBox()).y).toBe(24);
});

test('all reception screens have a visible exit and leaving resets only unfinished work', async ({ page }) => {
  await bridge(page);
  await page.goto('/');
  await expect(page.locator('.topbar')).toHaveText('猫咖接待');
  await expect(page.locator('.wallet-balance')).toContainText('金币余额');
  await expect(page.locator('.wallet-balance')).toContainText('20');
  await page.locator('[data-action="open"]').click();
  await expect(page.locator('.nav-back')).toBeVisible();
  await page.locator('.nav-back').click();
  await expect(page.locator('.home-page')).toBeVisible();
  await startDay(page);
  await page.locator('.nav-back').click();
  await expect(page.locator('.home-page')).toBeVisible();
  await startDay(page);
  await page.locator('[data-action="arrange"]').click();
  await page.locator('[data-action="cat"][data-id="C01"]').click();
  await page.locator('[data-action="seat"][data-id="S01"]').click();
  await page.locator('.nav-back').click();
  await expect(page.locator('.home-page')).toBeVisible();
  await startDay(page);
  await page.locator('[data-action="arrange"]').click();
  await expect(page.locator('[data-action="admit"]')).toBeDisabled();
  await page.locator('[data-action="cat"][data-id="C01"]').click();
  await page.locator('[data-action="seat"][data-id="S01"]').click();
  await page.locator('[data-action="admit"]').click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('.nav-back').click();
  await expect(page.locator('.feedback-page')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.nav-back').click();
  await expect(page.locator('.home-page')).toBeVisible();
  await expect(page.locator('.wallet-balance')).toContainText('20');
  await startDay(page);
  await page.locator('[data-action="arrange"]').click();
  await expect(page.locator('[data-action="cat"][data-id="C01"]')).toBeEnabled();
});

test('shop balance stays in content and sticky back remains available after scrolling', async ({ page }) => {
  await bridge(page);
  await page.goto('/');
  await page.locator('[data-action="shop"]').click();
  await expect(page.locator('.wallet-panel')).toContainText('20');
  await expect(page.locator('.topbar')).not.toContainText('20');
  await page.locator('[data-action="buy"][data-id="wand"]').click();
  await expect(page.locator('.wallet-panel')).toContainText('2');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator('.nav-back')).toBeInViewport({ ratio: 1 });
  await page.locator('.nav-back').click();
  await expect(page.locator('.home-page')).toBeVisible();
  await expect(page.locator('.wallet-balance')).toContainText('2');
});

test('unsupported leaderboard has a stable entry, a clear explanation and a working back button', async ({ page }) => {
  await bridge(page);
  await page.goto('/');
  await page.locator('[data-action="ranks"]').click();
  await expect(page.getByText('排行榜暂未开放')).toBeVisible();
  await expect(page.getByText('当前环境暂不支持排行榜，可以先继续营业。')).toBeVisible();
  await page.locator('.nav-back').click();
  await expect(page.locator('[data-action="ranks"]')).toBeVisible();
  await page.locator('[data-action="ranks"]').click();
  await page.locator('.nav-back').click();
  await expect(page.locator('.home-page')).toBeVisible();
});

test('permission denial preserves leaderboard entry and explicit retry can recover', async ({ page }) => {
  await bridge(page, { full: true });
  await page.goto('/');
  await page.evaluate(() => { window.xhs.miniTool.getRankList = async () => { throw { errCode: 1005 }; }; });
  await page.locator('[data-action="ranks"]').click();
  await expect(page.getByText('当前小工具的排行榜权限尚未开通，开放后即可查看。')).toBeVisible();
  await expect(page.getByText(/关注/)).toHaveCount(0);
  await page.locator('.nav-back').click();
  await expect(page.locator('[data-action="ranks"]')).toBeVisible();
  await page.locator('[data-action="ranks"]').click();
  await expect(page.getByText('排行榜暂未开放')).toBeVisible();
  await page.evaluate(() => {
    window.xhs.miniTool.getRankList = async () => ({ data: [] });
    window.xhs.miniTool.getMyRank = async () => ({ status: 'NO_SCORE' });
  });
  await page.locator('[data-action="load-rank"]').click();
  await expect(page.getByText('这一期还没有成绩，等第一位接待员上榜。')).toBeVisible();
  await page.locator('.nav-back').click();
  await expect(page.locator('.home-page')).toBeVisible();
});

test('back works during a pending leaderboard request and late results do not reopen it', async ({ page }) => {
  await bridge(page, { full: true });
  await page.goto('/');
  await page.evaluate(() => {
    window.xhs.miniTool.getRankList = () => new Promise(resolve => { window.__finishRank = resolve; });
  });
  await page.locator('[data-action="ranks"]').click();
  await expect(page.getByText('正在翻开接待榜…')).toBeVisible();
  await page.locator('.nav-back').click({ timeout: 1000 });
  await expect(page.locator('.home-page')).toBeVisible();
  await page.evaluate(() => window.__finishRank({ data: [] }));
  await expect(page.locator('.ranks-page')).toHaveCount(0);
  await expect(page.locator('.home-page')).toBeVisible();
});

test('leaderboard timeout is shown as a failed load with retry, rather than empty results', async ({ page }) => {
  await bridge(page, { full: true });
  await page.clock.install();
  await page.goto('/');
  await page.evaluate(() => { window.xhs.miniTool.getRankList = () => new Promise(() => {}); });
  await page.locator('[data-action="ranks"]').click();
  await expect(page.getByText('正在翻开接待榜…')).toBeVisible();
  await page.clock.fastForward(8100);
  await expect(page.getByText('暂时没能加载榜单')).toBeVisible();
  await expect(page.locator('[data-action="load-rank"]')).toBeVisible();
  await page.locator('.nav-back').click();
  await expect(page.locator('.home-page')).toBeVisible();
});

test('return during seating save remains on home when the delayed save finishes', async ({ page }) => {
  await bridge(page);
  await page.goto('/');
  await startDay(page);
  await page.locator('[data-action="arrange"]').click();
  await page.locator('[data-action="cat"][data-id="C01"]').click();
  await page.locator('[data-action="seat"][data-id="S01"]').click();
  await page.evaluate(() => {
    const previous = window.xhs.miniTool.setStorage;
    window.xhs.miniTool.setStorage = options => new Promise(resolve => {
      window.__finishSave = async () => { resolve(await previous(options)); };
    });
  });
  await page.locator('[data-action="admit"]').click();
  await expect(page.locator('[data-action="admit"]')).toHaveAttribute('aria-busy', 'true');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.nav-back').click({ timeout: 1000 });
  await expect(page.locator('.home-page')).toBeVisible();
  await page.evaluate(() => window.__finishSave());
  await expect(page.locator('.home-page')).toBeVisible();
  await expect(page.locator('.feedback-page')).toHaveCount(0);
  await expect(page.locator('.wallet-balance')).toContainText('20');
});
