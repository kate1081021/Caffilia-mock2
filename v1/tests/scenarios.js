/*
 * 3つの流れを rules.js だけで最初から最後まで動かし、ログを確かめる。
 *   node tests/scenarios.js
 * 画面と同じく「魔法を撃つ → 全員撃ったら自動でターン終了」「ターン終了ボタン」で進める。
 */
var R = require('../rules.js');

var failures = 0;

function scenario(title, fn) {
  console.log('\n==== ' + title + ' ====');
  var log = [];
  var game = {
    state: null,
    log: log,
    cast: function (unitId, x, y, dir) {
      var r = R.castMagic(this.state, unitId, x, y, dir);
      if (!r.ok) throw new Error('魔法が撃てない: ' + r.error);
      var events = r.events;
      var st = r.state;
      if (!st.result && R.allAlliesDone(st)) {
        var t = R.endTurn(st);
        events = events.concat([{ text: '全員が魔法を撃ったので、ターン終了' }], t.events);
        st = t.state;
      }
      this.state = st;
      this.record(events);
    },
    move: function (unitId, x, y) {
      var r = R.moveAlly(this.state, unitId, x, y);
      if (!r.ok) throw new Error('移動できない: ' + r.error);
      this.state = r.state;
      this.record(r.events);
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
      var hit = log.some(function (l) { return l.indexOf(text) >= 0; });
      check(hit, 'ログに「' + text + '」がある');
    },
    expect: function (cond, what) { check(cond, what); }
  };
  try {
    fn(game);
  } catch (e) {
    failures++;
    console.log('  !! 途中で止まった: ' + e.message);
  }
}

function check(cond, what) {
  if (cond) console.log('  ✔ ' + what);
  else { failures++; console.log('  ✘ ' + what); }
}

// 味方の魔法を変えた初期状態（エディットモードで変えたのと同じ）
function setup(magics, enemyMoves, enemyPos) {
  var s = R.createState({ enemyMoves: enemyMoves });
  var al = R.alliesOf(s);
  magics.forEach(function (m, i) { s = R.editSetMagic(s, al[i].id, m).state; });
  if (enemyPos) {
    var e = R.enemiesOf(s)[0];
    s = R.editMoveUnit(s, e.id, enemyPos[0], enemyPos[1]).state;
  }
  return R.normalizeForPlay(s);
}

// ---------------------------------------------------------------
scenario('1. 草で森を3つ並べる → 1つに火 → 風 → 燃え広がりで森が全部燃える', function (g) {
  // 味方: P1 草 / P2 火 / P3 風。敵は (4,3) で止まっている
  g.state = setup(['grass', 'fire', 'wind'], false, [4, 3]);
  g.cast('P1', 1, 3);          // 森1
  g.endTurn();
  g.cast('P1', 2, 3);          // 森2
  g.endTurn();
  g.cast('P1', 3, 3);          // 森3
  g.cast('P2', 1, 3);          // 森1に火 → 炎
  g.cast('P3', 1, 3, 'right'); // 炎に風（右へ） → 燃え広がり。全員撃ったので自動でターン終了
  var s = g.state;
  g.expectLog('森が燃えた');
  g.expectLog('燃え広がり！ 森2つが燃えた。敵Aに8ダメージ');
  g.expect([1, 2, 3].every(function (x) { return R.getTile(s, x, 3) !== 'forest'; }), '並べた森が1つも残っていない');
  g.expect(R.getTile(s, 2, 3) === 'fire' && R.getTile(s, 3, 3) === 'fire', '燃えた森は炎になって燃え続けている');
  g.expect(R.getTile(s, 1, 3) === 'empty', '起点は空きに戻った');
  g.expect(R.enemiesOf(s)[0].hp === 12, '敵Aの HP は 20 - (4 + 2×2) = 12');
});

// ---------------------------------------------------------------
scenario('2. 川 → 風で渦巻き → 敵を隣まで歩かせて引き込む → 火でセンタクキ', function (g) {
  // 味方: P1 水 / P2 風 / P3 火。敵は (3,0) から動く
  g.state = setup(['water', 'wind', 'fire'], true);
  g.cast('P1', 3, 3);          // 川
  g.cast('P2', 3, 3, 'up');    // 川に風 → 渦巻き
  g.cast('P3', 0, 0);          // 火はとりあえず端へ（小さな炎）→ 自動でターン終了
  g.expectLog('川が渦巻きになった');

  // 敵が渦巻きに引き込まれるまでターンを回す（味方は何もしない）
  var turns = 0;
  while (!g.log.some(function (l) { return l.indexOf('渦巻きに引き込まれた') >= 0; }) && turns < 10) {
    g.endTurn();
    turns++;
  }
  var e = R.enemiesOf(g.state)[0];
  g.expect(R.isInWhirl(g.state, e), '敵Aが渦巻きの中にいる（' + turns + 'ターン後）');
  g.expect(R.alliesOf(g.state).every(function (a) { return a.hp === a.maxHp; }), '味方は無傷');

  g.cast('P3', 3, 3);          // 渦巻きに火 → センタクキ
  g.expectLog('センタクキ！ 敵Aに12ダメージ');
  var e2 = R.enemiesOf(g.state)[0];
  g.expect(e2.hp === 8, '敵Aの HP は 20 - 12 = 8');
  g.expect(R.getTile(g.state, 3, 3) === 'empty' && !R.isInWhirl(g.state, e2), '渦巻きは空きに戻り、敵Aは解放された');
});

// ---------------------------------------------------------------
scenario('3. 土で山 → 火でマグマ → 別の山に水で川を流し、マグマに当てて水蒸気爆発', function (g) {
  // 味方: P1 土 / P2 火 / P3 水。敵は (4,1) で止まっている
  g.state = setup(['earth', 'fire', 'water'], false, [4, 1]);
  g.cast('P1', 4, 2);          // 山
  g.endTurn();
  g.cast('P2', 4, 2);          // 山に火 → マグマ
  g.cast('P1', 0, 2);          // 別の山
  g.cast('P3', 0, 2, 'right'); // 山に水（右へ）→ 川が流れてマグマに当たる → 水蒸気爆発
  g.expectLog('山がマグマになった');
  g.expectLog('山から右へ川が流れた（3マス）、マグマに当たって止まった');
  g.expectLog('水蒸気爆発！ 敵Aに10ダメージ');
  var s = g.state;
  g.expect([1, 2, 3].every(function (x) { return R.getTile(s, x, 2) === 'river'; }), '(1,2)〜(3,2) が川になった');
  g.expect(R.getTile(s, 4, 2) === 'empty', 'マグマは空きに戻った');
  g.expect(R.getTile(s, 0, 2) === 'mountain', '水を撃った山は残っている');
  g.expect(R.enemiesOf(s)[0].hp === 10, '敵Aの HP は 20 - 10 = 10');
});

console.log('\n' + (failures ? failures + ' 件の確認に失敗' : 'すべてのシナリオが期待どおり'));
if (failures) process.exitCode = 1;
