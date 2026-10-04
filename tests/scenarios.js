/*
 * 4つの流れを rules.js だけで最初から最後まで動かし、ログを確かめる（v2）。
 *   node tests/scenarios.js
 * 画面と同じく「味方が1人ずつ行動 → 3人とも終えたら自動でターン終了」で進める。
 */
var R = require('../rules.js');

var failures = 0;

function check(cond, what) {
  if (cond) console.log('  ✔ ' + what);
  else { failures++; console.log('  ✘ ' + what); }
}

function scenario(title, setup, fn) {
  console.log('\n==== ' + title + ' ====');
  var log = [];
  var g = {
    state: setup(),
    log: log,
    act: function (unitId, to, dir, shoot) {
      var r = R.act(this.state, unitId, { to: to, dir: dir, shoot: shoot });
      if (!r.ok) throw new Error(unitId + ' が行動できない: ' + r.error);
      var events = r.events;
      var st = r.state;
      if (!st.result && R.allAlliesActed(st)) {
        var t = R.endTurn(st);
        events = events.concat([{ text: '3人とも行動したので、ターン終了' }], t.events);
        st = t.state;
      }
      this.state = st;
      this.record(events);
    },
    endTurn: function () {
      var r = R.endTurn(this.state);
      if (!r.ok) throw new Error('ターン終了できない: ' + r.error);
      this.state = r.state;
      this.record(r.events);
    },
    record: function (events) {
      events.forEach(function (e) { log.push(e.text); console.log('  ' + e.text); });
    },
    expectLog: function (text) {
      check(log.some(function (l) { return l.indexOf(text) >= 0; }), 'ログに「' + text + '」がある');
    },
    unit: function (id) { return R.findUnit(this.state, id); },
    tile: function (x, y) { return R.getTile(this.state, x, y); }
  };
  try { fn(g); } catch (e) { failures++; console.log('  !! 途中で止まった: ' + e.message); }
}

// 盤面を文字で作る（. 空き F 森 M 山 R 川 X 炎 s 小さな炎 G マグマ D 泥沼）
var CH = { '.': 'empty', F: 'forest', M: 'mountain', R: 'river', X: 'fire', s: 'smallfire', G: 'magma', D: 'mud' };
function build(rows, enemyActs, allies, enemies) {
  var s = R.createState({ size: rows.length, blank: true, enemyActs: enemyActs });
  rows.forEach(function (row, y) { for (var x = 0; x < row.length; x++) R.setTile(s, x, y, CH[row[x]]); });
  allies.forEach(function (a) { R.addAlly(s, a[0], a[1], a[2], 'up'); });
  enemies.forEach(function (e) { R.addEnemy(s, e[0], e[1], e[2], 'down'); });
  return s;
}

// ---------------------------------------------------------------
scenario('1. 草で森のかたまり → 火で森に点火 → 炎の後ろに回って風 → 燃え広がりで敵を巻き込む',
  function () {
    // 味方 P1 草(2,5) / P2 火(1,5) / P3 風(3,5)。敵A（火）は (2,0) で何もしない設定
    return build(['......', '......', '......', '......', '......', '......'], false,
      [['grass', 2, 5], ['fire', 1, 5], ['wind', 3, 5]], [['fire', 2, 0]]);
  },
  function (g) {
    g.act('P1', [2, 5], 'up');            // 草: (2,3) と (1,2)(2,2)(3,2) に森
    g.expectLog('森ができた×4');
    g.act('P2', [1, 3], 'right');         // 火: (1,3) から右へ → (2,3) の森が炎、(4,3) に小さな炎
    g.expectLog('森が燃えた');
    g.act('P3', [2, 4], 'up');            // 風: 炎の真後ろ (2,4) から上へ → 燃え広がり
    g.expectLog('燃え広がり！ 上へ3マス走り、森3つが燃えた（威力10）');
    g.expectLog('敵Aに10ダメージ');
    var e = R.enemiesOf(g.state)[0];
    check(e.hp === 10, '敵Aの HP は 20 - (4 + 3×2) = 10');
    check(['2,2', '1,2', '3,2'].every(function (k) { var c = k.split(',').map(Number); return g.tile(c[0], c[1]) !== 'forest'; }), 'かたまりの森は全部燃えた');
    check(R.alliesOf(g.state).length === 3, '味方は巻き込まれていない');
  });

