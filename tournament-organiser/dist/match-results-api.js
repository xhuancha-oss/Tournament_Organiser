import { sameScores, validateSavePayload, validateSnapshot } from './match-results-model.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR', uncertain = false, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.uncertain = uncertain;
  }
}

function requireId(value) {
  if ((typeof value === 'string' && value.trim()) || (Number.isSafeInteger(value) && value >= 0)) return String(value);
  throw new Error('赛事和比赛编号必须是非空字符串或非负整数。');
}

function errorMessage(body, fallback) {
  if (body && typeof body === 'object') {
    for (const value of [body.message, body.error?.message, body.error]) {
      if (typeof value === 'string' && value.trim()) return value;
    }
  }
  return fallback;
}

export function createMatchResultsApi({
  baseUrl = '', fetchImpl = globalThis.fetch, timeoutMs = 15000, paths = {}, getHeaders,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('当前环境不支持 Fetch，请提供 fetchImpl。');
  if (typeof baseUrl !== 'string') throw new TypeError('baseUrl 必须是字符串。');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs 必须大于零。');
  if (getHeaders !== undefined && typeof getHeaders !== 'function') throw new TypeError('getHeaders 必须是函数。');
  const endpoints = {
    getMatches: id => `/api/tournaments/${encodeURIComponent(id)}/matches`,
    saveScores: (id, matchId) => `/api/tournaments/${encodeURIComponent(id)}/matches/${encodeURIComponent(matchId)}/result`,
    ...paths,
  };
  if (typeof endpoints.getMatches !== 'function' || typeof endpoints.saveScores !== 'function') {
    throw new TypeError('paths 必须提供路径生成函数。');
  }
  const base = baseUrl.replace(/\/+$/, '');

  function resolvePath(path) {
    if (typeof path !== 'string' || !path.trim()) throw new Error('接口路径必须是非空字符串。');
    if (/^https?:\/\//i.test(path)) return path;
    return `${base}/${path.replace(/^\/+/, '')}`;
  }

  async function request(url, { method, tournamentId, payload, signal }) {
    const saving = method === 'PUT';
    if (signal !== undefined && (typeof signal?.addEventListener !== 'function' || typeof signal?.removeEventListener !== 'function')) {
      throw new ApiError('请求取消信号无效。', { code: 'INVALID_REQUEST' });
    }
    if (signal?.aborted) throw new ApiError('请求已取消。', { code: 'ABORTED' });
    const controller = new AbortController();
    let dispatched = false;
    let cancellation;
    let rejectCancellation;
    const cancelled = new Promise((_, reject) => { rejectCancellation = reject; });
    function cancel(code) {
      if (cancellation) return;
      const uncertain = code === 'TIMEOUT' || (saving && dispatched);
      const message = code === 'TIMEOUT'
        ? (saving && dispatched ? '保存请求超时，结果尚无法确认，请刷新核对后再操作。' : '请求超时，请稍后重新加载。')
        : (saving && dispatched ? '保存请求已取消，结果尚无法确认，请刷新核对后再操作。' : '请求已取消。');
      cancellation = new ApiError(message, { code, uncertain });
      controller.abort(cancellation);
      rejectCancellation(cancellation);
    }
    const onAbort = () => cancel('ABORTED');
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => cancel('TIMEOUT'), timeoutMs);

    async function perform() {
      let headers;
      try {
        headers = new Headers(getHeaders ? await getHeaders({ method, tournamentId, matchId: payload?.matchId }) : undefined);
        if (!headers.has('Accept')) headers.set('Accept', 'application/json');
        if (saving && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      } catch (cause) {
        if (cancellation) throw cancellation;
        throw new ApiError('无法准备请求，请检查团队接口配置。', { code: 'INVALID_REQUEST', cause });
      }
      if (cancellation) throw cancellation;
      let response;
      try {
        dispatched = true;
        response = await fetchImpl(url, {
          method,
          headers,
          credentials: 'same-origin',
          signal: controller.signal,
          ...(saving ? { body: JSON.stringify({ scores: payload.scores, reason: payload.reason, expectedRevision: payload.expectedRevision }) } : {}),
        });
      } catch (cause) {
        if (cancellation) throw cancellation;
        if (cause?.name === 'AbortError') {
          throw new ApiError(saving ? '保存请求已取消，请刷新核对结果。' : '请求已取消。', {
            code: 'ABORTED', uncertain: saving && dispatched, cause,
          });
        }
        throw new ApiError(saving ? '连接中断，保存结果尚无法确认，请刷新核对后再操作。' : '无法连接服务器，请检查网络后重试。', {
          code: 'NETWORK_ERROR', uncertain: true, cause,
        });
      }
      if (cancellation) throw cancellation;
      if (!response || typeof response.text !== 'function' || !Number.isInteger(response.status) || typeof response.ok !== 'boolean') {
        throw new ApiError('服务器响应格式无效，请刷新核对。', { code: 'INVALID_RESPONSE', uncertain: saving });
      }
      let text;
      try { text = await response.text(); }
      catch (cause) {
        if (cancellation) throw cancellation;
        throw new ApiError('读取服务器响应失败，请刷新核对结果。', {
          status: response.status, code: 'NETWORK_ERROR', uncertain: true, cause,
        });
      }
      if (cancellation) throw cancellation;
      let body;
      let parseError;
      try { body = JSON.parse(text); }
      catch (cause) { parseError = cause; }
      if (!response.ok) {
        const conflict = response.status === 409 || response.status === 412;
        const fallback = conflict ? '比赛已有更新，请载入最新比分后核对。' : `请求未成功（HTTP ${response.status}），请稍后重试。`;
        throw new ApiError(errorMessage(body, fallback), {
          status: response.status,
          code: conflict ? 'CONFLICT' : 'HTTP_ERROR',
          uncertain: saving && response.status >= 500,
          cause: parseError,
        });
      }
      if (parseError) {
        throw new ApiError('服务器未返回有效 JSON，结果尚无法确认，请刷新核对。', {
          status: response.status, code: 'INVALID_JSON', uncertain: true, cause: parseError,
        });
      }
      let snapshot;
      try {
        snapshot = validateSnapshot(body);
        if (snapshot.tournament.id !== tournamentId) throw new Error('返回的赛事编号与请求不符。');
        if (saving) {
          const accepted = snapshot.matches.find(match => match.id === payload.matchId);
          if (!accepted || !sameScores(accepted.scores, payload.scores) || accepted.revision === payload.expectedRevision) {
            throw new Error('未收到与本次提交匹配的新版本比分。');
          }
        }
      } catch (cause) {
        throw new ApiError(saving ? '未收到有效保存确认，结果尚无法确认，请刷新核对后再操作。' : '服务器返回的赛事数据无效，请联系组员检查接口。', {
          status: response.status, code: 'INVALID_RESPONSE', uncertain: saving, cause,
        });
      }
      if (cancellation) throw cancellation;
      return snapshot;
    }

    try { return await Promise.race([perform(), cancelled]); }
    finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return {
    async getMatches(tournamentId, { signal } = {}) {
      let url;
      try { tournamentId = requireId(tournamentId); url = resolvePath(endpoints.getMatches(tournamentId)); }
      catch (cause) { throw new ApiError(cause.message || '赛事请求无效。', { code: 'INVALID_REQUEST', cause }); }
      return request(url, { method: 'GET', tournamentId, signal });
    },
    async saveScores(value, { signal } = {}) {
      let payload;
      let url;
      try {
        payload = validateSavePayload(value);
        url = resolvePath(endpoints.saveScores(payload.tournamentId, payload.matchId));
      } catch (cause) { throw new ApiError(cause.message || '保存请求无效。', { code: 'INVALID_REQUEST', cause }); }
      return request(url, { method: 'PUT', tournamentId: payload.tournamentId, payload, signal });
    },
  };
}
