import { CATS, SEATS, ITEMS, GUESTS, STATES, EVENT_COPY, catById, seatById } from './data.js';
import { createDay, wallet, unlocked, available, buy, admit, finishDay, summaryDetails, unmetLimits } from './game.js';
import { platformFor, SaveStore, Rankings } from './platform.js';
import './style.css';

async function main() {
const root = document.getElementById('app');
const toastNode = document.getElementById('toast');
const platform = await platformFor();
const rankings = new Rankings(platform);
let screen = 'home';
let day = null;
let selection = { cat: null, seat: null };
let toastTimer;
let clickBusy = false;
let rankPeriod = 'week';
let rankValue = null;
let rankError = false;
let rankRequest = 0;
let shopReturn = 'home';
let ready = false;
let detailsOpen = false;
const store = new SaveStore(platform, () => { if (ready) updateSaveIndicator(); });
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const guestById = id => GUESTS.find(guest => guest.id === id);
const progress = () => store.progress;
const currentGuest = () => guestById(day.guests[day.results.length]);
const totalRevenue = () => Object.values(progress().days).reduce((sum, record) => sum + record.revenue, 0);
const button = (text, action, kind = 'primary', extra = '') => `<button class="button ${kind}" data-action="${action}" ${extra}>${text}</button>`;

function toast(message) {
  clearTimeout(toastTimer);
  toastNode.textContent = message;
  toastNode.classList.add('visible');
  toastTimer = setTimeout(() => toastNode.classList.remove('visible'), 3300);
}

function catArt(id, extra = '') {
  const cat = catById(id);
  return `<span class="cat-art ${id} ${extra}" role="img" aria-label="${cat.name}，${cat.fur}猫"><i class="tail"></i><i class="cat-body"></i><i class="ear left"></i><i class="ear right"></i><i class="cat-head"><i class="patch"></i><i class="stripe one"></i><i class="stripe two"></i><i class="eye left"></i><i class="eye right"></i><i class="muzzle"></i><i class="nose"></i><i class="whisker left"></i><i class="whisker right"></i></i><i class="paw left"></i><i class="paw right"></i>${id === 'C08' ? '<i class="bow"></i>' : ''}</span>`;
}

function person(guest, small = false) {
  return `<span class="person ${small ? 'small' : ''} person-${guest.id % 4}" role="img" aria-label="${esc(guest.look)}" style="--shirt:${guest.hue}"><i class="hair-back"></i><i class="person-body"></i><i class="face"><i class="bang"></i><i class="person-eye left"></i><i class="person-eye right"></i><i class="smile"></i></i></span>`;
}

function statusLabel(status) {
  return status.state === 'quarrel' ? `刚和${catById(status.opponent).name}吵过` : STATES[status.state];
}

function saveLabel() {
  if (store.localState === 'read-error') return '读取失败 · 原存档已保留';
  if (store.localState === 'unavailable') return '当前环境无法保存进度';
  if (store.localState === 'write-error') return '本机保存未确认 · 点击重试';
  if (store.localState === 'saving') return '正在保存…';
  if (platform.preview) return '浏览器试玩 · 模拟本机存档';
  if (store.cloudState === 'syncing') return '本机已保存 · 云端同步中';
  if (store.cloudState === 'synced') return '本机已保存 · 云端已同步';
  if (store.cloudState === 'pending') return '本机已保存 · 云端结果待确认';
  if (['error', 'too-large'].includes(store.cloudState)) return '本机已保存 · 云端待同步';
  return '本机存档 · 云同步暂不可用';
}

function updateSaveIndicator() {
  document.querySelectorAll('[data-save-status]').forEach(node => { node.textContent = saveLabel(); });
}

function header() {
  return `<header class="topbar"><button class="brand" data-action="home" aria-label="返回猫咖首页"><span class="brand-mark">喵</span><span>猫咖接待<span class="brand-sub">今天，也好好相遇。</span></span></button><div class="top-actions"><span class="coin"><span aria-hidden="true">◉</span> ${wallet(progress())}</span><button class="icon-button" data-action="settings" aria-label="存档与说明">···</button></div></header>`;
}

function heading(eyebrow, title, description = '') {
  return `<div class="page-heading"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${description ? `<p class="intro">${description}</p>` : ''}</div>`;
}

function homePage() {
  const completed = Boolean(progress().days[progress().day]);
  const planned = createDay(progress());
  const prior = progress().summary;
  return `<section class="home-page">${heading('一间小店，几位猫同事', '把今天，<br>交给一场猫的相遇。')}<div class="hero"><img src="./assets/cafe.png" alt="阳光照进猫咖，豆皮、霜降和米粒正在等客人" width="1536" height="1024"><div class="open-sign">${completed ? '今日已打烊' : '准备营业'}<span>CAT CAFÉ</span></div></div><div class="day-strip"><div><span class="small-label">营业手册</span><strong>第 ${progress().day} 天</strong></div><span class="strip-divider"></span><div><span class="small-label">${completed ? '今日已接待' : '今日来客'}</span><strong>${completed && prior ? prior.results.length : planned.guests.length} 桌<span class="soft"> / 慢慢来</span></strong></div><span class="tiny-flower" aria-hidden="true">✳</span></div><div class="home-description"><p>一位客人，一只猫，一个刚刚好的座位。</p><p>你来安排，猫咪负责自由发挥。</p></div><div class="home-actions">${button(completed ? '翻开今日结算 <span>→</span>' : '挂上营业牌 <span>→</span>', completed ? 'summary' : 'open')}<div class="home-secondary"><button data-action="shop">店里添点新朋友</button>${rankings.available ? '<button data-action="ranks">接待排行榜 ↗</button>' : '<span>每次营业，约两分钟</span>'}</div></div><button class="save-status" data-action="settings" data-save-status>${saveLabel()}</button></section>`;
}

function catsPage() {
  return `<section>${heading(`第 ${day.number} 天 · 营业前`, '今天，谁来上班？', day.number === 1 ? '先看猫的性格，再为客人选一位合拍同伴。' : '猫有自己的心情，今天的相遇也会不一样。')}<div class="cat-roster">${day.cats.map(status => {
    const cat = catById(status.id);
    const canWake = available(progress(), 'wand') && !day.wandUsed && status.state === 'sleep';
    return `<article class="roster-row">${catArt(cat.id, status.state === 'sleep' ? 'sleeping' : '')}<div><div class="roster-name"><h2>${cat.name}</h2><span>${cat.fur}</span></div><p>${cat.tags.join(' · ')}${cat.scratch ? ' · 会抓人' : ''}</p><span class="cat-state ${status.state}">${statusLabel(status)}</span></div>${canWake ? `<button class="wake-button" data-action="wake" data-id="${cat.id}">逗一逗<br><span>每日一次</span></button>` : ''}</article>`;
  }).join('')}</div>${unlocked(progress(), 'C08') && !day.cats.some(cat => cat.id === 'C08') ? '<p class="notice">伯爵今天没来。它的出勤概率是 30%。</p>' : ''}<div class="page-bottom">${button('开始接待 <span>→</span>', 'guest')}<span class="footnote">每只猫今天只接待一桌</span></div></section>`;
}

function demand(guest, compact = false) {
  return `<div class="demand ${compact ? 'compact' : ''}"><div class="demand-row"><span>想要</span><strong>${guest.need}</strong></div><div class="demand-row"><span>限制</span><strong class="requirement">${guest.limits.length ? guest.limits.join(' / ') : '没有特别限制'}</strong></div><div class="demand-row"><span>座位</span><strong>${guest.preferences.length ? guest.preferences.join(' / ') : '坐哪里都好'}</strong><span class="budget">预算 ${guest.budget} ◉</span></div></div>`;
}

function guestPage() {
  const guest = currentGuest();
  return `<section class="guest-page">${heading(`第 ${day.number} 天 · 第 ${day.results.length + 1} / ${day.guests.length} 桌`, '门口，来了一位客人。')}<div class="guest-portrait"><div class="portrait-sun"></div>${person(guest)}<span class="guest-leaf" aria-hidden="true">✳</span></div><div class="guest-name"><h2>${guest.name}</h2><span>${guest.look}</span></div><blockquote>“${guest.quote}”</blockquote><div class="order-note"><span class="note-pin"></span><h3>这一桌的小心愿</h3>${demand(guest)}</div><div class="page-bottom">${button('去安排猫和座位 <span>→</span>', 'arrange')}</div></section>`;
}

function seatButton(id) {
  if (!day.seats.includes(id)) return '<span class="floor-space" aria-hidden="true">留一点空白<br>给未来的新座位</span>';
  const seat = seatById(id);
  const occupied = day.results.find(result => result.seatId === id);
  const selected = selection.seat === id;
  return `<button class="seat ${id} ${occupied ? 'occupied' : ''} ${selected ? 'selected' : ''}" data-action="seat" data-id="${id}" aria-pressed="${selected}" aria-label="${seat.name}，${occupied ? '已占用，' + guestById(occupied.guestId).name + '与' + catById(occupied.catId).name : seat.tags.join('、')}" ${occupied ? 'disabled' : ''}><span class="seat-icon ${id}" aria-hidden="true"><i></i><i></i></span><span class="seat-name">${seat.name}<span class="seat-check">${selected ? '✓' : occupied ? '已入座' : '空闲'}</span></span><span class="seat-tags">${occupied ? `${guestById(occupied.guestId).name} · ${catById(occupied.catId).name}` : seat.tags.join(' · ')}</span></button>`;
}

function arrangePage() {
  const guest = currentGuest();
  const freeCats = day.cats.filter(cat => !day.results.some(result => result.catId === cat.id));
  const freeSeats = day.seats.filter(id => !day.results.some(result => result.seatId === id));
  const full = !freeCats.length || !freeSeats.length;
  const selectedCat = catById(selection.cat);
  const selectedSeat = seatById(selection.seat);
  const violations = selectedCat && selectedSeat ? unmetLimits(guest, selectedCat, selectedSeat) : [];
  return `<section class="arrange-page"><div class="arrange-title"><div><p class="eyebrow">第 ${day.results.length + 1} / ${day.guests.length} 桌</p><h1>给${guest.name}安排一下</h1></div><button class="text-button" data-action="guest">看客人</button></div>${demand(guest, true)}<div class="section-label"><h2>选一个座位</h2><span>${freeSeats.length} 个空闲</span></div><div class="floorplan"><div class="floor-row">${seatButton('S01')}<span class="adjacency" aria-label="靠窗和拍照角相邻">相邻</span>${seatButton('S03')}</div><div class="floor-aisle">过 道</div><div class="floor-row">${seatButton('S02')}${day.seats.includes('S04') ? '<span class="adjacency" aria-label="安静角落和吧台相邻">相邻</span>' : ''}${seatButton('S04')}</div></div><div class="section-label cat-section-label"><h2>选一位猫同事</h2><span>${freeCats.length} 只空闲</span></div><div class="cat-picker ${day.cats.length <= 3 ? 'three' : ''}">${day.cats.map(status => {
    const cat = catById(status.id);
    const occupied = day.results.find(result => result.catId === cat.id);
    const selected = selection.cat === cat.id;
    return `<button class="cat-option ${selected ? 'selected' : ''} ${occupied ? 'occupied' : ''}" data-action="cat" data-id="${cat.id}" aria-pressed="${selected}" aria-label="${cat.name}，${occupied ? '已占用，' + guestById(occupied.guestId).name : `${cat.fur}，${cat.tags.join('、')}，${statusLabel(status)}${cat.scratch ? '，会抓人' : ''}`}" ${occupied ? 'disabled' : ''}>${catArt(cat.id, status.state === 'sleep' ? 'sleeping' : '')}<span class="option-name">${cat.name}${selected ? '<span>✓</span>' : ''}</span><span class="option-trait">${cat.fur} · ${cat.tags.join(' / ')}</span><span class="option-state ${status.state}">${occupied ? `${guestById(occupied.guestId).name} · 已占用` : statusLabel(status)}</span>${cat.scratch && !occupied ? '<span class="scratch-label">会抓人</span>' : ''}</button>`;
  }).join('')}</div><div class="selection-summary" aria-live="polite"><span>${full ? '今天的猫或座位已经用完了' : `${selectedCat ? selectedCat.name : '未选猫'} ＋ ${selectedSeat ? selectedSeat.name : '未选座位'}`}</span><button data-action="reset" ${!selection.cat && !selection.seat ? 'disabled' : ''}>重选</button></div>${violations.length ? `<p class="warning" role="status">会踩限制 · ${violations.join('、')}。仍可安排入座。</p>` : ''}<div class="arrange-bottom">${button(full ? '向客人说明，送别这一桌' : '安排入座 <span>→</span>', 'admit', full ? 'secondary' : 'primary', !full && (!selection.cat || !selection.seat) ? 'disabled' : '')}</div></section>`;
}

function pairArt(result) {
  return `<div class="pair-art">${person(guestById(result.guestId))}<span class="pair-heart" aria-hidden="true">♡</span>${result.catId ? catArt(result.catId) : '<span class="empty-chair" aria-hidden="true">再会</span>'}<span class="table-line"></span></div>`;
}

function feedbackPage() {
  const result = day.results[day.results.length - 1];
  const event = result.events[0];
  return `<section class="feedback-page">${heading(`第 ${day.results.length} 桌 · ${result.seatId ? seatById(result.seatId).name : '门口'}`, event ? EVENT_COPY[event][1] : result.stars >= 4 ? '这一次，刚刚好。' : '猫有自己的想法。')}${pairArt(result)}<div class="stars" aria-label="${result.stars} 星"><span>${'★'.repeat(result.stars)}</span><span class="empty-stars">${'☆'.repeat(5 - result.stars)}</span></div><blockquote>“${result.review}”</blockquote><div class="feedback-income"><span>本桌收入</span><strong>+${result.income}<small> ◉</small></strong><span>${result.score} 分</span></div><button class="text-button score-toggle" data-action="details" aria-expanded="${detailsOpen}">${detailsOpen ? '收起' : '看看为什么'} ${detailsOpen ? '−' : '+'}</button>${detailsOpen && result.breakdown ? `<div class="score-details">${[['限制', result.breakdown.limits, 40], ['诉求匹配', result.breakdown.match, 30], ['座位', result.breakdown.seat, 15], ['气氛', result.breakdown.atmosphere, 15]].map(([label, score, max]) => `<span>${label}<strong>${score} / ${max}</strong></span>`).join('')}${result.breakdown.adjustment ? `<span>状态修正<strong>${result.breakdown.adjustment > 0 ? '+' : ''}${result.breakdown.adjustment}</strong></span>` : ''}</div>` : ''}<div class="page-bottom">${button(day.results.length === day.guests.length ? '挂上打烊牌 <span>→</span>' : '接待下一位 <span>→</span>', 'continue')}<span class="footnote">今日暂收 ${day.results.reduce((sum, entry) => sum + entry.income, 0)} 金币，打烊后入账</span></div></section>`;
}

function summaryPage() {
  const summary = progress().summary;
  if (!summary) return homePage();
  const { best, review, revenue } = summaryDetails(summary);
  const average = (summary.results.reduce((sum, result) => sum + result.score, 0) / summary.results.length).toFixed(1);
  return `<section class="summary-page">${heading(`第 ${summary.day} 天 · 打烊手记`, '今天最合拍的一对。')}<div class="summary-print"><span class="print-stamp">好好相遇</span>${best ? pairArt(best) : '<div class="no-pair">今天先休息一下</div>'}<div class="pair-names">${best ? `${guestById(best.guestId).name}<span>＆</span>${catById(best.catId).name}` : '明天，再来一次'}<small>${best ? seatById(best.seatId).name + '的一次相遇' : '总有合拍的下一桌'}</small></div><div class="receipt-edge"></div><div class="receipt-totals"><div><span>今日营业额</span><strong>${revenue}<small> 金币</small></strong></div><div><span>平均接待分</span><strong>${average}<small> / 100</small></strong></div></div><div class="review-note"><span>留在留言簿上的一句话</span><blockquote>“${review}”</blockquote></div><div class="receipt-footer">今日接待 ${summary.results.length} 桌<span>累计金币 ${wallet(progress())}</span></div></div><div class="summary-actions">${button('开店，迎接下一天 <span>→</span>', 'next-day')}<div class="secondary-row">${button('升级小店', 'shop', 'secondary')}${button('分享今天 ↗', 'share-menu', 'secondary')}</div>${rankings.available ? '<button class="text-button rank-link" data-action="ranks">去看看接待排行榜 ↗</button>' : ''}</div><button class="save-status" data-action="settings" data-save-status>${saveLabel()}</button></section>`;
}

function shopPage() {
  const today = createDay(progress());
  const upgrades = [...CATS.filter(cat => cat.price).map(cat => ({ ...cat, type: 'cat', text: `${cat.fur} · ${cat.tags.join('、')}${cat.scratch ? ' · 会抓人' : ''}` })), { id: 'S04', name: '吧台座位', price: 30, type: 'seat', text: '安静、可看店员；与安静角落相邻。' }, ...ITEMS.map(item => ({ ...item, type: 'item' }))];
  return `<section class="shop-page">${heading('给明天，留一点新期待', '店里添点什么？', '新朋友、新座位和小物件，从下一天开始可用。')}${progress().day >= 4 ? '<p class="notice">往后可能有第 4 桌。多一只猫、多一个座位，会从容一点。</p>' : ''}<div class="shop-list">${upgrades.map(item => {
    const owned = unlocked(progress(), item.id);
    const affordable = wallet(progress()) >= item.price;
    return `<article class="shop-row">${item.type === 'cat' ? catArt(item.id) : `<span class="shop-object ${item.id}" aria-hidden="true">${item.id === 'S04' ? '▤' : item.id === 'wand' ? '〰' : '▱'}</span>`}<div class="shop-info"><h2>${item.name}</h2><p>${item.text}</p>${item.id === 'C08' ? `<small>每日 30% 概率到店${owned && !today.cats.some(cat => cat.id === 'C08') ? ' · 今天没来' : ''}</small>` : ''}</div><button class="buy-button ${owned ? 'owned' : ''}" data-action="buy" data-id="${item.id}" ${owned || !affordable ? 'disabled' : ''}>${owned ? '已解锁' : `${item.price} ◉`}${!owned && !affordable ? `<small>还差 ${item.price - wallet(progress())}</small>` : ''}</button></article>`;
  }).join('')}</div><div class="page-bottom">${button('回到小店 <span>→</span>', 'shop-back', 'secondary')}</div></section>`;
}

function ranksPage() {
  const mine = rankValue && rankValue.mine;
  return `<section class="ranks-page">${heading('和大家，比一比接待手艺', '接待排行榜', '按单日平均接待分排名，同周期保留最好成绩。')}<div class="tabs" role="tablist" aria-label="榜单周期">${[['week', '周榜'], ['all', '总榜']].map(([period, label]) => `<button role="tab" aria-selected="${rankPeriod === period}" class="${rankPeriod === period ? 'active' : ''}" data-action="period" data-id="${period}">${label}</button>`).join('')}</div>${rankError ? `<div class="empty-state"><p>${rankings.available ? '榜单暂时没准备好，请稍后再试。' : '排行榜内测权限尚未开通。'}</p>${rankings.available ? button('重新加载', 'load-rank', 'secondary') : ''}</div>` : !rankValue ? '<p class="empty-state" role="status">正在翻开接待榜…</p>' : `<div class="my-rank"><span>我的排名</span><strong>${mine.status === 'EXACT' ? mine.rank : mine.status === 'OVER_LIMIT' ? '500+' : '暂无成绩'}</strong><small>${mine.status === 'EXACT' ? mine.score + ' 分' : '完成营业后提交成绩'}</small></div>${!rankValue.rows.length ? '<p class="empty-state">这一期还没有成绩，等第一位接待员上榜。</p>' : `<ol class="rank-list">${rankValue.rows.map(row => `<li><span class="rank-number">${esc(row.rank)}</span><span>${esc(row.nickname || '猫咖来客')}</span><strong>${esc(row.score)}<small> 分</small></strong></li>`).join('')}</ol>`}`}<p class="footnote">周榜每周一北京时间 0 点开启新一期。</p>${progress().summary && rankings.available ? '<button class="text-button score-toggle" data-action="submit-rank">提交最近一次接待成绩</button>' : ''}<div class="page-bottom">${button('回到小店', 'back-summary', 'secondary')}</div></section>`;
}

function settingsPage() {
  const cloudTexts = { unavailable: '云存档为内测能力，当前未开放或客户端暂不支持。本机仍会保存进度。', pending: '上次云端写入结果尚未确认。会先查询核对，避免重复写入。', error: '同步暂未成功，本机进度已保留。可稍后重试。', 'too-large': '云存档超过当前单条容量限制，本机进度仍保留。', synced: '已与同账号云存档合并。再次打开时会先读取，营业间歇低频同步。', syncing: '正在核对并合并同账号的进度。', idle: '将在进入小店和营业间歇同步，每分钟最多发起一轮。' };
  return `<section class="settings-page">${heading('营业手册', '存档与说明')}<div class="info-section"><h2>进度保存</h2><p data-save-status>${saveLabel()}</p><p>关键操作后保存本机进度。中途离开会重开当天，未结算收入不会入账；已购买的解锁会保留。</p>${store.localState === 'write-error' ? button('重试本机保存', 'save-retry', 'secondary') : ''}</div><div class="info-section"><h2>云端同步</h2><p>${cloudTexts[store.cloudState]}</p>${store.cloudAvailable ? button('核对并同步', 'sync', 'secondary') : ''}<p>多设备完成同一天只记一次收入；并发购买合并后按时间核算，可支付的解锁生效。</p></div><div class="info-section"><h2>这一间猫咖</h2><p>八位猫同事，各有脾气。每只猫和每个座位一天只接待一桌。相邻座位的猫若刚吵过，可能会继续拌嘴。</p><p>游戏中的毛类限制属于简化规则，不构成现实中的过敏防护建议。</p><p class="credits">原创猫咪造型与界面 · 场景插画由 AI 辅助生成<br>测试版 0.1 · 猫咖接待</p></div><div class="page-bottom">${button('回到小店', 'back-summary', 'secondary')}</div></section>`;
}

function render() {
  root.classList.toggle('arrange-mode', screen === 'arrange');
  root.classList.toggle('many-cats', Boolean(day && day.cats.length > 3));
  if (store.readBlocked) {
    root.innerHTML = `<section class="load-error"><span class="brand-mark">喵</span><h1>营业手册暂时没翻开</h1><p>读取存档失败。原数据已保留，请重试。</p>${button('重新读取', 'retry-load')}</section>`;
    root.removeAttribute('aria-busy');
    return;
  }
  const pages = { home: homePage, cats: catsPage, guest: guestPage, arrange: arrangePage, feedback: feedbackPage, summary: summaryPage, shop: shopPage, ranks: ranksPage, settings: settingsPage };
  root.innerHTML = `${header()}<div class="page-content">${pages[screen]()}</div>`;
  root.removeAttribute('aria-busy');
}

function go(next, keepScroll = false) {
  screen = next;
  render();
  if (!keepScroll) window.scrollTo(0, 0);
}

async function checkpoint() {
  const saved = await store.save(progress());
  if (!saved) toast('本机保存未确认，请在离开前重试。');
  return saved;
}

async function safeSync() {
  if (!['home', 'summary', 'shop', 'settings', 'ranks'].includes(screen) || !store.progress) return;
  const before = JSON.stringify(progress());
  await store.sync();
  if (JSON.stringify(progress()) !== before && !['cats', 'guest', 'arrange', 'feedback'].includes(screen)) {
    toast('已合并云端进度。');
    render();
  }
}

async function loadRanks() {
  const request = ++rankRequest;
  const period = rankPeriod;
  rankValue = null;
  rankError = false;
  render();
  try {
    const value = await rankings.list(period);
    if (request === rankRequest) rankValue = value;
  } catch { if (request === rankRequest) rankError = true; }
  if (screen === 'ranks' && request === rankRequest) render();
}

function shareMenu() {
  const shareAvailable = platform.supports(9530, ['share']);
  const dialog = document.createElement('div');
  dialog.className = 'modal-backdrop';
  dialog.innerHTML = `<section class="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title"><span class="eyebrow">把好心情带给朋友</span><h2 id="share-title">分享今天的小相遇</h2><p>${shareAvailable ? '分享结果图或小工具，邀请朋友来当一天接待员。' : '可以直接截取结算页，分享今天最合拍的一对。平台分享需在支持的小红书全屏容器中使用。'}</p>${shareAvailable ? button('分享成果图', 'share-image') + button('邀请朋友来玩', 'share-card', 'secondary') : ''}${button('回到结算', 'close-modal', 'quiet')}</section>`;
  document.body.appendChild(dialog);
  const previous = document.activeElement;
  const focusable = Array.from(dialog.querySelectorAll('button'));
  focusable[0].focus();
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { dialog.remove(); previous.focus(); }
    if (event.key === 'Tab') {
      event.preventDefault();
      const index = focusable.indexOf(document.activeElement);
      focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
    }
  });
  dialog.addEventListener('click', async event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'close-modal') { dialog.remove(); previous.focus(); return; }
    focusable.forEach(node => { node.disabled = true; });
    try {
      if (target.dataset.action === 'share-card') await platform.api.share({ type: 'card' });
      else await platform.api.share({ type: 'image', image_resource: await shareImage() });
      dialog.remove();
      previous.focus();
    } catch { toast('暂时无法发起分享，请稍后重试或截图分享。'); focusable.forEach(node => { node.disabled = false; }); }
  });
}

