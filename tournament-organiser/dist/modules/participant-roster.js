import { cleanName } from '../tournament.js';

// Drafts saved by older versions may still have extra spaces or full-width letters.
function searchKey(value) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function listParticipants(tournament, query = '') {
  const rows = [];
  const needle = searchKey(query);
  const emails = tournament.participantEmails ?? {};
  tournament.players.forEach((name, slot) => {
    const key = searchKey(name);
    if (!key) return;
    const email = Object.hasOwn(emails, key) && typeof emails[key] === 'string' ? emails[key] : '';
    if (key.includes(needle) || searchKey(email).includes(needle)) rows.push({ slot, name, email });
  });
  return rows;
}

function requireDraft(tournament) {
  if (tournament.rounds) throw new Error('比赛已经开始，选手名单已锁定。');
}

function requireParticipant(tournament, slot) {
  if (!Number.isInteger(slot) || !tournament.players[slot]?.trim()) {
    throw new Error('找不到该选手，请刷新名单后重试。');
  }
}

function cleanEmail(value = '') {
  if (typeof value !== 'string') throw new Error('邮箱格式不正确。');
  const email = value.trim();
  const validEmail = /^[a-z\d.!#$%&'*+\/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)*$/i;
  if (email.length > 254 || (email && !validEmail.test(email))) {
    throw new Error('请输入有效的邮箱地址。');
  }
  return email;
}

function replaceParticipant(tournament, slot, name, email) {
  const players = [...tournament.players];
  players[slot] = name;
  // Key contacts by unique name so shuffling the bracket cannot move their emails.
  const emails = listParticipants(tournament)
    .filter(row => row.slot !== slot && row.email)
    .map(row => [searchKey(row.name), row.email]);
  if (email) emails.push([searchKey(name), email]);
  return { ...tournament, players, participantEmails: Object.fromEntries(emails), updatedAt: new Date().toISOString() };
}

export function saveParticipant(tournament, slot, { name, email }) {
  requireDraft(tournament);
  if (slot === null) {
    slot = tournament.players.findIndex(player => !player.trim());
    if (slot === -1) throw new Error('8 个选手名额已满。');
  } else {
    requireParticipant(tournament, slot);
  }

  const cleanedName = cleanName(name);
  const cleanedEmail = cleanEmail(email);
  const others = listParticipants(tournament).filter(row => row.slot !== slot);
  if (others.some(row => searchKey(row.name) === searchKey(cleanedName))) {
    throw new Error('选手姓名不能重复，同名选手请加编号。');
  }
  if (cleanedEmail && others.some(row => searchKey(row.email) === searchKey(cleanedEmail))) {
    throw new Error('这个邮箱已被其他选手使用。');
  }
  return replaceParticipant(tournament, slot, cleanedName, cleanedEmail);
}

export function removeParticipant(tournament, slot) {
  requireDraft(tournament);
  requireParticipant(tournament, slot);
  return replaceParticipant(tournament, slot, '', '');
}
