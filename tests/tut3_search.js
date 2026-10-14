/*
 * チュートリアル③「3人で合わせる」の配置を確かめる探索（IMPROVE_simul）。  node tests/tut3_search.js
 *   一斉発動で、土 → 草 → 風 の順に構えて勝てる手（立ち位置・向き）を全部数える。
 *   外したとき（1ターン目に全員待機／順番を間違えた）に、2ターン目で立て直せるかも見る。
 *   LAYOUT=JSON でシナリオの形（rows・allies・enemies・overrides）を渡すと、その配置を調べる（省略で rules.js の tut3）。
 */
var R = require('../rules.js');
var B = require('../balance.js');

function opts(s, u) {
  var out = [];
  Object.keys(R.reachableCells(s, u.id)).forEach(function (k) {
    var to = k.split(',').map(Number);
    R.DIR_ORDER.forEach(function (d) { out.push({ to: to, dir: d }); });
  });
  return out;
}
function allyHpSum(s) { return R.alliesOf(s).reduce(function (n, a) { return n + a.hp; }, 0); }
function byMagic(s, m) { return R.controllableOf(s).filter(function (a) { return a.magic === m; })[0]; }

// 一斉では、土と草の構えだけでは盤面が変わらないので、「土 → 草」を発動したらどうなるかで枝を減らす
function simulWins(s0, limit) {
  var wins = [], hp0 = allyHpSum(s0), n0 = R.alliesOf(s0).length;
  var E = byMagic(s0, 'earth');
  opts(s0, E).forEach(function (oe) {
    var se = R.act(s0, E.id, oe);
    if (!se.ok) return;
    var G = byMagic(se.state, 'grass');
    opts(se.state, G).forEach(function (og) {
      if (wins.length >= limit) return;
      var sg = R.act(se.state, G.id, og);
      if (!sg.ok) return;
      var mid = R.fireAllStances(sg.state).after;
      if (!mid.tiles.some(function (t) { return t === 'sakura'; })) return;
      var W = byMagic(sg.state, 'wind');
      opts(sg.state, W).forEach(function (ow) {
        if (wins.length >= limit) return;
        var sw = R.act(sg.state, W.id, ow);
        if (!sw.ok) return;
        var t = R.fireAllStances(sw.state).after;   // 敵を全員倒せば、敵の発動の前に勝ちが決まる
        if (t.result === 'win' && R.alliesOf(t).length === n0 && allyHpSum(t) === hp0) wins.push(['earth(' + oe.to + ')' + oe.dir, 'grass(' + og.to + ')' + og.dir, 'wind(' + ow.to + ')' + ow.dir]);
      });
    });
  });
  return wins;
}

