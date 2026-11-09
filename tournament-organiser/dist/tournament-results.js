import {loadState, champion} from './tournament.js';
import {
  calculateStandings,
  getChampionJourney,
  getMatchHistory,
  getTournamentAnalytics,
  generateTextSummary,
  generateCsvExport,
  getTournamentStatus,
  runnerUp,
  STAGE_NAMES,
  ROUND_NAMES
} from './tournament-results-model.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

let allTournaments = [];
let currentTournament = null;
let currentRoundFilter = 'all';
let currentSortOrder = 'rank-asc';
let currentSearchQuery = '';

function notify(text, isError = false) {
  const el = $('#message-toast');
  if (!el) return;
  el.textContent = text;
  el.className = isError ? 'load-error' : 'status-notice-hero';
  el.hidden = false;
  clearTimeout(notify._timer);
  notify._timer = setTimeout(() => {
    el.hidden = true;
  }, 4000);
}

function readData() {
  try {
    const state = loadState(localStorage);
    allTournaments = state.tournaments || [];
    return true;
  } catch (error) {
    allTournaments = [];
    currentTournament = null;
    $('#message-toast').textContent = `无法读取赛事数据：${error.message}`;
    $('#message-toast').className = 'load-error';
    $('#message-toast').hidden = false;
    return false;
  }
}

function selectTournamentById(id) {
  if (!allTournaments.length) {
    currentTournament = null;
    return;
  }
  const match = allTournaments.find(t => t.id === id);
  if (match) {
    currentTournament = match;
  } else {
    // 优先选择第一个已结束的比赛，若无则选第一个
    currentTournament = allTournaments.find(t => champion(t)) || allTournaments[0];
  }
}

function syncUrlParam(id) {
  if (!id) return;
  const url = new URL(location.href);
  url.searchParams.set('tournament', id);
  history.replaceState(null, '', url);
}

function renderPicker() {
  const select = $('#tournament-select');
  if (!select) return;

  if (!allTournaments.length) {
    select.innerHTML = '<option value="">(当前没有已保存的赛事)</option>';
    select.disabled = true;
    return;
  }

  select.disabled = false;
  select.innerHTML = allTournaments.map(t => {
    const isCompleted = Boolean(champion(t));
    const statusText = isCompleted ? '已结束 (冠军已产生)' : t.rounds ? '进行中' : '待开始';
    const selected = currentTournament && t.id === currentTournament.id ? 'selected' : '';
    return `<option value="${escape(t.id)}" ${selected}>${escape(t.name)} · [${statusText}]</option>`;
  }).join('');
}

function renderHeroSection(t) {
  const heroContainer = $('#champion-hero-container');
  if (!heroContainer) return;

  if (!t) {
    heroContainer.innerHTML = `
      <section class="list-empty">
        <h3>暂无选中赛事</h3>
        <p>请先在赛事列表中选择一场赛事，或前往创建新赛事。</p>
        <a class="button-link" href="./TournamentList.html">前往赛事列表</a>
      </section>
    `;
    return;
  }

  const champ = champion(t);
  const runner = runnerUp(t);
  const standings = calculateStandings(t);
  const analytics = getTournamentAnalytics(t);

  if (champ) {
    const bronzePlayer = standings.find(s => s.rank === 3);
    heroContainer.innerHTML = `
      <section class="champion-hero" aria-labelledby="champ-title">
        <span class="champion-hero-badge">★ 荣耀冠军时刻 ★</span>
        <div class="champion-name-row">
          <h2 id="champ-title" class="champion-name">🏆 冠军：${escape(champ)}</h2>
          <span class="status-badge status-completed">赛事已圆满结束</span>
        </div>
        <p class="champion-honor-text">
          在全部 7 场激烈对决中保持全胜，以卓越竞技水平摘得《${escape(t.name)}》总冠军荣誉！
        </p>

        <!-- 三甲领奖台 -->
        <div class="podium-container" aria-label="赛事前三名领奖台">
          <div class="podium-card podium-2">
            <span class="podium-rank-badge" aria-label="亚军">🥈</span>
            <div class="podium-title">亚 军 (Runner-up)</div>
            <div class="podium-player">${escape(runner || '待定')}</div>
            <div class="podium-sub">决赛惜败 · 荣耀第二名</div>
          </div>
          <div class="podium-card podium-1">
            <span class="podium-rank-badge" aria-label="冠军">🥇</span>
            <div class="podium-title">总 冠 军 (Champion)</div>
            <div class="podium-player">${escape(champ)}</div>
            <div class="podium-sub">荣膺桂冠 · 顶级王者</div>
          </div>
          <div class="podium-card podium-3">
            <span class="podium-rank-badge" aria-label="季军">🥉</span>
            <div class="podium-title">季 军 (3rd Place)</div>
            <div class="podium-player">${escape(bronzePlayer ? bronzePlayer.name : '四强晋级')}</div>
            <div class="podium-sub">四强优胜 · 季军排位</div>
          </div>
        </div>
      </section>
    `;
  } else {
    heroContainer.innerHTML = `
      <section class="status-notice-hero">
        <h2>⚔️ 赛事正在进行中 · 最终冠军虚位以待</h2>
        <p>当前赛事尚未完赛（已完成 <strong>${analytics.completedMatches}</strong> / <strong>${analytics.totalMatches}</strong> 场，完成进度 ${analytics.completionRate}%）。完成全部决赛后将在此举行冠军颁奖典礼！</p>
        <div class="hero-progress-bar" aria-hidden="true">
          <span style="width: ${analytics.completionRate}%"></span>
        </div>
      </section>
    `;
  }
}

