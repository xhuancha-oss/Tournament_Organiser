// Compatibility aliases for demonstration records generated before the English UI.
// Custom tournament names and player names are preserved.
const demoTournamentNames = new Map(Object.entries({
  "\u529f\u80fd\u6d4b\u8bd5 \u00b7 8\u4eba\u4e52\u4e53\u7403\u8d5b": "Demo - 8-Player Table Tennis",
  "\u6211\u7684\u7b2c\u4e00\u573a\u6bd4\u8d5b": "My First Tournament",
  "Class Chess \u5f85\u5f00\u59cb": "Class Chess - Not Started",
  "\u73ed\u7ea7\u4e52\u4e53\u7403\u8d5b \u8fdb\u884c\u4e2d": "Class Table Tennis - In Progress",
  "\u5b66\u9662\u7bee\u7403\u8d5b \u5df2\u7ed3\u675f": "College Basketball - Completed"
}));

function translateExamplePlayer(name) {
  if (typeof name !== 'string') return name;
  const match = /^\u9009\u624b([1-8])$/u.exec(name);
  return match ? `Player ${match[1]}` : name;
}

export function translateLegacyDemoData(state) {
  let changed = false;
  const tournaments = state.tournaments.map(tournament => {
    const name = demoTournamentNames.get(tournament.name) ?? tournament.name;
    const players = tournament.players.map(translateExamplePlayer);
    const rounds = tournament.rounds?.map(round => round.map(match => ({
      ...match, players: match.players.map(translateExamplePlayer)
    }))) ?? null;
    const renamed = name !== tournament.name || players.some((p, i) => p !== tournament.players[i]) ||
      (rounds && rounds.some((round, r) => round.some((match, i) => match.players.some((p, k) => p !== tournament.rounds[r][i].players[k]))));
    if (!renamed) return tournament;
    changed = true;
    return {...tournament, name, players, rounds};
  });
  return changed ? {...state, tournaments} : state;
}
