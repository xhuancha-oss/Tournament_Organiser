import {
  ROUND_NAMES, startTournament, validatePlayers, recordScore, winner,
  isLocked, completedCount, champion, exportText,
} from './tournament.js';
import {
  readState, writeState, statusOf, statusClass, escapeHtml,
  formatDate, tournamentId, alertInto,
} from './store.js';

const message = document.getElementById('message');
const TAB_NAMES = ['overview', 'participants', 'bracket', 'standings'];
const state = readState();
if (state.error) alertInto(message, `Saved tournaments could not be loaded: ${state.error}`, false);

let index = state.tournaments.findIndex(t => t.id === tournamentId());
if (index < 0) index = state.tournaments.findIndex(t => t.id === state.activeId);

if (index < 0) {
  document.getElementById('missing').hidden = false;
} else {
  document.getElementById('view').hidden = false;
  start();
}

function current() {
  return state.tournaments[index];
}

function save(tournament) {
  tournament.updatedAt = new Date().toISOString();
  state.tournaments[index] = tournament;
  state.activeId = tournament.id;
  writeState(state);
}

function start() {
  const t = current();
  document.title = `${t.name} · Tournament Organiser`;
  renderHead();
  renderOverview();
  renderParticipants();
  renderBracket();
  renderStandings();
  bindTabs();
  bindOverview();
  bindParticipants();
  showTab(location.hash.slice(1) || 'overview');
}

/* ---------- head ---------- */

function renderHead() {
  const t = current();
  const status = statusOf(t);
  document.getElementById('crumb-name').textContent = t.name;
  document.getElementById('page-title').textContent = t.name;
  const pill = document.getElementById('page-status');
  pill.textContent = status;
  pill.className = statusClass(status);
  const players = t.players.filter(Boolean).length;
  document.getElementById('page-lead').textContent =
    `8-player single elimination · ${players} ${players === 1 ? 'player registered' : 'players registered'} · created ${formatDate(t.createdAt)}`;
}

/* ---------- overview ---------- */

function renderOverview() {
  const t = current();
  const done = completedCount(t);
  const percent = Math.round((done / 7) * 100);
  const won = champion(t);

  document.getElementById('detail-players').textContent = `${t.players.filter(Boolean).length} / 8`;
  document.getElementById('detail-created').textContent = formatDate(t.createdAt);
  document.getElementById('detail-updated').textContent = formatDate(t.updatedAt);
  document.getElementById('detail-champion').textContent = won || 'Not decided yet';
  document.getElementById('overview-percent').textContent = `${percent}%`;
  document.getElementById('overview-bar').style.width = `${percent}%`;
  document.getElementById('overview-note').textContent = `${done} / 7 matches completed`;

  const card = document.getElementById('overview-champion');
  card.hidden = !won;
  if (won) document.getElementById('champion-name').textContent = won;
}