async function shareImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 750;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  const summary = progress().summary;
  const { best, review, revenue } = summaryDetails(summary);
  ctx.fillStyle = '#f7f3e9'; ctx.fillRect(0, 0, 750, 1000);
  ctx.fillStyle = '#274b3e'; ctx.font = 'bold 32px sans-serif'; ctx.fillText('猫咖接待 · 第 ' + summary.day + ' 天', 58, 78);
  ctx.font = 'bold 43px sans-serif'; ctx.fillText('今天最合拍的一对', 58, 145);
  const image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = './assets/cafe.png'; });
  ctx.drawImage(image, 0, 0, image.width, image.height, 40, 185, 670, 447);
  if (best) {
    drawShareCat(ctx, best.catId, 540, 520);
    ctx.fillStyle = '#274b3e'; ctx.font = 'bold 36px sans-serif'; ctx.fillText(guestById(best.guestId).name + ' ＆ ' + catById(best.catId).name, 58, 692);
  }
  ctx.font = '26px sans-serif'; ctx.fillText('今日营业额 ' + revenue + ' 金币', 58, 745);
  ctx.font = 'bold 28px sans-serif';
  const characters = Array.from('“' + review + '”');
  let line = ''; let y = 815;
  characters.forEach(character => { if (ctx.measureText(line + character).width > 625) { ctx.fillText(line, 58, y); line = ''; y += 42; } line += character; });
  ctx.fillText(line, 58, y);
  ctx.fillStyle = '#69776d'; ctx.font = '22px sans-serif'; ctx.fillText('一位客人，一只猫，一个刚刚好的座位。', 58, 954);
  return canvas.toDataURL('image/png');
}

