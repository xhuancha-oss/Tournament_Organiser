import test from 'node:test';
import assert from 'node:assert/strict';
import {createTournament,startTournament,recordScore,winner,champion,completedCount,isLocked,loadState,saveState,exportText,STORAGE_KEY,validateTournament} from '../dist/tournament.js';
const names=['甲','乙','丙','丁','戊','己','庚','辛'];
const started=()=>startTournament(createTournament('班级赛','test'),names);
test('complete seven matches and preserve champion across reload',()=>{
  let t=started();
  for(let i=0;i<4;i++)t=recordScore(t,0,i,11,5);
  assert.deepEqual(t.rounds[1].map(m=>m.players),[['甲','丙'],['戊','庚']]);
  t=recordScore(t,1,0,5,11);t=recordScore(t,1,1,11,4);
  assert.deepEqual(t.rounds[2][0].players,['丙','戊']);
  t=recordScore(t,2,0,12,10);
  assert.equal(champion(t),'丙');assert.equal(completedCount(t),7);
  const memory=new Map();const storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
  saveState(storage,{version:1,activeId:t.id,tournaments:[t]});
  const restored=loadState(storage).tournaments[0];assert.deepEqual(restored,t);
  assert.match(exportText(restored),/Champion: 丙/);assert.match(exportText(restored),/12 : 10/);
});
test('names and player count must be valid',()=>{
  assert.throws(()=>createTournament('   '));
  assert.throws(()=>startTournament(createTournament('x'),names.slice(0,7)));
  assert.throws(()=>startTournament(createTournament('x'),[...names.slice(0,7),'甲']));
  assert.throws(()=>startTournament(createTournament('x'),['Alice',' alice ','3','4','5','6','7','8']));
  assert.throws(()=>startTournament(createTournament('x'),[...names.slice(0,7),'   ']));
});
test('scores reject ties, negatives, decimals, blanks and out of range',()=>{
  const t=started();
  for(const [a,b] of [[2,2],[-1,3],[1.2,3],['',2],[' ',2],[10000,2],['abc',2],[null,2]])assert.throws(()=>recordScore(t,0,0,a,b));
  assert.equal(winner(recordScore(t,0,0,0,1).rounds[0][0]),'乙');
  assert.throws(()=>recordScore(t,1,0,11,3));
});
test('correction updates next round until downstream result locks it',()=>{
  let t=started();t=recordScore(t,0,0,11,2);t=recordScore(t,0,1,11,3);
  const original=structuredClone(t);t=recordScore(t,0,0,2,11);
  assert.equal(t.rounds[1][0].players[0],'乙');assert.equal(original.rounds[1][0].players[0],'甲');
  t=recordScore(t,1,0,11,5);assert.equal(isLocked(t,0,0),true);
  assert.throws(()=>recordScore(t,0,0,11,2));assert.equal(isLocked(t,0,2),false);
});
test('random draw keeps eight unique players and cannot redraw after starting',()=>{
  const t=startTournament(createTournament('x'),names,true,()=>0);
  assert.deepEqual([...t.players].sort(),[...names].sort());assert.notDeepEqual(t.players,names);
  assert.throws(()=>startTournament(t,names));
});
test('stored data corruption is rejected, including false advancement',()=>{
  const bad=started();bad.rounds[1][0].players[0]='甲';assert.throws(()=>validateTournament(bad));
  const storage={getItem:()=>'{broken'};assert.throws(()=>loadState(storage));
  const t=started();t.rounds[0][0].scores=[1,1];assert.throws(()=>validateTournament(t));
});
test('draft and separate tournaments survive storage',()=>{
  const a=createTournament('比赛一','a'), b=createTournament('比赛二','b');a.players[0]='Alice';
  let raw;const storage={getItem:()=>raw,setItem:(k,v)=>{assert.equal(k,STORAGE_KEY);raw=v;}};
  saveState(storage,{version:1,activeId:'b',tournaments:[a,b]});
  assert.equal(loadState(storage).tournaments[0].players[0],'Alice');assert.equal(loadState(storage).activeId,'b');
});
