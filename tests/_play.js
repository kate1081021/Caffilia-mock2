// 手で手順を試す（調べもの用）: node tests/_play.js シナリオid '[[["P1",[x,y],"up"],...], ...]'
var R = require('../game/rules.js');
var show = require('./_show.js');
var id = process.argv[2], turns = JSON.parse(process.argv[3] || '[]');
var s = R.startBattle(R.loadPreset(id)).state;
function intents(s) {
  return R.enemiesOf(s).map(function (e) { return e.name + '(' + e.x + ',' + e.y + ')' + (e.intent ? R.DIRS[e.facing].name : '-'); }).join(' ');
}
console.log(show(s)); console.log('  ' + intents(s) + ' | ' + R.missionInfo(s).status.join(' / '));
turns.forEach(function (t, i) {
  if (s.result) return;
  console.log('== ターン' + s.turn);
  t.forEach(function (a) {
    if (s.result) return;
    var r = R.act(s, a[0], { to: a[1], dir: a[2], shoot: a[3] });
    if (!r.ok) { console.log('  !! ' + a[0] + ': ' + r.error); return; }
    r.events.forEach(function (e) { if (e.type !== 'move') console.log('  ' + e.text); });
    s = r.state;
  });
  if (!s.result) { var r2 = R.endTurn(s); r2.events.forEach(function (e) { if (/damage|death|result|wagon|fireSpread|finisher|treasure|cast|move/.test(e.type) && e.side !== 'enemy' || e.type === 'cast' || e.type==='result') console.log('  ' + e.text); }); s = r2.state; }
  console.log(show(s)); console.log('  ' + intents(s) + ' | ' + R.missionInfo(s).status.join(' / '));
});
