import { listParticipants, removeParticipant, saveParticipant } from './participant-roster.js';

export function initParticipantManagement(container, { getTournament, onChange }) {
  container.classList.add('participant-management');
  container.innerHTML = `
    <div class="pm-heading"><h3>2. 选手管理</h3><span class="pm-count"></span></div>
    <p class="pm-lock-note hint" hidden>对阵已生成，选手名单已锁定。</p>
    <form class="pm-form">
      <h4>添加选手</h4>
      <div class="pm-fields">
        <label>选手姓名<input name="participant-name" type="text" required maxlength="40" autocomplete="off"></label>
        <label>邮箱（选填）<input name="participant-email" type="email" maxlength="254" autocomplete="off"></label>
        <div class="pm-buttons">
          <button type="submit">添加选手</button>
          <button type="button" class="secondary pm-cancel" hidden>取消添加</button>
        </div>
      </div>
    </form>
    <p class="pm-error" role="alert"></p>
    <p class="pm-status" role="status"></p>
    <div class="pm-toolbar">
      <h4>参赛名单</h4>
      <label class="pm-search">搜索选手<input type="search" name="participant-search" placeholder="姓名或邮箱"></label>
    </div>
    <table class="pm-table" aria-label="参赛名单">
      <thead><tr><th scope="col">签位</th><th scope="col">姓名</th><th scope="col">邮箱</th><th class="pm-actions-head" scope="col">操作</th></tr></thead>
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
    find('.pm-form h4').textContent = '添加选手';
    find('.pm-form [type=submit]').textContent = '添加选手';
    cancel.textContent = '取消添加';
    cancel.hidden = true;
  }

  function edit(participant) {
    if (editing?.slot === participant.slot) {
      nameInput.focus();
      return;
    }
    if (isDirty() && !window.confirm('放弃表单中尚未提交的内容并编辑这名选手吗？')) return;
    editing = participant;
    form.hidden = false;
    nameInput.value = participant.name;
    emailInput.value = participant.email;
    find('.pm-form h4').textContent = `编辑 ${participant.slot + 1} 号选手`;
    find('.pm-form [type=submit]').textContent = '保存修改';
    cancel.textContent = '取消编辑';
    cancel.hidden = false;
    clearMessages();
    nameInput.focus();
  }

  function remove(participant) {
    if (!window.confirm(`确定删除选手“${participant.name}”吗？`)) return;
    clearMessages();
    try {
      onChange(removeParticipant(getTournament(), participant.slot));
    } catch (error) {
      errorBox.textContent = error.message;
      return;
    }
    if (editing?.slot === participant.slot) resetForm();
    renderList();
    status.textContent = `已删除选手“${participant.name}”。`;
    search.focus();
  }

  function addAction(cell, action, label, participant, handleClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.dataset.action = action;
    button.textContent = label;
    button.setAttribute('aria-label', label + '选手 ' + participant.name);
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
    find('.pm-count').textContent = `已报名 ${total} / ${tournament.players.length} 人`;
    list.replaceChildren();
    for (const participant of people) {
      const row = list.insertRow();
      row.insertCell().textContent = participant.slot + 1;
      row.insertCell().textContent = participant.name;
      row.insertCell().textContent = participant.email || '—';
      if (!locked) {
        const cell = row.insertCell();
        cell.className = 'pm-row-actions';
        addAction(cell, 'edit', '编辑', participant, edit);
        addAction(cell, 'remove', '删除', participant, remove);
      }
    }
    if (!people.length) {
      const cell = list.insertRow().insertCell();
      cell.colSpan = locked ? 3 : 4;
      cell.className = 'pm-empty';
      cell.textContent = total ? '没有匹配的选手，请更换搜索内容。' : '尚未报名选手。';
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
    status.textContent = wasEditing ? '选手信息已更新。' : '选手已添加。';
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
    status.textContent = `找到 ${listParticipants(getTournament(), search.value).length} 名选手。`;
  });

  renderList();
  return {
    isDirty,
    focusName() { if (!form.hidden) nameInput.focus(); }
  };
}
