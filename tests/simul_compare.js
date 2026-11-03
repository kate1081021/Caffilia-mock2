/*
 * ターンの形（1人ずつ／一斉）をくらべる記録（IMPROVE_simul 5章）。  node tests/simul_compare.js
 *   今あるシナリオ（チュートリアル3つ・お題・戦闘）を、両方の形で同じ自動プレイ（ビーム探索）で回し、数を出す。
 *   - 決め手が初めて敵に入ったターン
 *   - 1ターンで3段目まで通した回数（ターンの始めに3段目の材料がなく、そのターンの味方の手で3段目の決め手が起きた）
 *   - 敵から3マス以上離れたマスに自然を作った手の割合（関係ないところに撃つ）
 *   - 味方が倒れた数
 *   自動プレイは参考（人の遊び方ではない）。どちらの形も同じ探索・同じ点数のつけ方。ONLY=シナリオid、TURNS=最大ターン数、BEAM=幅
 */
var R = require('../game/rules.js');
var B = require('../game/balance.js');

var MAX_TURNS = Number(process.env.TURNS) || 8;
var BEAM = Number(process.env.BEAM) || 5;
var THIRD = { '桜吹雪': true, 'センタクキ': true, 'オバケヤシキ': true, '火炎竜巻': true };
var THIRD_MATERIAL = { sakura: true, hillsakura: true, volcano: true, firewhirl: true, tornado: true, deadforest: true };
var MATERIAL = { forest: 1, mountain: 1, river: 1, puddle: 1, smallfire: 2, fire: 2, sakura: 4, volcano: 3, firewhirl: 4, deadforest: 4, breeze: 1 };

function options(s, u) {
  var out = [];
  Object.keys(R.reachableCells(s, u.id)).forEach(function (k) {
    var to = k.split(',').map(Number);
    R.DIR_ORDER.forEach(function (d) { out.push({ to: to, dir: d }); });
    out.push({ to: to, dir: u.facing, shoot: false });
  });
  return out;
}
function enemyHp(s) { return R.enemiesOf(s).reduce(function (n, e) { return n + e.hp; }, 0); }

// 点数: このターンの味方の手と、敵の発動・ターン終了まで（forecast）で起きること
function score(s, s0) {
  var fc = R.forecast(s);
  var eh0 = enemyHp(s0), dmg = {}, sc = 0;
  R.enemiesOf(s0).forEach(function (e) { var now = R.findUnit(s, e.id); dmg[e.id] = e.hp - (now ? now.hp : 0); });
  fc.enemyDamage.concat(fc.burn).forEach(function (d) { if (dmg[d.id] !== undefined) dmg[d.id] += d.amount; });
  Object.keys(dmg).forEach(function (id) { var e = R.findUnit(s0, id); var d = Math.min(e.hp, dmg[id]); sc += d; if (d >= e.hp) sc += 30; });
  var allyLoss = 0;
  R.alliesOf(s0).forEach(function (a) {
    var now = R.findUnit(s, a.id), hp = now ? now.hp : 0;
    fc.enemyDamage.concat(fc.burn).forEach(function (d) { if (d.id === a.id) hp -= d.amount; });
    if (hp <= 0) allyLoss += 100; else allyLoss += (a.hp - hp) * 10;
  });
  // 材料（自然）を作った分を少し足す（組み立ての途中でも差がつくように。両方の形で同じ）
  var after = R.simulOn() ? R.fireAllStances(s).after : s;
  for (var i = 0; i < after.tiles.length; i++) if (after.tiles[i] !== s0.tiles[i]) sc += (MATERIAL[after.tiles[i]] || 0) * 0.3;
  if (s.result === 'win' || (R.simulOn() && R.fireAllStances(s).after.result === 'win')) sc += 500;
  return sc - allyLoss + (eh0 ? 0 : 0);
}

// 1ターンの手を探す: 味方を好きな順に1人ずつ、ビーム幅 BEAM
function planTurn(s0) {
  var beam = [{ s: s0, seq: [], sc: 0 }];
  var n = R.controllableOf(s0).length;
  for (var step = 0; step < n; step++) {
    var next = [];
    beam.forEach(function (b) {
      if (b.s.result) { next.push(b); return; }
      R.controllableOf(b.s).filter(function (a) { return !a.acted; }).forEach(function (a) {
        options(b.s, a).forEach(function (o) {
          var r = R.act(b.s, a.id, o);
          if (!r.ok) return;
          next.push({ s: r.state, seq: b.seq.concat([{ id: a.id, to: o.to, dir: o.dir, shoot: o.shoot }]), sc: score(r.state, s0) });
        });
      });
    });
    next.sort(function (x, y) { return y.sc - x.sc; });
    beam = next.slice(0, BEAM);
    if (!beam.length) break;
  }
  return beam[0] ? beam[0].seq : [];
}

function far(s, cells) {
  var en = R.enemiesOf(s);
  if (!en.length) return false;
  return cells.every(function (c) { return en.every(function (e) { return Math.abs(e.x - c[0]) + Math.abs(e.y - c[1]) >= 3; }); });
}
function created(before, after, size) {
  var out = [];
  for (var i = 0; i < after.length; i++) if (after[i] !== before[i] && after[i] !== 'empty') out.push([i % size, Math.floor(i / size)]);
  return out;
}

