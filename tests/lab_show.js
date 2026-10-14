/*
 * ラボ用シナリオの盤面を文字で出す（シナリオを作るときの確認用）。
 *   node tests/lab_show.js labC1            … 戦闘開始（敵の移動と予告のあと）の盤面
 *   node tests/lab_show.js labC1 P1:2,5:up  … 続けて手を打つ（id:x,y:向き。待機は id:x,y:向き:wait、ターン終了は T）
 */
var R = require('../rules.js');

var id = process.argv[2];
var p = R.findPreset(id);
if (!p) { console.log('シナリオがない: ' + id); process.exit(1); }
R.labApply(p.lab || [], p.labOpts);

var LETTER = {};
Object.keys(R.TILE_INFO).forEach(function (t) { LETTER[t] = R.TILE_INFO[t].label || '・'; });
LETTER.empty = '・';

function show(s, title) {
  console.log('---- ' + title + '（ターン' + s.turn + (s.result ? ' ' + s.result : '') + '）');
  var rows = R.rowsOf(s);
  var head = '   ';
  for (var x = 0; x < s.size; x++) head += ' ' + x + ' ';
  console.log(head);
  for (var y = 0; y < rows; y++) {
    var line = (y < 10 ? ' ' : '') + y + ' ';
    for (var x2 = 0; x2 < s.size; x2++) {
      var u = R.unitAt(s, x2, y);
      var t = LETTER[R.getTile(s, x2, y)] || '?';
      if (u) {
        var c = u.side === 'enemy' ? u.letter : u.side === 'object' ? '村' : R.magicName(u.magic);
        line += '[' + c + ']';
      } else line += ' ' + t + ' ';
    }
    console.log(line);
  }
  s.units.forEach(function (u) {
    console.log('  ' + u.id + ' ' + R.unitLabel(s, u) + ' (' + u.x + ',' + u.y + ') ' + u.facing + ' HP' + u.hp + (u.intent ? ' 予告中' : '') + (u.stuck ? ' 足止め' : ''));
  });
  (s.labTargets || []).forEach(function (t) {   // ラボ L: ターゲットと取った手
    console.log('  ターゲット ' + t.id + '（' + t.dir + '）: ' + (t.got ? (t.got.by ? t.got.by.magic : t.got.cands.map(function (h) { return h.magic; }).join('/')) + ' ' + (t.got.how || '') : 'まだ'));
  });
  s.units.forEach(function (u) { if (u.labPath && R.lab('L0')) console.log('  道 ' + u.id + ' ' + R.LX.L.pathMarks(u.magic, u.labPath) + (u.labPath.awake ? ' 覚醒' + u.labPath.awake : '')); });
  var fc = R.forecast(s);
  fc.enemies.forEach(function (e) {
    console.log('  予告 ' + e.id + ': ' + e.dir + ' ' + e.magic + ' → ' + (e.finishers || []).map(function (f) { return f.name; }).join(',') +
      ' dmg ' + (e.damages || []).map(function (d) { return d.id + ':' + d.amount; }).join(','));
  });
}

var s = R.startBattle(R.loadPreset(id)).state;
show(s, id + ' 開始');
process.argv.slice(3).forEach(function (a) {
  if (a === 'T') { var e = R.endTurn(s); e.events.forEach(function (ev) { console.log('  ' + ev.text); }); s = e.state; show(s, 'ターン終了'); return; }
  var m = a.split(':');
  var to = m[1].split(',').map(Number);
  var r = R.act(s, m[0], { to: to, dir: m[2], shoot: m[3] !== 'wait' });
  if (!r.ok) { console.log('  ✘ ' + a + ': ' + r.error); return; }
  r.events.forEach(function (ev) { console.log('  ' + ev.text); });
  s = r.state;
  if (!s.result && R.allAlliesActed(s)) { var t = R.endTurn(s); t.events.forEach(function (ev) { console.log('  ' + ev.text); }); s = t.state; }
  show(s, a);
});
