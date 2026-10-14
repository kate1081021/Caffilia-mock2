/*
 * 1ターン分の手を全部ためして、決め手 want で敵が倒れ、味方が誰も倒れない手順を探す（小さな盤面のデモ探し用）。
 *   node tests/lab_try.js labC5 オバケヤシキ [見つける数] [前の手 …（lab_show.js と同じ書き方）]
 */
var R = require('../rules.js');
var id = process.argv[2], want = process.argv[3], maxShow = Number(process.argv[4] || 3), lossOk = Number(process.env.LOSS || 0);
var p = R.findPreset(id); R.labApply(p.lab || [], p.labOpts);
if (process.env.LABOFF) process.env.LABOFF.split(',').forEach(function (k) { R.BALANCE.lab[k].on = false; });
var s0 = R.startBattle(R.loadPreset(id)).state;
process.argv.slice(5).forEach(function (a) {
  if (a === 'T') { s0 = R.endTurn(s0).state; return; }
  var m = a.split(':'), to = m[1].split(',').map(Number);
  var r = R.act(s0, m[0], { to: to, dir: m[2], shoot: m[3] !== 'wait' });
  if (!r.ok) throw new Error(a + ': ' + r.error);
  s0 = r.state;
  if (!s0.result && R.allAlliesActed(s0)) s0 = R.endTurn(s0).state;
});
var n0 = R.alliesOf(s0).length;
function opts(s, a) { var out = []; Object.keys(R.reachableCells(s, a.id)).forEach(function (k) { var to = k.split(',').map(Number); R.DIR_ORDER.forEach(function (d) { out.push({ id: a.id, to: to, dir: d }); }); out.push({ id: a.id, to: to, dir: a.facing, shoot: false }); }); return out; }
var found = 0, tried = 0;
function rec(s, seq, fin) {
  if (found >= maxShow) return;
  var left = R.alliesOf(s).filter(function (a) { return !a.acted && !a.npc; });
  if (!left.length || s.result || fin) {
    tried++;
    if (fin && R.alliesOf(s).length >= n0 - lossOk) { found++; console.log(seq.map(function (o) { return o.id + ':' + o.to.join(',') + ':' + o.dir + (o.shoot === false ? ':wait' : ''); }).join(' '), s.result || '', R.enemiesOf(s).map(function (e) { return e.id + ':' + e.hp; }).join(' ')); }
    return;
  }
  left.forEach(function (a) {
    opts(s, a).forEach(function (o) {
      var r = R.act(s, o.id, o); if (!r.ok) return;
      var f = r.events.some(function (e) { return e.type === 'finisher' && e.name.indexOf(want) >= 0; }) && r.events.some(function (e) { return e.type === 'death' && e.side === 'enemy'; });
      rec(r.state, seq.concat([o]), f);
    });
  });
}
rec(s0, [], false);
console.log('tried', tried, 'found', found);