// ---------------------------------------------------------------
scenario('2. 土で山 → 火でマグマ → 水を流してマグマに当て、水蒸気爆発',
  function () {
    // 味方 P1 土(4,5) / P2 火(3,5) / P3 水(0,4)。敵A（水）は (3,1) で何もしない設定
    return build(['......', '......', '......', '......', '......', '......'], false,
      [['earth', 4, 5], ['fire', 3, 5], ['water', 0, 4]], [['water', 3, 1]]);
  },
  function (g) {
    g.act('P1', [4, 5], 'up');            // 土: (3,3)(4,3)(3,2) に山
    g.expectLog('山ができた×3');
    g.act('P2', [3, 5], 'up');            // 火: (3,4) 小さな炎、(3,2) の山がマグマ
    g.expectLog('山がマグマになった');
    g.act('P3', [0, 2], 'right');         // 水: (0,2) から右へ → (1,2)(2,2) が川、(3,2) のマグマで爆発
    g.expectLog('川が2マスできた、マグマに当たった');
    g.expectLog('水蒸気爆発！');
    g.expectLog('敵Aに10ダメージ');
    check(g.tile(3, 2) === 'empty', 'マグマは空きに戻った');
    check(g.tile(3, 3) === 'mountain' && g.tile(4, 3) === 'mountain', '周りの山はそのまま');
    check(R.enemiesOf(g.state)[0].hp === 10, '敵Aの HP は 20 - 10 = 10');
  });

// ---------------------------------------------------------------
scenario('3. 火の敵が森に火をつける → こちらの風で燃え広がりを敵の方へ返す',
  function () {
    // 味方 P1 風(4,5) / P2 水(0,5) / P3 火(5,5)。敵A（火）は (2,0) から行動する
    return build(['......', '......', '...FFF', '....F.', '......', '......'], true,
      [['wind', 4, 5], ['water', 0, 5], ['fire', 5, 5]], [['fire', 2, 0]]);
  },
  function (g) {
    // ターン1: 味方は何もしない。敵は一番近い味方（風）へ近づき、下へ火を撃つ
    g.endTurn();
    var e = R.enemiesOf(g.state)[0];
    check(e.x === 4 && e.y === 0 && e.facing === 'down', '敵Aは (4,0) へ動いて下を向いた');
    g.expectLog('敵Aが下へ火の魔法（点ける）→ 小さな炎がついた、森が燃えた');
    check(g.tile(4, 3) === 'fire', '敵の火で (4,3) の森が炎になった');
    // ターン2: 風が炎の後ろ (4,5) から上へ → 燃え広がりが敵の方へ
    g.act('P1', [4, 5], 'up');
    g.expectLog('燃え広がり！ 上へ3マス走り、森3つが燃えた（威力10）');
    g.expectLog('敵Aに10ダメージ');
    check(R.enemiesOf(g.state)[0].hp === 10, '敵Aの HP は 20 - 10 = 10');
  });

// ---------------------------------------------------------------
scenario('4. 水で川を作る → 風で川を1マス押し流す',
  function () {
    // 味方 P1 水(2,5) / P2 風(0,5) / P3 火(5,5)。敵は何もしない
    return build(['......', '......', '......', '......', '......', '......'], false,
      [['water', 2, 5], ['wind', 0, 5], ['fire', 5, 5]], [['fire', 5, 0]]);
  },
  function (g) {
    g.act('P1', [2, 5], 'up');            // 水: (2,4)〜(2,1) が川（縦の壁）
    g.expectLog('川が4マスできた');
    check([4, 3, 2, 1].every(function (y) { return g.tile(2, y) === 'river'; }), '(2,1)〜(2,4) が川');
    g.act('P2', [0, 3], 'right');         // 風: (0,3) から右へ → (2,3) の川を (3,3) へ運ぶ
    g.expectLog('川を右へ1マス運んだ');
    check(g.tile(2, 3) === 'empty' && g.tile(3, 3) === 'river', '川が (2,3) から (3,3) へ動いて、壁に穴があいた');
  });

console.log('\n' + (failures ? failures + ' 件の確認に失敗' : 'すべてのシナリオが期待どおり'));
if (failures) process.exitCode = 1;
