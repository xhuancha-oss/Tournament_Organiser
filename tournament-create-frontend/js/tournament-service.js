export const TOURNAMENTS_KEY = 'tos.tournaments.v1';

export class TournamentError extends Error {
  constructor(message, fieldErrors = {}) {
    super(message);
    this.name = 'TournamentError';
    this.fieldErrors = fieldErrors;
  }
}

// storage 与 fetchImpl 可注入，方便团队集成和自动测试。
export async function createTournament(payload, config, { storage, fetchImpl = globalThis.fetch } = {}) {
  if (config.mode === 'local') {
    try {
      storage ??= globalThis.localStorage;
      const records = JSON.parse(storage.getItem(TOURNAMENTS_KEY) || '[]');
      if (!Array.isArray(records)) throw new Error('Invalid local data');
      const record = { ...payload, id: crypto.randomUUID(), status: 'upcoming', created_at: new Date().toISOString() };
      storage.setItem(TOURNAMENTS_KEY, JSON.stringify([...records, record]));
      return record;
    } catch {
      throw new TournamentError('本地保存失败，可能是浏览器存储已满、被禁用或原有数据损坏。请保留表单内容后重试。');
    }
  }
  if (config.mode !== 'api') throw new TournamentError('提交模式配置无效，请检查 config.js。');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs || 15000);
  try {
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new TournamentError(
        typeof data?.message === 'string' ? data.message : `创建失败（HTTP ${response.status}），请稍后重试。`,
        data?.errors && typeof data.errors === 'object' ? data.errors : {},
      );
    }
    const record = data?.tournament || data;
    if (!record || typeof record !== 'object' || !record.id) {
      throw new TournamentError('服务器已响应，但未返回有效的赛事 ID。请先核实赛事是否已创建，避免重复提交。');
    }
    return record;
  } catch (error) {
    if (error instanceof TournamentError) throw error;
    if (controller.signal.aborted) throw new TournamentError('请求超时，请先确认赛事是否已创建，再尝试提交。');
    throw new TournamentError('无法连接服务器，请检查网络和接口配置。表单内容已保留。');
  } finally {
    clearTimeout(timer);
  }
}
