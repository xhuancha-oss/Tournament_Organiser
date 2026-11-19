import {groupMatches, matchSource, matchState, winningSide} from './bracket-model.js';
import {alertInto, escapeHtml, tournamentId} from './store.js';

const $ = id => document.getElementById(`bracket-${id}`);
const dateFormat = new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'});
const formatNames = {
  single_elimination: 'Single elimination',
  double_elimination: 'Double elimination',
  round_robin: 'Round robin',
};
const eventStatuses = {upcoming: 'Upcoming', scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed'};
const matchStatuses = {upcoming: 'Upcoming', live: 'Live', completed: 'Completed', awaiting: 'Awaiting result'};
const statusClasses = {completed: 'pill-ok', live: 'pill-live', in_progress: 'pill-live'};
const isPublic = new URLSearchParams(location.search).get('public') === '1';
let request;
let tournaments;

async function getJson(path, signal) {
  const response = await fetch(path, {headers: {Accept: 'application/json'}, cache: 'no-store', signal});
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || `Request failed (HTTP ${response.status}).`);
  }
  return response.json();
}

function time(date) {
  return date ? `<time datetime="${escapeHtml(date)}">${dateFormat.format(new Date(date))}</time>` : '—';
}

function renderEvent(event, count) {
  $('event-name').textContent = event.name;
  $('event-status').textContent = eventStatuses[event.status] || 'Upcoming';
  $('event-status').className = `pill ${statusClasses[event.status] || ''}`;
  const entryType = event.entry_type === 'team' ? 'Teams' : 'Players';
  $('event-details').innerHTML = `
    <div><dt>Format</dt><dd>${formatNames[event.format] || '—'}</dd></div>
    <div><dt>${entryType}</dt><dd>${count}</dd></div>
    <div><dt>Starts</dt><dd>${time(event.start_time)}</dd></div>
    <div><dt>Ends</dt><dd>${time(event.end_time)}</dd></div>`;
  $('description').textContent = event.description || '';
  $('event').hidden = false;
}

function teamRow(match, side, score, winner, matchIds) {
  const name = match[side];
  const source = matchSource(match, side, matchIds);
  return `<li class="bracket-team${winner ? ' bracket-team-winner' : ''}">
    <div class="bracket-team-name">
      ${name ? escapeHtml(name) : source ? '' : 'To be decided'}
      ${source ? `<a class="bracket-source" href="#match-${source.id}">${source.label}</a>` : ''}
      ${winner ? '<span>Winner</span>' : ''}
    </div>
    <span class="bracket-score">${score == null
      ? '<span class="sr-only">No score</span><span aria-hidden="true">–</span>'
      : `<span class="sr-only">Score </span>${escapeHtml(score)}`}</span>
  </li>`;
}

function matchCard(match, index, status, matchIds) {
  const id = match.id && `match-${escapeHtml(match.id)}`;
  const name = match.id || `Match ${index + 1}`;
  const winner = winningSide(match);
  return `<article class="bracket-game"${id ? ` id="${id}" tabindex="-1"` : ''} aria-label="${escapeHtml(name)}">
    <div class="bracket-game-head">
      <h5>${escapeHtml(name)}</h5>
      <span class="pill ${statusClasses[status] || ''}">${matchStatuses[status]}</span>
    </div>
    ${match.starts_at ? `<p class="bracket-game-time">${time(match.starts_at)}</p>` : ''}
    <ul class="bracket-teams">
      ${teamRow(match, 'home', match.scores?.[0], winner === 'home', matchIds)}
      ${teamRow(match, 'away', match.scores?.[1], winner === 'away', matchIds)}
    </ul>
    ${match.id === 'GF2' ? '<a class="bracket-source" href="#match-GF">After the grand final</a>' : ''}
  </article>`;
}

