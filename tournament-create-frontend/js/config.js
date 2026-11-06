// 与 Flask 对接时改为 api，并确认 endpoint 与后端路由一致。
export const config = Object.freeze({
  mode: 'local', // 'local' | 'api'；API 失败不会自动转为本地保存。
  endpoint: '/api/tournaments',
  timeoutMs: 15000,
});
