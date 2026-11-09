import test from 'node:test';
import assert from 'node:assert/strict';
import {createTournament,startTournament,recordScore,loadState,validateTournament,champion} from '../dist/tournament.js';
import {translateLegacyDemoData} from '../dist/legacy-demo-data.js';

test('old demonstration labels render in English without losing results or rewriting storage',()=>{
  const title='\u529f\u80fd\u6d4b\u8bd5 \u00b7 8\u4eba\u4e52\u4e53\u7403\u8d5b';
  const players=Array.from({length:8},(_,i)=>`\u9009\u624b${i+1}`);
  let t=startTournament(createTournament(title,'legacy-demo'),players);
  for(let r=0;r<3;r++)for(let i=0;i<[4,2,1][r];i++)t=recordScore(t,r,i,11,5);
  const state={version:1,activeId:t.id,tournaments:[t]};
  const raw=JSON.stringify(state),storage={getItem:()=>raw};
  const restored=loadState(storage),translated=restored.tournaments[0];
  assert.equal(translated.name,'Demo - 8-Player Table Tennis');
  assert.equal(champion(translated),'Player 1');
  assert.deepEqual(translated.rounds.map(round=>round.map(m=>m.scores)),t.rounds.map(round=>round.map(m=>m.scores)));
  assert.equal(translated.id,t.id);assert.equal(translated.updatedAt,t.updatedAt);
  assert.equal(restored.activeId,t.id);assert.equal(storage.getItem(),raw);
  assert.doesNotThrow(()=>validateTournament(translated));
});

test('custom names and unrelated saved data are preserved',()=>{
  const t=createTournament('My Tournament','custom');t.players[0]='\u5f20\u4e09';
  const state={version:1,activeId:t.id,tournaments:[t]};
  assert.equal(translateLegacyDemoData(state),state);
  assert.equal(translateLegacyDemoData(state).tournaments[0].players[0],t.players[0]);
});

test('English example records do not change on subsequent reads',()=>{
  const t=startTournament(createTournament('English Demo','english'),Array.from({length:8},(_,i)=>`Player ${i+1}`));
  const state={version:1,activeId:t.id,tournaments:[t]};
  assert.equal(translateLegacyDemoData(state),state);
});
