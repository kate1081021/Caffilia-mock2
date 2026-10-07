/*
 * 初期シナリオを rules.js で何通りか試して、遊び心地を数字で見る（設計者向けの分析）。
 *   node tests/playtest.js
 * 1. 1ターン目の全探索: 3人の行動の順番・立ち位置・向き（待機も含む）を全部試す
 * 2. 何もしない場合: 敵だけが動くと何ターンで全滅するか
 * 3. かんたんな自動プレイ: 1人ずつ「敵へのダメージが大きく、味方が傷つかず、敵の予告で狙われない」手を選ぶ
 *    お題（防衛・護衛・奪取）のシナリオでは代わりに、mission_search.js の探索を幅を変えて回す（勝率は参考）
 * ONLY=シナリオid で1つだけ見られる。
 */
var R = require('../rules.js');
var BAL = require('../balance.js');
// IDEAS_OFF=1 で、試し中の小さなシナジー（balance.js の ideas）を全部切ってくらべられる
if (process.env.IDEAS_OFF) Object.keys(BAL.ideas).forEach(function (k) { BAL.ideas[k] = false; });
console.log('小さなシナジー（ideas）: ' + (process.env.IDEAS_OFF ? 'すべて切った' : 'すべて入れた'));

var DIRS = R.DIR_ORDER;

// 味方1人の行動の候補（立ち位置 × 向き × 撃つ/待機）
function options(s, ally) {
  var out = [];
  var reach = R.reachableCells(s, ally.id);
  Object.keys(reach).forEach(function (k) {
    var to = k.split(',').map(Number);
    DIRS.forEach(function (d) { out.push({ to: to, dir: d, shoot: true }); });
    out.push({ to: to, dir: ally.facing, shoot: false });
  });
  return out;
}

function enemyHp(s) { return R.enemiesOf(s).reduce(function (n, e) { return n + e.hp; }, 0); }
function allyHp(s) { return R.alliesOf(s).reduce(function (n, a) { return n + a.hp; }, 0); }
function finishers(events) { return events.filter(function (e) { return e.type === 'finisher'; }).map(function (e) { return e.name; }); }

// ---------------------------------------------------------------
// 1. 1ターン目の全探索
// ---------------------------------------------------------------
function searchTurn1(s0) {
  var best = { dmg: -1, seq: null }, stats = { leaves: 0, finisherLeaves: 0, selfKillLeaves: 0, finisherOptions: {} };
  var startEnemy = enemyHp(s0), startAllies = R.alliesOf(s0).length;
  function dfs(s, seq, fins) {
    var rest = R.alliesOf(s).filter(function (a) { return !a.acted; });
    if (!rest.length || s.result) {
      stats.leaves++;
      var dmg = startEnemy - enemyHp(s);
      var lost = startAllies - R.alliesOf(s).length;
      if (fins.length) stats.finisherLeaves++;
      if (lost) stats.selfKillLeaves++;
      var score = dmg - lost * 100;
      if (score > best.dmg) best = { dmg: score, enemyDmg: dmg, lost: lost, seq: seq.slice(), fins: fins.slice() };
      return;
    }
    rest.forEach(function (a) {
      options(s, a).forEach(function (o) {
        var r = R.act(s, a.id, o);
        if (!r.ok) return;
        var f = finishers(r.events);
        f.forEach(function (n) { stats.finisherOptions[n] = (stats.finisherOptions[n] || 0) + 1; });
        seq.push(R.unitLabel(s, a) + (o.shoot ? ' (' + o.to + ')' + o.dir : ' 待機'));
        dfs(r.state, seq, fins.concat(f));
        seq.pop();
      });
    });
  }
  dfs(s0, [], []);
  return { best: best, stats: stats };
}

// ---------------------------------------------------------------
// 2. 何もしない
// ---------------------------------------------------------------
function passive(s0, maxTurns) {
  var s = s0, firstLoss = null;
  for (var t = 1; t <= maxTurns && !s.result; t++) {
    var before = R.alliesOf(s).length;
    s = R.endTurn(s).state;
    if (firstLoss === null && R.alliesOf(s).length < before) firstLoss = t;
  }
  return { turns: s.turn - 1, result: s.result, resultText: s.resultText, firstLoss: firstLoss, allies: R.alliesOf(s).length };
}

// ---------------------------------------------------------------
// 3. かんたんな自動プレイ
// ---------------------------------------------------------------
function greedyGame(s0, maxTurns) {
  var s = s0;
  var log = { finishers: {}, allyLost: 0, enemyFireUsed: 0, turns: 0, result: null, friendlyFire: 0 };
  var enemyMade = {};   // 敵の火でできた炎・小さな炎の位置
  for (var t = 1; t <= maxTurns && !s.result; t++) {
    var order = R.alliesOf(s).map(function (a) { return a.id; });
    order.forEach(function (id) {
      var a = R.findUnit(s, id);
      if (!a || a.acted || s.result) return;
      var bestR = null, bestScore = -Infinity;
      options(s, a).forEach(function (o) {
        var r = R.act(s, id, o);
        if (!r.ok) return;
        var dmg = enemyHp(s) - enemyHp(r.state);
        var allyLoss = allyHp(s) - allyHp(r.state);
        var f = R.forecast(r.state);
        var danger = f.enemyDamage.filter(function (d) { return d.side === 'ally'; }).reduce(function (n, d) { return n + d.amount; }, 0) +
          f.burn.filter(function (b) { var u = R.findUnit(r.state, b.id); return u && u.side === 'ally'; }).length * 2;
        var score = dmg * 2 - allyLoss * 6 - danger * 3 + (finishers(r.events).length ? 3 : 0) + Math.random() * 0.5;
        if (score > bestScore) { bestScore = score; bestR = r; }
      });
      if (!bestR) return;
      var lostBefore = R.alliesOf(s).length;
      bestR.events.forEach(function (e) {
        if (e.type === 'finisher') {
          log.finishers[e.name] = (log.finishers[e.name] || 0) + 1;
          if (e.name === '燃え広がり' && enemyMade[e.cells[0][0] + ',' + e.cells[0][1]]) log.enemyFireUsed++;
        }
        if (e.type === 'damage' && e.side === 'ally') log.friendlyFire++;
      });
      s = bestR.state;
      log.allyLost += lostBefore - R.alliesOf(s).length;
    });
    if (s.result) break;
    var lost = R.alliesOf(s).length;
    var tr = R.endTurn(s);
    tr.events.forEach(function (e) {
      if (e.type === 'cast' && e.side === 'enemy') {
        e.cells.forEach(function (c) {
          var tl = R.getTile(tr.state, c[0], c[1]);
          if (tl === 'fire' || tl === 'smallfire') enemyMade[c[0] + ',' + c[1]] = true;
        });
      }
    });
    s = tr.state;
    log.allyLost += lost - R.alliesOf(s).length;
  }
  log.turns = s.turn;
  log.result = s.result || '決着せず';
  return log;
}

