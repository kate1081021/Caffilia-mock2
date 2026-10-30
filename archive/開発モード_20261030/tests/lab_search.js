/*
 * ラボ用シナリオで、スーパープレイ（デモ）の手を探す（設計者向け）。
 *   node tests/lab_search.js labC1 [ターン数] [幅] [探したい決め手の名前]
 * シナリオの lab（と needs）をオンにしてから、mission_search.js のビームサーチで探す。
 * 決め手の名前を渡すと、その決め手が起きた手に点を足す（見せたい瞬間を探すため）。
 */
var R = require('../rules.js');
var MS = require('./mission_search.js');

var id = process.argv[2];
var turns = Number(process.argv[3]) || 3;
var width = Number(process.argv[4]) || 30;
var want = process.argv[5] || null;
var p = R.findPreset(id);
if (!p) { console.log('シナリオがない: ' + id); process.exit(1); }
R.labApply(p.lab || [], p.labOpts);

// 見せたい決め手が起きた手に点を足す
if (want) {
  var orig = MS.score;
  var R0 = R.act;
  R.act = function (s, uid, o) {
    var r = R0(s, uid, o);
    if (r.ok && r.events.some(function (e) { return e.type === 'finisher' && e.name.indexOf(want) >= 0; })) r.state.labWantHit = (s.labWantHit || 0) + 1;
    return r;
  };
}

var s0 = R.startBattle(R.loadPreset(id)).state;
var res = MS.search(s0, { turns: turns, width: width });
var all = [];
res.plan.forEach(function (p2) {
  console.log('-- ターン' + p2.turn);
  var st = p2.before;
  p2.acts.forEach(function (a) { var d = MS.describe(st, a); console.log('  ' + d.text); st = d.state; });
});
console.log('結果: ' + (res.state.resultText || '決着せず') + ' 味方' + R.alliesOf(res.state).length + '人');
console.log('turns: ' + JSON.stringify(res.plan.map(function (p2) {
  return p2.acts.map(function (a) { var o = { id: a.id, to: a.to, dir: a.dir }; if (a.shoot === false) o.shoot = false; return o; });
})));
