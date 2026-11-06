// Preview-only adapter. Advancement and persistence in production belong to Flask/SQLite.
import { validateScores, validateSnapshot } from './match-results-model.js';
import { ApiError } from './match-results-api.js';

const KEY = 'tournament-module-5-vanilla-demo-v1';
const people = ['林泽宇','周予安','陈一鸣','许知远','江以南','顾星河','沈亦川','程景行']
  .map((name,i) => ({ id:`p${i+1}`, name, seed:i+1 }));
const roundNames = ['四分之一决赛','半决赛','决赛'];

export function createDemoState() {
  const updatedAt = new Date().toISOString();
  let data = {
    tournament:{ id:'campus-demo', name:'校园单打挑战赛', formatLabel:'单败淘汰赛', participantCount:8 },
    matches:[4,2,1].flatMap((count,r) => Array.from({length:count},(_,i) => ({
      id:`${['QF','SF','F'][r]}-${String(i+1).padStart(2,'0')}`, round:r+1, roundName:roundNames[r], number:i+1,
      players:r === 0 ? [people[i*2],people[i*2+1]] : [null,null], scores:null, locked:false,
      lockReason:'', revision:0, updatedAt,
    }))),
  };
  for (const [matchId,scores] of [['QF-01',[11,7]],['QF-02',[9,11]],['QF-03',[11,8]],['SF-01',[11,6]]]) {
    data = saveDemoResult(data,{ tournamentId:data.tournament.id, matchId,scores,
      expectedRevision:data.matches.find(m => m.id === matchId).revision });
  }
  return data;
}

export function saveDemoResult(data,payload) {
  if (String(payload.tournamentId) !== String(data.tournament.id)) throw new ApiError('赛事不存在。',{status:404,code:'HTTP_ERROR'});
  const source = data.matches.find(m => m.id === payload.matchId);
  if (!source) throw new ApiError('比赛不存在。',{status:404,code:'HTTP_ERROR'});
  if (source.locked) throw new ApiError('后续比赛已有结果，本场比分已锁定。',{status:409,code:'CONFLICT'});
  if (!source.players.every(Boolean)) throw new ApiError('请等待双方选手确定。',{status:400,code:'HTTP_ERROR'});
  if (source.revision !== payload.expectedRevision) throw new ApiError('比分已被更新，请载入最新结果核对。',{status:409,code:'CONFLICT'});
  if (source.scores && !payload.reason?.trim()) throw new ApiError('请填写比分修改原因。',{status:400,code:'HTTP_ERROR'});
  const scores = validateScores(payload.scores);
  const next = structuredClone(data);
  const match = next.matches.find(m => m.id === payload.matchId);
  match.scores = scores; match.revision += 1; match.updatedAt = new Date().toISOString();
  match.history = [...(match.history ?? []),{scores:[...scores],reason:payload.reason ?? '',at:match.updatedAt}];
  if (match.round < 3) {
    const target = next.matches.find(m => m.round === match.round+1 && m.number === Math.ceil(match.number/2));
    target.players[(match.number-1)%2] = match.players[scores[0]>scores[1] ? 0 : 1];
    target.revision += 1; target.updatedAt = match.updatedAt;
  }
  for (const candidate of next.matches) {
    let downstream = candidate, locked = false;
    while (downstream.round < 3) {
      downstream = next.matches.find(m => m.round === downstream.round+1 && m.number === Math.ceil(downstream.number/2));
      if (downstream.scores) { locked = true; break; }
    }
    candidate.locked = locked;
    candidate.lockReason = locked ? '后续比赛已录入比分，本场结果已锁定，暂不支持修改。' : '';
  }
  return next;
}

function pause(ms,signal) {
  return new Promise((resolve,reject) => {
    if (signal?.aborted) { reject(new ApiError('请求已取消。',{code:'ABORTED'})); return; }
    const stop = () => { clearTimeout(timer); signal?.removeEventListener('abort',stop); reject(new ApiError('请求已取消。',{code:'ABORTED'})); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort',stop); resolve(); },ms);
    signal?.addEventListener('abort',stop,{once:true});
  });
}

export function createDemoService({storage,delayMs=250}={}) {
  const local = storage ?? { getItem:key => localStorage.getItem(key), setItem:(key,value) => localStorage.setItem(key,value) };
  let scenario = 'normal';
  function write(value) {
    try { local.setItem(KEY,JSON.stringify(value)); }
    catch { throw new ApiError('本地保存失败，请检查浏览器存储设置后重试。',{code:'DEMO_STORAGE_ERROR'}); }
  }
  function read() {
    let raw;
    try { raw = local.getItem(KEY); }
    catch { throw new ApiError('无法读取本地示例记录，请检查浏览器设置。',{code:'DEMO_STORAGE_ERROR'}); }
    if (!raw) { const initial = createDemoState(); write(initial); return initial; }
    try { return validateSnapshot(JSON.parse(raw)); }
    catch { throw new ApiError('本地示例数据无法读取，已保留原记录。可在页脚重置示例后继续。',{code:'DEMO_DATA_ERROR'}); }
  }
  return {
    storageKey:KEY,
    setScenario(value) { scenario = value; },
    reset() { const initial = createDemoState(); write(initial); return initial; },
    async getMatches(tournamentId,{signal}={}) {
      await pause(scenario === 'loading' ? 60000 : delayMs,signal);
      if (scenario === 'load-error') throw new ApiError('暂时无法连接赛事服务，请稍后重试。',{code:'NETWORK_ERROR'});
      const data = read();
      if (String(data.tournament.id) !== String(tournamentId)) throw new ApiError('示例赛事不存在。',{status:404,code:'HTTP_ERROR'});
      return scenario === 'empty' ? {...data,matches:[]} : data;
    },
    async saveScores(payload,{signal}={}) {
      await pause(delayMs,signal);
      if (scenario === 'save-error') throw new ApiError('暂时无法保存。当前输入已保留，请稍后重试。',{code:'DEMO_SAVE_ERROR'});
      const next = saveDemoResult(read(),payload);
      write(next); return validateSnapshot(next);
    },
  };
}
