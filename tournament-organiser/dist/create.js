import {createTournament} from './tournament.js';
import {readState, writeState, alertInto} from './store.js';

const message = document.getElementById('message');
const form = document.getElementById('create-form');
const input = document.getElementById('tournament-name');

form.addEventListener('submit', event => {
  event.preventDefault();
  const state = readState();
  if (state.error) {
    alertInto(message, `Saved tournaments could not be loaded: ${state.error}`, false);
    return;
  }
  let tournament;
  try {
    tournament = createTournament(input.value);
  } catch (error) {
    alertInto(message, error.message, false);
    input.focus();
    return;
  }
  state.tournaments.push(tournament);
  state.activeId = tournament.id;
  writeState(state);
  location.href = `tournament.html?id=${encodeURIComponent(tournament.id)}#participants`;
});

input.focus();
