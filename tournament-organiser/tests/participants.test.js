import test from 'node:test';
import assert from 'node:assert/strict';
import { createTournament, loadState, saveState, startTournament } from '../dist/tournament.js';
import { listParticipants, saveParticipant, removeParticipant } from '../dist/modules/participant-roster.js';

const draft = () => createTournament('校内赛', 'cup');

test('add, search, rename and remove without shifting opponents or mutating the draft', () => {
  const original = draft();
  let t = saveParticipant(original, null, { name: ' Ａda  Li ', email: ' Ada@example.com ' });
  t = saveParticipant(t, null, { name: '乙' });
  assert.deepEqual(original.players, Array(8).fill(''));
  const expected = [{ slot: 0, name: 'Ada Li', email: 'Ada@example.com' }];
  assert.deepEqual(listParticipants(t, ' LI '), expected);
  assert.deepEqual(listParticipants(t, '＠EXAMPLE'), expected);
  assert.deepEqual(listParticipants(t, 'missing'), []);
  t = saveParticipant(t, 0, { name: '丙', email: 'Ada@example.com' });
  assert.equal(listParticipants(t, 'Ada Li').length, 0);
  t = removeParticipant(t, 0);
  assert.deepEqual(listParticipants(t), [{ slot: 1, name: '乙', email: '' }]);
  t = saveParticipant(t, null, { name: '丙' });
  assert.deepEqual(t.players.slice(0, 2), ['丙', '乙']);
  assert.equal(listParticipants(t)[0].email, '');
});

test('invalid names, emails, duplicate entries and stale slots are rejected', () => {
  const t = saveParticipant(draft(), null, { name: 'Alice', email: 'a@example.com' });
  for (const name of [' ', 'a'.repeat(41), ' ＡLICE ']) {
    assert.throws(() => saveParticipant(t, null, { name }));
  }
  for (const email of ['invalid', 'x @example.com', 'a@-example.com', 'x'.repeat(250) + '@site.com', 'A@EXAMPLE.COM']) {
    assert.throws(() => saveParticipant(t, null, { name: '乙', email }));
  }
  for (const slot of [-1, 1, 8, '0', 0.5]) {
    assert.throws(() => saveParticipant(t, slot, { name: '丙' }));
    assert.throws(() => removeParticipant(t, slot));
  }
  assert.equal(listParticipants(t).length, 1);
});

test('older drafts with blank slots and duplicate names can be repaired in place', () => {
  const old = { ...draft(), region: '北区', players: ['  ', '甲', ' Ａ ', 'a', '', '', '', ''] };
  assert.deepEqual(listParticipants(old, 'a').map(row => row.slot), [2, 3]);
  let t = saveParticipant(old, 3, { name: '丙' });
  t = saveParticipant(t, null, { name: '丁' });
  assert.deepEqual(t.players, ['丁', '甲', ' Ａ ', '丙', '', '', '', '']);
  assert.equal(t.region, '北区');
});

test('emails stay with names after a random draw and reload, including reserved object keys', () => {
  const names = ['__proto__', 'constructor', '丙', '丁', '戊', '己', '庚', '辛'];
  let t = draft();
  for (const [index, name] of names.entries()) {
    t = saveParticipant(t, null, { name, email: 'p' + index + '@club.example' });
  }
  assert.throws(() => saveParticipant(t, null, { name: '候补' }), /已满/);
  t = startTournament(t, t.players, true, () => 0);
  assert.notDeepEqual(t.players, names);
  let raw;
  const storage = { setItem: (_, value) => { raw = value; }, getItem: () => raw };
  saveState(storage, { version: 1, activeId: t.id, tournaments: [t] });
  const restored = loadState(storage).tournaments[0];
  for (const { name, slot, email } of listParticipants(restored)) {
    assert.equal(restored.players[slot], name);
    assert.equal(email, 'p' + names.indexOf(name) + '@club.example');
  }
  assert.throws(() => saveParticipant(restored, null, { name: '候补' }), /锁定/);
  assert.throws(() => saveParticipant(restored, 0, { name: '候补' }), /锁定/);
  assert.throws(() => removeParticipant(restored, 0), /锁定/);
});
