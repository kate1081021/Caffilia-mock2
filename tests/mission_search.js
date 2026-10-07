/*
 * お題の手を探す（設計者向けの分析）。  node tests/mission_search.js [シナリオid] [ターン数] [幅]
 *   1ターンずつ、味方1人の行動を足していくビームサーチ。3人とも行動したらターン終了して、お題ごとの点で残す。
 *   見つけた手順と、手ごとに「敵のいないところに撃ったか」「何の自然を作った・壊したか」を出す。
 *   module として読むと search(state, opts) が使える（playtest.js から）。
 */
var R = require('../rules.js');

function key(x, y) { return x + ',' + y; }

// 味方1人の行動の候補（立ち位置 × 向き × 撃つ/待機）
function options(s, a) {
  var out = [];
  Object.keys(R.reachableCells(s, a.id)).forEach(function (k) {
    var to = k.split(',').map(Number);
    if (R.canShoot(s, a, to)) R.DIR_ORDER.forEach(function (d) { out.push({ id: a.id, to: to, dir: d, shoot: true }); });
    out.push({ id: a.id, to: to, dir: a.facing, shoot: false });
  });
  return out;
}

function dist(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); }

// 盤面の点（大きいほど良い）。次のターンの敵の予告で受けるダメージも引く
function score(s) {
  if (s.result === 'win') return 1e9 - s.turn * 1000;
  if (s.result === 'lose') return -1e9;
  var type = (s.mission && s.mission.type) || 'annihilate';
  var fc = R.forecast(s);
  var threat = {};
  fc.enemyDamage.concat(fc.burn).forEach(function (d) { threat[d.id] = (threat[d.id] || 0) + d.amount; });
  var v = 0;
  R.alliesOf(s).forEach(function (a) { v += 3000; if ((threat[a.id] || 0) >= a.hp) v -= 2500; });
  R.enemiesOf(s).forEach(function (e) { v -= e.hp * 30; });
  // 的から遠い敵ほど良い（的の隣のマスまで、敵が自分の足で行ける道のり）
  var targets = R.missionTargets(s);
  if (targets.length) {
    R.enemiesOf(s).forEach(function (e) {
      var goal = {};
      targets.forEach(function (t) { R.DIR_ORDER.forEach(function (d) { goal[key(t.x + R.DIRS[d].dx, t.y + R.DIRS[d].dy)] = true; }); });
      var seen = {}, q = [[e.x, e.y, 0]], found = 9;
      seen[key(e.x, e.y)] = true;
      while (q.length) {
        var c = q.shift();
        if (goal[key(c[0], c[1])]) { found = c[2]; break; }
        R.DIR_ORDER.forEach(function (d) {
          var nx = c[0] + R.DIRS[d].dx, ny = c[1] + R.DIRS[d].dy, k = key(nx, ny);
          if (seen[k] || !R.inBounds(s, nx, ny) || !R.canEnter(e, R.getTile(s, nx, ny))) return;
          var o = R.unitAt(s, nx, ny);
          if (o && o !== e) return;
          seen[k] = true; q.push([nx, ny, c[2] + 1]);
        });
      }
      v += Math.min(found, 9) * 1200;
    });
  }
  if (type === 'defense') {
    R.objectsOf(s, 'village').forEach(function (o) { v += 20000; if ((threat[o.id] || 0) >= o.hp) v -= 30000; });
    v += s.turn * 500;
  } else if (type === 'escort') {
    var w = R.objectsOf(s, 'wagon')[0];
    if (w) {
      v += w.hp * 3000;
      if ((threat[w.id] || 0) >= w.hp) v -= 40000;
      var r = R.wagonRoute(s);
      v -= (r && r.steps !== null ? r.steps : 12) * 2500;
    }
  } else if (type === 'retrieve') {
    var m = s.mission, c = R.carrierOf(s);
    if (c) {
      v += 20000;
      if ((threat[c.id] || 0) >= c.hp) v -= 30000;
      var best = Math.min.apply(null, m.exit.map(function (e) { return dist(e, [c.x, c.y]); }));
      v -= best * 2000;
    } else if (m.treasure) {
      var near = Math.min.apply(null, R.alliesOf(s).map(function (a) { return dist(m.treasure, [a.x, a.y]); }));
      v -= near * 1500;
    }
  }
  return v;
}

