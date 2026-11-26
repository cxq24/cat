import { createProgress, validateProgress, mergeProgress } from './game.js';

export async function platformFor(scope = window) {
  const xhs = scope.xhs;
  const api = xhs && xhs.miniTool;
  let launchOptions = xhs && xhs.launchOptions;
  const read = options => {
    const raw = options && options.miniToolEnv && options.miniToolEnv.buildVersion;
    return /^[1-9]\d{6,}$/.test(String(raw)) && Number.isSafeInteger(Number(raw)) ? Math.floor(Number(raw) / 1000) : null;
  };
  let version = read(launchOptions);
  if (version === null && api && typeof api.getLaunchOptions === 'function') {
    try { launchOptions = await api.getLaunchOptions(); version = read(launchOptions); } catch { /* Remains unknown. */ }
  }
  return { api, version, launchOptions, preview: Boolean(scope.__CAT_CAFE_PREVIEW__), supports: (minimum, methods) => version !== null && version >= minimum && Boolean(api) && methods.every(method => typeof api[method] === 'function') };
}

export const LOCAL_KEY = 'cat_cafe_reception_v1';
const COLLECTION = 'cat_cafe_progress_v1';
const clone = value => JSON.parse(JSON.stringify(value));
const isDenied = error => [1005, 1006, 10003].includes(Number(error && error.errCode));

export class SaveStore {
  constructor(platform, onChange = () => {}) {
    this.platform = platform;
    this.onChange = onChange;
    this.progress = null;
    this.localState = 'loading';
    this.cloudState = 'unavailable';
    this.pending = null;
    this.localQueue = Promise.resolve();
    this.syncing = null;
    this.readBlocked = false;
    this.cloudAvailable = platform.supports(9510, ['queryCloudStorage', 'addCloudStorage', 'updateCloudStorage']);
    if (this.cloudAvailable) this.cloudState = 'idle';
  }

  emit() { this.onChange(); }

  async load() {
    if (!this.platform.supports(9460, ['getStorage', 'setStorage'])) {
      this.localState = 'unavailable';
      this.progress = createProgress();
      this.emit();
      return;
    }
    try {
      const result = await this.platform.api.getStorage({ key: LOCAL_KEY });
      if (!result || !Object.prototype.hasOwnProperty.call(result, 'data')) throw new Error('无法确认存档读取结果。');
      const empty = result.data === null || result.data === '';
      const envelope = empty ? null : JSON.parse(result.data);
      this.progress = empty ? createProgress() : validateProgress(envelope.progress);
      this.pending = envelope && envelope.pending || null;
      this.localState = empty ? 'new' : 'saved';
    } catch (error) {
      this.readBlocked = true;
      this.localState = 'read-error';
      this.loadError = error;
    }
    this.emit();
  }

  async retryLoad() {
    this.readBlocked = false;
    await this.load();
  }

  async save(progress = this.progress) {
    if (this.readBlocked) throw new Error('读取失败，已保留原存档。');
    this.progress = clone(progress);
    return this.writeLocal();
  }

  writeLocal() {
    if (!this.platform.supports(9460, ['setStorage']) || this.readBlocked) return Promise.resolve(false);
    const envelope = JSON.stringify({ progress: this.progress, pending: this.pending });
    this.localState = 'saving';
    this.emit();
    this.localQueue = this.localQueue.catch(() => {}).then(async () => {
      try {
        const result = await this.platform.api.setStorage({ key: LOCAL_KEY, data: envelope });
        if (!result || result.errMsg !== 'setStorage:ok') throw new Error('保存结果未确认');
        this.localState = 'saved';
        return true;
      } catch {
        this.localState = 'write-error';
        return false;
      } finally { this.emit(); }
    });
    return this.localQueue;
  }

  async cloudRecords() {
    const records = [];
    const seen = new Set();
    let cursor;
    do {
      const response = await this.platform.api.queryCloudStorage({ collection: COLLECTION, limit: 100, ...(cursor ? { cursor } : {}) });
      if (!response || !Array.isArray(response.items)) throw new Error('云存档读取结果无效');
      response.items.forEach(record => {
        if (!record.id || !record.content || record.content.kind !== 'cat-cafe-save') throw new Error('云存档记录无法识别');
        validateProgress(record.content.progress);
        records.push(record);
      });
      cursor = response.nextCursor;
      if (cursor && seen.has(cursor)) throw new Error('云存档分页异常');
      seen.add(cursor);
    } while (cursor);
    return records.sort((a, b) => a.id.localeCompare(b.id));
  }