function renderChampionJourney(t) {
  const journeySection = $('#champion-journey-section');
  if (!journeySection) return;

  const champ = champion(t);
  if (!champ) {
    journeySection.hidden = true;
    return;
  }

  const journey = getChampionJourney(t);
  if (!journey.length) {
    journeySection.hidden = true;
    return;
  }

  journeySection.hidden = false;
  const listEl = $('#journey-steps-list');
  listEl.innerHTML = journey.map((step, idx) => `
    <div class="journey-step ${step.isFinal ? 'is-final' : ''}">
      <div class="journey-step-header">
        <b>第 ${idx + 1} 关 · ${escape(step.roundName)}</b>
        <span>${step.isFinal ? '🏆 决胜之战' : '晋级战'}</span>
      </div>
      <div class="journey-versus">
        vs ${escape(step.opponent)}
      </div>
      <div class="journey-score">
        比分：${step.scoreText} (净胜 +${step.margin})
      </div>
    </div>
  `).join('');
}

function renderStandingsTable(t) {
  const body = $('#standings-body');
  if (!body) return;

  if (!t) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;">暂无数据</td></tr>';
    return;
  }

  let standings = calculateStandings(t);

  // 搜索过滤
  if (currentSearchQuery.trim()) {
    const q = currentSearchQuery.trim().toLowerCase();
    standings = standings.filter(s => s.name.toLowerCase().includes(q));
  }

  // 排序处理
  standings.sort((a, b) => {
    switch (currentSortOrder) {
      case 'points-desc':
        return b.pointsFor - a.pointsFor || a.rank - b.rank;
      case 'diff-desc':
        return b.pointDiff - a.pointDiff || a.rank - b.rank;
      case 'winrate-desc':
        return b.winRate - a.winRate || a.rank - b.rank;
      case 'rank-asc':
      default:
        return a.rank - b.rank;
    }
  });

  if (!standings.length) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#52606e;">没有找到符合搜索条件的选手</td></tr>';
    return;
  }

  body.innerHTML = standings.map(s => {
    let rankBadge = `<span class="rank-badge">${s.rank}</span>`;
    if (s.rank === 1) rankBadge = `<span class="rank-badge rank-1" title="冠军">🥇</span>`;
    else if (s.rank === 2) rankBadge = `<span class="rank-badge rank-2" title="亚军">🥈</span>`;
    else if (s.rank === 3) rankBadge = `<span class="rank-badge rank-3" title="季军">🥉</span>`;

    const diffClass = s.pointDiff > 0 ? 'diff-positive' : s.pointDiff < 0 ? 'diff-negative' : '';

    return `
      <tr>
        <td>${rankBadge}</td>
        <td class="player-name-cell">${escape(s.name)}</td>
        <td><span class="tag">${escape(s.stageLabel)}</span></td>
        <td><strong>${s.wins}</strong> 胜 <strong>${s.losses}</strong> 负</td>
        <td>${s.pointsFor} / ${s.pointsAgainst}</td>
        <td class="${diffClass}">${s.pointDiffFormatted}</td>
        <td><strong>${s.winRateFormatted}</strong></td>
      </tr>
    `;
  }).join('');
}

