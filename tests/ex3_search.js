/*
 * 展示ステージ③: 何ターン目に勝てるかを総当たりで探す（調整用）。  node tests/ex3_search.js [step|chain|instant] [ターン数]
 *   山 → 火 → 風 の順に構える（撃つ）手だけを探す（ほかの順では1ターンに3段は起きない）。
 *   1ターン目に勝てる手の数と、その一例を出す。ターン数を2にすると、1ターン目は「動くだけ（待機）」の手も含めて2ターンで探す。
 */
var R = require('../rules.js');
var B = require('../balance.js');
var mode = process.argv[2] || 'chain';
var turns = Number(process.argv[3] || 1);
B.turnMode = mode === 'instant' ? 'single' : 'simul';
B.simul.stepwise = mode === 'step';

function byMagic(s, m) { return R.controllableOf(s).filter(function (a) { return a.magic === m; })[0]; }
function options(s, u) {
  var out = [];
  Object.keys(R.reachableCells(s, u.id)).forEach(function (k) {
    var p = k.split(',').map(Number);
    R.DIR_ORDER.forEach(function (d) { out.push({ to: p, dir: d }); });
  });
  return out;
}
// 1ターン: 山 → 火 → 風 の順に打つ。勝てた手を返す
function winsThisTurn(s0, limit) {
  var wins = [];
  var e0 = byMagic(s0, 'mount');
  options(s0, e0).forEach(function (oe) {
    if (wins.length >= limit) return;
    var r1 = R.act(s0, e0.id, { to: oe.to, dir: oe.dir });
    if (!r1.ok || r1.state.result) return;
    var s1 = r1.state, f1 = byMagic(s1, 'fire');
    options(s1, f1).forEach(function (of) {
      if (wins.length >= limit) return;
      var r2 = R.act(s1, f1.id, { to: of.to, dir: of.dir });
      if (!r2.ok || r2.state.result) return;
      var s2 = r2.state, w2 = byMagic(s2, 'wind');
      options(s2, w2).forEach(function (ow) {
        if (wins.length >= limit) return;
        var r3 = R.act(s2, w2.id, { to: ow.to, dir: ow.dir });
        if (!r3.ok) return;
        var s3 = r3.state;
        if (!s3.result) { var t = R.endTurn(s3); s3 = t.state; }
        if (s3.result === 'win') wins.push([['山', oe.to, oe.dir], ['火', of.to, of.dir], ['風', ow.to, ow.dir]]);
      });
    });
  });
  return wins;
}
var s = R.startBattle(R.loadPreset('ex3')).state;
var t0 = Date.now();
var w = winsThisTurn(s, 1000000);
console.log('形: ' + mode + '  1ターン目に勝てる手: ' + w.length + (w.length ? '  例: ' + JSON.stringify(w[0]) : '') + '  (' + (Date.now() - t0) + 'ms)');