function run(id, mode) {
  B.turnMode = mode;
  var s = R.startBattle(R.loadPreset(id)).state;
  var m = { firstFinisherTurn: null, third: 0, natureActs: 0, farActs: 0, allyDeaths: 0, result: null, turns: 0 };
  for (var t = 1; t <= MAX_TURNS && !s.result; t++) {
    var hadThird = s.tiles.some(function (x) { return THIRD_MATERIAL[x]; });
    var seq = planTurn(s), allyEv = [], third = false;
    seq.forEach(function (a) {
      if (s.result) return;
      var before = s.tiles.slice(), sb = s;
      var r = R.act(s, a.id, a);
      if (!r.ok) return;
      s = r.state;
      allyEv = allyEv.concat(r.events);
      if (mode === 'single' && a.shoot !== false) {
        var cr = created(before, s.tiles, s.size);
        if (cr.length) { m.natureActs++; if (far(sb, cr)) m.farActs++; }
      }
    });
    var endEv = [];
    if (!s.result) {
      var prev = s.tiles.slice(), prevState = s;
      var te = R.endTurn(s);
      te.steps.forEach(function (st) {
        var cast = st.events.filter(function (e) { return e.type === 'cast' && e.order; })[0];
        if (cast && mode === 'simul') {
          var cr2 = created(prev, st.state.tiles, st.state.size);
          if (cr2.length) { m.natureActs++; if (far(prevState, cr2)) m.farActs++; }
        }
        prev = st.state.tiles.slice(); prevState = st.state;
      });
      // 敵の発動の見出しの前までが味方の手（一斉: 構えの発動、1人ずつ: 構える味方の発動）
      var cut = te.events.length;
      te.events.forEach(function (e, i) { if (cut === te.events.length && (e.type === 'phase' && /敵/.test(e.text) || e.type === 'turnEnd')) cut = i; });
      allyEv = allyEv.concat(te.events.slice(0, cut));
      endEv = te.events.slice(cut);
      s = te.state;
    }
    if (m.firstFinisherTurn === null && allyEv.some(function (e) { return e.type === 'damage' && e.side === 'enemy' && (e.src === 'finisher' || e.src === 'weakfire'); })) m.firstFinisherTurn = t;
    if (!hadThird && allyEv.some(function (e) { return e.type === 'finisher' && THIRD[e.name]; })) third = true;
    if (third) m.third++;
    m.allyDeaths += allyEv.concat(endEv).filter(function (e) { return e.type === 'death' && e.side === 'ally'; }).length;
    m.turns = t;
  }
  m.result = s.result || '決着せず';
  B.turnMode = 'single';
  return m;
}

var ids = R.TUTORIALS.map(function (t) { return t.id; }).concat(R.PRESETS.filter(function (p) { return !p.hidden && !p.recipe; }).map(function (p) { return p.id; }));
if (process.env.ONLY) ids = [process.env.ONLY];
var total = { single: { ff: [], third: 0, nat: 0, far: 0, deaths: 0, wins: 0 }, simul: { ff: [], third: 0, nat: 0, far: 0, deaths: 0, wins: 0 } };
console.log('ビーム幅 ' + BEAM + '・最大 ' + MAX_TURNS + 'ターン');
console.log('シナリオ | 形 | 結果(ターン) | 決め手が初めて敵に | 1ターンで3段目 | 離れた所に自然 | 味方が倒れた');
ids.forEach(function (id) {
  ['single', 'simul'].forEach(function (mode) {
    var t0 = Date.now(), m = run(id, mode), T = total[mode];
    T.ff.push(m.firstFinisherTurn); T.third += m.third; T.nat += m.natureActs; T.far += m.farActs; T.deaths += m.allyDeaths; if (m.result === 'win') T.wins++;
    console.log([id, mode === 'simul' ? '一斉' : '1人ずつ', m.result + '(' + m.turns + ')', m.firstFinisherTurn === null ? 'なし' : m.firstFinisherTurn, m.third,
      m.farActs + '/' + m.natureActs, m.allyDeaths].join(' | ') + '  ' + Math.round((Date.now() - t0) / 1000) + 's');
  });
});
['single', 'simul'].forEach(function (mode) {
  var T = total[mode], hit = T.ff.filter(function (x) { return x !== null; });
  console.log('合計 ' + (mode === 'simul' ? '一斉' : '1人ずつ') + ': 勝ち ' + T.wins + '/' + ids.length + '、決め手が初めて敵に入ったターン 平均 ' +
    (hit.length ? (hit.reduce(function (a, b) { return a + b; }, 0) / hit.length).toFixed(2) : '-') + '（入らなかった ' + (T.ff.length - hit.length) + '）、1ターンで3段目 ' + T.third +
    '回、離れた所に自然 ' + T.far + '/' + T.nat + '（' + (T.nat ? Math.round(T.far / T.nat * 100) : 0) + '%）、味方が倒れた ' + T.deaths);
});