// ---------------------------------------------------------------
var targets = [{ id: '', name: '標準（火・水・風）', state: R.startBattle(R.createState()).state }].concat(
  R.PRESETS.map(function (p) { return { id: p.id, name: p.name, mission: p.mission, state: R.startBattle(R.loadPreset(p.id)).state }; }));
if (process.env.ONLY !== undefined) targets = targets.filter(function (t) { return t.id === process.env.ONLY; });
var MS = require('./mission_search.js');

// お題: 探索を幅を変えて回し、勝ち・ターン数・「敵のいない所に撃った手」の割合を見る
function missionRuns(t) {
  var widths = [3, 6, 10], wins = 0, turns = [], shots = 0, empty = 0;
  widths.forEach(function (w) {
    var res = MS.search(t.state, { turns: 10, width: w });
    if (res.state.result === 'win') { wins++; turns.push(res.state.turn); }
    res.plan.forEach(function (pl) {
      var st = pl.before;
      pl.acts.forEach(function (a) { var d = MS.describe(st, a); if (a.shoot !== false) { shots++; if (d.noEnemy) empty++; } st = d.state; });
    });
  });
  console.log('[お題の探索 ×' + widths.length + '（幅 ' + widths.join('・') + '）] 勝ち ' + wins + (turns.length ? '（ターン ' + turns.join('・') + '）' : '') +
    '、撃った手 ' + shots + ' のうち敵のいない所 ' + empty + '（' + (shots ? (empty / shots * 100).toFixed(0) : 0) + '%）');
}

targets.forEach(function (t) {
  console.log('\n================ ' + t.name + ' ================');
  var t0 = Date.now();
  var sr = searchTurn1(t.state);
  console.log('[1ターン目の全探索] ' + sr.stats.leaves + ' 通り（' + ((Date.now() - t0) / 1000).toFixed(1) + '秒）');
  console.log('  決め手が1つ以上起きる手順: ' + sr.stats.finisherLeaves + ' 通り（' + (sr.stats.finisherLeaves / sr.stats.leaves * 100).toFixed(1) + '%）');
  console.log('  味方が自分たちの魔法で倒れる手順: ' + sr.stats.selfKillLeaves + ' 通り（' + (sr.stats.selfKillLeaves / sr.stats.leaves * 100).toFixed(1) + '%）');
  console.log('  最善: 敵へのダメージ ' + sr.best.enemyDmg + '、味方の損失 ' + sr.best.lost + '、決め手 ' + (sr.best.fins.join('・') || 'なし'));
  console.log('    ' + sr.best.seq.join(' → '));

  var p = passive(t.state, 12);
  console.log('[何もしない] ' + (p.result ? 'ターン' + (p.turns + 1) + 'で「' + p.resultText + '」' : '12ターン後も味方 ' + p.allies + '人') +
    (p.firstLoss !== null ? '（最初に味方が倒れるのはターン' + p.firstLoss + '）' : '（味方は倒れない）'));

  if (t.mission) { missionRuns(t); return; }
  var runs = 20, wins = 0, losses = 0, turnsSum = 0, lostSum = 0, fin = {}, enemyFire = 0, ff = 0;
  for (var i = 0; i < runs; i++) {
    var g = greedyGame(t.state, 15);
    if (g.result === 'win') { wins++; turnsSum += g.turns; }
    if (g.result === 'lose') losses++;
    lostSum += g.allyLost;
    enemyFire += g.enemyFireUsed;
    ff += g.friendlyFire;
    Object.keys(g.finishers).forEach(function (k) { fin[k] = (fin[k] || 0) + g.finishers[k]; });
  }
  console.log('[かんたんな自動プレイ ×' + runs + '] 勝ち ' + wins + ' / 負け ' + losses + ' / 決着せず ' + (runs - wins - losses) +
    (wins ? '、勝つまで平均 ' + (turnsSum / wins).toFixed(1) + 'ターン' : '') + '、倒れた味方 平均 ' + (lostSum / runs).toFixed(1) + '人');
  console.log('  決め手（20戦合計）: ' + (Object.keys(fin).map(function (k) { return k + ' ' + fin[k]; }).join('、') || 'なし') +
    '、うち敵の火を起点にした燃え広がり ' + enemyFire + '、味方への味方の直撃・巻き込み ' + ff);
});
