import {ROUND_NAMES, winner, champion, completedCount} from './tournament.js';

export {ROUND_NAMES};

export const STAGE_NAMES = Object.freeze({
  champion: '冠军',
  runner_up: '亚军',
  semi_final: '四强 (半决赛)',
  quarter_final: '八强 (1/4 决赛)',
  not_started: '尚未出战'
});

/**
 * 获取赛事状态：pending | in-progress | completed
 */
export function getTournamentStatus(tournament) {
  if (!tournament) return 'pending';
  if (champion(tournament)) return 'completed';
  return tournament.rounds ? 'in-progress' : 'pending';
}

/**
 * 获取亚军（决赛负者）
 */
export function runnerUp(tournament) {
  if (!tournament?.rounds || tournament.rounds.length < 3) return null;
  const finalMatch = tournament.rounds[2]?.[0];
  if (!finalMatch || !finalMatch.scores) return null;
  const champ = champion(tournament);
  return finalMatch.players.find(p => p && p !== champ) || null;
}

/**
 * 格式化净胜分字符串：+12, -5, 0
 */
export function formatPointDiff(diff) {
  if (diff > 0) return `+${diff}`;
  return String(diff);
}

/**
 * 计算全员最终排名（1 ~ 8 名）
 * 规则：
 * 1. 冠军：决赛胜者
 * 2. 亚军：决赛负者
 * 3. 3~4 名：半决赛负者。按净胜分高低排序；若相同，按总得分；若仍相同，按名单初始顺序。
 * 4. 5~8 名：四分之一决赛负者。按净胜分高低排序；若相同，按总得分；若仍相同，按初始顺序。
 */
export function calculateStandings(tournament) {
  if (!tournament || !Array.isArray(tournament.players)) return [];

  const players = tournament.players.filter(Boolean);
  const champ = champion(tournament);
  const runner = runnerUp(tournament);

  // 初始化每位选手的战绩桶
  const statsMap = new Map();
  players.forEach((name, index) => {
    statsMap.set(name, {
      name,
      seedIndex: index + 1,
      furthestRound: -1, // -1: 未开始, 0: 八强, 1: 半决赛, 2: 决赛
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      winRate: 0,
      stageLabel: STAGE_NAMES.not_started
    });
  });

  // 如果尚未生成对阵
  if (!tournament.rounds) {
    return players.map((name, i) => ({
      ...statsMap.get(name),
      rank: i + 1,
      pointDiffFormatted: '0',
      winRateFormatted: '0.0%'
    }));
  }

  // 遍历所有轮次记录统计数据
  tournament.rounds.forEach((round, r) => {
    round.forEach(m => {
      if (!m || !m.scores || !m.players.every(Boolean)) return;
      const [p0, p1] = m.players;
      const [s0, s1] = m.scores;

      const p0Stat = statsMap.get(p0);
      const p1Stat = statsMap.get(p1);

      if (p0Stat) {
        p0Stat.matchesPlayed++;
        p0Stat.pointsFor += s0;
        p0Stat.pointsAgainst += s1;
        p0Stat.furthestRound = Math.max(p0Stat.furthestRound, r);
        if (s0 > s1) p0Stat.wins++;
        else p0Stat.losses++;
      }

      if (p1Stat) {
        p1Stat.matchesPlayed++;
        p1Stat.pointsFor += s1;
        p1Stat.pointsAgainst += s0;
        p1Stat.furthestRound = Math.max(p1Stat.furthestRound, r);
        if (s1 > s0) p1Stat.wins++;
        else p1Stat.losses++;
      }
    });
  });

  // 计算每位选手的净胜分、胜率与止步阶段
  statsMap.forEach(stat => {
    stat.pointDiff = stat.pointsFor - stat.pointsAgainst;
    stat.winRate = stat.matchesPlayed > 0 ? (stat.wins / stat.matchesPlayed) * 100 : 0;

    if (champ && stat.name === champ) {
      stat.stageLabel = STAGE_NAMES.champion;
    } else if (runner && stat.name === runner) {
      stat.stageLabel = STAGE_NAMES.runner_up;
    } else if (stat.furthestRound === 1) {
      stat.stageLabel = STAGE_NAMES.semi_final;
    } else if (stat.furthestRound === 0) {
      stat.stageLabel = STAGE_NAMES.quarter_final;
    } else {
      stat.stageLabel = STAGE_NAMES.not_started;
    }
  });

  // 分层排序：
  // Tier 1: 冠军
  // Tier 2: 亚军
  // Tier 3: 止步半决赛者（按净胜分降序，再按得分降序，再按种子序）
  // Tier 4: 止步四分之一决赛者（按净胜分降序，再按得分降序，再按种子序）
  // Tier 5: 其余未参赛者
  const tierChamp = [];
  const tierRunner = [];
  const tierSemis = [];
  const tierQuarters = [];
  const tierOthers = [];

  statsMap.forEach(stat => {
    if (champ && stat.name === champ) {
      tierChamp.push(stat);
    } else if (runner && stat.name === runner) {
      tierRunner.push(stat);
    } else if (stat.furthestRound === 1) {
      tierSemis.push(stat);
    } else if (stat.furthestRound === 0) {
      tierQuarters.push(stat);
    } else {
      tierOthers.push(stat);
    }
  });

  const secondarySort = (a, b) => {
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return a.seedIndex - b.seedIndex;
  };

  tierSemis.sort(secondarySort);
  tierQuarters.sort(secondarySort);
  tierOthers.sort((a, b) => a.seedIndex - b.seedIndex);

  const ordered = [...tierChamp, ...tierRunner, ...tierSemis, ...tierQuarters, ...tierOthers];

  return ordered.map((item, index) => ({
    ...item,
    rank: index + 1,
    pointDiffFormatted: formatPointDiff(item.pointDiff),
    winRateFormatted: `${item.winRate.toFixed(1)}%`
  }));
}

