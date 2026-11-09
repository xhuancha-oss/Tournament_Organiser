import test from 'node:test';
import assert from 'node:assert/strict';
import {createTournament, startTournament, recordScore, champion} from '../dist/tournament.js';
import {
  getTournamentStatus,
  runnerUp,
  calculateStandings,
  getChampionJourney,
  getMatchHistory,
  getTournamentAnalytics,
  generateTextSummary,
  generateCsvExport,
  STAGE_NAMES
} from '../dist/tournament-results-model.js';

const players = ['选手1', '选手2', '选手3', '选手4', '选手5', '选手6', '选手7', '选手8'];

test('status detection works across pending, in-progress and completed', () => {
  const tDraft = createTournament('测试赛', 'id-1');
  assert.equal(getTournamentStatus(tDraft), 'pending');

  let tStarted = startTournament(tDraft, players);
  assert.equal(getTournamentStatus(tStarted), 'in-progress');
  assert.equal(runnerUp(tStarted), null);

  // 完成四分之一决赛
  for (let i = 0; i < 4; i++) {
    tStarted = recordScore(tStarted, 0, i, 11, 5);
  }
  assert.equal(getTournamentStatus(tStarted), 'in-progress');

  // 完成半决赛
  tStarted = recordScore(tStarted, 1, 0, 11, 6);
  tStarted = recordScore(tStarted, 1, 1, 11, 7);
  assert.equal(getTournamentStatus(tStarted), 'in-progress');

  // 完成决赛
  tStarted = recordScore(tStarted, 2, 0, 12, 10);
  assert.equal(getTournamentStatus(tStarted), 'completed');
  assert.equal(champion(tStarted), '选手1');
  assert.equal(runnerUp(tStarted), '选手5');
});

test('calculateStandings accurately ranks champion, runner-up, semis and quarter-finalists', () => {
  let t = startTournament(createTournament('网球大师赛', 't-tennis'), [
    '张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十'
  ]);

  // Round 0 (Quarter-finals):
  // 张三(11) vs 李四(3) -> 张三胜, 李四净胜分 -8
  // 王五(11) vs 赵六(9) -> 王五胜, 赵六净胜分 -2 (在首轮败者中表现最好)
  // 钱七(11) vs 孙八(5) -> 钱七胜, 孙八净胜分 -6
  // 周九(11) vs 吴十(1) -> 周九胜, 吴十净胜分 -10
  t = recordScore(t, 0, 0, 11, 3);
  t = recordScore(t, 0, 1, 11, 9);
  t = recordScore(t, 0, 2, 11, 5);
  t = recordScore(t, 0, 3, 11, 1);

  // Round 1 (Semi-finals):
  // 张三(11) vs 王五(8) -> 张三胜, 王五净胜分: +2(第0轮) + (-3)(第1轮) = -1
  // 钱七(11) vs 周九(4) -> 钱七胜, 周九净胜分: +10(第0轮) + (-7)(第1轮) = +3
  t = recordScore(t, 1, 0, 11, 8);
  t = recordScore(t, 1, 1, 11, 4);

  // Round 2 (Final):
  // 张三(15) vs 钱七(13) -> 张三夺冠！钱七亚军！
  t = recordScore(t, 2, 0, 15, 13);

  const standings = calculateStandings(t);
  assert.equal(standings.length, 8);

  // 验证第1名: 冠军 张三 (全胜 3-0)
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[0].name, '张三');
  assert.equal(standings[0].stageLabel, STAGE_NAMES.champion);
  assert.equal(standings[0].wins, 3);
  assert.equal(standings[0].losses, 0);
  assert.equal(standings[0].pointsFor, 11 + 11 + 15);

  // 验证第2名: 亚军 钱七 (2胜1负)
  assert.equal(standings[1].rank, 2);
  assert.equal(standings[1].name, '钱七');
  assert.equal(standings[1].stageLabel, STAGE_NAMES.runner_up);
  assert.equal(standings[1].wins, 2);
  assert.equal(standings[1].losses, 1);

  // 验证第3名与第4名: 周九(+3) vs 王五(-1)
  // 周九净胜分高于王五，因此周九获得季军(第3名)，王五获第4名
  assert.equal(standings[2].rank, 3);
  assert.equal(standings[2].name, '周九');
  assert.equal(standings[2].stageLabel, STAGE_NAMES.semi_final);
  assert.equal(standings[3].rank, 4);
  assert.equal(standings[3].name, '王五');
  assert.equal(standings[3].stageLabel, STAGE_NAMES.semi_final);

  // 验证第5~8名（四分之一决赛败者，按净胜分排序）:
  // 赵六(-2) > 孙八(-6) > 李四(-8) > 吴十(-10)
  assert.equal(standings[4].rank, 5);
  assert.equal(standings[4].name, '赵六');
  assert.equal(standings[5].rank, 6);
  assert.equal(standings[5].name, '孙八');
  assert.equal(standings[6].rank, 7);
  assert.equal(standings[6].name, '李四');
  assert.equal(standings[7].rank, 8);
  assert.equal(standings[7].name, '吴十');
});

