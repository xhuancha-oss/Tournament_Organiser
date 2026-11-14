// Shared state helpers for the tournament pages.
import {loadState, saveState, champion} from './tournament.js';

export const STATUS = {
  idle:'Not started',
  live:'In progress',
  done:'Finished',
};

export function readState() {
  try {
    return loadState(localStorage);
  } catch (error) {
    return {version:1, activeId:null, tournaments:[], error:error.message};
  }
}

export function writeState(state) {
  saveState(localStorage, {version:1, activeId:state.activeId, tournaments:state.tournaments});
}

export function statusOf(tournament) {
  if (!tournament.rounds) return STATUS.idle;
  return champion(tournament) ? STATUS.done : STATUS.live;
}

export function statusClass(status) {
  if (status === STATUS.done) return 'pill pill-ok';
  if (status === STATUS.live) return 'pill pill-live';
  return 'pill';
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'});
}

export function tournamentId() {
  return new URLSearchParams(location.search).get('id');
}

export function alertInto(node, message, ok = true) {
  node.textContent = message;
  node.className = ok ? 'alert alert-ok' : 'alert alert-error';
  node.hidden = false;
}