function bindOverview() {
  document.getElementById('export-results').addEventListener('click', () => {
    const t = current();
    const url = URL.createObjectURL(new Blob([exportText(t)], {type:'text/plain'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${t.name.replace(/[^\w-]+/g, '-').toLowerCase()}-results.txt`;
    link.click();
    URL.revokeObjectURL(url);
    alertInto(message, 'Results exported as a text file.');
  });
  document.getElementById('open-bracket').addEventListener('click', () => showTab('bracket'));
}

/* ---------- participants ---------- */

const SAMPLE = ['Ava','Ben','Cara','Dan','Eli','Fern','Gus','Hana'];

function renderParticipants() {
  const t = current();
  const locked = Boolean(t.rounds);
  document.getElementById('players-form').hidden = locked;
  document.getElementById('locked-players').hidden = !locked;
  document.getElementById('players-pill').textContent = `${t.players.filter(Boolean).length} / 8`;

  if (locked) {
    document.getElementById('player-chips').innerHTML = t.players
      .map(p => `<li>${escapeHtml(p)}</li>`).join('');
    return;
  }

  const fields = document.getElementById('player-fields');
  fields.innerHTML = t.players.map((value, i) => `
    <div class="player-field">
      <label for="player-${i}">Player ${i + 1}</label>
      <input type="text" id="player-${i}" name="player-${i}" maxlength="40" autocomplete="off"
             placeholder="Enter name" value="${escapeHtml(value)}">
    </div>`).join('');
}

function bindParticipants() {
  document.getElementById('player-fields')?.addEventListener('input', event => {
    const field = event.target.closest('input');
    if (!field) return;
    const t = { ...current(), players: current().players.slice() };
    t.players[Number(field.id.replace('player-', ''))] = field.value.slice(0, 40);
    save(t);
    document.getElementById('players-pill').textContent = `${t.players.filter(Boolean).length} / 8`;
  });

  document.getElementById('sample-button')?.addEventListener('click', () => {
    const t = { ...current(), players: SAMPLE.slice() };
    save(t);
    renderParticipants();
    alertInto(message, 'Sample players filled in. Change the names before generating the bracket.');
  });

  document.getElementById('players-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const names = [...document.querySelectorAll('#player-fields input')].map(input => input.value);
    try {
      validatePlayers(names);
    } catch (error) {
      alertInto(message, error.message, false);
      return;
    }
    const random = document.getElementById('draw-mode').value === 'random';
    const next = startTournament(current(), names, random);
    save(next);
    renderHead();
    renderOverview();
    renderParticipants();
    renderBracket();
    renderStandings();
    bindBracket();
    showTab('bracket');
    alertInto(message, 'Bracket generated. Record the quarter-final scores to move players on.');
  });
}

/* ---------- bracket ---------- */

function matchStatus(match) {
  if (match.scores) return 'Completed';
  return match.players.every(Boolean) ? 'Ready' : 'Pending';
}

function pillFor(status) {
  if (status === 'Completed') return 'pill pill-ok';
  if (status === 'Ready') return 'pill pill-live';
  return 'pill';
}

function renderBracket() {
  const t = current();
  document.getElementById('bracket-pill').textContent = `${completedCount(t)} / 7 completed`;
  const bracket = document.getElementById('bracket-body');

  if (!t.rounds) {
    bracket.innerHTML = '';
    return;
  }

  bracket.innerHTML = t.rounds.map((round, r) => `
    <div class="round">
      <h3>${ROUND_NAMES[r]}</h3>
      ${round.map((match, i) => {
        const status = matchStatus(match);
        const locked = isLocked(t, r, i);
        const played = Boolean(match.scores);
        const ready = match.players.every(Boolean);
        const label = locked ? 'Result locked'
          : played ? 'Update score'
          : (r === 2 ? 'Save score and crown champion' : 'Save score and advance');
        const advance = r === 2
          ? (champion(t) ? `Champion: <strong>${escapeHtml(champion(t))}</strong>` : '')
          : (winner(match) ? `Advances: <strong>${escapeHtml(winner(match))}</strong>` : '');
        return `<form class="match" data-round="${r}" data-index="${i}">
          <div class="match-head"><span class="match-id">M${i + 1}</span><span class="${pillFor(status)}">${status}</span></div>
          <div class="score-row">
            <label for="score-${r}-${i}-0">${match.players[0] ? escapeHtml(match.players[0]) : '<span class="muted">Winner of M' + (i * 2 + 1) + '</span>'}</label>
            <input type="text" inputmode="numeric" id="score-${r}-${i}-0" name="score-0" maxlength="4"
                   value="${match.scores ? match.scores[0] : ''}" ${ready && !locked ? '' : 'disabled'}>
          </div>
          <div class="score-row">
            <label for="score-${r}-${i}-1">${match.players[1] ? escapeHtml(match.players[1]) : '<span class="muted">Winner of M' + (i * 2 + 2) + '</span>'}</label>
            <input type="text" inputmode="numeric" id="score-${r}-${i}-1" name="score-1" maxlength="4"
                   value="${match.scores ? match.scores[1] : ''}" ${ready && !locked ? '' : 'disabled'}>
          </div>
          ${advance ? `<p class="advance">${advance}</p>` : ''}
          <button class="btn" type="submit" ${ready && !locked ? '' : 'disabled'}>${label}</button>
          ${locked ? '<p class="hint">A later match already has a result, so this match cannot be changed.</p>' : ''}
        </form>`;
      }).join('')}
    </div>`).join('');

  bindBracket();
}

function bindBracket() {
  document.querySelectorAll('#bracket form.match').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      const round = Number(form.dataset.round);
      const matchIndex = Number(form.dataset.index);
      try {
        const next = recordScore(current(), round, matchIndex,
          form.elements['score-0'].value, form.elements['score-1'].value);
        save(next);
        renderHead();
        renderOverview();
        renderBracket();
        renderStandings();
        const won = winner(current().rounds[round][matchIndex]);
        alertInto(message, round === 2
          ? `Final saved. ${won} is the champion.`
          : `Score saved. ${won} has advanced to the next round.`);
      } catch (error) {
        alertInto(message, error.message, false);
      }
    });
  });
}

/* ---------- standings ---------- */

function standingsFor(t) {
  const rows = new Map(t.players.map(name => [name, {name, played:0, won:0, lost:0}]));
  t.rounds?.flat().forEach(match => {
    if (!match.scores) return;
    const won = winner(match);
    const lost = match.players[0] === won ? match.players[1] : match.players[0];
    rows.get(match.players[0]).played += 1;
    rows.get(match.players[1]).played += 1;
    rows.get(won).won += 1;
    rows.get(lost).lost += 1;
  });
  const order = new Map(t.players.map((name, i) => [name, i]));
  return [...rows.values()].sort((a, b) =>
    b.won - a.won || a.lost - b.lost || order.get(a.name) - order.get(b.name));
}

function renderStandings() {
  const t = current();
  const rows = standingsFor(t);
  const champ = champion(t);
  const scored = t.rounds?.flat().filter(m => m.scores).length || 0;
  document.getElementById('standings-pill').textContent = `${scored} ${scored === 1 ? 'match scored' : 'matches scored'}`;

  document.getElementById('standings-rows').innerHTML = rows.map((row, i) => {
    const status = champ === row.name ? 'Champion' : row.lost > 0 ? 'Eliminated' : 'Active';
    const statusPill = status === 'Champion' ? 'pill pill-ok' : status === 'Eliminated' ? 'pill' : 'pill pill-live';
    return `<tr>
      <td>${i + 1}</td>
      <td${champ === row.name ? ' class="winner"' : ''}>${escapeHtml(row.name)}</td>
      <td>${row.played}</td>
      <td>${row.won}</td>
      <td>${row.lost}</td>
      <td><span class="${statusPill}">${status}</span></td>
    </tr>`;
  }).join('');
}

/* ---------- tabs ---------- */

function showTab(name) {
  if (!TAB_NAMES.includes(name)) name = 'overview';
  document.querySelectorAll('.tab').forEach(tab => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.panel').forEach(panel => {
    panel.hidden = panel.id !== `panel-${name}`;
  });
  document.querySelectorAll('.nav-item[data-tab-link]').forEach(link => {
    link.classList.toggle('is-active', link.dataset.tabLink === name);
  });
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  });
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
}
