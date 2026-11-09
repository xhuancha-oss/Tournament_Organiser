import { listParticipants, removeParticipant, saveParticipant } from './participant-roster.js';

function validationMessage(input) {
  const state = input.validity;
  if (state.badInput) return 'Enter a number.';
  if (state.valueMissing) return 'Fill in this field.';
  if (state.typeMismatch && input.type === 'email') return 'Enter a valid email address.';
  if (state.rangeUnderflow) return `Enter a value of ${input.min} or higher.`;
  if (state.rangeOverflow) return `Enter a value of ${input.max} or lower.`;
  if (state.stepMismatch) return 'Enter a whole number.';
  if (state.tooLong) return `Use at most ${input.maxLength} characters.`;
  return 'Enter a valid value.';
}

// Capture invalid events so inputs added after a tournament is created are covered too.
export function useEnglishValidation(container) {
  container.addEventListener('invalid', ({ target }) => {
    if (target instanceof HTMLInputElement) target.setCustomValidity(validationMessage(target));
  }, true);
  container.addEventListener('input', ({ target }) => {
    if (target instanceof HTMLInputElement) target.setCustomValidity('');
  }, true);
  container.addEventListener('reset', ({ target }) => {
    for (const input of target.querySelectorAll('input')) input.setCustomValidity('');
  }, true);
}

export function initParticipantManagement(container, { getTournament, onChange }) {
  container.classList.add('participant-management');
  container.innerHTML = `
    <div class="pm-heading"><h3>2. Participant management</h3><span class="pm-count"></span></div>
    <p class="pm-lock-note hint" hidden>The roster is locked because the bracket has been generated.</p>
    <form class="pm-form">
      <h4>Add participant</h4>
      <div class="pm-fields">
        <label>Participant name<input name="participant-name" type="text" required maxlength="40" autocomplete="off"></label>
        <label>Email (optional)<input name="participant-email" type="email" maxlength="254" autocomplete="off"></label>
        <div class="pm-buttons">
          <button type="submit">Add participant</button>
          <button type="button" class="secondary pm-cancel" hidden>Cancel</button>
        </div>
      </div>
    </form>
    <p class="pm-error" role="alert"></p>
    <p class="pm-status" role="status"></p>
    <div class="pm-toolbar">
      <h4>Tournament roster</h4>
      <label class="pm-search">Search participants<input type="search" name="participant-search" placeholder="Name or email"></label>
    </div>
    <table class="pm-table" aria-label="Tournament roster">
      <thead><tr><th scope="col">Slot</th><th scope="col">Name</th><th scope="col">Email</th><th class="pm-actions-head" scope="col">Actions</th></tr></thead>
      <tbody class="pm-list"></tbody>
    </table>`;

  const find = selector => container.querySelector(selector);
  const form = find('.pm-form');
  const nameInput = form.elements['participant-name'];
  const emailInput = form.elements['participant-email'];
  const search = find('.pm-search input');
  const list = find('.pm-list');
  const cancel = find('.pm-cancel');
  const status = find('.pm-status');
  const errorBox = find('.pm-error');
  let editing = null;

  function isDirty() {
    return nameInput.value !== (editing?.name ?? '') || emailInput.value !== (editing?.email ?? '');
  }

  function clearMessages() {
    errorBox.textContent = '';
    status.textContent = '';
  }

  function resetForm() {
    form.reset();
    editing = null;
    find('.pm-form h4').textContent = 'Add participant';
    find('.pm-form [type=submit]').textContent = 'Add participant';
    cancel.textContent = 'Cancel';
    cancel.hidden = true;
  }

  function edit(participant) {
    if (editing?.slot === participant.slot) {
      nameInput.focus();
      return;
    }
    if (isDirty() && !window.confirm('Discard your unsaved changes and edit this participant?')) return;
    editing = participant;
    form.hidden = false;
    form.reset();
    nameInput.value = participant.name;
    emailInput.value = participant.email;
    find('.pm-form h4').textContent = `Edit participant in slot ${participant.slot + 1}`;
    find('.pm-form [type=submit]').textContent = 'Save changes';
    cancel.textContent = 'Cancel';
    cancel.hidden = false;
    clearMessages();
    nameInput.focus();
  }

  function remove(participant) {
    if (!window.confirm(`Remove ${participant.name} from this tournament?`)) return;
    clearMessages();
    try {
      onChange(removeParticipant(getTournament(), participant.slot));
    } catch (error) {
      errorBox.textContent = error.message;
      return;
    }
    if (editing?.slot === participant.slot) resetForm();
    renderList();
    status.textContent = `Removed ${participant.name} from the roster.`;
    search.focus();
  }

  function addAction(cell, action, label, participant, handleClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.dataset.action = action;
    button.textContent = label;
    button.setAttribute('aria-label', `${label} ${participant.name}`);
    button.addEventListener('click', () => handleClick(participant));
    cell.append(button);
  }

  function renderList() {
    const tournament = getTournament();
    const locked = Boolean(tournament.rounds);
    const total = listParticipants(tournament).length;
    const people = listParticipants(tournament, search.value);
    form.hidden = locked || (editing === null && total === tournament.players.length);
    find('.pm-lock-note').hidden = !locked;
    find('.pm-actions-head').hidden = locked;
    find('.pm-count').textContent = `${total} of ${tournament.players.length} registered`;
    list.replaceChildren();
    for (const participant of people) {
      const row = list.insertRow();
      row.insertCell().textContent = participant.slot + 1;
      row.insertCell().textContent = participant.name;
      row.insertCell().textContent = participant.email || '—';
      if (!locked) {
        const cell = row.insertCell();
        cell.className = 'pm-row-actions';
        addAction(cell, 'edit', 'Edit', participant, edit);
        addAction(cell, 'remove', 'Remove', participant, remove);
      }
    }
    if (!people.length) {
      const cell = list.insertRow().insertCell();
      cell.colSpan = locked ? 3 : 4;
      cell.className = 'pm-empty';
      cell.textContent = total ? 'No participants match your search.' : 'No participants have registered yet.';
    }
  }

  form.addEventListener('input', () => {
    clearMessages();
    cancel.hidden = editing === null && !isDirty();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    clearMessages();
    const wasEditing = editing !== null;
    const participant = { name: nameInput.value, email: emailInput.value };
    try {
      onChange(saveParticipant(getTournament(), editing?.slot ?? null, participant));
    } catch (error) {
      errorBox.textContent = error.message;
      return;
    }
    resetForm();
    search.value = '';
    renderList();
    status.textContent = wasEditing ? 'Participant updated.' : 'Participant added.';
    (form.hidden ? search : nameInput).focus();
  });
  cancel.addEventListener('click', () => {
    resetForm();
    clearMessages();
    renderList();
    (form.hidden ? search : nameInput).focus();
  });
  search.addEventListener('input', () => {
    clearMessages();
    renderList();
    const matches = listParticipants(getTournament(), search.value).length;
    status.textContent = `${matches} ${matches === 1 ? 'participant' : 'participants'} found.`;
  });

  renderList();
  return {
    isDirty,
    focusName() { if (!form.hidden) nameInput.focus(); }
  };
}