// 1ターン分のビームサーチ。返り値: [{ state, acts }]（点の高い順）
function searchTurn(s0, width) {
  var beam = [{ state: s0, acts: [] }];
  var n = R.alliesOf(s0).filter(function (a) { return !a.acted; }).length;
  for (var step = 0; step < n; step++) {
    var next = [], seen = {};
    beam.forEach(function (b) {
      if (b.state.result) { next.push(b); return; }
      R.alliesOf(b.state).filter(function (a) { return !a.acted; }).forEach(function (a) {
        options(b.state, a).forEach(function (o) {
          var r = R.act(b.state, o.id, o);
          if (!r.ok) return;
          var st = r.state;
          var sig = JSON.stringify([st.tiles, st.units.map(function (u) { return [u.id, u.x, u.y, u.hp, u.acted]; }), st.mission]);
          if (seen[sig]) return;
          seen[sig] = true;
          next.push({ state: st, acts: b.acts.concat([o]), sc: st.result ? score(st) : null });
        });
      });
    });
    // 途中も「残りの味方が待機してターン終了したら」の点で比べる（敵が動いて出す次の予告まで見る）
    next.forEach(function (b) { if (b.sc === null || b.sc === undefined) b.sc = b.state.result ? score(b.state) : score(R.endTurn(b.state).state); });
    next.sort(function (a, b) { return b.sc - a.sc; });
    beam = next.slice(0, width);
  }
  // ターン終了まで進めて点を付け直す
  var done = beam.map(function (b) {
    var st = b.state;
    if (!st.result) st = R.endTurn(st).state;
    return { state: st, acts: b.acts, sc: score(st) };
  });
  done.sort(function (a, b) { return b.sc - a.sc; });
  return done;
}

// turns ターン先まで、1ターンずつ一番良い手を選んで進める（貪欲。各ターンの中はビーム）
function search(s0, opts) {
  opts = opts || {};
  var turns = opts.turns || 8, width = opts.width || 40;
  var s = s0, plan = [];
  for (var t = 0; t < turns && !s.result; t++) {
    var best = searchTurn(s, width)[0];
    if (!best) break;
    plan.push({ turn: s.turn, acts: best.acts, before: s });
    s = best.state;
  }
  return { state: s, plan: plan };
}

// 手の中身: 敵のいないところに撃ったか（形のマスに敵がいない）、作った・壊した自然
function describe(before, act) {
  var u = R.findUnit(before, act.id);
  var r = R.act(before, act.id, act);
  var label = R.unitLabel(before, u) + ' (' + act.to + ') ' + (act.shoot === false ? '待機' : R.DIRS[act.dir].name + 'へ撃つ');
  if (act.shoot === false) return { text: label, state: r.state };
  var cast = r.events.filter(function (e) { return e.type === 'cast'; })[0];
  var cells = (cast && cast.cells) || [];
  var enemyIn = cells.some(function (c) { var o = R.unitAt(before, c[0], c[1]); return o && o.side === 'enemy'; });
  var made = {}, broke = {};
  for (var i = 0; i < before.tiles.length; i++) {
    if (before.tiles[i] !== r.state.tiles[i]) {
      if (r.state.tiles[i] !== 'empty') made[R.tileName(r.state.tiles[i])] = (made[R.tileName(r.state.tiles[i])] || 0) + 1;
      if (before.tiles[i] !== 'empty') broke[R.tileName(before.tiles[i])] = (broke[R.tileName(before.tiles[i])] || 0) + 1;
    }
  }
  var fin = r.events.filter(function (e) { return e.type === 'finisher'; }).map(function (e) { return e.name; });
  var fmt = function (o) { return Object.keys(o).map(function (k) { return k + o[k]; }).join(' '); };
  return {
    text: label + (enemyIn ? '［敵に当てる］' : '［敵のいない所］') + (fmt(made) ? ' 作る:' + fmt(made) : '') + (fmt(broke) ? ' 変わる:' + fmt(broke) : '') + (fin.length ? ' 決め手:' + fin.join('・') : ''),
    noEnemy: !enemyIn, state: r.state
  };
}

module.exports = { search: search, searchTurn: searchTurn, describe: describe, score: score };

if (require.main === module) {
  var id = process.argv[2] || 'mDefense';
  var turns = Number(process.argv[3]) || 8;
  var width = Number(process.argv[4]) || 40;
  var show = require('./_show.js');
  var s0 = R.startBattle(R.loadPreset(id)).state;
  console.log('■ ' + id + '（' + R.missionInfo(s0).name + '）  幅' + width);
  console.log(show(s0));
  var t0 = Date.now();
  var res = search(s0, { turns: turns, width: width });
  res.plan.forEach(function (p) {
    console.log('-- ターン' + p.turn);
    var st = p.before;
    p.acts.forEach(function (a) { var d = describe(st, a); console.log('  ' + d.text); st = d.state; });
  });
  console.log(show(res.state));
  console.log('結果: ' + (res.state.resultText || '決着せず') + '  / ' + R.missionInfo(res.state).status.join(' / ') + '  (' + (Date.now() - t0) + 'ms)');
  // demos.js にそのまま貼れる形
  console.log('turns: ' + JSON.stringify(res.plan.map(function (p) {
    return p.acts.map(function (a) { var o = { id: a.id, to: a.to, dir: a.dir }; if (a.shoot === false) o.shoot = false; return o; });
  })));
}