test('champion journey traces all steps from quarter-final to final', () => {
  let t = startTournament(createTournament('羽毛球锦标赛', 't-badminton'), players);
  for (let i = 0; i < 4; i++) t = recordScore(t, 0, i, 21, 15);
  t = recordScore(t, 1, 0, 21, 18);
  t = recordScore(t, 1, 1, 21, 19);
  t = recordScore(t, 2, 0, 23, 21); // 选手1 胜 选手5

  const journey = getChampionJourney(t);
  assert.equal(journey.length, 3);
  assert.equal(journey[0].roundName, '四分之一决赛');
  assert.equal(journey[0].opponent, '选手2');
  assert.equal(journey[0].scoreText, '21 : 15');

  assert.equal(journey[1].roundName, '半决赛');
  assert.equal(journey[1].opponent, '选手3');
  assert.equal(journey[1].scoreText, '21 : 18');

  assert.equal(journey[2].roundName, '决赛');
  assert.equal(journey[2].opponent, '选手5');
  assert.equal(journey[2].scoreText, '23 : 21');
  assert.equal(journey[2].isFinal, true);
});

test('match history and tournament analytics calculate proper stats', () => {
  let t = startTournament(createTournament('乒乓争霸', 't-stats'), players);
  t = recordScore(t, 0, 0, 11, 2); // 分差 9
  t = recordScore(t, 0, 1, 12, 10); // 分差 2, 总分 22

  const all = getMatchHistory(t, 'all');
  assert.equal(all.length, 7);
  assert.equal(all[0].isCompleted, true);
  assert.equal(all[2].isCompleted, false);

  const qfOnly = getMatchHistory(t, '0');
  assert.equal(qfOnly.length, 4);

  const stats = getTournamentAnalytics(t);
  assert.equal(stats.completedMatches, 2);
  assert.equal(stats.totalPoints, (11 + 2) + (12 + 10));
  assert.equal(stats.highestScoringMatch.scoreText, '12 : 10');
  assert.equal(stats.closestMatch.scoreDiff, 2);
});

test('generateTextSummary and generateCsvExport produce formatted output', () => {
  let t = startTournament(createTournament('校际杯', 't-export'), players);
  for (let i = 0; i < 4; i++) t = recordScore(t, 0, i, 11, 4);
  t = recordScore(t, 1, 0, 11, 8);
  t = recordScore(t, 1, 1, 11, 9);
  t = recordScore(t, 2, 0, 11, 7);

  const text = generateTextSummary(t);
  assert.match(text, /【赛事战报】校际杯/);
  assert.match(text, /🥇 冠  军：选手1/);
  assert.match(text, /🥈 亚  军：选手5/);
  assert.match(text, /最终全员排名榜单/);
  assert.match(text, /全场比赛比分记录/);

  const csv = generateCsvExport(t);
  assert.match(csv, /排名,选手姓名,止步轮次/);
  assert.match(csv, /"选手1","冠军"/);
});
