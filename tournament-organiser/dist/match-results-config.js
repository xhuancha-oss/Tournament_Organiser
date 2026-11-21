// Team integration contract. These route names are proposals, not verified Flask endpoints.
export const matchResultsConfig = {
  mode: 'api',
  tournamentId: '',
  apiBaseUrl: '',
  timeoutMs: 15000,
  maxScore: 9999,
  readOnly: false,
  paths: {
    getMatches: id => `/api/tournaments/${encodeURIComponent(id)}/matches`,
    saveScores: (id, matchId) => `/api/tournaments/${encodeURIComponent(id)}/matches/${encodeURIComponent(matchId)}/result`,
  },
  getHeaders: () => {
    const token = document.querySelector('meta[name="csrf-token"]')?.content;
    return token ? { 'X-CSRFToken': token } : {};
  },
};