function renderBracket(event, matches, champion) {
  const matchIds = new Set(matches.map(match => match.id).filter(Boolean));
  const now = Date.now();
  const statuses = new Map(matches.map(match => [match, matchState(match, event.end_time, now)]));
  const completed = matches.filter(match => statuses.get(match) === 'completed').length;
  $('progress').textContent = `${completed} / ${matches.length} completed`;
  $('champion').innerHTML = champion ? `Champion <strong>${escapeHtml(champion)}</strong>` : '';
  $('champion').hidden = !champion;
  $('timing').hidden = !matches.some(match => statuses.get(match) === 'live');
  $('rounds').innerHTML = groupMatches(matches, event.format).map(({title, rounds}) => `
    <div class="bracket-group">
      ${title ? `<h3>${title}</h3>` : '<h3 class="sr-only">Match rounds</h3>'}
      <div class="bracket-scroll" role="region" aria-label="${title || 'Match rounds'}" tabindex="0">
        <div class="bracket-columns">
          ${rounds.map(({name, games}) => `
            <div class="bracket-round">
              <h4>${escapeHtml(name)}</h4>
              <div class="bracket-games">
                ${games.map((match, index) => matchCard(match, index, statuses.get(match), matchIds)).join('')}
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>`).join('');
  $('board').hidden = false;
  document.getElementById(location.hash.slice(1))?.scrollIntoView({block: 'nearest', inline: 'nearest'});
}

function empty(title, detail) {
  $('empty').innerHTML = `<strong>${title}</strong><p>${detail}</p>`;
  $('empty').hidden = false;
}

function setTournamentId(id) {
  const url = new URL(location.href);
  url.searchParams.set('id', id);
  url.hash = '';
  history.replaceState(null, '', url);
}

async function load(reloadList = false) {
  request?.abort();
  const controller = new AbortController();
  const signal = controller.signal;
  request = controller;
  const timer = setTimeout(() => controller.abort(), 15000);
  for (const panel of ['error', 'event', 'empty', 'board']) $(panel).hidden = true;
  $('loading').hidden = false;

  try {
    let id = tournamentId();
    if (!isPublic && (reloadList || !tournaments)) {
      const result = await getJson('/api/tournaments', signal);
      if (request !== controller) return;
      tournaments = result.tournaments;
      $('tournament').replaceChildren(new Option('Select a tournament', ''),
        ...tournaments.map(event => new Option(event.name, event.id)));
      $('picker').hidden = tournaments.length === 0;
    }
    if (!isPublic && id === null) {
      if (!tournaments.length) {
        empty('No tournaments available', 'Tournaments saved on the server will appear here.');
        return;
      }
      id = String(tournaments[0].id);
      setTournamentId(id);
    }
    if (!isPublic) $('tournament').value = tournaments.some(event => String(event.id) === id) ? id : '';
    if (!id || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw new Error('Choose a valid tournament.');
    }

    let event, matches, players, champion;
    if (isPublic) {
      ({tournament: event, matches, players, champion} = await getJson(`/api/public/tournaments/${id}`, signal));
    } else {
      const path = `/api/tournaments/${id}`;
      const [summary, workspace] = await Promise.all([getJson(path, signal), getJson(`${path}/workspace`, signal)]);
      event = summary;
      ({players} = workspace);
      matches = workspace.bracket?.games ?? workspace.matches;
      champion = workspace.bracket?.champion;
    }
    if (request !== controller) return;
    renderEvent(event, players.length);
    if (matches.length) renderBracket(event, matches, champion);
    else empty('No matches yet', 'The schedule will appear here when matches are generated or saved.');
  } catch (error) {
    if (request === controller) {
      const detail = signal.aborted ? 'The request timed out.' : error.message;
      alertInto($('error'), `Could not load the bracket. ${detail} Use Refresh bracket to try again.`, false);
      controller.abort();
    }
  } finally {
    clearTimeout(timer);
    if (request === controller) $('loading').hidden = true;
  }
}

$('refresh').addEventListener('click', () => load(true));
$('tournament').addEventListener('change', event => {
  if (event.target.value) {
    setTournamentId(event.target.value);
    load();
  }
});
load();
