/*
 * 育つ・縮尺（IMPROVE_grow）の見本ごとに、広場を自動で遊んで数字を出す（設計者向け）。
 *   node tests/grow_measure.js            … 見本5つ × 自動プレイ（1手先・乱数なし）と探索（ビーム）
 *   ONLY=large node tests/grow_measure.js … 1つだけ
 *   WIDTH=6 TURNS=8                       … 探索の幅とターン数（初期値 6・8）
 * 出す数字（IMPROVE_grow 5章）:
 *   遠さ（敵の予告が初めて味方に当たるターン／味方の魔法が初めて敵に届くターン）、すかすか度（1・3・5ターン目の、空き以外のマスの割合）、
 *   一気に変わる度（1発で変わったマス数の平均・最大、育つ一手で変わったマス数）、決め手が初めて入ったターン、勝ち負けとターン、
 *   育てた回数・一段のまま使った回数、山の押し出しで動いた回数（敵・味方）、敵から3マス以上離れた所に自然を作った手の割合
 */
var R = require('../rules.js');
var B = require('../balance.js');
var T = require('./../tune.js');
var MS = require('./mission_search.js');

var WIDTH = Number(process.env.WIDTH || 6), TURNS = Number(process.env.TURNS || 8);

function setPath(k, v) { var ps = k.split('.'), last = ps.pop(); ps.reduce(function (o, p) { return o[p]; }, B)[last] = v; }
function withSet(set, fn) {
  var saved = {};
  Object.keys(set).forEach(function (k) { saved[k] = T.getPath(B, k); setPath(k, set[k]); });
  try { return fn(); } finally { Object.keys(saved).forEach(function (k) { setPath(k, saved[k]); }); }
}
function enemyHp(s) { return R.enemiesOf(s).reduce(function (n, e) { return n + e.hp; }, 0); }
function allyHp(s) { return R.alliesOf(s).reduce(function (n, a) { return n + a.hp; }, 0); }
function nonEmpty(s) { return s.tiles.filter(function (t) { return t !== 'empty'; }).length / s.tiles.length; }
function options(s, a) {
  var out = [];
  Object.keys(R.reachableCells(s, a.id)).sort().forEach(function (k) {
    var to = k.split(',').map(Number);
    R.DIR_ORDER.forEach(function (d) { out.push({ id: a.id, to: to, dir: d, shoot: true }); });
    out.push({ id: a.id, to: to, dir: a.facing, shoot: false });
  });
  return out;
}
// 一段のまま使った（育てずに使った）手の目印
var ONE_STAGE = [
  ['丘の源流', /丘に当たって川になった/], ['水たまりの蜃気楼', /水たまりが蜃気楼になった/], ['丘の桜', /丘に桜が咲いた/],
  ['草むらの燃え広がり', /草むら\d+マスも燃えた/], ['丘の高台', null]
];

// 1手ぶんの記録をとる
function newStats() {
  return { shots: 0, changed: [], growChanged: [], grows: {}, oneStage: {}, pushes: { enemy: 0, ally: 0 }, natureShots: 0, farNature: 0,
    firstFinisher: null, finishers: {}, firstThreat: null, firstReach: null, density: {}, result: null, turn: null, allyLost: 0 };
}
function recordShot(st, before, r, a) {
  var after = r.state;
  var changed = 0, made = [];
  for (var i = 0; i < before.tiles.length; i++) {
    if (before.tiles[i] !== after.tiles[i]) { changed++; if (before.tiles[i] === 'empty') made.push([i % before.size, Math.floor(i / before.size)]); }
  }
  st.shots++;
  st.changed.push(changed);
  r.events.forEach(function (e) {
    if (e.type === 'cast' && e.grows && e.grows.length) {
      var n = e.grows.reduce(function (t, g) { return t + g.cells.length; }, 0);
      st.growChanged.push(n);
      e.grows.forEach(function (g) { st.grows[g.tile] = (st.grows[g.tile] || 0) + 1; });
    }
    if (e.type === 'push' && e.ok && /盛り上がる/.test(e.text || '')) {
      var u = R.findUnit(before, e.id);
      if (u) st.pushes[u.side === 'ally' ? 'ally' : 'enemy']++;
    }
    if (e.type === 'finisher') { if (st.firstFinisher === null) st.firstFinisher = before.turn; st.finishers[e.name] = st.finishers[e.name] || ('ターン' + before.turn); }
    ONE_STAGE.forEach(function (o) { if (o[1] && o[1].test(e.text || '')) st.oneStage[o[0]] = (st.oneStage[o[0]] || 0) + 1; });
  });
  var me = R.findUnit(before, a.id);
  if (me && R.getTile(before, me.x, me.y) === 'hill') st.oneStage['丘の高台'] = (st.oneStage['丘の高台'] || 0) + 1;
  if (made.length) {
    st.natureShots++;
    var foes = R.enemiesOf(before);
    if (made.every(function (c) { return foes.every(function (f) { return Math.abs(f.x - c[0]) + Math.abs(f.y - c[1]) >= 3; }); })) st.farNature++;
  }
}
// ターンの始め: すかすか度・遠さ
function turnStart(st, s) {
  if ([1, 3, 5].indexOf(s.turn) >= 0) st.density[s.turn] = nonEmpty(s);
  if (st.firstThreat === null && R.forecast(s).enemyDamage.some(function (d) { return d.side === 'ally'; })) st.firstThreat = s.turn;
  if (st.firstReach === null) {
    var hp0 = enemyHp(s);
    var reach = R.alliesOf(s).some(function (a) {
      return !a.acted && options(s, a).some(function (o) { if (!o.shoot) return false; var r = R.act(s, a.id, o); return r.ok && enemyHp(r.state) < hp0; });
    });
    if (reach) st.firstReach = s.turn;
  }
}