  async sync() {
    if (!this.cloudAvailable || this.readBlocked || !this.progress || this.localState === 'unavailable') return false;
    if (this.syncing) return this.syncing;
    this.syncing = this.performSync().finally(() => { this.syncing = null; });
    return this.syncing;
  }

  async performSync() {
    this.cloudState = 'syncing';
    this.emit();
    try {
      const records = await this.cloudRecords();
      let merged = this.progress;
      records.forEach(record => { merged = mergeProgress(merged, record.content.progress); });
      this.progress = merged;
      if (this.pending) {
        const confirmed = records.some(record => record.content.writeId === this.pending.writeId);
        if (!confirmed) {
          // An unknown write is reconciled by reads, never blindly replayed.
          this.cloudState = 'pending';
          await this.writeLocal();
          return false;
        }
        this.pending = null;
      }
      const content = { kind: 'cat-cafe-save', writeId: String(Date.now()) + '-' + Math.random().toString(36).slice(2), progress: clone(merged) };
      if (new Blob([JSON.stringify(content)]).size > 60000) {
        this.cloudState = 'too-large';
        await this.writeLocal();
        return false;
      }
      const target = records[0];
      this.pending = { writeId: content.writeId, id: target ? target.id : null };
      if (!await this.writeLocal()) {
        this.cloudState = 'error';
        this.pending = null;
        return false;
      }
      const response = target
        ? await this.platform.api.updateCloudStorage({ collection: COLLECTION, items: [{ id: target.id, content }] })
        : await this.platform.api.addCloudStorage({ collection: COLLECTION, items: [{ content }] });
      const result = response && response.data && response.data[0];
      if (result && result.status === 'SUCCESS') {
        this.pending = null;
        this.cloudState = 'synced';
      } else if (result && result.status === 'FAILED') {
        this.pending = null;
        this.cloudState = 'error';
      } else this.cloudState = 'pending';
      await this.writeLocal();
      return this.cloudState === 'synced';
    } catch (error) {
      if (isDenied(error)) {
        this.cloudAvailable = false;
        this.cloudState = 'unavailable';
        this.pending = null;
      } else this.cloudState = this.pending ? 'pending' : 'error';
      await this.writeLocal();
      return false;
    } finally { this.emit(); }
  }
}

export class Rankings {
  constructor(platform) {
    this.platform = platform;
    this.available = platform.supports(9510, ['submitScore', 'getRankList', 'getMyRank']);
    this.supported = this.available;
    this.failureReason = this.available ? null : 'unsupported';
    this.cache = new Map();
  }

  async request(method, options) {
    let timeout;
    try {
      return await Promise.race([
        this.platform.api[method](options),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('排行榜请求超时')), 8000); }),
      ]);
    } finally { clearTimeout(timeout); }
  }

  async submit(summary) {
    if (!this.available) return false;
    const total = summary.results.reduce((sum, result) => sum + result.score, 0);
    const score = Math.round(total / summary.results.length * 100) / 100;
    try {
      await this.request('submitScore', { board: 1, score });
      this.cache.clear();
      return true;
    } catch (error) {
      if (isDenied(error)) { this.available = false; this.failureReason = 'permission'; }
      return false;
    }
  }

  async list(period) {
    if (!this.supported) throw new Error('当前环境暂不支持排行榜');
    const cached = this.cache.get(period);
    if (this.available && cached && Date.now() - cached.at < 30000) return cached.value;
    try {
      let rows;
      for (const delay of [0, 500, 1000, 2000, 4000]) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        try {
          rows = await this.request('getRankList', { board: 1, period });
          break;
        } catch (error) { if (Number(error.errCode) !== 2002 || delay === 4000) throw error; }
      }
      const mine = await this.request('getMyRank', { board: 1, period });
      if (!rows || !Array.isArray(rows.data) || !mine || !['EXACT', 'OVER_LIMIT', 'NO_SCORE', 'NOT_PARTICIPATING'].includes(mine.status)) throw new Error('榜单数据暂不可用');
      const value = { rows: rows.data, mine };
      this.available = true;
      this.failureReason = null;
      this.cache.set(period, { at: Date.now(), value });
      return value;
    } catch (error) {
      if (isDenied(error)) { this.available = false; this.failureReason = 'permission'; }
      else this.failureReason = 'network';
      throw error;
    }
  }
}
