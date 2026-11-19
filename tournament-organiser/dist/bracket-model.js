const winnerRoundNumber = id => Number(/^W(\d+)-\d+$/.exec(id)?.[1] || 0);
const closingRounds = ['Final', 'Semi-finals', 'Quarter-finals'];

export function groupMatches(matches, format) {
  const lastRound = matches.reduce((last, match) => Math.max(last, winnerRoundNumber(match.id)), 0);
  const sections = new Map();

  for (const match of matches) {
    const id = match.id || '';
    let title = '';
    const roundNumber = winnerRoundNumber(id);
    let round = match.round || 'Fixtures';

    if (format === 'double_elimination' && id) {
      if (id.startsWith('W')) title = 'Winners bracket';
      else if (id.startsWith('L')) title = 'Lower bracket';
      else title = 'Finals';
    }
    if (format === 'single_elimination' && roundNumber) {
      round = closingRounds[lastRound - roundNumber] || `Round ${roundNumber}`;
    }

    if (!sections.has(title)) sections.set(title, new Map());
    const rounds = sections.get(title);
    if (!rounds.has(round)) rounds.set(round, []);
    rounds.get(round).push(match);
  }

  return Array.from(sections, ([title, rounds]) => ({
    title,
    rounds: Array.from(rounds, ([name, games]) => ({name, games})),
  }));
}

export function matchState(match, eventEnd, now = Date.now()) {
  if (match.scores) return 'completed';
  const start = Date.parse(match.starts_at);
  if (!match.home || !match.away || !(start <= now)) return 'upcoming';
  return now < Date.parse(eventEnd) ? 'live' : 'awaiting';
}

export function winningSide({scores}) {
  if (!scores || scores[0] === scores[1]) return null;
  return scores[0] > scores[1] ? 'home' : 'away';
}

export function matchSource(match, side, matchIds) {
  const label = match[`${side}_label`];
  if (!label || label === match[side]) return null;
  const source = /^(Winner|Loser) of ((?:W|L)\d+-\d+|GF)$/.exec(label);
  return source && matchIds.has(source[2]) ? {label, id: source[2]} : null;
}