// 自動プレイ（1手先だけ読む。乱数なし: 同点なら先に見つけた手）
function greedy(s0) {
  var st = newStats(), s = s0, allies0 = R.alliesOf(s0).length;
  for (var t = 0; t < TURNS && !s.result; t++) {
    turnStart(st, s);
    R.alliesOf(s).map(function (a) { return a.id; }).forEach(function (id) {
      var a = R.findUnit(s, id);
      if (!a || a.acted || s.result) return;
      var best = null, bestScore = -Infinity;
      options(s, a).forEach(function (o) {
        var r = R.act(s, id, o);
        if (!r.ok) return;
        var f = R.forecast(r.state);
        var danger = f.enemyDamage.filter(function (d) { return d.side === 'ally'; }).reduce(function (n, d) { return n + d.amount; }, 0);
        var sc = (enemyHp(s) - enemyHp(r.state)) * 2 - (allyHp(s) - allyHp(r.state)) * 6 - danger * 3 +
          (r.events.some(function (e) { return e.type === 'finisher'; }) ? 3 : 0);
        if (sc > bestScore) { bestScore = sc; best = { r: r, a: a }; }
      });
      if (!best) return;
      recordShot(st, s, best.r, best.a);
      s = best.r.state;
    });
    if (!s.result) s = R.endTurn(s).state;
  }
  st.result = s.result || '決着せず'; st.turn = s.turn; st.allyLost = allies0 - R.alliesOf(s).length;
  return st;
}
// 探索（ビーム。mission_search.js）で選んだ手を、同じ順に打ち直して記録する
function beam(s0) {
  var st = newStats(), allies0 = R.alliesOf(s0).length;
  var plan = MS.search(s0, { turns: TURNS, width: WIDTH }).plan;
  var s = s0;
  plan.forEach(function (p) {
    if (s.result) return;
    turnStart(st, s);
    p.acts.forEach(function (o) {
      if (s.result) return;
      var a = R.findUnit(s, o.id);
      var r = R.act(s, o.id, o);
      if (!r.ok) return;
      if (o.shoot !== false) recordShot(st, s, r, a);
      s = r.state;
    });
    if (!s.result) s = R.endTurn(s).state;
  });
  st.result = s.result || '決着せず'; st.turn = s.turn; st.allyLost = allies0 - R.alliesOf(s).length;
  return st;
}

function avg(a) { return a.length ? (a.reduce(function (t, x) { return t + x; }, 0) / a.length) : 0; }
function pct(x) { return x === undefined ? '-' : Math.round(x * 100) + '%'; }
function show(name, st) {
  var one = Object.keys(st.oneStage).map(function (k) { return k + st.oneStage[k]; }).join('・') || 'なし';
  var grows = Object.keys(st.grows).map(function (k) { return R.tileName(k) + st.grows[k]; }).join('・') || 'なし';
  console.log('  ' + name + ': ' + (st.result === 'win' ? '勝ち' : st.result === 'lose' ? '負け' : '決着せず') + '（ターン' + st.turn + '、味方の損失' + st.allyLost + '）');
  console.log('    遠さ: 敵の予告が初めて味方に当たる ターン' + (st.firstThreat || '-') + '／味方の魔法が初めて敵に届く ターン' + (st.firstReach || '-') +
    '／決め手が初めて入った ターン' + (st.firstFinisher || '-') + '（' + (Object.keys(st.finishers).map(function (k) { return k + ' ' + st.finishers[k]; }).join('・') || 'なし') + '）');
  console.log('    すかすか度（空き以外）: 1ターン目 ' + pct(st.density[1]) + '・3ターン目 ' + pct(st.density[3]) + '・5ターン目 ' + pct(st.density[5]));
  console.log('    一気に変わる度: 1発で変わったマス 平均' + avg(st.changed).toFixed(1) + '・最大' + Math.max.apply(null, st.changed.concat([0])) +
    '／育つ一手で変わったマス 平均' + avg(st.growChanged).toFixed(1) + '・最大' + Math.max.apply(null, st.growChanged.concat([0])));
  console.log('    育てた回数: ' + grows + '／一段のまま使った: ' + one + '／山の押し出し: 敵' + st.pushes.enemy + '・味方' + st.pushes.ally);
  console.log('    敵から3マス以上離れた所に自然を作った手: ' + st.farNature + '/' + st.natureShots + '（' + (st.natureShots ? Math.round(st.farNature / st.natureShots * 100) : 0) + '%）');
}

var worlds = T.WORLDS.filter(function (w) { return !process.env.ONLY || w.id === process.env.ONLY; });
console.log('見本ごとの広場（探索: 幅' + WIDTH + '・' + TURNS + 'ターン）');
worlds.forEach(function (w) {
  withSet(w.set, function () {
    var s0 = R.startBattle(R.loadPreset('plaza')).state;
    console.log('\n■ ' + w.name);
    var t0 = Date.now();
    show('自動プレイ（1手先）', greedy(s0));
    show('探索（ビーム）', beam(s0));
    console.log('    （' + Math.round((Date.now() - t0) / 1000) + '秒）');
  });
});
