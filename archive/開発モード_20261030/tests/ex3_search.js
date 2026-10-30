/*
 * 展示ステージ③: 1ターン目の手を総当たりで打って、結果を分ける（調整用）。  node tests/ex3_search.js [chain|step|instant] [all] [例の数]
 *   3人とも撃つ（構える）手を、届くマス × 4つの向きで全部打ち、ターンを終える。
 *   順番は、ふだんは 山 → 火 → 風 だけ。all を付けると6つの順番すべて（一斉では、構えた順 ＝ 発動の順）。
 *   結果: 一掃（桜吹雪でボスも取り巻きも全部倒れた）／ボスだけ（勝ちだが取り巻きが残る）／桜吹雪が外れた（ボスが残る）／火山だけ（桜吹雪なし）／何も起きない
 *   一掃の手は全部、惜しい手（ボスだけ）は例の数（既定 20）まで出す。待機の手は打たない（桜吹雪には3人の魔法が要る）
 *   オーナー 10/30: ③の配置の組み直しで、つながるの1ターン目に一掃できる手と惜しい手を数えるために書き直した
 */
var R = require('../rules.js');
var B = require('../balance.js');
var mode = process.argv[2] || 'chain';
var allOrders = process.argv.indexOf('all') >= 0;
var keep = Number(process.argv.filter(function (a) { return /^\d+$/.test(a); })[0] || 20);
B.turnMode = mode === 'instant' ? 'single' : 'simul';
B.simul.stepwise = mode === 'step';

var NAME = { mount: '山', fire: '火', wind: '風' };
var ORDERS = allOrders
  ? [['mount', 'fire', 'wind'], ['mount', 'wind', 'fire'], ['fire', 'mount', 'wind'], ['fire', 'wind', 'mount'], ['wind', 'mount', 'fire'], ['wind', 'fire', 'mount']]
  : [['mount', 'fire', 'wind']];
var KINDS = ['wipe', 'bossOnly', 'stormMiss', 'volcanoOnly', 'none'];
var LABEL = { wipe: '一掃', bossOnly: 'ボスだけ', stormMiss: '桜吹雪が外れた', volcanoOnly: '火山だけ', none: '何も起きない' };

function byMagic(s, m) { return R.controllableOf(s).filter(function (a) { return a.magic === m; })[0]; }
function options(s, u) {
  var out = [];
  Object.keys(R.reachableCells(s, u.id)).forEach(function (k) {
    var p = k.split(',').map(Number);
    R.DIR_ORDER.forEach(function (d) { out.push({ to: p, dir: d }); });
  });
  return out;
}
function classify(s, events) {
  var storm = events.some(function (e) { return e.type === 'finisher' && e.name === '桜吹雪'; });
  var volcano = events.some(function (e) { return e.made === 'volcano'; });
  var en = R.enemiesOf(s);
  var boss = en.some(function (e) { return e.stand === 'boss'; });
  var left = en.filter(function (e) { return e.stand === 'float'; });
  if (storm && !boss && !left.length) return { kind: 'wipe' };
  if (storm && !boss) return { kind: 'bossOnly', left: left.map(function (e) { return R.unitLabel(s, e) + '(' + e.x + ',' + e.y + ')'; }) };
  if (storm) return { kind: 'stormMiss' };
  if (volcano) return { kind: 'volcanoOnly' };
  return { kind: 'none' };
}
// order の順に3人が撃つ（構える）手を全部
function searchOrder(s0, order) {
  var res = { count: {}, list: { wipe: [], bossOnly: [] } };
  KINDS.forEach(function (k) { res.count[k] = 0; });
  function rec(s, i, moves, evs) {
    if (i === order.length) {
      var t = s.result ? { state: s, events: [] } : R.endTurn(s);
      var c = classify(t.state, evs.concat(t.events));   // 撃った瞬間に発動（instant）では、1人ずつの手の中で起きる
      res.count[c.kind]++;
      if (c.kind === 'wipe') res.list.wipe.push(moves);
      else if (c.kind === 'bossOnly' && res.list.bossOnly.length < keep) res.list.bossOnly.push(moves.concat([['残り', c.left.join('・')]]));
      return;
    }
    var u = byMagic(s, order[i]);
    options(s, u).forEach(function (o) {
      var r = R.act(s, u.id, { to: o.to, dir: o.dir });
      if (!r.ok) return;
      rec(r.state, i + 1, moves.concat([[NAME[order[i]], o.to, o.dir]]), evs.concat(r.events));
    });
  }
  rec(s0, 0, [], []);
  return res;
}

var s = R.startBattle(R.loadPreset('ex3')).state;
var t0 = Date.now(), total = {};
KINDS.forEach(function (k) { total[k] = 0; });
console.log('形: ' + mode + '  盤面 ' + s.size + '×' + R.rowsOf(s) + '  順番: ' + (allOrders ? '6つすべて' : '山 → 火 → 風'));
console.log('1ターン目の始め: ' + s.units.map(function (u) { return R.unitLabel(s, u) + '(' + u.x + ',' + u.y + ')'; }).join(' '));
ORDERS.forEach(function (order) {
  var r = searchOrder(s, order);
  KINDS.forEach(function (k) { total[k] += r.count[k]; });
  console.log('\n順番 ' + order.map(function (m) { return NAME[m]; }).join(' → ') + ': ' + KINDS.map(function (k) { return LABEL[k] + ' ' + r.count[k]; }).join(' / '));
  r.list.wipe.forEach(function (m) { console.log('  一掃 ' + JSON.stringify(m)); });
  r.list.bossOnly.forEach(function (m) { console.log('  ボスだけ ' + JSON.stringify(m)); });
});
console.log('\n合計: ' + KINDS.map(function (k) { return LABEL[k] + ' ' + total[k]; }).join(' / ') + '  (' + (Date.now() - t0) + 'ms)');
