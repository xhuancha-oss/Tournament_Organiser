import { config } from './config.js';
import { FORMATS, validateTournament, toPayload } from './tournament-model.js';
import { createTournament } from './tournament-service.js';

const $ = (id) => document.getElementById(id);
const form = $('tournament-form');
const draftKey = 'tos.create-tournament.draft.v1';
const controls = { name: $('name'), start_time: $('start-time'), end_time: $('end-time'), description: $('description') };
const errorIds = { name: 'name-error', start_time: 'start-time-error', end_time: 'end-time-error', format: 'format-error', description: 'description-error' };
let submitting = false;
let validationStarted = false;
let draftTimer;
let draftValues;

function values() {
  return Object.fromEntries(new FormData(form));
}

function displayErrors(errors) {
  for (const [field, id] of Object.entries(errorIds)) {
    $(id).textContent = typeof errors[field] === 'string' ? errors[field] : '';
    const targets = field === 'format' ? form.querySelectorAll('[name="format"]') : [controls[field]];
    for (const input of targets) {
      if (errors[field]) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }
}

function displayTime(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '尚未设置';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function updatePreview() {
  const data = values();
  $('preview-name').textContent = data.name.trim() || '你的下一场精彩赛事';
  $('preview-format').textContent = FORMATS[data.format] || '尚未选择';
  $('preview-start').textContent = displayTime(data.start_time);
  $('preview-end').textContent = displayTime(data.end_time);
  $('preview-description').textContent = data.description.trim();
  $('preview-description').hidden = !data.description.trim();
  $('name-count').textContent = `${data.name.length} / 80`;
  $('description-count').textContent = `${data.description.length} / 1000`;
  if (validationStarted) displayErrors(validateTournament(data));
}

function saveDraft() {
  draftTimer = null;
  try {
    localStorage.setItem(draftKey, JSON.stringify(values()));
    $('draft-status').textContent = '草稿已保存至当前浏览器';
  } catch {
    $('draft-status').textContent = '草稿保存失败，请勿关闭页面';
  }
}

function clearDraft() {
  clearTimeout(draftTimer);
  draftTimer = null;
  try { localStorage.removeItem(draftKey); return true; }
  catch { return false; }
}

function resetEditor() {
  const cleared = clearDraft();
  form.reset();
  validationStarted = false;
  displayErrors({});
  $('form-message').hidden = true;
  $('draft-status').textContent = cleared ? '草稿仅保存在当前浏览器' : '表单已清空；浏览器草稿清除失败';
  updatePreview();
}

function focusError(errors) {
  const first = Object.keys(errorIds).find((key) => errors[key]);
  if (first) (controls[first] || form.querySelector('[name="format"]')).focus();
}

function setBusy(busy) {
  submitting = busy;
  for (const element of form.elements) element.disabled = busy;
  form.setAttribute('aria-busy', String(busy));
  $('submit-button').textContent = busy ? '正在创建…' : '创建赛事 ↗';
}

$('mode-badge').textContent = config.mode === 'api' ? 'API 连接模式' : '本地演示模式';
$('timezone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
try {
  draftValues = JSON.parse(localStorage.getItem(draftKey) || 'null');
  if (draftValues && typeof draftValues === 'object') {
    for (const [key, input] of Object.entries(controls)) {
      if (typeof draftValues[key] === 'string') input.value = draftValues[key];
    }
    const radio = [...form.querySelectorAll('[name="format"]')].find((input) => input.value === draftValues.format);
    if (radio) radio.checked = true;
    $('draft-status').textContent = '已恢复上次未提交的草稿';
  }
} catch {
  $('draft-status').textContent = '无法读取草稿，可继续填写';
}
updatePreview();

form.addEventListener('input', () => {
  updatePreview();
  clearTimeout(draftTimer);
  $('draft-status').textContent = '正在保存草稿…';
  draftTimer = setTimeout(saveDraft, 350);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting) return;
  validationStarted = true;
  const data = values();
  const errors = validateTournament(data);
  displayErrors(errors);
  $('form-message').hidden = true;
  if (Object.keys(errors).length) {
    $('form-message').textContent = '请检查标出的信息后再次提交。';
    $('form-message').hidden = false;
    focusError(errors);
    return;
  }
  clearTimeout(draftTimer);
  saveDraft();
  const payload = toPayload(data);
  setBusy(true);
  try {
    const record = await createTournament(payload, config);
    const cleared = clearDraft();
    $('success-title').textContent = config.mode === 'local' ? '赛事已在本地创建' : '赛事创建成功';
    $('success-message').textContent = `「${payload.name}」 · ${FORMATS[payload.format]} · ${displayTime(data.start_time)}`;
    $('success-detail').textContent = (config.mode === 'local'
      ? '已保存到当前浏览器，尚未发送到服务器。刷新页面不会丢失此赛事。'
      : `服务器已保存赛事，编号：${record.id}。`) + (cleared ? '' : ' 注意：旧草稿未能清除。');
    $('editor').hidden = true;
    $('success-panel').hidden = false;
    $('success-panel').focus();
    // 其他模块可监听此事件，或读取服务返回的 record。
    document.dispatchEvent(new CustomEvent('tournament:created', { detail: record }));
  } catch (error) {
    $('form-message').textContent = error.message || '创建失败，请重试。';
    $('form-message').hidden = false;
    displayErrors(error.fieldErrors || {});
    $('form-message').scrollIntoView({ block: 'nearest' });
  } finally {
    setBusy(false);
  }
});

$('reset-button').addEventListener('click', () => $('reset-dialog').showModal());
$('cancel-reset').addEventListener('click', () => $('reset-dialog').close());
$('confirm-reset').addEventListener('click', () => {
  $('reset-dialog').close();
  resetEditor();
  controls.name.focus();
});
$('create-another').addEventListener('click', () => {
  resetEditor();
  $('success-panel').hidden = true;
  $('editor').hidden = false;
  controls.name.focus();
});
window.addEventListener('beforeunload', () => {
  if (draftTimer && !$('editor').hidden) saveDraft();
});
