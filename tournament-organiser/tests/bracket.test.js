import test from 'node:test';
import assert from 'node:assert/strict';
import {groupMatches, matchSource, matchState, winningSide} from '../dist/bracket-model.js';

test('names single-elimination rounds from the final, including brackets with byes', () => {
  const games = ['W1-2', 'W2-1', 'W2-2', 'W3-1'].map(id => ({id}));
  const [section] = groupMatches(games, 'single_elimination');
  assert.deepEqual(section.rounds.map(round => [round.name, round.games.length]), [
    ['Quarter-finals', 1], ['Semi-finals', 2], ['Final', 1],
  ]);
  assert.equal(groupMatches([{id: 'W1-1'}], 'single_elimination')[0].rounds[0].name, 'Final');
});

test('groups upper, lower and reset games separately from manual fixtures', () => {
  const games = [
    {id: 'W1-1', round: 'Winners round 1'}, {id: 'L1-1', round: 'Lower round 1'},
    {id: 'GF', round: 'Grand final'}, {id: 'GF2', round: 'Grand final reset'},
  ];
  const sections = groupMatches(games, 'double_elimination');
  assert.deepEqual(sections.map(section => section.title), ['Winners bracket', 'Lower bracket', 'Finals']);
  assert.deepEqual(sections[2].rounds.map(round => round.name), ['Grand final', 'Grand final reset']);
  assert.equal(groupMatches([{round: ''}], 'round_robin')[0].rounds[0].name, 'Fixtures');
  assert.deepEqual(groupMatches([], 'single_elimination'), []);
});

test('keeps the source link when a slot has advanced and rejects missing games', () => {
  const ids = new Set(['W1-1']);
  const match = {home: 'A', home_label: 'Winner of W1-1', away: null, away_label: 'Loser of W1-1'};
  assert.deepEqual(matchSource(match, 'home', ids), {id: 'W1-1', label: 'Winner of W1-1'});
  assert.deepEqual(matchSource(match, 'away', ids), {id: 'W1-1', label: 'Loser of W1-1'});
  assert.equal(matchSource(match, 'home', new Set()), null);
  assert.equal(matchSource({...match, home: 'Winner of W1-1'}, 'home', ids), null);
});

test('uses scores, time and decided slots to display match status', () => {
  const start = '2026-11-20T01:00:00Z';
  const end = '2026-11-20T03:00:00Z';
  const now = Date.parse(start);
  const scheduled = {home: 'A', away: 'B', starts_at: start, scores: null};
  assert.equal(matchState(scheduled, end, now - 1), 'upcoming');
  assert.equal(matchState({...scheduled, away: null}, end, now), 'upcoming');
  assert.equal(matchState({...scheduled, starts_at: ''}, end, now), 'upcoming');
  assert.equal(matchState(scheduled, end, now), 'live');
  assert.equal(matchState(scheduled, end, Date.parse(end)), 'awaiting');
  assert.equal(matchState({...scheduled, scores: [0, 2]}, end, now), 'completed');
  assert.equal(winningSide({scores: [0, 2]}), 'away');
  assert.equal(winningSide({scores: [0, 0]}), null);
});
