const MAX_SCORE = 9999;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRevision(value) {
  return (Number.isSafeInteger(value) && value >= 0) || isText(value);
}

function requireText(value, label) {
  if (!isText(value)) throw new Error(`${label}必须是非空字符串。`);
  return value;
}

function requireId(value, label) {
  if (isText(value) || (Number.isSafeInteger(value) && value >= 0)) return String(value);
  throw new Error(`${label}必须是非空字符串或非负整数。`);
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label}必须是正整数。`);
  return value;
}

export function matchStatus(match) {
  if (!Array.isArray(match?.players) || match.players.length !== 2 || !match.players.every(Boolean)) return 'waiting';
  if (match.locked) return 'locked';
  return match.scores ? 'completed' : 'ready';
}

export function validateScores(values, maxScore = MAX_SCORE) {
  if (!Number.isSafeInteger(maxScore) || maxScore < 0) throw new Error('比分上限必须是非负整数。');
  if (!Array.isArray(values) || values.length !== 2 || !(0 in values) || !(1 in values)) {
    throw new Error('需要填写双方的比分。');
  }
  const scores = values.map(value => {
    const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    if (!/^\d+$/.test(text)) throw new Error('请为双方填写非负整数比分。');
    const number = Number(text);
    if (!Number.isSafeInteger(number) || number > maxScore) throw new Error(`比分应在 0–${maxScore} 之间。`);
    return number;
  });
  if (scores[0] === scores[1]) throw new Error('淘汰赛不能平局，请填写决胜后的比分。');
  return scores;
}

export function filterMatches(matches, { round = 'all', status = 'all', search = '' } = {}) {
  const query = search.trim().toLocaleLowerCase();
  return matches.filter(match => {
    const state = matchStatus(match);
    const matchesRound = round === 'all' || String(match.round) === String(round);
    const matchesStatus = status === 'all' || (status === 'completed' ? Boolean(match.scores) : state === status);
    const haystack = [match.id, match.roundName, ...match.players.map(player => player?.name ?? '')]
      .join(' ').toLocaleLowerCase();
    return matchesRound && matchesStatus && (!query || haystack.includes(query));
  });
}

export function sameScores(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length
    && Array.from(a).every((value, index) => index in a && index in b && String(value) === String(b[index]));
}

/** Validate server data before it can replace a displayed tournament. */
export function validateSnapshot(value) {
  if (!isRecord(value) || !isRecord(value.tournament) || !Array.isArray(value.matches)) {
    throw new Error('赛事响应必须包含 tournament 和 matches。');
  }
  const sourceTournament = value.tournament;
  const tournament = {
    id: requireId(sourceTournament.id, '赛事编号'),
    name: requireText(sourceTournament.name, '赛事名称'),
  };
  if (sourceTournament.formatLabel !== undefined) {
    tournament.formatLabel = requireText(sourceTournament.formatLabel, '赛制名称');
  }
  if (sourceTournament.participantCount !== undefined) {
    if (!Number.isSafeInteger(sourceTournament.participantCount) || sourceTournament.participantCount < 0) {
      throw new Error('参赛人数必须是非负整数。');
    }
    tournament.participantCount = sourceTournament.participantCount;
  }
  const ids = new Set();
  const matches = Array.from(value.matches, source => {
    if (!isRecord(source)) throw new Error('比赛数据格式无效。');
    const id = requireId(source.id, '比赛编号');
    if (ids.has(id)) throw new Error('同一赛事内的比赛编号不能重复。');
    ids.add(id);
    if (!Array.isArray(source.players) || source.players.length !== 2) throw new Error('每场比赛必须包含两个选手位置。');
    const players = Array.from(source.players, player => {
      if (player === null) return null;
      if (!isRecord(player)) throw new Error('选手必须包含编号和姓名，待定选手使用 null。');
      const result = { id: requireId(player.id, '选手编号'), name: requireText(player.name, '选手姓名') };
      if (player.seed !== undefined) result.seed = requirePositiveInteger(player.seed, '选手编号');
      return result;
    });
    if (players[0] && players[1] && players[0].id === players[1].id) throw new Error('比赛双方不能是同一位选手。');
    let scores = null;
    if (source.scores !== null) {
      if (!Array.isArray(source.scores) || !source.scores.every(Number.isSafeInteger)) {
        throw new Error('已保存比分必须是两个非负整数。');
      }
      scores = validateScores(source.scores);
      if (!players.every(Boolean)) throw new Error('选手待定的比赛不能已有比分。');
    }
    if (typeof source.locked !== 'boolean') throw new Error('比赛必须包含布尔值 locked。');
    if (!isRevision(source.revision)) throw new Error('比赛版本必须是非负整数或非空字符串。');
    const match = {
      id,
      round: requirePositiveInteger(source.round, '轮次'),
      roundName: requireText(source.roundName, '轮次名称'),
      number: requirePositiveInteger(source.number, '场次编号'),
      players,
      scores,
      locked: source.locked,
      revision: source.revision,
    };
    if (source.lockReason !== undefined) {
      if (typeof source.lockReason !== 'string') throw new Error('锁定原因必须是字符串。');
      match.lockReason = source.lockReason;
    }
    if (source.updatedAt !== undefined) {
      if (!isText(source.updatedAt) || !Number.isFinite(Date.parse(source.updatedAt))) throw new Error('比赛更新时间无效。');
      match.updatedAt = source.updatedAt;
    }
    return match;
  });
  return { tournament, matches };
}

export function validateSavePayload(value) {
  if (!isRecord(value)) throw new Error('保存请求格式无效。');
  if (!isRevision(value.expectedRevision)) throw new Error('保存时必须提供比赛原版本。');
  if (value.reason !== undefined && typeof value.reason !== 'string') throw new Error('修改原因必须是字符串。');
  const reason = (value.reason ?? '').trim();
  if (reason.length > 300) throw new Error('修改原因不能超过 300 字。');
  return {
    tournamentId: requireId(value.tournamentId, '赛事编号'),
    matchId: requireId(value.matchId, '比赛编号'),
    scores: validateScores(value.scores),
    reason,
    expectedRevision: value.expectedRevision,
  };
}
