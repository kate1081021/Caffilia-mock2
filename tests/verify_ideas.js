/*
 * 新しいシナジー案（balance.js の ideas）を、入れたとき／切ったときでくらべる。
 *   node tests/verify_ideas.js
 * 「できることが増えたか（選択肢・材料・逃げ道）」を数字で見る。ダメージの大きさは見ない。
 */
var R = require('../rules.js');
var B = require('../balance.js');

var CH = { '.': 'empty', F: 'forest', M: 'mountain', R: 'river', X: 'fire', s: 'smallfire', V: 'volcano', D: 'mud', P: 'puddle', H: 'mirage', I: 'ice', L: 'lava', W: 'whirlwind', T: 'tornado' };
function board(rows) {
  var s = R.createState({ size: rows.length, blank: true, enemyActs: false });
  rows.forEach(function (row, y) { for (var x = 0; x < row.length; x++) R.setTile(s, x, y, CH[row[x]]); });
  return s;
}
function withIdea(name, on, fn) {
  var old = B.ideas[name];
  B.ideas[name] = on;
  try { return fn(); } finally { B.ideas[name] = old; }
}
// 盤面の空きマスすべてに術者を置いて、4方向に撃ってみる
function everyShot(s0, magic, fn) {
  for (var y = 0; y < s0.size; y++) for (var x = 0; x < s0.size; x++) {
    if (!R.isPassable(R.getTile(s0, x, y)) || R.unitAt(s0, x, y)) continue;
    R.DIR_ORDER.forEach(function (d) {
      var s = R.clone(s0);
      var a = R.addAlly(s, magic, x, y, d);
      var r = R.act(s, a.id, { dir: d });
      if (r.ok) fn(r, s, x, y, d);
    });
  }
}
function row(name, off, on, note) {
  console.log('  ' + name + '\n      切ったとき ' + off + ' → 入れたとき ' + on + (note ? '   ' + note : ''));
}

console.log('\n■ 1. 氷の上は滑る（敵の進路を誘導できるか）');
(function () {
  var lake = board(['..XX..', '.IIII.', '.IIII.', '.IIII.', '.IIII.', '......']);
  function measure() {
    var ends = {}, far = 0, intoFire = 0, shots = 0;
    var s0 = R.clone(lake);
    var e = R.addEnemy(s0, 'fire', 2, 3);
    everyShot(s0, 'wind', function (r) {
      var u = R.findUnit(r.state, e.id);
      if (!u) return;
      shots++;
      ends[u.x + ',' + u.y] = true;
      if (Math.abs(u.x - 2) + Math.abs(u.y - 3) >= 2) far++;
      var t = R.getTile(r.state, u.x, u.y);
      if (t === 'fire' || t === 'smallfire') intoFire++;
    });
    return { ends: Object.keys(ends).length, far: far, intoFire: intoFire, shots: shots };
  }
  var off = withIdea('iceSlide', false, measure), on = withIdea('iceSlide', true, measure);
  row('凍った湖の上の敵を、風1発で動かせる行き先の数', off.ends, on.ends);
  row('2マス以上動かせる撃ち方', off.far + ' / ' + off.shots, on.far + ' / ' + on.shots);
  row('炎の上まで運べる撃ち方（ターン終了で2ダメージ）', off.intoFire, on.intoFire);
})();

console.log('\n■ 2. 水辺の森はよく育つ（燃え広がりの材料が増えるか）');
(function () {
  var riverside = board(['......', '......', 'RRRRRR', '......', '......', '......']);
  function measure() {
    var total = 0, n = 0, best = 0;
    everyShot(riverside, 'grass', function (r) {
      var f = r.state.tiles.filter(function (t) { return t === 'forest'; }).length;
      total += f; n++; if (f > best) best = f;
    });
    return { avg: (total / n).toFixed(2), best: best };
  }
  var off = withIdea('wetlandForest', false, measure), on = withIdea('wetlandForest', true, measure);
  row('川のそばで草を1発撃ったときの森の数（平均）', off.avg, on.avg);
  row('同じく、いちばん多いとき', off.best, on.best);
  var plain = board(['......', '......', '......', '......', '......', '......']);
  var p = withIdea('wetlandForest', true, function () { var b = 0; everyShot(plain, 'grass', function (r) { b = Math.max(b, r.state.tiles.filter(function (t) { return t === 'forest'; }).length); }); return b; });
  console.log('      （水のない盤面では、いちばん多くて ' + p + ' マス。水辺だけで効く）');
})();

console.log('\n■ 3. 土をかぶせて火を消す（敵の火から身を守れるか）');
(function () {
  // 「火の敵」で、敵が1回火を撃ったあとの盤面
  var s0 = R.endTurn(R.startBattle(R.loadPreset('fireEnemy')).state).state;
  var fires = s0.tiles.filter(function (t) { return t === 'fire' || t === 'smallfire'; }).length;
  function measure() {
    var removing = 0, best = 0, shots = 0;
    everyShot(s0, 'earth', function (r) {
      shots++;
      var left = r.state.tiles.filter(function (t) { return t === 'fire' || t === 'smallfire'; }).length;
      var gone = fires - left;
      if (gone > 0) removing++;
      if (gone > best) best = gone;
    });
    return { removing: removing, best: best, shots: shots };
  }
  var off = withIdea('earthSmother', false, measure), on = withIdea('earthSmother', true, measure);
  console.log('      （盤面の火: ' + fires + 'マス）');
  row('土1発で火を消せる撃ち方', off.removing + ' / ' + off.shots, on.removing + ' / ' + on.shots);
  row('土1発で消せる火の数（いちばん多いとき）', off.best, on.best);
})();

console.log('\n■ 4. 風で蜃気楼が晴れる（隠れ場所を風で消せるか）');
(function () {
  var s0 = board(['......', '......', '......', '..H...', '......', '......']);
  var a = R.addAlly(s0, 'fire', 2, 3);
  function measure() {
    var found = 0, shots = 0;
    everyShot(s0, 'wind', function (r, s, x, y) {
      shots++;
      var u = R.findUnit(r.state, a.id);
      if (u && !R.hidden(r.state, u)) found++;
    });
    return found + ' / ' + shots;
  }
  console.log('      （中に隠れている者は、この案がなくても風で押し出されて見つかる: ' + withIdea('windClearsMirage', false, measure) + '）');
  var empty0 = board(['......', '......', '......', '..H...', '......', '......']);
  function cleared() {
    var c = 0, n = 0;
    everyShot(empty0, 'wind', function (r) { n++; if (r.state.tiles.indexOf('mirage') < 0) c++; });
    return c + ' / ' + n;
  }
  row('風1発で、だれもいない蜃気楼（隠れ場所）を消せる撃ち方', withIdea('windClearsMirage', false, cleared), withIdea('windClearsMirage', true, cleared), '（敵の風でも同じ）');
})();

console.log('\n■ 5. 燃え広がりは氷を溶かす（凍結のあとを燃え広がりで戻せるか）');
(function () {
  var s0 = board(['......', '..I...', '..I...', '..X...', '......', '......']);
  function measure() {
    var a = 0;
    everyShot(s0, 'wind', function (r) { a = Math.max(a, r.state.tiles.filter(function (t) { return t === 'puddle'; }).length); });
    return a;
  }
  row('燃え広がり1発で水たまりに戻る氷（いちばん多いとき）', withIdea('spreadMeltsIce', false, measure), withIdea('spreadMeltsIce', true, measure));
})();
console.log('');
