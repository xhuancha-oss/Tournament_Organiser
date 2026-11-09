import test from 'node:test';
import assert from 'node:assert/strict';
import {createTournament,startTournament,recordScore,STORAGE_KEY,loadState} from '../dist/tournament.js';
import {tournamentStatus,tournamentSummary,statusCounts,queryTournaments,tournamentDetailsHref} from '../dist/tournament-list-model.js';

const players=['Player A','Player B','Player C','Player D','Player E','Player F','Player G','Player H'];
function fixtures(){
  const draft=createTournament('Class Chess','draft');draft.players[0]='Alice';draft.players[1]='  ';
  const active=startTournament(createTournament('Class Table Tennis Tournament','active'),players);
  let done=startTournament(createTournament('College Basketball Tournament','done'),players);
  for(const [r,count] of [[0,4],[1,2],[2,1]])for(let i=0;i<count;i++)done=recordScore(done,r,i,11,3);
  draft.createdAt=draft.updatedAt='2026-11-01T08:00:00Z';
  active.createdAt=active.updatedAt='2026-11-02T08:00:00Z';
  done.createdAt='2026-10-01T08:00:00Z';done.updatedAt='2026-11-03T08:00:00Z';
  return [draft,active,done];
}
test('all three statuses follow actual bracket state; generated bracket is in progress',()=>{
  const rows=fixtures();assert.deepEqual(rows.map(tournamentStatus),['pending','in-progress','completed']);
  assert.deepEqual(statusCounts(rows),{all:3,pending:1,'in-progress':1,completed:1});
  assert.equal(tournamentSummary(rows[0]).participantCount,1);
  assert.equal(tournamentSummary(rows[1]).completedMatches,0);
  assert.equal(tournamentSummary(rows[2]).champion,'Player A');
  assert.equal(tournamentSummary(rows[2]).completedMatches,7);
});
test('search handles substring, case, full-width input and whitespace',()=>{
  const rows=fixtures();
  for(const search of ['chess',' CLASS  CHESS ','Ｃｌａｓｓ　Ｃｈｅｓｓ'])assert.deepEqual(queryTournaments(rows,{search}).map(t=>t.id),['draft']);
  assert.deepEqual(queryTournaments(rows,{search:'Table Tennis'}).map(t=>t.id),['active']);
  assert.equal(queryTournaments(rows,{search:'   '}).length,3);
});
test('search and status combine; clearing filters recovers all',()=>{
  const rows=fixtures();assert.equal(queryTournaments(rows,{search:'Tournament',status:'pending'}).length,0);
  assert.deepEqual(queryTournaments(rows,{search:'Tournament',status:'completed'}).map(t=>t.id),['done']);
  assert.equal(queryTournaments(rows).length,3);assert.equal(queryTournaments([]).length,0);
});
test('sorting is deterministic without mutating source data',()=>{
  const rows=fixtures(),before=structuredClone(rows);
  assert.deepEqual(queryTournaments(rows).map(t=>t.id),['done','active','draft']);
  assert.deepEqual(queryTournaments(rows,{sort:'created-desc'}).map(t=>t.id),['active','draft','done']);
  assert.deepEqual(rows,before);
});
test('deep links encode exact ids and allow selecting the requested event',()=>{
  const id='tournament / ?&"#1';const href=tournamentDetailsHref(id);
  assert.equal(new URL(href,'http://localhost:8765/').searchParams.get('tournament'),id);
  assert.equal(new URL(href,'http://localhost:8765/').pathname,'/index.html');
});
test('malformed shared storage remains an error instead of becoming an empty list',()=>{
  const raw=JSON.stringify({version:1,activeId:'bad',tournaments:[{id:'bad',name:'bad'}]});
  const storage={getItem:key=>{assert.equal(key,STORAGE_KEY);return raw;}};
  assert.throws(()=>loadState(storage));assert.equal(storage.getItem(STORAGE_KEY),raw);
});
