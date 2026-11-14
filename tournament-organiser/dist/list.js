import {champion} from './tournament.js';
import {readState, statusOf, statusClass, escapeHtml, formatDate, alertInto} from './store.js';

const message = document.getElementById('message');
const state = readState();
if (state.error) alertInto(message, `Saved tournaments could not be loaded: ${state.error}`, false);

const rows = document.getElementById('rows');
const empty = document.getElementById('empty');
const search = document.getElementById('search');
const filter = document.getElementById('status-filter');
const countPill = document.getElementById('count-pill');

function renderStats(tournaments) {
  const statuses = tournaments.map(statusOf);
  document.getElementById('stat-total').textContent = tournaments.length;
  document.getElementById('stat-live').textContent = statuses.filter(s => s === 'In progress').length;
  document.getElementById('stat-done').textContent = statuses.filter(s => s === 'Finished').length;
  countPill.textContent = tournaments.length === 1 ? '1 tournament' : `${tournaments.length} tournaments`;
}

function render() {
  const term = search.value.trim().toLowerCase();
  const wanted = filter.value;
  const visible = state.tournaments
    .filter(t => !term || t.name.toLowerCase().includes(term))
    .filter(t => !wanted || statusOf(t) === wanted)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  rows.innerHTML = visible.map(t => {
    const status = statusOf(t);
    const won = champion(t);
    const players = t.players.filter(Boolean).length;
    return `<tr class="row" data-id="${escapeHtml(t.id)}">
      <td><a class="row-name" href="tournament.html?id=${encodeURIComponent(t.id)}">${escapeHtml(t.name)}</a></td>
      <td>Single elimination</td>
      <td>${players}<span class="muted"> / 8</span></td>
      <td><span class="${statusClass(status)}">${status}</span></td>
      <td>${won ? `<strong class="winner">${escapeHtml(won)}</strong>` : '<span class="muted">—</span>'}</td>
      <td class="muted">${formatDate(t.createdAt)}</td>
    </tr>`;
  }).join('');

  const noneAtAll = state.tournaments.length === 0;
  empty.hidden = visible.length > 0;
  empty.innerHTML = noneAtAll
    ? '<strong>No tournaments yet</strong><p class="hint">Create your first tournament to add players, build the bracket and record scores.</p><p class="hint"><a class="btn" href="create.html">Create a tournament</a></p>'
    : '<strong>No tournaments match this filter</strong><p class="hint">Try a different name or status.</p>';

  rows.querySelectorAll('tr.row').forEach(row => {
    row.addEventListener('click', event => {
      if (event.target.closest('a')) return;
      location.href = `tournament.html?id=${encodeURIComponent(row.dataset.id)}`;
    });
  });
}

search.addEventListener('input', render);
filter.addEventListener('change', render);

renderStats(state.tournaments);
render();