function report(p) {
  var save = B.turnMode;
  try {
    B.turnMode = 'simul';
    var s = R.startBattle(R.buildPreset(p)).state;
    var fc = R.forecast(s);
    var hitsAlly = fc.enemyDamage.some(function (d) { return d.side === 'ally'; });
    console.log('ターン1の敵: ' + R.enemiesOf(s).map(function (e) { return R.unitLabel(s, e) + '(' + e.x + ',' + e.y + ')' + e.facing; }).join(' ') + (hitsAlly ? '  ※ 最初の予告が味方に当たる' : '  予告は味方に当たらない'));
    var w1 = simulWins(s, 400);
    console.log('一斉・1ターン目に 土→草→風 で勝てる手: ' + (w1.length >= 400 ? '400以上' : w1.length));
    w1.slice(0, 5).forEach(function (w) { console.log('   ' + w.join(' → ')); });
    // 外した: 全員待機
    var sw = s;
    R.controllableOf(sw).forEach(function (a) { sw = R.act(sw, a.id, { shoot: false }).state; });
    var t1 = R.endTurn(sw).state;
    console.log('全員待機のあと: ' + (t1.result || '続く') + '、味方 ' + R.alliesOf(t1).length + '人。ターン2の敵: ' + R.enemiesOf(t1).map(function (e) { return '(' + e.x + ',' + e.y + ')'; }).join(' '));
    if (!t1.result) {
      var w2 = simulWins(t1, 50);
      console.log('  → ターン2に 土→草→風 で勝てる手: ' + (w2.length >= 50 ? '50以上' : w2.length));
      w2.slice(0, 2).forEach(function (w) { console.log('   ' + w.join(' → ')); });
    }
    // 外した: 一番の手で、順番だけ 草→土→風 にした
    if (w1.length) {
      var best = w1[0].map(function (x) { var m = /^(\w+)\(([\d,]+)\)(\w+)$/.exec(x); return { magic: m[1], to: m[2].split(',').map(Number), dir: m[3] }; });
      var order = [best[1], best[0], best[2]], sx = s;
      order.forEach(function (o) { sx = R.act(sx, byMagic(sx, o.magic).id, { to: o.to, dir: o.dir }).state; });
      var t2 = R.endTurn(sx).state;
      console.log('順番を 草→土→風 にしたら: ' + (t2.result || '続く') + '、味方 ' + R.alliesOf(t2).length + '人' + (t2.result ? '' : '、盤面の桜 ' + t2.tiles.filter(function (t) { return t === 'sakura'; }).length + 'マス'));
      if (!t2.result) {
        var w3 = simulWins(t2, 50), wOnly = 0;
        var W = byMagic(t2, 'wind');
        opts(t2, W).forEach(function (o) {
          var a = R.act(t2, W.id, o).state;
          R.controllableOf(a).forEach(function (x) { if (!x.acted) a = R.act(a, x.id, { shoot: false }).state; });
          if (R.endTurn(a).state.result === 'win') wOnly++;
        });
        console.log('  → ターン2に 土→草→風 で勝てる手: ' + (w3.length >= 50 ? '50以上' : w3.length) + '、風だけで勝てる手: ' + wOnly);
      }
      // 外した: 土と草は正しく、風だけ向きを間違えた（桜は残る）
      var sm = s;
      best.slice(0, 2).forEach(function (o) { sm = R.act(sm, byMagic(sm, o.magic).id, { to: o.to, dir: o.dir }).state; });
      var wrong = R.DIR_ORDER.filter(function (d) { return d !== best[2].dir; })[0];
      sm = R.act(sm, byMagic(sm, 'wind').id, { to: best[2].to, dir: wrong }).state;
      var t4 = R.endTurn(sm).state;
      if (!t4.result) {
        var W4 = byMagic(t4, 'wind'), wOnly4 = 0;
        opts(t4, W4).forEach(function (o) {
          var a = R.act(t4, W4.id, o).state;
          R.controllableOf(a).forEach(function (x) { if (!x.acted) a = R.act(a, x.id, { shoot: false }).state; });
          if (R.fireAllStances(a).after.result === 'win') wOnly4++;
        });
        console.log('風の向きだけ間違えたら: 続く、味方 ' + R.alliesOf(t4).length + '人、桜 ' + t4.tiles.filter(function (t) { return t === 'sakura'; }).length + 'マス → ターン2に風だけで勝てる手: ' + wOnly4 + '、3人で: ' + simulWins(t4, 50).length);
      } else console.log('風の向きだけ間違えたら: ' + t4.result);
      // 外した手をいくつも試す（1ターン目に勝てない構えの組み合わせを決まった間隔で拾う）: 味方が倒れないか、2ターン目に勝てるか
      var tried = 0, dead = 0, stuck = 0, k = 0;
      var E0 = byMagic(s, 'earth');
      opts(s, E0).forEach(function (oe) {
        var se = R.act(s, E0.id, oe).state, G0 = byMagic(se, 'grass');
        opts(se, G0).forEach(function (og) {
          var sg = R.act(se, G0.id, og).state, W0 = byMagic(sg, 'wind');
          opts(sg, W0).forEach(function (ow) {
            if ((k++) % 997) return;
            var sw2 = R.act(sg, W0.id, ow).state;
            var t5 = R.endTurn(sw2).state;
            if (t5.result === 'win') return;
            tried++;
            if (t5.result || R.alliesOf(t5).length < 3) { dead++; return; }
            if (!simulWins(t5, 1).length) stuck++;
          });
        });
      });
      console.log('外した手 ' + tried + '通り: 1ターン目で味方が倒れた ' + dead + '、2ターン目に3人で勝てる手がない ' + stuck);
      // 1人ずつで、同じ順に撃つ
      B.turnMode = 'single';
      var ss = R.startBattle(R.buildPreset(p)).state;
      best.forEach(function (o) { if (!ss.result) ss = R.act(ss, byMagic(ss, o.magic).id, { to: o.to, dir: o.dir }).state; });
      if (!ss.result) ss = R.endTurn(ss).state;
      console.log('1人ずつで同じ順に撃つと: ' + (ss.result || '続く'));
    }
  } finally { B.turnMode = save; }
}

var layout = process.env.LAYOUT ? JSON.parse(process.env.LAYOUT) : R.findPreset('tut3');
if (!layout) { console.log('tut3 がまだない。LAYOUT=JSON で配置を渡す'); process.exit(0); }
report(layout);
