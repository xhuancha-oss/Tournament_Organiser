import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTournament, toPayload } from '../js/tournament-model.js';
import { createTournament, TOURNAMENTS_KEY } from '../js/tournament-service.js';

const valid = { name: '  校园公开赛  ', start_time: '2026-11-20T09:00', end_time: '2026-11-20T18:00', format: 'single_elimination', description: ' 欢迎参赛 ' };
const api = { mode: 'api', endpoint: '/api/tournaments', timeoutMs: 100 };
function memoryStorage(initial) {
  const records = new Map(initial ? [[TOURNAMENTS_KEY, initial]] : []);
  return { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
}

test('必填、空白名称、非法赛制和长度校验', () => {
  assert.deepEqual(validateTournament(valid), {});
  assert.deepEqual(Object.keys(validateTournament({ name: '  ', format: 'invalid' })), ['name', 'start_time', 'end_time', 'format']);
  assert.ok(validateTournament({ ...valid, name: 'a'.repeat(81) }).name);
  assert.ok(validateTournament({ ...valid, description: 'a'.repeat(1001) }).description);
  assert.ok(validateTournament({ ...valid, format: 'toString' }).format);
});

test('结束时间必须严格晚于开始时间', () => {
  for (const end_time of ['2026-11-19T09:00', valid.start_time, 'invalid']) {
    assert.ok(validateTournament({ ...valid, end_time }).end_time);
  }
});

test('提交内容去除首尾空格并将设备本地时间转为 UTC', () => {
  const payload = toPayload(valid);
  assert.equal(payload.name, '校园公开赛');
  assert.equal(payload.description, '欢迎参赛');
  assert.equal(payload.start_time, new Date(valid.start_time).toISOString());
  assert.throws(() => toPayload({ ...valid, name: '' }));
});

test('本地创建保留已有记录并生成独立 ID', async () => {
  const storage = memoryStorage();
  const first = await createTournament(toPayload(valid), { mode: 'local' }, { storage });
  const second = await createTournament(toPayload(valid), { mode: 'local' }, { storage });
  assert.notEqual(first.id, second.id);
  assert.equal(first.status, 'upcoming');
  assert.equal(JSON.parse(storage.getItem(TOURNAMENTS_KEY)).length, 2);
});

test('本地存储损坏或写入失败不报告成功、不覆盖数据', async () => {
  const storage = memoryStorage('{bad json');
  await assert.rejects(createTournament(toPayload(valid), { mode: 'local' }, { storage }), /本地保存失败/);
  assert.equal(storage.getItem(TOURNAMENTS_KEY), '{bad json');
  await assert.rejects(createTournament(toPayload(valid), { mode: 'local' }, { storage: { getItem: () => '[]', setItem: () => { throw new Error('Quota'); } } }), /本地保存失败/);
});

test('API 发送 JSON 并接收约定返回值', async () => {
  const payload = toPayload(valid);
  const record = await createTournament(payload, api, { fetchImpl: async (url, options) => {
    assert.equal(url, api.endpoint);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), payload);
    return new Response(JSON.stringify({ tournament: { ...payload, id: 12 } }), { status: 201 });
  } });
  assert.equal(record.id, 12);
});

test('后端字段错误被保留，失败不会降级为本地保存', async () => {
  const storage = memoryStorage();
  await assert.rejects(createTournament(toPayload(valid), api, { storage, fetchImpl: async () => new Response(JSON.stringify({ message: '名称重复', errors: { name: '请更换赛事名称' } }), { status: 409 }) }), error => {
    assert.equal(error.message, '名称重复');
    assert.equal(error.fieldErrors.name, '请更换赛事名称');
    return true;
  });
  assert.equal(storage.getItem(TOURNAMENTS_KEY), null);
});

test('非 JSON 响应、网络错误、响应缺少 ID 均正确提示', async () => {
  const payload = toPayload(valid);
  await assert.rejects(createTournament(payload, api, { fetchImpl: async () => new Response('Internal Server Error', { status: 500 }) }), /HTTP 500/);
  await assert.rejects(createTournament(payload, api, { fetchImpl: async () => { throw new TypeError('Network'); } }), /无法连接服务器/);
  await assert.rejects(createTournament(payload, api, { fetchImpl: async () => new Response('{}') }), /未返回有效的赛事 ID/);
});

test('请求超时中断请求并提醒核实结果', async () => {
  await assert.rejects(createTournament(toPayload(valid), { ...api, timeoutMs: 5 }, { fetchImpl: (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')))) }), /请求超时/);
});