function renderMatchHistory(t) {
  const container = $('#match-cards-container');
  if (!container) return;

  if (!t || !t.rounds) {
    container.innerHTML = '<p class="hint">该赛事尚未生成对阵安排。</p>';
    return;
  }

  const matches = getMatchHistory(t, currentRoundFilter);
  if (!matches.length) {
    container.innerHTML = '<p class="hint">暂无该轮次比赛信息。</p>';
    return;
  }

  container.innerHTML = matches.map(m => {
    const isCompleted = m.isCompleted;
    return `
      <div class="match-history-card ${isCompleted ? 'completed' : 'pending'}">
        <div class="card-top">
          <span><strong>${escape(m.roundName)}</strong> · 第 ${m.matchNumber} 场</span>
          <span class="status-badge ${isCompleted ? 'status-completed' : 'status-pending'}">${m.statusText}</span>
        </div>
        <div class="card-score-row ${m.winner && m.winner === m.players[0] ? 'winner-row' : ''}">
          <span>${escape(m.players[0])}</span>
          <span class="score-badge">${isCompleted ? m.scores[0] : '-'}</span>
        </div>
        <div class="card-score-row ${m.winner && m.winner === m.players[1] ? 'winner-row' : ''}">
          <span>${escape(m.players[1])}</span>
          <span class="score-badge">${isCompleted ? m.scores[1] : '-'}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderAnalytics(t) {
  const grid = $('#analytics-grid');
  if (!grid) return;

  const a = getTournamentAnalytics(t);

  $('#stat-total-points').textContent = `${a.totalPoints} 分`;
  $('#stat-avg-points').textContent = `${a.averageMatchPoints} 分/场`;

  const highEl = $('#stat-highest-match');
  if (a.highestScoringMatch) {
    highEl.textContent = `${a.highestScoringMatch.players[0]} vs ${a.highestScoringMatch.players[1]} (${a.highestScoringMatch.scoreText})`;
  } else {
    highEl.textContent = '暂无已完赛记录';
  }

  const closeEl = $('#stat-closest-match');
  if (a.closestMatch) {
    closeEl.textContent = `${a.closestMatch.players[0]} vs ${a.closestMatch.players[1]} (分差 ${a.closestMatch.scoreDiff} 分)`;
  } else {
    closeEl.textContent = '暂无已完赛记录';
  }
}

function renderAll() {
  renderPicker();
  renderHeroSection(currentTournament);
  renderChampionJourney(currentTournament);
  renderStandingsTable(currentTournament);
  renderMatchHistory(currentTournament);
  renderAnalytics(currentTournament);

  // 绑定比赛管理直达链接
  const toManageLink = $('#btn-goto-manage');
  if (toManageLink && currentTournament) {
    toManageLink.href = `./index.html?tournament=${encodeURIComponent(currentTournament.id)}#current-title`;
  }
}

function bindEvents() {
  // 切换赛事
  $('#tournament-select')?.addEventListener('change', e => {
    const targetId = e.target.value;
    selectTournamentById(targetId);
    syncUrlParam(targetId);
    renderAll();
    notify('已切换当前查看的赛事。');
  });

  // 刷新按钮
  $('#refresh-results')?.addEventListener('click', () => {
    if (readData()) {
      const urlId = new URLSearchParams(location.search).get('tournament');
      selectTournamentById(urlId);
      renderAll();
      notify('赛事数据已刷新至最新状态。');
    }
  });

  // 排名搜索
  $('#standings-search')?.addEventListener('input', e => {
    currentSearchQuery = e.target.value;
    renderStandingsTable(currentTournament);
  });

  // 排名排序
  $('#standings-sort')?.addEventListener('change', e => {
    currentSortOrder = e.target.value;
    renderStandingsTable(currentTournament);
  });

  // 轮次筛选标签切换
  document.querySelectorAll('.match-filter-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.match-filter-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRoundFilter = btn.dataset.round;
      renderMatchHistory(currentTournament);
    });
  });

  // 复制战报
  $('#btn-copy-summary')?.addEventListener('click', async () => {
    if (!currentTournament) return;
    const text = generateTextSummary(currentTournament);
    try {
      await navigator.clipboard.writeText(text);
      notify('✓ 战报已成功复制到剪贴板，可直接粘贴分享！');
    } catch {
      // 降级复制
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      notify('✓ 战报已复制到剪贴板！');
    }
  });

  // 导出 CSV
  $('#btn-export-csv')?.addEventListener('click', () => {
    if (!currentTournament) return;
    const csvContent = '\ufeff' + generateCsvExport(currentTournament);
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentTournament.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')}-最终排名.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('已成功下载排名 CSV 表格文件。');
  });

  // 导出 JSON
  $('#btn-export-json')?.addEventListener('click', () => {
    if (!currentTournament) return;
    const jsonStr = JSON.stringify(currentTournament, null, 2);
    const blob = new Blob([jsonStr], {type: 'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentTournament.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')}-赛事全量数据.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('已成功导出赛事完整 JSON 数据文件。');
  });

  // 打印战报
  $('#btn-print-results')?.addEventListener('click', () => {
    window.print();
  });

  // 跨标签页更新监听
  window.addEventListener('storage', event => {
    if (event.key !== 'tournament-organiser-v1' && event.key !== null) return;
    readData();
    const currentId = currentTournament?.id;
    selectTournamentById(currentId);
    renderAll();
    notify('检测到比赛数据在另一窗口更新，已同步刷新！');
  });
}

function init() {
  readData();
  const requestedId = new URLSearchParams(location.search).get('tournament');
  selectTournamentById(requestedId);
  renderAll();
  bindEvents();
}

init();
