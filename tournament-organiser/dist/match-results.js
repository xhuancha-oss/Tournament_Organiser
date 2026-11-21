import { matchResultsConfig } from './match-results-config.js';
import { createMatchResultsApi } from './match-results-api.js';
import { filterMatches, matchStatus, sameScores, validateScores, validateSnapshot } from './match-results-model.js';
import { fillIcons, icon } from './match-results-icons.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const statusNames = { ready: '待录入', completed: '已完成', locked: '已锁定', waiting: '等待晋级' };
function statusMarkup(match) {
  const status = matchStatus(match);
  return `<span class="mr-status mr-status--${status}">${status === 'locked' ? icon('lock', 12) : '<i></i>'}${statusNames[status]}</span>`;
}
function timeText(value) {
  const date = new Date(value);
  return !value || Number.isNaN(date.getTime()) ? '暂无更新' : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function mountMatchResults({ service, tournamentId, mode = 'api', maxScore = 9999, readOnly = false, root = document }) {
  const $ = id => root.querySelector(`#${id}`);
  const lifecycle = new AbortController();
  const listen = (element, event, callback) => element.addEventListener(event, callback, { signal: lifecycle.signal });
  let snapshot = null;
  let selectedId = null;
  let draft = null;
  let round = 'all', status = 'all', search = '';
  let loading = false, saving = false, loadSequence = 0, destroyed = false;
  let loadController = null, saveController = null;
  let pendingRefresh = false;
  let previousScenario = 'normal';

  fillIcons(root);
  $('source-label').textContent = mode === 'demo' ? '示例赛事' : '服务器数据';
  $('footer-source').textContent = mode === 'demo' ? '本地交互预览 · 仅保存在当前浏览器' : '服务器数据 · 保存后同步赛事结果';
  $('demo-tools').hidden = mode !== 'demo';
  $('score-a').maxLength = $('score-b').maxLength = String(maxScore).length + 1;
  $('score-rules').textContent = `单场比分 · 0–${maxScore} 的整数 · 不接受平局`;

  function current() { return snapshot?.matches.find(match => match.id === selectedId) ?? draft?.match ?? null; }
  function dirty() { return Boolean(draft && (!sameScores(draft.values, draft.baseline) || draft.reason.trim())); }
  function busy() { return loading || saving; }
  function canEdit() {
    const match = current();
    return Boolean(match && snapshot?.matches.some(m => m.id === match.id) && !readOnly && !match.locked && match.players.every(Boolean));
  }
  function notice(message = '', isError = false) {
    $('page-notice').hidden = !message;
    $('page-notice').textContent = message;
    $('page-notice').classList.toggle('is-error', isError);
    $('page-notice').setAttribute('role', isError ? 'alert' : 'status');
  }
  function beginEdit(match) {
    selectedId = match?.id ?? null;
    draft = match ? { match, values: match.scores?.map(String) ?? ['', ''], baseline: match.scores?.map(String) ?? ['', ''],
      baseRevision: match.revision, reason: '', error: '', success: '', confirming: false, conflict: false, uncertain: false } : null;
    if (match) {
      $('score-a').value = draft.values[0]; $('score-b').value = draft.values[1]; $('change-reason').value = '';
    }
  }
  function applySnapshot(value, { resetEditor = false } = {}) {
    const next = validateSnapshot(value);
    if (String(next.tournament.id) !== String(tournamentId)) throw new Error('收到的赛事数据与当前赛事不一致。');
    const previous = current();
    snapshot = next;
    const updated = snapshot.matches.find(m => m.id === selectedId);
    if (resetEditor || !draft || (!updated && !dirty())) {
      beginEdit(updated ?? snapshot.matches.find(m => matchStatus(m) === 'ready') ?? snapshot.matches[0]);
    } else if (!updated || updated.revision !== draft.baseRevision || updated.locked !== previous?.locked) {
      if (dirty() || draft.conflict) {
        draft.conflict = true; draft.confirming = false; draft.success = '';
      } else beginEdit(updated);
    } else if (!dirty() && !draft.conflict) {
      draft.match = updated;
    }
    render();
  }
  function pageState(kind, message = '') {
    const panel = $('page-state');
    panel.hidden = false; $('workspace').hidden = true;
    panel.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    const headings = { loading:'正在载入比赛…', error:'暂时无法载入比赛', empty:'还没有可以管理的比赛' };
    const details = { loading:'请稍候，正在获取最新比分。', error:message, empty:'生成对阵后，比赛会显示在这里。' };
    panel.innerHTML = `${icon(kind === 'error' ? 'info' : kind === 'empty' ? 'grid' : 'refresh', 28)}<h2>${headings[kind]}</h2><p>${escape(details[kind])}</p>${kind !== 'loading' ? `<button type="button" class="mr-button mr-button--primary" data-retry>${kind === 'error' ? '重新加载' : '刷新比赛'}</button>` : ''}`;
  }
  function renderHeader() {
    const matches = snapshot?.matches ?? [];
    const completed = matches.filter(m => m.scores).length;
    const count = matches.length;
    $('event-name').textContent = $('breadcrumb-name').textContent = snapshot?.tournament.name ?? '当前赛事';
    $('event-format').textContent = `${snapshot?.tournament.formatLabel ?? '单败淘汰赛'}${snapshot?.tournament.participantCount ? ` · ${snapshot.tournament.participantCount} 位选手` : ''}`;
    $('event-status').textContent = loading ? '正在加载' : !snapshot ? '连接异常' : !count ? '尚未开始' : completed === count ? '赛事已结束' : '比赛进行中';
    $('total-count').textContent = count; $('ready-count').textContent = matches.filter(m => matchStatus(m) === 'ready').length;
    $('completed-count').textContent = completed; $('list-count').textContent = count;
    const percent = count ? Math.round(completed / count * 100) : 0;
    $('progress-percent').textContent = `${percent}%`; $('progress-fill').style.width = `${percent}%`;
    $('progress-text').textContent = `${completed} / ${count} 场比赛已完成`;
    $('match-progress').setAttribute('aria-valuenow', completed); $('match-progress').setAttribute('aria-valuemax', count || 1);
    $('refresh-results').disabled = busy();
    $('preview-scenario').disabled = saving; $('reset-demo').disabled = saving;
  }
  function renderList() {
    const matches = snapshot?.matches ?? [];
    const rounds = [...new Map(matches.map(m => [String(m.round), m.roundName])).entries()];
    if (round !== 'all' && !rounds.some(([id]) => id === round)) round = 'all';
    $('round-tabs').innerHTML = [['all','全部轮次'], ...rounds].map(([id, name]) => `<button type="button" data-round="${escape(id)}" class="${round === id ? 'is-active' : ''}" aria-pressed="${round === id}">${escape(name)}</button>`).join('');
    const counts = { ready:matches.filter(m => matchStatus(m) === 'ready').length, completed:matches.filter(m => m.scores).length,
      locked:matches.filter(m => m.locked).length, waiting:matches.filter(m => matchStatus(m) === 'waiting').length };
    for (const option of $('status-filter').options) if (option.value !== 'all') option.textContent = `${statusNames[option.value]} · ${counts[option.value]}`;
    const visible = filterMatches(matches, { round, status, search });
    $('match-rows').innerHTML = visible.map(match => `<tr class="${match.id === selectedId ? 'is-selected' : ''} ${match.locked ? 'is-locked' : ''}"><td><button type="button" class="mr-match-select" data-match="${escape(match.id)}" aria-pressed="${match.id === selectedId}"><span class="mr-row-number">${String(match.number).padStart(2,'0')}</span><span><span class="mr-row-meta">${escape(match.roundName)} <span>·</span> ${escape(match.id)}</span><span class="mr-opponents">${escape(match.players[0]?.name ?? '待定')} <small>vs</small> ${escape(match.players[1]?.name ?? '待定')}</span></span></button></td><td><span class="mr-table-score ${match.scores ? '' : 'is-empty'}">${match.scores ? `<b class="${match.scores[0] > match.scores[1] ? 'is-winner' : ''}">${match.scores[0]}</b><i>:</i><b class="${match.scores[1] > match.scores[0] ? 'is-winner' : ''}">${match.scores[1]}</b>` : '— : —'}</span></td><td>${statusMarkup(match)}</td><td><button type="button" class="mr-row-arrow" data-match="${escape(match.id)}" aria-label="${match.locked ? '查看' : '管理'}${escape(match.id)}比分">${icon('chevron',16)}</button></td></tr>`).join('');
    $('no-matches').hidden = visible.length > 0;
    $('visible-count').textContent = `显示 ${visible.length} / ${matches.length} 场比赛`;
    const latest = matches.map(m => m.updatedAt).filter(v => Number.isFinite(Date.parse(v))).sort((a,b) => Date.parse(b)-Date.parse(a))[0];
    $('last-update').textContent = latest ? `最近更新 ${timeText(latest)}` : '暂无更新';
  }
  function renderEditor() {
    const match = current();
    $('editor-column').hidden = !match;
    if (!match || !draft) return;
    const editable = canEdit();
    $('score-editor').setAttribute('aria-busy', String(saving));
    $('editor-title').textContent = match.locked ? '查看比分' : match.scores ? '修改比分' : '录入比分';
    $('editor-icon').innerHTML = icon(match.locked ? 'lock' : 'edit');
    $('editor-round').textContent = `${match.roundName} · 第 ${match.number} 场`;
    $('editor-code').textContent = match.id; $('editor-status').innerHTML = statusMarkup(match);
    $('editor-updated').textContent = match.scores ? `更新于 ${timeText(match.updatedAt)}` : '提交前请核对双方选手';
    match.players.forEach((player, index) => {
      const suffix = index ? 'b' : 'a';
      $(`avatar-${suffix}`).textContent = player?.name.slice(-2) ?? '?';
      $(`player-${suffix}-name`).textContent = player?.name ?? '选手待定';
      $(`player-${suffix}-meta`).textContent = player ? `选手 ${String(player.seed ?? index + 1).padStart(2,'0')}` : '等待上一轮结果';
      $(`score-${suffix}-label`).textContent = `${player?.name ?? `选手${index + 1}`}比分`;
      $(`score-${suffix}`).setAttribute('aria-invalid', String(Boolean(draft.error)));
      $(`score-${suffix}`).setAttribute('aria-describedby', draft.error ? 'save-error' : 'score-rules');
    });
    $('score-fields').disabled = !editable || busy() || draft.confirming || draft.conflict;
    $('reason-field').hidden = !match.scores || !editable;
    const callout = !snapshot?.matches.some(m => m.id === selectedId) ? '本场比赛已不在最新赛程中，当前输入已保留供核对。'
      : match.locked ? (match.lockReason || '后续比赛已产生结果，本场比分已锁定。')
      : !match.players.every(Boolean) ? '双方选手确定后，即可录入本场比分。' : readOnly ? '当前页面为只读模式。' : '';
    $('editor-callout').hidden = !callout;
    if (callout) $('editor-callout').innerHTML = `${icon(match.locked ? 'lock' : 'info', 16)}<p>${escape(callout)}</p>`;
    $('conflict-alert').hidden = !draft.conflict;
    $('conflict-message').textContent = draft.uncertain ? '本次保存状态尚不确定，当前输入已保留。请先载入最新结果核对，避免重复提交。' : '这场比赛已有更新或结果冲突，当前输入已保留。请先核对最新结果。';
    $('load-latest').disabled = busy();
    $('save-error').hidden = !draft.error; $('save-error').textContent = draft.error;
    $('save-success').hidden = !draft.success; $('save-success').textContent = draft.success;
    $('confirm-panel').hidden = !draft.confirming;
    if (draft.confirming) {
      $('confirm-title').textContent = match.scores ? '确认修改结果？' : '确认提交结果？';
      $('confirm-score').textContent = `${match.players[0].name} ${draft.values[0]} : ${draft.values[1]} ${match.players[1].name}`;
      $('confirm-winner').textContent = `胜者：${match.players[Number(draft.values[0]) > Number(draft.values[1]) ? 0 : 1].name}`;
    }
    $('confirm-save').disabled = saving; $('back-to-edit').disabled = saving;
    $('confirm-save').textContent = saving ? '正在保存…' : '确认保存';
    $('prepare-save').hidden = draft.confirming;
    $('prepare-save').disabled = !editable || busy() || !dirty() || draft.conflict;
    $('prepare-save').textContent = match.locked ? '结果已锁定' : !match.players.every(Boolean) ? '等待选手晋级' : readOnly ? '当前为只读模式' : match.scores ? '更新比赛结果' : '保存比赛结果';
    $('discard-input').hidden = !editable || !dirty() || draft.confirming || draft.conflict;
    $('discard-input').disabled = busy();
  }
  function render() {
    renderHeader();
    if (snapshot && (snapshot.matches.length || draft)) { $('page-state').hidden = true; $('workspace').hidden = false; renderList(); renderEditor(); }
    else if (snapshot) pageState('empty');
  }
  async function refresh({ resetEditor = false } = {}) {
    if (saving || destroyed) return;
    const sequence = ++loadSequence;
    loadController?.abort(); loadController = new AbortController();
    loading = true; notice(); renderHeader();
    if (!snapshot) pageState('loading'); else renderEditor();
    try {
      if (tournamentId == null || (typeof tournamentId === 'string' && !tournamentId.trim())) throw new Error('尚未选择赛事，请从赛事列表进入比分管理。');
      const result = await service.getMatches(tournamentId, { signal: loadController.signal });
      if (destroyed || sequence !== loadSequence) return;
      applySnapshot(result, { resetEditor });
    } catch (error) {
      if (destroyed || sequence !== loadSequence || error.code === 'ABORTED' || error.name === 'AbortError') return;
      if (snapshot) notice(`未能获取最新比赛：${error.message || '请稍后重试。'} 当前输入已保留。`, true);
      else pageState('error', error.message || '加载失败，请稍后重试。');
    } finally {
      if (!destroyed && sequence === loadSequence) { loading = false; renderHeader(); if (snapshot) renderEditor(); }
    }
  }
  function scrollEditor() {
    if (window.matchMedia('(max-width: 1100px)').matches) $('editor-column').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block:'start' });
  }
  function selectMatch(id) {
    if (saving) { notice('正在保存当前比赛，请稍候。'); return; }
    const match = snapshot?.matches.find(m => m.id === id);
    if (!match) return;
    if (id === selectedId) { scrollEditor(); return; }
    if (dirty() && !window.confirm('当前比分尚未保存，确定放弃本次输入并切换比赛吗？')) return;
    beginEdit(match); renderList(); renderEditor(); scrollEditor();
  }
  function onInput() {
    if (!draft) return;
    draft.values = [$('score-a').value, $('score-b').value]; draft.reason = $('change-reason').value;
    draft.error = ''; draft.success = ''; renderEditor();
  }
  function prepare(event) {
    event.preventDefault();
    if (!canEdit() || busy() || draft.conflict) return;
    try {
      validateScores(draft.values, maxScore);
      if (sameScores(draft.values, draft.baseline)) throw new Error('比分未改变，无需再次保存。');
      if (current().scores && !draft.reason.trim()) throw new Error('请填写修改原因，便于核对这次更正。');
      draft.error = ''; draft.success = ''; draft.confirming = true;
      renderEditor(); $('confirm-save').focus();
    } catch (error) { draft.error = error.message; renderEditor(); }
  }
  async function save() {
    if (!draft?.confirming || !canEdit() || busy() || draft.conflict) return;
    const payload = { tournamentId, matchId:selectedId, scores:validateScores(draft.values, maxScore), reason:draft.reason.trim(), expectedRevision:draft.baseRevision };
    const correction = Boolean(current().scores);
    saving = true; saveController = new AbortController(); renderHeader(); renderEditor();
    try {
      const result = await service.saveScores(payload, { signal:saveController.signal });
      if (destroyed) return;
      // Both real and demo services return the entire authoritative tournament snapshot.
      applySnapshot(result, { resetEditor:true });
      draft.success = correction ? '比分已更新，相关比赛信息已同步。' : '比分已保存，晋级信息已更新。';
      document.dispatchEvent(new CustomEvent('tournament:updated', { detail:{ tournamentId, snapshot:result, source:'match-results' } }));
      renderEditor();
    } catch (error) {
      if (destroyed) return;
      draft.error = error.message || '保存失败，当前输入已保留。'; draft.confirming = false;
      if (error.code === 'CONFLICT' || error.uncertain) { draft.conflict = true; draft.uncertain = Boolean(error.uncertain); }
    } finally {
      if (!destroyed) {
        saving = false; renderHeader(); renderEditor();
        if (pendingRefresh) { pendingRefresh = false; refresh(); }
      }
    }
  }
  listen($('score-form'), 'submit', prepare);
  listen($('score-a'), 'input', onInput); listen($('score-b'), 'input', onInput); listen($('change-reason'), 'input', onInput);
  listen($('confirm-save'), 'click', save);
  listen($('back-to-edit'), 'click', () => { if (saving) return; draft.confirming = false; renderEditor(); $('score-a').focus(); });
  listen($('discard-input'), 'click', () => { if (busy()) return; beginEdit(current()); renderEditor(); $('score-a').focus(); });
  listen($('load-latest'), 'click', () => {
    if (dirty() && !window.confirm('载入最新比分将替换当前未保存的输入，确定继续吗？')) return;
    refresh({ resetEditor:true });
  });
  listen($('refresh-results'), 'click', () => refresh());
  listen($('page-state'), 'click', event => {
    if (!event.target.closest('[data-retry]')) return;
    if (mode === 'demo') { service.setScenario('normal'); previousScenario = 'normal'; $('preview-scenario').value = 'normal'; }
    refresh();
  });
  listen($('match-rows'), 'click', event => { const button = event.target.closest('[data-match]'); if (button) selectMatch(button.dataset.match); });
  listen($('round-tabs'), 'click', event => {
    const button = event.target.closest('[data-round]'); if (!button) return;
    round = button.dataset.round; renderList();
    [...$('round-tabs').querySelectorAll('button')].find(b => b.dataset.round === round)?.focus();
  });
  listen($('match-search'), 'input', event => { search = event.target.value; renderList(); });
  listen($('status-filter'), 'change', event => { status = event.target.value; renderList(); });
  listen($('clear-filters'), 'click', () => { round = status = 'all'; search = ''; $('match-search').value = ''; $('status-filter').value = 'all'; renderList(); $('match-search').focus(); });
  listen(window, 'beforeunload', event => { if (dirty() || saving) { event.preventDefault(); event.returnValue = ''; } });
  listen(document, 'tournament:updated', event => {
    if (event.detail?.source === 'match-results' || String(event.detail?.tournamentId) !== String(tournamentId)) return;
    if (saving) { pendingRefresh = true; return; }
    refresh();
  });
  if (mode === 'demo') {
    listen($('preview-scenario'), 'change', event => {
      const next = event.target.value;
      if (['normal','save-error'].includes(next) && ['normal','save-error'].includes(previousScenario)) { service.setScenario(next); previousScenario = next; return; }
      if (dirty() && !window.confirm('切换预览场景会放弃尚未保存的输入，确定继续吗？')) { event.target.value = previousScenario; return; }
      if (!['normal','save-error'].includes(next)) { snapshot = null; beginEdit(null); }
      previousScenario = next; service.setScenario(next); refresh({ resetEditor:true });
    });
    listen($('reset-demo'), 'click', async () => {
      if (saving || !window.confirm('重置示例赛事将清除本预览中保存的比分，确定继续吗？')) return;
      loadController?.abort(); ++loadSequence; loading = false;
      try {
        const result = service.reset(); service.setScenario('normal'); previousScenario = 'normal'; $('preview-scenario').value = 'normal';
        beginEdit(null);
        applySnapshot(result, { resetEditor:true }); notice('示例赛事已重置。');
      } catch(error) { notice(error.message, true); }
    });
    listen(window, 'storage', event => {
      if (event.key !== service.storageKey) return;
      if (saving) pendingRefresh = true; else refresh();
    });
  }
  refresh();
  return { refresh, hasUnsavedChanges:() => dirty() || saving,
    destroy() { destroyed = true; ++loadSequence; loadController?.abort(); saveController?.abort(); lifecycle.abort(); } };
}

async function bootstrap() {
  const query = new URLSearchParams(location.search);
  const config = { ...matchResultsConfig, ...(window.TOURNAMENT_MATCH_RESULTS_CONFIG ?? {}) };
  const mode = query.get('mode') ?? config.mode;
  if (!['demo','api'].includes(mode)) throw new Error('页面模式不正确，请从赛事列表重新进入。');
  const tournamentId = query.get('tournamentId') ?? (mode === 'demo' ? 'campus-demo' : config.tournamentId);
  const service = mode === 'demo'
    ? (await import('./match-results-demo.js')).createDemoService()
    : createMatchResultsApi({ baseUrl:config.apiBaseUrl, timeoutMs:config.timeoutMs, paths:config.paths, getHeaders:config.getHeaders });
  window.matchResultsPage = mountMatchResults({ service, tournamentId, mode, maxScore:config.maxScore, readOnly:config.readOnly });
}
if (document.querySelector('#match-results-root')) bootstrap().catch(error => {
  const panel = document.querySelector('#page-state'); panel.setAttribute('role','alert');
  panel.replaceChildren(Object.assign(document.createElement('h2'), { textContent:'暂时无法载入比赛' }), Object.assign(document.createElement('p'), { textContent:error.message || '请稍后重试。' }));
});