/**
 * 追踪冠军的夺冠晋级历程（Champion's Road to Glory）
 */
export function getChampionJourney(tournament) {
  const champ = champion(tournament);
  if (!champ || !tournament?.rounds) return [];

  const journey = [];
  tournament.rounds.forEach((round, r) => {
    round.forEach((m, matchIndex) => {
      if (!m || !m.scores || !m.players.includes(champ)) return;
      const champIdx = m.players.indexOf(champ);
      const opponentIdx = 1 - champIdx;
      const opponent = m.players[opponentIdx] || '未知选手';
      const champScore = m.scores[champIdx];
      const oppScore = m.scores[opponentIdx];

      journey.push({
        roundIndex: r,
        roundName: ROUND_NAMES[r] || `第 ${r + 1} 轮`,
        matchIndex,
        champion: champ,
        opponent,
        championScore: champScore,
        opponentScore: oppScore,
        scoreText: `${champScore} : ${oppScore}`,
        margin: champScore - oppScore,
        isFinal: r === 2
      });
    });
  });

  return journey;
}

/**
 * 获取完整比赛明细清单（支持按轮次筛选）
 */
export function getMatchHistory(tournament, filterRound = 'all') {
  if (!tournament?.rounds) return [];

  const matches = [];
  tournament.rounds.forEach((round, r) => {
    if (filterRound !== 'all' && String(r) !== String(filterRound)) return;
    round.forEach((m, i) => {
      const ready = m.players && m.players.every(Boolean);
      const completed = Boolean(m.scores && m.scores.length === 2);
      const win = winner(m);
      const lose = completed ? m.players.find(p => p !== win) : null;
      const scoreDiff = completed ? Math.abs(m.scores[0] - m.scores[1]) : 0;

      matches.push({
        id: `r${r}-m${i}`,
        roundIndex: r,
        roundName: ROUND_NAMES[r] || `第 ${r + 1} 轮`,
        matchNumber: i + 1,
        players: [m.players[0] || '待定', m.players[1] || '待定'],
        scores: m.scores || null,
        scoreText: completed ? `${m.scores[0]} : ${m.scores[1]}` : '未开始',
        winner: win,
        loser: lose,
        scoreDiff,
        isCompleted: completed,
        isReady: ready,
        statusText: completed ? '已完赛' : ready ? '待录入' : '等待晋级'
      });
    });
  });

  return matches;
}

/**
 * 获取赛事统计数据洞察（宏观指标、最悬殊对决、最高分比赛等）
 */
export function getTournamentAnalytics(tournament) {
  if (!tournament) {
    return {
      totalMatches: 7,
      completedMatches: 0,
      completionRate: 0,
      totalPoints: 0,
      averageMatchPoints: 0,
      highestScoringMatch: null,
      closestMatch: null,
      champion: null,
      runnerUp: null
    };
  }

  const allMatches = getMatchHistory(tournament, 'all');
  const completed = allMatches.filter(m => m.isCompleted);
  const totalMatches = allMatches.length || 7;
  const completedMatches = completed.length;
  const completionRate = Math.round((completedMatches / totalMatches) * 100);

  let totalPoints = 0;
  let highestScoringMatch = null;
  let maxMatchPoints = -1;
  let closestMatch = null;
  let minDiff = Infinity;

  completed.forEach(m => {
    const sum = m.scores[0] + m.scores[1];
    totalPoints += sum;

    if (sum > maxMatchPoints) {
      maxMatchPoints = sum;
      highestScoringMatch = m;
    }

    if (m.scoreDiff < minDiff) {
      minDiff = m.scoreDiff;
      closestMatch = m;
    }
  });

  const averageMatchPoints = completedMatches > 0 ? (totalPoints / completedMatches).toFixed(1) : 0;

  return {
    totalMatches,
    completedMatches,
    completionRate,
    totalPoints,
    averageMatchPoints,
    highestScoringMatch,
    closestMatch,
    champion: champion(tournament),
    runnerUp: runnerUp(tournament)
  };
}

