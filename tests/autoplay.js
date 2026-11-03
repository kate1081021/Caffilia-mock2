/*
 * 自動プレイ（テスト・探索用）。人の遊び方ではなく、「この盤面は勝てる形か」を見る道具。
 *   1ターンずつ、味方の手を1人ずつ足していくビーム探索。点数は「このターンの手と、敵の発動・ターン終了までの予告」で数える。
 *   ターンの形（BALANCE.turnMode）はどちらでも動く（一斉では構えを置いてから発動）。
 *   play(state, { turns, beam }) → { result, turns, state }
 */
var R = require('../game/rules.js');

var MATERIAL = { forest: 1, mountain: 1, river: 1, puddle: 1, smallfire: 2, fire: 2, sakura: 4, volcano: 3, firewhirl: 4, deadforest: 4, breeze: 1, mud: 1 };

function options(s, u) {
  var out = [];
  Object.keys(R.reachableCells(s, u.id)).forEach(function (k) {
    var to = k.split(',').map(Number);
    R.DIR_ORDER.forEach(function (d) { out.push({ to: to, dir: d }); });
    out.push({ to: to, dir: u.facing, shoot: false });
  });
  return out;
}

function score(s, s0) {
  var fc = R.forecast(s);
  var dmg = {}, sc = 0;
  R.enemiesOf(s0).forEach(function (e) { var now = R.findUnit(s, e.id); dmg[e.id] = e.hp - (now ? now.hp : 0); });
  fc.enemyDamage.concat(fc.burn).forEach(function (d) { if (dmg[d.id] !== undefined) dmg[d.id] += d.amount; });
  Object.keys(dmg).forEach(function (id) { var e = R.findUnit(s0, id); var d = Math.min(e.hp, dmg[id]); sc += d; if (d >= e.hp) sc += 30; });
  var loss = 0;
  s0.units.forEach(function (a) {
    if (a.side === 'enemy') return;
    var now = R.findUnit(s, a.id), hp = now ? now.hp : 0;
    fc.enemyDamage.concat(fc.burn).forEach(function (d) { if (d.id === a.id) hp -= d.amount; });
    (fc.rushes || []).forEach(function (r) { if (r.reach && r.village === a.id && r.stop >= r.path.length) hp -= a.hp; });
    if (hp <= 0) loss += a.side === 'object' ? 300 : 100; else loss += (a.hp - hp) * 10;
  });
  var after = R.simulOn() ? R.fireAllStances(s).after : s;
  for (var i = 0; i < after.tiles.length; i++) if (after.tiles[i] !== s0.tiles[i]) sc += (MATERIAL[after.tiles[i]] || 0) * 0.3;
  if (after.result === 'win') sc += 500;
  if (after.result === 'lose') sc -= 500;
  return sc - loss;
}

function planTurn(s0, beamWidth) {
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
    beam = next.slice(0, beamWidth);
    if (!beam.length) break;
  }
  return beam[0] ? beam[0].seq : [];
}

function play(s, opts) {
  opts = opts || {};
  var maxTurns = opts.turns || 8, width = opts.beam || 12, t = 0;
  for (t = 1; t <= maxTurns && !s.result; t++) {
    planTurn(s, width).forEach(function (a) { if (!s.result) { var r = R.act(s, a.id, a); if (r.ok) s = r.state; } });
    if (!s.result) s = R.endTurn(s).state;
  }
  return { result: s.result || 'none', turns: Math.min(t, maxTurns), state: s };
}

module.exports = { play: play, planTurn: planTurn, score: score };
