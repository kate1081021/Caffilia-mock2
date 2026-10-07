/*
 * 今のルールの結果を記録して、あとで同じかどうかを比べる（切り替えを足したとき、切った状態で何も変わらないことを確かめる）。
 *   node tests/snapshot.js save   … 今の結果を tests/snapshot_base.txt に記録する
 *   node tests/snapshot.js        … 記録と比べる。違ったら、どのシナリオ・どの手かを出す
 * 見るもの: どのシナリオでも、味方1人の1手（立ち位置 × 向き）→ ターン終了 の盤面と出来事。デモは最後まで再生した盤面と出来事。
 * 風の形・竜巻の作り方・桜吹雪の起こし方の切り替えごとにも見る。
 */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var R = require('../rules.js');
var B = require('../balance.js');
var DEMOS = require('../demos.js');

var FILE = path.join(__dirname, 'snapshot_base.txt');

function hash(str) { return crypto.createHash('sha1').update(str).digest('hex').slice(0, 16); }
function texts(events) { return (events || []).map(function (e) { return e.text || e.type; }).join('|'); }

var VARIANTS = [
  { name: '標準', set: function () {} },
  { name: '風=line', set: function () { B.windMode = 'line'; } },
  { name: '竜巻=windWind', set: function () { B.tornadoRecipe = 'windWind'; } },
  { name: '竜巻=senpu', set: function () { B.tornadoRecipe = 'senpu'; } },
  { name: '桜=fire', set: function () { B.sakura.from = 'fire'; } },
  { name: '噴火=溶岩', set: function () { B.funka.lava = true; } }
];
var saved = { windMode: B.windMode, tornadoRecipe: B.tornadoRecipe, sakura: B.sakura.from, lava: B.funka.lava };
function reset() { B.windMode = saved.windMode; B.tornadoRecipe = saved.tornadoRecipe; B.sakura.from = saved.sakura; B.funka.lava = saved.lava; }

// 1つのシナリオ・1つの切り替えで、全部の1手を試した結果（手ごとの記録）
function presetLines(pre, variant) {
  reset();
  if (pre.sakuraFrom) B.sakura.from = pre.sakuraFrom;
  variant.set();
  var s0 = R.startBattle(R.loadPreset(pre.id)).state;
  var lines = [];
  R.alliesOf(s0).forEach(function (a) {
    Object.keys(R.reachableCells(s0, a.id)).sort().forEach(function (k) {
      var to = k.split(',').map(Number);
      R.DIR_ORDER.forEach(function (d) {
        var r = R.act(s0, a.id, { to: to, dir: d, shoot: true });
        var body;
        if (!r.ok) body = 'NG';
        else {
          var e = r.state.result ? { state: r.state, events: [] } : R.endTurn(r.state);
          body = JSON.stringify(e.state) + '#' + texts(r.events) + '#' + texts(e.events);
        }
        lines.push(pre.id + ' ' + variant.name + ' ' + a.id + '@' + k + '>' + d + ' ' + hash(body));
      });
    });
  });
  return lines;
}

function demoLine(d) {
  reset();
  B.tornadoRecipe = d.recipe || 'off';
  B.windMode = d.windMode || 'breeze';
  var pre = R.PRESETS.filter(function (p) { return p.id === d.preset; })[0];
  B.sakura.from = (pre && pre.sakuraFrom) || 'grass';
  var st = R.loadPreset(d.preset);
  if (d.enemyActs === false) st = R.editSetEnemyActs(st, false).state;
  st = R.startBattle(st).state;
  var log = [];
  d.turns.forEach(function (turn) {
    turn.forEach(function (a) {
      if (st.result) return;
      var r = R.act(st, a.id, { to: a.to, dir: a.dir, shoot: a.shoot !== false });
      if (!r.ok) { log.push('NG'); return; }
      st = r.state; log.push(texts(r.events));
    });
    if (!st.result) { var e = R.endTurn(st); st = e.state; log.push(texts(e.events)); }
  });
  return 'demo ' + d.id + ' ' + hash(JSON.stringify(st) + '#' + log.join('/'));
}

var lines = [];
R.PRESETS.forEach(function (pre) {
  VARIANTS.forEach(function (v) { lines = lines.concat(presetLines(pre, v)); });
});
DEMOS.forEach(function (d) { lines.push(demoLine(d)); });
reset();

if (process.argv[2] === 'save') {
  fs.writeFileSync(FILE, lines.join('\n') + '\n');
  console.log('記録した: ' + lines.length + ' 件 → ' + path.relative(process.cwd(), FILE));
} else {
  if (!fs.existsSync(FILE)) { console.log('記録がない。先に node tests/snapshot.js save'); process.exit(1); }
  var base = fs.readFileSync(FILE, 'utf8').trim().split('\n');
  var diff = [];
  var n = Math.max(base.length, lines.length);
  for (var i = 0; i < n; i++) if (base[i] !== lines[i]) diff.push('  記録: ' + (base[i] || '（なし）') + '\n  今  : ' + (lines[i] || '（なし）'));
  if (diff.length) {
    console.log(diff.slice(0, 20).join('\n'));
    console.log('\n記録と違う: ' + diff.length + ' / ' + n + ' 件');
    process.exitCode = 1;
  } else console.log('記録と同じ（' + n + ' 件）');
}