/**
 * 生成可分享和打印的赛事完整纯文本战报
 */
export function generateTextSummary(tournament) {
  if (!tournament) return '无赛事数据';

  const champ = champion(tournament);
  const runner = runnerUp(tournament);
  const standings = calculateStandings(tournament);
  const journey = getChampionJourney(tournament);
  const analytics = getTournamentAnalytics(tournament);

  const lines = [
    '==================================================',
    `【赛事战报】${tournament.name}`,
    `赛制：8 人单淘汰赛    状态：${champ ? '已圆满结束' : '比赛进行中'}`,
    `生成时间：${new Date().toLocaleString('zh-CN')}`,
    '==================================================',
    ''
  ];

  if (champ) {
    lines.push('🏆【赛事荣誉殿堂】');
    lines.push(`  🥇 冠  军：${champ}`);
    if (runner) lines.push(`  🥈 亚  军：${runner}`);
    if (standings.length >= 3 && standings[2].stageLabel === STAGE_NAMES.semi_final) {
      lines.push(`  🥉 季  军：${standings[2].name}`);
    }
    lines.push('');

    if (journey.length > 0) {
      lines.push('🔥【冠军晋级之路】');
      journey.forEach(step => {
        lines.push(`  • ${step.roundName}：${step.champion} 以 ${step.scoreText} 战胜 ${step.opponent}`);
      });
      lines.push('');
    }
  } else {
    lines.push(`ℹ️【赛事进度】已完成 ${analytics.completedMatches} / ${analytics.totalMatches} 场（${analytics.completionRate}%），冠军尚未产生。`);
    lines.push('');
  }

  lines.push('📊【最终全员排名榜单】');
  lines.push('名次 | 选手姓名        | 阶段成绩       | 胜-负 | 得失分   | 净胜分 | 胜率');
  lines.push('-----+-----------------+----------------+-------+----------+--------+-------');
  standings.forEach(s => {
    const rankStr = String(s.rank).padEnd(4, ' ');
    const nameStr = s.name.padEnd(14, ' ');
    const stageStr = s.stageLabel.padEnd(13, ' ');
    const recordStr = `${s.wins}-${s.losses}`.padEnd(5, ' ');
    const ptsStr = `${s.pointsFor}/${s.pointsAgainst}`.padEnd(9, ' ');
    const diffStr = s.pointDiffFormatted.padStart(5, ' ');
    const rateStr = s.winRateFormatted.padStart(6, ' ');
    lines.push(`${rankStr} | ${nameStr} | ${stageStr} | ${recordStr} | ${ptsStr} | ${diffStr} | ${rateStr}`);
  });
  lines.push('');

  lines.push('📝【全场比赛比分记录】');
  tournament.rounds?.forEach((round, r) => {
    lines.push(`【${ROUND_NAMES[r]}】`);
    round.forEach((m, i) => {
      const p1 = m.players[0] || '待定';
      const p2 = m.players[1] || '待定';
      const score = m.scores ? m.scores.join(' : ') : '未完成';
      const win = winner(m) || '待定';
      lines.push(`  第 ${i + 1} 场：${p1} vs ${p2}  |  比分：${score}  |  胜者：${win}`);
    });
    lines.push('');
  });

  lines.push('📈【赛事趣味统计】');
  lines.push(`  • 赛事总得分：${analytics.totalPoints} 分（场均 ${analytics.averageMatchPoints} 分）`);
  if (analytics.highestScoringMatch) {
    const hm = analytics.highestScoringMatch;
    lines.push(`  • 最高得分对决：${hm.roundName} ${hm.players[0]} vs ${hm.players[1]}（合计 ${hm.scores[0] + hm.scores[1]} 分，比分 ${hm.scoreText}）`);
  }
  if (analytics.closestMatch) {
    const cm = analytics.closestMatch;
    lines.push(`  • 最激烈决战：${cm.roundName} ${cm.players[0]} vs ${cm.players[1]}（分差仅 ${cm.scoreDiff} 分，比分 ${cm.scoreText}）`);
  }
  lines.push('==================================================');

  return lines.join('\r\n');
}

/**
 * 导出排名表为 CSV 格式
 */
export function generateCsvExport(tournament) {
  const standings = calculateStandings(tournament);
  const rows = [
    ['排名', '选手姓名', '止步轮次', '胜场', '负场', '总得分', '总失分', '净胜分', '胜率']
  ];
  standings.forEach(s => {
    rows.push([
      s.rank,
      `"${s.name.replace(/"/g, '""')}"`,
      `"${s.stageLabel}"`,
      s.wins,
      s.losses,
      s.pointsFor,
      s.pointsAgainst,
      s.pointDiff,
      s.winRateFormatted
    ]);
  });
  return rows.map(r => r.join(',')).join('\r\n');
}
