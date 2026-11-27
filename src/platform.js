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
    this.supported = platform.supports(9510, ['getRankList']);
    this.submitSupported = platform.supports(9510, ['submitScore']);
    this.available = this.supported;
    this.failureReason = this.supported ? null : 'unsupported';
    this.readIssue = this.capabilityIssue('getRankList');
    this.personalIssue = null;
    this.submitIssue = this.capabilityIssue('submitScore');
    this.submissionStatus = 'not-submitted';
    this.lastScore = null;
    this.cache = new Map();
  }

  capabilityIssue(method) {
    let code;
    if (!this.platform.api) code = 'SDK_MISSING';
    else if (!Number.isSafeInteger(this.platform.version)) code = 'VERSION_UNKNOWN';
    else if (this.platform.version < 9510) code = 'CLIENT_TOO_OLD';
    else if (typeof this.platform.api[method] !== 'function') code = 'METHOD_MISSING';
    return code ? this.issue(method, { code }) : null;
  }

  issue(method, error) {
    const internalCodes = ['SDK_MISSING', 'VERSION_UNKNOWN', 'CLIENT_TOO_OLD', 'METHOD_MISSING', 'TIMEOUT', 'INVALID_RESPONSE', 'INVALID_SCORE'];
    const nativeCode = error && error.errCode;
    const code = /^-?\d+$/.test(String(nativeCode)) ? String(Number(nativeCode))
      : internalCodes.includes(error && error.code) ? error.code : 'NO_CODE';
    const descriptions = {
      SDK_MISSING: '当前页面未取得小红书容器接口，请在小红书内打开。',
      VERSION_UNKNOWN: '客户端版本读取失败，暂时无法确认排行榜兼容性。',
      CLIENT_TOO_OLD: '排行榜需要小红书 9.51 或更新版本。',
      METHOD_MISSING: '当前容器未提供这个排行榜接口。',
      TIMEOUT: '平台接口在等待时间内没有返回，请稍后重试。',
      INVALID_RESPONSE: '平台接口返回格式与当前开发文档不一致。',
      INVALID_SCORE: '本次成绩格式无效，无法提交。',
      '1005': '排行榜未授权，请核实内测资格及上传时的用户头像昵称授权。',
      '10003': '容器白名单拒绝了这个接口，需要平台开通。',
      '2002': '平台榜单缓存尚未准备完成，请稍后重试。',
      '2008': '平台授权服务暂时不可用，请稍后重试。',
      '2009': '排行榜调用过于频繁，请稍后重试。',
      '1004': '提交分数超出了平台允许范围。',
      '10001': '排行榜请求参数被平台拒绝。',
      NO_CODE: '平台接口调用失败，返回结果中没有错误码。',
    };
    return { method, code, reason: descriptions[code] || '平台接口返回了错误，请按错误码核对。' };
  }

  async request(method, options) {
    const capability = this.capabilityIssue(method);
    if (capability) throw { code: capability.code };
    let timeout;
    try {
      return await Promise.race([
        this.platform.api[method](options),
        new Promise((_, reject) => { timeout = setTimeout(() => reject({ code: 'TIMEOUT' }), 8000); }),
      ]);
    } finally { clearTimeout(timeout); }
  }

  async submit(summary) {
    this.submissionStatus = 'submitting';
    try {
      if (!summary || !Array.isArray(summary.results) || !summary.results.length) throw { code: 'INVALID_SCORE' };
      const total = summary.results.reduce((sum, result) => sum + result.score, 0);
      const score = Math.round(total / summary.results.length * 100) / 100;
      if (!Number.isFinite(score) || score < 0 || score > 100) throw { code: 'INVALID_SCORE' };
      this.lastScore = score;
      const response = await this.request('submitScore', { board: 1, score });
      if (!response || !Number.isFinite(response.score)) throw { code: 'INVALID_RESPONSE' };
      this.submitIssue = null;
      this.submissionStatus = 'submitted';
      this.cache.clear();
      return true;
    } catch (error) {
      this.submitIssue = this.issue('submitScore', error);
      this.submissionStatus = 'error';
      // Submission permissions do not establish whether public reads are allowed.
      return false;
    }
  }

  async list(period, onPublic, refresh = false) {
    const cached = this.cache.get(period);
    if (!refresh && this.available && cached && !cached.value.personalIssue && Date.now() - cached.at < 30000) return cached.value;
    let rows;
    try {
      for (const delay of [0, 500, 1000, 2000, 4000]) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        try {
          rows = await this.request('getRankList', { board: 1, period });
          break;
        } catch (error) { if (Number(error.errCode) !== 2002 || delay === 4000) throw error; }
      }
      if (!rows || !Array.isArray(rows.data)) throw { code: 'INVALID_RESPONSE' };
      this.available = true;
      this.failureReason = null;
      this.readIssue = null;
    } catch (error) {
      this.readIssue = this.issue('getRankList', error);
      this.available = !isDenied(error) && this.supported;
      this.failureReason = isDenied(error) ? 'permission' : this.supported ? 'network' : 'unsupported';
      throw error;
    }

    if (typeof onPublic === 'function') onPublic({ rows: rows.data, mine: null, personalIssue: null, personalPending: true });
    let mine = null;
    this.personalIssue = null;
    try {
      const response = await this.request('getMyRank', { board: 1, period });
      if (!response || !['EXACT', 'OVER_LIMIT', 'NO_SCORE', 'NOT_PARTICIPATING'].includes(response.status)) throw { code: 'INVALID_RESPONSE' };
      if (response.status === 'EXACT' && (!Number.isInteger(response.rank) || response.rank < 1 || response.rank > 500 || !Number.isFinite(response.score))) throw { code: 'INVALID_RESPONSE' };
      mine = response;
    } catch (error) { this.personalIssue = this.issue('getMyRank', error); }
    const value = { rows: rows.data, mine, personalIssue: this.personalIssue };
    this.cache.set(period, { at: Date.now(), value });
    return value;
  }
}
