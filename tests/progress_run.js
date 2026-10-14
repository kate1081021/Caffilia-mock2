/*
 * 進行モックの1周を、自動プレイで最初から最後まで回す（設計者向け。1周の長さの目安）。  node tests/progress_run.js
 *   進め方は決め打ち: おすすめの魔法を先に、足りなければ風・火・草…の順で連れていく。並べる順は6通り試して勝てる順。強化は候補の1つ目。
 *   クエスト制は「新しい魔法がもらえる寄り道 → おいしい寄り道（なければ簡単） → キー」。SEEDS=種の数、MODE=simul で一斉
 */
var B = require('../balance.js');
var P = require('../progress.js');
var D = require('../progress_data.js');
var A = require('./autoplay.js');
var R = require('../rules.js');

if (process.env.MODE === 'simul') B.turnMode = 'simul';
var PREF = ['wind', 'fire', 'grass', 'earth', 'water'];

function chooseTeam(run, e) {
  var mags = run.party.map(function (p) { return p.magic; });
  var want = e.recommend.filter(function (m) { return mags.indexOf(m) >= 0; });
  PREF.forEach(function (m) { if (want.length < 3 && mags.indexOf(m) >= 0 && want.indexOf(m) < 0) want.push(m); });
  return want.map(function (m) { return run.party.filter(function (p) { return p.magic === m; })[0].id; });
}
function fight(run, e) {
  var team = chooseTeam(run, e);
  var perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]], best = null;
  perms.some(function (pm) {
    var ids = pm.map(function (i) { return team[i]; });
    var r = A.play(P.buildBattle(run, e.battle, ids), { turns: Number(process.env.TURNS) || 12, beam: 8 });
    if (!best || r.result === 'win') best = { r: r, ids: ids };
    return r.result === 'win';
  });
  var st = P.startBattle(run, e.ref, best.ids);
  return { run: P.finishBattle(st.run, best.r.result === 'win' ? 'win' : 'lose', { turns: best.r.turns }).run, turns: best.r.turns, result: best.r.result };
}
function pickQuest(run) {
  var av = P.available(run), sides = av.filter(function (e) { return e.type !== 'key'; });
  var withMagic = sides.filter(function (e) { return e.magic && !P.owned(run, e.magic); })[0];
  var rich = sides.filter(function (e) { return e.type === 'rich'; })[0];
  return withMagic || rich || sides[0] || av.filter(function (e) { return e.type === 'key'; })[0];
}

function oneRun(mode, seed) {
  var run = P.newRun(mode, seed), turns = 0, log = [];
  for (var guard = 0; guard < 20 && !run.over; guard++) {
    var e = mode === 'quest' ? pickQuest(run) : P.available(run)[0];
    if (!e) break;
    var f = fight(run, e);
    run = f.run; turns += f.turns;
    log.push(D.battles[e.battle].name + (f.result === 'win' ? '○' : '×') + f.turns);
    if (run.offer) run = P.claimReward(run, run.offer.candidates.length ? 0 : -1).run;
  }
  return { over: run.over, battles: run.history.length, turns: turns, log: log.join(' '), party: run.party.map(function (p) { return R.magicName(p.magic); }).join('') };
}

var n = Number(process.env.SEEDS) || 3;
['quest', 'stage'].forEach(function (mode) {
  for (var s = 1; s <= n; s++) {
    var t0 = Date.now(), r = oneRun(mode, s);
    console.log((mode === 'quest' ? 'クエスト制' : 'ステージ制') + ' 種' + s + ': ' + r.over + '、戦闘 ' + r.battles + '、ターンの合計 ' + r.turns + '、仲間 ' + r.party + '  ' + r.log + '  (' + Math.round((Date.now() - t0) / 1000) + 's)');
  }
});