function drawShareCat(ctx, id, x, y) {
  const cat = catById(id);
  ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(x, y, 87, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = cat.color;
  ctx.beginPath(); ctx.moveTo(x - 60, y - 10); ctx.lineTo(x - 59, y - 70); ctx.lineTo(x - 20, y - 38); ctx.lineTo(x + 21, y - 38); ctx.lineTo(x + 59, y - 70); ctx.lineTo(x + 60, y - 10); ctx.ellipse(x, y, 67, 52, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff6e3'; ctx.beginPath(); ctx.ellipse(x, y + 15, 28, 20, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#263b30'; [-24, 24].forEach(dx => { ctx.beginPath(); ctx.ellipse(x + dx, y - 2, 5, id === 'C02' || id === 'C08' ? 3 : 7, 0, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#b87873'; ctx.beginPath(); ctx.moveTo(x - 6, y + 10); ctx.lineTo(x + 6, y + 10); ctx.lineTo(x, y + 17); ctx.fill();
  if (id === 'C01' || id === 'C05' || id === 'C07') { ctx.fillStyle = '#79562e'; [-15, 0, 15].forEach(dx => ctx.fillRect(x + dx - 2, y - 38, 4, 16)); }
  if (id === 'C03') { ctx.fillStyle = '#fff6e3'; ctx.beginPath(); ctx.moveTo(x, y - 37); ctx.lineTo(x - 17, y + 13); ctx.lineTo(x + 17, y + 13); ctx.fill(); }
}

root.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled || clickBusy) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  clickBusy = true;
  try {
    switch (action) {
      case 'home':
        if (['cats', 'guest', 'arrange', 'feedback'].includes(screen) && !window.confirm('离开后会重开当天，未结算收入不会入账。要回到首页吗？')) break;
        day = null; go('home'); break;
      case 'open': day = createDay(progress()); await checkpoint(); go('cats'); break;
      case 'guest': go('guest'); break;
      case 'arrange': go('arrange'); break;
      case 'cat': selection.cat = id; go('arrange', true); break;
      case 'seat': selection.seat = id; go('arrange', true); break;
      case 'reset': selection = { cat: null, seat: null }; go('arrange', true); break;
      case 'wake': {
        const status = day.cats.find(cat => cat.id === id);
        if (!day.wandUsed && available(progress(), 'wand') && status.state === 'sleep') { status.state = 'happy'; day.wandUsed = true; await checkpoint(); toast(catById(id).name + '醒来啦，今天心情好！'); render(); }
        break;
      }
      case 'admit': admit(day, progress(), selection.cat, selection.seat); selection = { cat: null, seat: null }; detailsOpen = false; await checkpoint(); go('feedback'); break;
      case 'details': detailsOpen = !detailsOpen; render(); break;
      case 'continue':
        if (day.results.length === day.guests.length) {
          finishDay(progress(), day);
          await checkpoint(); go('summary');
          rankings.submit(progress().summary).then(success => { if (!success && rankings.available) toast('成绩暂未提交，稍后可在排行榜重试。'); });
        } else go('guest');
        break;
      case 'summary': go('summary'); break;
      case 'next-day': progress().day = Math.max(progress().day, progress().summary.day + 1); progress().updatedAt = Date.now(); await checkpoint(); day = createDay(progress()); go('cats'); break;
      case 'shop': shopReturn = screen === 'summary' ? 'summary' : 'home'; go('shop'); break;
      case 'shop-back': go(shopReturn); break;
      case 'buy':
        if (buy(progress(), id)) { await checkpoint(); render(); toast('已解锁，下一天开始可用。'); }
        break;
      case 'ranks': go('ranks'); await loadRanks(); break;
      case 'load-rank': await loadRanks(); break;
      case 'submit-rank': {
        const success = await rankings.submit(progress().summary);
        toast(success ? '接待成绩已提交。' : '暂时无法提交成绩，请稍后重试。');
        await loadRanks();
        break;
      }
      case 'period': rankPeriod = id; await loadRanks(); break;
      case 'share-menu': shareMenu(); break;
      case 'settings':
        if (['cats', 'guest', 'arrange', 'feedback'].includes(screen)) { toast('关键操作会自动保存。离开当天会重开，打烊后收入才入账。'); break; }
        go('settings'); break;
      case 'back-summary': go(progress().summary && progress().day === progress().summary.day ? 'summary' : 'home'); break;
      case 'save-retry': await checkpoint(); render(); break;
      case 'sync': await safeSync(); render(); break;
      case 'retry-load': await store.retryLoad(); if (!store.readBlocked) { await safeSync(); } render(); break;
    }
  } catch (error) { toast(error.message || '这一步暂时没成功，请重试。'); }
  finally { clickBusy = false; }
});

await store.load();
ready = true;
render();
if (!store.readBlocked) {
  await safeSync();
  if (store.localState === 'new') await store.writeLocal();
}
setInterval(() => { if (!document.hidden) safeSync(); }, 60000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && store.progress && !store.readBlocked) store.writeLocal();
});
}

main().catch(() => {
  document.getElementById('app').innerHTML = '<section class="load-error"><h1>猫咖暂时没开好门</h1><p>请关闭后重新进入，已有存档会保留。</p></section>';
});
