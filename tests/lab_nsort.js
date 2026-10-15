/*
 * ラボ N: ミッションの仕分けを確かめる（どの属性が、どのミッションを取りやすいか）。  node tests/lab_nsort.js [盤面の id …] [--pairs]
 *   盤面ごとに、44のミッションを全部ねらいにして、1ターン目の手を全部ためす（道は0から。変化していない魔法で）。
 *     1手: 味方1人の 移動先 × 向き（撃つ）→ ターン終了（敵の番に決まるミッションも見る）
 *     2手（--pairs）: 味方2人の手を続けて → ターン終了（盤面の id のうしろに :1 を付けると、その盤面だけ1手。敵の行き先 D2 の盤面は重いので）
 *   ミッションを取った魔法（属性）を数え、仕分け（lab_change.js の SORT）のやりたいことと合う属性が取った割合を出す。
 *   勝ったときに決まるミッション（誰も倒されずに・村を守り切る …）は1ターンでは決まらないので、数えない。
 */
var R = require('../rules.js');
var LCH = require('../lab_change.js');

var args = process.argv.slice(2);
var pairs = args.indexOf('--pairs') >= 0;
var ids = args.filter(function (a) { return a[0] !== '-'; });
// 味方の組がちがう盤面（草火風・草土水・風水火・土風水・火風土・土水風）
if (!ids.length) ids = ['labN1', 'labN2', 'labN3', 'labN4', 'labMd', 'labMn', 'labMe', 'labMf2'];

var ATTR = ['fire', 'grass', 'water', 'wind', 'earth'];
var NAME = { fire: '火', grass: '草', water: '水', wind: '風', earth: '土' };
var count = {}, plays = {}, boardsWith = {};

function allActions(s, uid) {
  var out = [], u = R.findUnit(s, uid);
  if (!u) return out;
  Object.keys(R.reachableCells(s, uid)).forEach(function (k) {
    var c = k.split(',').map(Number);
    R.DIR_ORDER.forEach(function (d) { out.push({ id: uid, to: [c[0], c[1]], dir: d }); });
  });
  return out;
}
function record(st, board) {
  (st.labTargets || []).forEach(function (t) {
    if (!t.got || !t.got.by || t.got.by.side !== 'ally') return;
    var m = t.got.by.magic, k = t.id;
    count[k] = count[k] || {};
    count[k][m] = (count[k][m] || 0) + 1;
  });
}
function finish(st) {
  if (!st.result) { try { st = R.endTurn(st).state; } catch (e) { return st; } }
  return st;
}

ids.forEach(function (id0) {
  var id = id0.split(':')[0], single = id0.split(':')[1] === '1';
  var p = R.findPreset(id);
  if (!p) { console.log('盤面がない: ' + id); return; }
  R.labApply(['N0'].concat((p.lab || []).filter(function (x) { return x !== 'M0' && x !== 'L0'; })), p.labOpts);
  var s0 = R.startBattle(R.loadPreset(id)).state;
  var LL = R.LX.L;
  s0.units.forEach(function (u) { if (u.side === 'ally' && LL.pathDef(u.magic)) u.labPath = LL.newPath(u.magic); });
  // 44のミッションを全部ねらいに（この盤面で出せないものは除く）
  s0.labTargets = LL.N.MISSIONS().filter(function (d) { return !(d.check && d.check.end) && d.id !== 'hitCell'; })
    .map(function (d) { return LL.targetDef(d.id); })
    .filter(function (t) { return t && (!t.needsVillage || R.objectsOf(s0, 'village').length) && (t.check.kind !== 'blocked' || R.lab('D2')) && (!t.needsGrow || R.BALANCE.grow.enabled); });
  s0.labTargets.forEach(function (t) { t.got = null; });
  var allies = R.alliesOf(s0).filter(function (u) { return !u.npc; }).map(function (u) { return u.id; });
  var mags = R.alliesOf(s0).map(function (u) { return u.magic; });
  mags.forEach(function (m) { boardsWith[m] = (boardsWith[m] || 0) + 1; });
  var n = 0, t0 = Date.now();
  allies.forEach(function (a) {
    allActions(s0, a).forEach(function (x) {
      var r = R.act(s0, x.id, { to: x.to, dir: x.dir });
      if (!r.ok) return;
      n++;
      record(finish(r.state), id);
      if (!pairs || single || r.state.result) return;
      allies.forEach(function (b) {
        if (b === a) return;
        allActions(r.state, b).forEach(function (y) {
          var r2 = R.act(r.state, y.id, { to: y.to, dir: y.dir });
          if (!r2.ok) return;
          n++;
          record(finish(r2.state), id);
        });
      });
    });
  });
  plays[id] = n;
  console.log(id + '（' + p.name + '）味方 ' + mags.map(function (m) { return NAME[m] || m; }).join('・') + ': ' + n + '通り（' + Math.round((Date.now() - t0) / 1000) + '秒）');
});

// 表: ミッション → 仕分け → 取った属性の数 → 合う属性の割合
console.log('\n| 番号 | ミッション | 仕分け | ' + ATTR.map(function (m) { return NAME[m]; }).join(' | ') + ' | 合う属性が取った割合 |');
console.log('|---|---|---|' + ATTR.map(function () { return '---'; }).join('|') + '|---|');
var list = LL_missions();
function LL_missions() { R.labApply(['N0']); return R.LX.L.N.MISSIONS().slice().sort(function (a, b) { return a.no - b.no; }); }
list.forEach(function (d) {
  var want = LCH.SORT[d.id] || 'free', c = count[d.id] || {}, tot = 0, fit = 0;
  ATTR.forEach(function (m) { tot += c[m] || 0; if (want === 'free' || LCH.ATTR[m] === want) fit += c[m] || 0; });
  var end = d.check && d.check.end;
  console.log('| ' + d.no + ' | ' + d.name + ' | ' + LCH.WANTS[want].name + ' | ' + ATTR.map(function (m) { return c[m] || ''; }).join(' | ') + ' | ' +
    (end ? '（勝ったときに決まる）' : tot ? Math.round(100 * fit / tot) + '%（' + tot + '）' : '取れなかった') + ' |');
});
console.log('\n盤面に出た回数: ' + ATTR.map(function (m) { return NAME[m] + ' ' + (boardsWith[m] || 0); }).join('・'));
