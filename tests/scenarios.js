/*
 * 4つの流れを rules.js だけで最初から最後まで動かし、ログを確かめる（v2）。
 *   node tests/scenarios.js
 * 画面と同じく「味方が1人ずつ行動 → 3人とも終えたら自動でターン終了」で進める。
 */
var R = require('../rules.js');
var B = require('../balance.js');

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

// 盤面を文字で作る（. 空き F 森 M 山 R 川 X 炎 s 小さな炎 V 火山 D 泥沼 P 水たまり）
var CH = { '.': 'empty', F: 'forest', M: 'mountain', R: 'river', X: 'fire', s: 'smallfire', V: 'volcano', D: 'mud', P: 'puddle' };
function build(rows, enemyActs, allies, enemies) {
  var s = R.createState({ size: rows.length, blank: true, enemyActs: enemyActs });
  rows.forEach(function (row, y) { for (var x = 0; x < row.length; x++) R.setTile(s, x, y, CH[row[x]]); });
  allies.forEach(function (a) { R.addAlly(s, a[0], a[1], a[2], 'up'); });
  enemies.forEach(function (e) { R.addEnemy(s, e[0], e[1], e[2], 'down'); });
  return R.startBattle(s).state;   // 戦闘は敵の移動と予告が終わった状態から始まる
}

// ---------------------------------------------------------------
scenario('1. 草で森のかたまり → 火で森に点火 → 炎の後ろに回って風 → 燃え広がりで、森の上の敵を巻き込む',
  function () {
    // 味方 P1 草(2,5) / P2 火(1,5) / P3 風(3,5)。敵A（火）は (2,0) の森の上で何もしない設定
    return build(['..F...', '......', '......', '......', '......', '......'], false,
      [['grass', 2, 5], ['fire', 1, 5], ['wind', 3, 5]], [['fire', 2, 0]]);
  },
  function (g) {
    g.act('P1', [2, 5], 'up');            // 草: (2,3) と (1,2)(2,2)(3,2) に森
    g.expectLog('森ができた×4');
    g.act('P2', [1, 3], 'right');         // 火: (1,3) から右隣 (2,3) の森に火
    g.expectLog('森が燃えた');
    g.act('P3', [2, 4], 'up');            // 風: 炎の真後ろ (2,4) から上へ → 燃え広がり
    g.expectLog('燃え広がり！ 上へ3マス走り、森4つが燃えた');
    check(g.state.result === 'win', '燃えた森の上の敵Aに強い炎（20）が入って倒れる');
    check(['2,2', '1,2', '3,2'].every(function (k) { var c = k.split(',').map(Number); return g.tile(c[0], c[1]) !== 'forest'; }), 'かたまりの森は全部燃えた');
    check(R.alliesOf(g.state).length === 3, '味方は巻き込まれていない');
  });

// ---------------------------------------------------------------
scenario('2. 【新案】土で山 → 水が山に当たって端まで川（源流）→ 雷が川に落ちて感電',
  function () {
    // 味方 P1 土(2,5) / P2 水(3,5) / P3 雷(4,5)。敵A（火）は (3,1) で何もしない設定
    return build(['......', '......', '......', '......', '......', '......'], false,
      [['earth', 2, 5], ['water', 3, 5], ['thunder', 4, 5]], [['fire', 3, 1]]);
  },
  function (g) {
    g.act('P1', [2, 5], 'up');            // 土: (1,3)(2,3)(1,2) に山
    g.expectLog('山ができた×3');
    g.act('P2', [2, 4], 'up');            // 水: すぐ前の (2,3) の山に当たり、山を下って (2,2)(2,1)(2,0) が川
    g.expectLog('【新案】山に当たって川になった');
    g.expectLog('盤の端まで流れた');
    check(g.tile(2, 2) === 'river' && g.tile(2, 1) === 'river' && g.tile(2, 0) === 'river', '山の向こう (2,0)〜(2,2) が川になった');
    g.act('P3', [4, 3], 'left');          // 雷: ジグザグ (3,3)(2,2)… → 最初に当たる (2,2) の川に落ちる
    g.expectLog('【新案】雷が川に落ちた');
    g.expectLog('【新案】感電！ つながった水3マスに雷が走った（威力20）');
    check(g.state.result === 'win', '川の隣にいた敵Aが感電で倒れる');
  });

scenario('3. 火の敵が森に火をつける → こちらの風で燃え広がりを敵の方へ返す（敵の足元は森ではないので弱い炎）',
  function () {
    // 味方 P1 風(4,5) / P2 水(0,5) / P3 火(5,5)。敵A（火）は (2,0) から行動する
    return build(['......', '....F.', '...FFF', '......', '......', '......'], true,
      [['wind', 4, 5], ['water', 0, 5], ['fire', 5, 5]], [['fire', 2, 0]]);
  },
  function (g) {
    // ターン1: 味方は何もしない。敵は一番近い味方（風）へ近づき、下を向いて正面1マスに火を撃つ
    g.endTurn();
    var e = R.enemiesOf(g.state)[0];
    check(e.x === 4 && e.y === 0 && e.facing === 'down', '敵Aは (4,0) へ動いて下を向いた');
    g.expectLog('敵Aが下へ火の魔法（点ける）→ 森が燃えた');
    check(g.tile(4, 1) === 'fire', '敵の火で (4,1) の森が炎になった');
    // ターン2: 風が炎の後ろから上へ → 燃え広がりが敵の方へ
    g.act('P1', [4, 3], 'up');             // (4,2) の森を越えて (4,1) の炎に風が当たる
    g.expectLog('燃え広がり！');
    var e2 = R.enemiesOf(g.state)[0];
    check(e2.hp === B.enemy.hp - B.fire.weakDamage && e2.burn === B.fire.burnTurns, '敵Aは弱い炎で5、火傷を負う（森の上ではないので倒れない）');
  });

// ---------------------------------------------------------------
scenario('4. 【新案】水で池 → 風が水を横へ運んで敵の隣まで濡らす → 次のターン、離れてから雷で感電',
  function () {
    // 味方 P1 水(1,5) / P2 風(0,2) / P3 雷(0,5)。敵A（火）は (3,2) で何もしない設定
    return build(['......', '......', '......', '......', '......', '......'], false,
      [['water', 1, 5], ['wind', 0, 2], ['thunder', 0, 5]], [['fire', 3, 2]]);
  },
  function (g) {
    g.act('P1', [1, 4], 'up');            // 水: (1,3)(1,2) に池
    g.expectLog('池ができた（2マス）');
    g.act('P2', [0, 2], 'right');         // 風: (1,2) の水を右へ運ぶ → (1,2)(2,2) が水たまり
    g.expectLog('【新案】川の水を右へ運んだ（水たまり2マス）');
    check(g.tile(1, 2) === 'puddle' && g.tile(2, 2) === 'puddle', '通り道が水たまりになった');
    g.act('P3', [0, 5], 'up', false);     // 雷は待つ（水と風の味方が水のすぐ隣にいるため）
    g.act('P1', [1, 5], 'up', false);     // 2ターン目: 水と風は水から離れる
    g.act('P2', [0, 0], 'up', false);
    g.act('P3', [0, 4], 'up');            // 雷: (0,3) → (1,2) の水たまりに落ちる
    g.expectLog('【新案】感電！ つながった水3マスに雷が走った（威力20）');
    check(g.state.result === 'win', '水の隣にいた敵Aが感電で倒れる');
    check(R.alliesOf(g.state).length === 3, '離れていた味方は無事');
  });

scenario('5. 【新案・元の噴火】土で山 → 隣から火で噴火（溶岩が山脈のまわりにあふれる）→ 溶岩の上を風が吹き抜けて桜吹雪',
  function () {
    B.funka.lava = true;
    B.sakura.from = 'fire';
    // 8×8。味方 P1 土(2,7) / P2 火(5,5) / P3 風(1,0)。敵A（火）は (0,7) で何もしない設定
    var rows = []; for (var i = 0; i < 8; i++) rows.push('........');
    return build(rows, false, [['earth', 2, 7], ['fire', 5, 5], ['wind', 1, 0]], [['fire', 0, 7]]);
  },
  function (g) {
    g.act('P1', [2, 7], 'up');                    // 土: (1,5)(2,5)(1,4) に山
    g.act('P2', [4, 5], 'left', false);           // 火・風は待機
    g.act('P3', [1, 0], 'down', false);
    g.act('P1', [4, 7], 'up', false);             // 2ターン目: 土は溶岩が届かない所へ離れる
    g.act('P2', [3, 5], 'left');                  // 火: すぐ隣 (2,5) の山に火 → 山脈3つが噴火
    g.expectLog('【新案】噴火！ 山脈3つが一気に火山になり、溶岩があふれた');
    check(g.tile(1, 3) === 'lava' && g.tile(1, 2) !== 'lava', '溶岩は山脈のまわり1マスだけに流れ出した');
    check(R.alliesOf(g.state).length === 2, '【課題】火は1マスなので、火を点けた味方は溶岩に巻き込まれる');
    g.act('P3', [1, 2], 'down');                  // 風: 溶岩 (1,3) の上を吹き抜けて (1,4) の火山へ → 桜吹雪
    g.expectLog('【新案】桜吹雪！ 火山3つの火の粉が下へ舞い散った（威力20）');
    check(g.state.result === 'win', '扇の中の敵Aが倒れる');
    B.funka.lava = false;
    B.sakura.from = 'grass';
  });

scenario('6. 【新案】土で山 → 水が山を下って川の壁 → 氷で一気に凍らせて、壁が道に変わる',
  function () {
    // 味方 P1 土(2,5) / P2 水(3,5) / P3 氷(4,3)。敵A（火）は (2,0) で何もしない設定
    return build(['......', '......', '......', '......', '......', '......'], false,
      [['earth', 2, 5], ['water', 3, 5], ['ice', 4, 3]], [['fire', 2, 0]]);
  },
  function (g) {
    g.act('P1', [2, 5], 'up');            // 土: (1,3)(2,3)(1,2) に山
    g.act('P2', [2, 4], 'up');            // 水: (2,3) の山を下って (2,2)(2,1) が川、(2,0) の敵で止まる
    g.expectLog('【新案】山に当たって川になった');
    g.act('P3', [3, 2], 'left');          // 氷: (3,2) から左へ → (2,2) の川に冷気が触れる
    g.expectLog('【新案】凍結！ つながった水2マスが一気に凍った');
    check(g.tile(2, 2) === 'ice' && g.tile(2, 1) === 'ice', '川が氷になった');
    check(R.reachableCells(g.state, 'P3')['2,1'] !== undefined || R.reachableCells(g.state, 'P3')['2,2'] !== undefined, '凍った川の上を歩ける');
  });

// 竜巻は外している（tornadoRecipe: 'off'）。作り方を選べば動くことを、元の4マスの風で確かめる
scenario('7. 【新案・元の作り方】風でつむじ風 → もう一度風で竜巻 → 火を入れて火炎竜巻',
  function () {
    B.tornadoRecipe = 'windWind';
    B.windMode = 'line';
    return build(['......', '......', '......', '......', '......', '......'], false,
      [['wind', 2, 5], ['fire', 4, 5], ['water', 0, 5]], [['fire', 4, 1]]);
  },
  function (g) {
    g.act('P1', [2, 5], 'up');                    // 風: 吹き抜けた先 (2,1) につむじ風
    g.expectLog('【新案】吹き抜けた先につむじ風が残った');
    g.act('P2', [4, 3], 'up', false);
    g.act('P3', [0, 5], 'up', false);
    g.act('P1', [2, 5], 'up');                    // 2ターン目: もう一度風 → 竜巻（2×2）
    g.expectLog('【新案】つむじ風が育って竜巻になった');
    check(g.tile(2, 1) === 'tornado' && g.tile(3, 0) === 'tornado', '2×2の竜巻が立った');
    g.act('P2', [3, 2], 'up');                    // 火: すぐ上 (3,1) の竜巻に火
    g.expectLog('【新案】火炎竜巻！');
    g.expectLog('敵Aに20ダメージ');
    B.tornadoRecipe = 'off';
    B.windMode = 'breeze';
  });

scenario('7b. 【新案・元の作り方】風でつむじ風 → もう一度風で竜巻 → 水を入れてセンタクキ',
  function () {
    B.tornadoRecipe = 'windWind';
    B.windMode = 'line';
    return build(['......', '......', '......', '......', '......', '......'], false,
      [['wind', 2, 5], ['fire', 4, 5], ['water', 1, 4]], [['fire', 4, 1]]);
  },
  function (g) {
    g.act('P1', [2, 5], 'up');
    g.act('P2', [4, 5], 'up', false);
    g.act('P3', [1, 4], 'up', false);
    g.act('P1', [2, 5], 'up');                    // 竜巻 (2,0)(3,0)(2,1)(3,1)
    g.act('P3', [2, 3], 'up');                    // 水: (2,2) 池、(2,1) の竜巻に水 → センタクキ
    g.expectLog('【新案】センタクキ！');
    g.expectLog('センタクキで回された');
    check(g.tile(2, 1) === 'empty', '竜巻は跡形もなく消えた');
    B.tornadoRecipe = 'off';
    B.windMode = 'breeze';
  });

scenario('7c. 【新案】風でつむじ風 → 水を流して竜巻 → 火を入れてセンタクキ（1ターン）',
  function () {
    B.tornadoRecipe = 'windWater';
    B.windMode = 'line';
    return build(['......', '......', '......', '......', '......', '......'], false,
      [['wind', 2, 5], ['fire', 4, 3], ['water', 1, 4]], [['fire', 4, 1]]);
  },
  function (g) {
    g.act('P1', [2, 5], 'up');                    // 風: 吹き抜けた先 (2,1) につむじ風
    g.expectLog('【新案】吹き抜けた先につむじ風が残った');
    g.act('P3', [2, 3], 'up');                    // 水: (2,2) 池、(2,1) のつむじ風に水 → 竜巻
    g.expectLog('【新案】つむじ風が水を巻き上げて竜巻になった');
    check(g.tile(2, 1) === 'tornado' && g.tile(3, 0) === 'tornado', '2×2の竜巻が立った');
    g.act('P2', [3, 2], 'up');                    // 火: すぐ上 (3,1) の竜巻に火 → センタクキ
    g.expectLog('【新案】センタクキ！');
    check(!g.log.some(function (l) { return /火炎竜巻/.test(l); }), '火炎竜巻にはならない');
    B.tornadoRecipe = 'off';
    B.windMode = 'breeze';
  });

scenario('7d. 「燃え広がり」シナリオ: 森なしの火 → 風では敵は倒れない（弱い炎 5＋火傷）',
  function () { return R.startBattle(R.loadPreset('spread')).state; },
  function (g) {
    var e = R.enemiesOf(g.state)[0];
    check(R.getTile(g.state, e.x, e.y) === 'empty', '敵は空きマスで構えている');
    g.act('P2', [3, 4], 'left');          // 火: (2,4) に小さな炎
    g.act('P3', [2, 5], 'up');            // 風: (2,4) の小さな炎に当たって上へ燃え広がり
    g.expectLog('燃えた森はなし（弱い炎');
    var e2 = R.enemiesOf(g.state)[0];
    check(e2 && e2.hp === B.enemy.hp - B.fire.weakDamage && e2.burn === B.fire.burnTurns, '敵は倒れず、5と火傷');
  });

// ---------------------------------------------------------------
// 敵の予告を利用する（敵は 動いて予告 → 味方 → 発動 → ターン終了 の順）
function enemyAt(g, letter) { return R.enemiesOf(g.state).filter(function (e) { return e.letter === letter; })[0]; }

scenario('8. 【敵】敵の火を使う: 敵Aの予告先に風を吹かせる → 敵の火で火の渦 → 隣の敵Bが巻き込まれる',
  function () { return R.startBattle(R.loadPreset('useEnemyFire')).state; },
  function (g) {
    var a = enemyAt(g, 'A'), b = enemyAt(g, 'B');
    check(a.x === 3 && a.y === 2 && a.facing === 'down' && a.intent, '敵Aは (3,2) で下へ火を予告');
    check(b.x === 2 && b.y === 3 && b.intent && g.tile(2, 3) === 'forest', '敵Bは (2,3) の森の上で予告');
    g.act('P3', [3, 5], 'up');            // 風: (3,4)(3,3) に風が残る。敵Aの予告先 (3,3) も風の中
    check(R.forecast(g.state).enemies[0].finishers.some(function (f) { return f.name === '火の渦'; }), '予告の結果が「火の渦」に変わった');
    g.act('P1', [0, 5], 'up', false);
    g.act('P2', [5, 5], 'up', false);     // 3人とも行動 → 敵の魔法の発動
    g.expectLog('【新案】火の渦！');
    g.expectLog('敵Bは倒れた');
    check(!enemyAt(g, 'B'), '敵Bは敵Aの火の渦の強い炎（森の上）に巻き込まれて倒れた（敵Bの予告は発動しない）');
    check(R.alliesOf(g.state).length === 3, '味方は無事');
  });

scenario('9. 【敵】罠に踏み込む: 避けない敵Aは炎を踏み越えて来る／避ける敵Bは炎の列が燃え尽きるまで出られない',
  function () { return R.startBattle(R.loadPreset('trap')).state; },
  function (g) {
    var a = enemyAt(g, 'A'), b = enemyAt(g, 'B');
    check(a.y === 3, '敵A（通れない所だけ避ける）は炎の列を越えて (1,3) へ');
    check(b.x === 4 && b.y === 1, '敵B（危ない所も避ける）は動けない');
    check(R.startBattle(R.loadPreset('trap')).events.some(function (e) { return e.text === '敵Bは味方への道がないので、その場で構える'; }), '敵Bは道がないので、その場で構える');
    g.act('P1', [0, 5], 'up', false);
    g.act('P2', [3, 4], 'up');            // 火: (3,3) に小さな炎
    g.act('P3', [5, 3], 'left');          // 風: (4,3) → (3,3) の小さな炎に当たって、左へ燃え広がり
    g.expectLog('燃え広がり！');
    var a1 = enemyAt(g, 'A');
    check(a1 && a1.hp < B.enemy.hp && a1.burn > 0, '踏み込んだ敵Aは弱い炎で焼かれて火傷（足元が森ではないので倒れない）');
    check(R.alliesOf(g.state).length === 2, '風の味方は敵Bの土の予告先に立っていたので倒れる（引き換え）');
    check(g.tile(0, 2) === 'fire', '1回目のターン終了では炎の列は残る');
    check(enemyAt(g, 'B').x === 4 && enemyAt(g, 'B').y === 1, '敵Bはまだ出られない');
    R.alliesOf(g.state).forEach(function (al) { if (!g.state.result) g.act(al.id, [al.x, al.y], al.facing, false); });
    check([0, 1, 2, 3, 4, 5].every(function (x) { return g.tile(x, 2) !== 'fire'; }), '2回目のターン終了で炎の列が燃え尽きた');
    g.expectLog('炎が燃え尽きた（6マス）');
    var b3 = enemyAt(g, 'B');
    check(b3 && b3.y > 1, '3ターン目、敵Bが炎の向こうから出てきた');
  });

scenario('10. 【敵】敵だけの雷: 土で山 → 水で源流の川を敵Bの雷の先へ → 敵Bの雷が川に落ちて感電',
  function () { return R.startBattle(R.loadPreset('enemyThunder')).state; },
  function (g) {
    check(R.allyMagics(g.state).indexOf('thunder') < 0, '雷は敵だけの魔法');
    var b = enemyAt(g, 'B');
    check(b.x === 4 && b.y === 1 && b.intent, '敵Bは (4,1) で下へ雷を予告');
    g.act('P1', [1, 4], 'right');         // 土: (3,3)(3,4)(4,3) に山
    g.act('P2', [4, 5], 'up');            // 水: (4,4) → (4,3) の山に当たって源流。上へ流れて (4,2) が川
    g.expectLog('【新案】山に当たって川になった');
    g.act('P3', [5, 5], 'up', false);     // 3人とも行動 → 敵の魔法の発動
    g.expectLog('【新案】感電！');
    check(g.log.some(function (l) { return /敵B(に|は倒れた)/.test(l); }), '敵Bは自分の雷で感電した');
    check(R.alliesOf(g.state).length === 3, '味方は無事');
  });

// ---------------------------------------------------------------
scenario('11. 【チュートリアル】① 重ねる: 1回外してヒントが光る → 構える味方の風の前に火を置く → 燃え広がりで森ごと敵が燃える',
  function () { return R.startBattle(R.loadPreset('tut1')).state; },
  function (g) {
    var me = R.controllableOf(g.state)[0].id;
    var npc = R.alliesOf(g.state).filter(function (a) { return a.npc; })[0];
    check(npc && npc.intent && npc.facing === 'right', '構える味方は最初から右向きに風を構えている');
    g.act(me, [2, 2], 'up');              // 外す: (2,1) に火。風は (1,1) の何もない所に吹く
    g.expectLog('構える味方「風」が右へ風の魔法（吹き抜ける）→ 何も起きなかった');
    check(!g.state.result && g.state.turn === 2, '勝負はつかず、ターン2へ');
    g.expectLog('敵Aが左へ1マス進んだ');
    check(g.unit(R.enemiesOf(g.state)[0].id).x === 3 && g.tile(3, 1) === 'forest', '敵はまだ森の中 (3,1)');
    check(JSON.stringify(R.npcHintCells(g.state)) === '[[1,1]]', '構える味方が狙っている (1,1) が光る');
    g.act(me, [1, 2], 'up');              // 正解: (1,2) から上へ火 → (1,1) に小さな炎
    g.expectLog('小さな炎に風が当たった');
    g.expectLog('燃え広がり！ 右へ3マス走り、森4つが燃えた');
    g.expectLog('敵を全員倒した！（勝利）');
    check(g.state.result === 'win', '勝ち');
    check(B.spread.maxLength === 4 && B.windMode === 'breeze', 'このステージの数値はほかに漏れていない');
  });

scenario('12. 【チュートリアル】① 重ねる: 2回外すと、ターン2の終わりに敵が森から出て（移動と魔法のセット）構える味方を山の魔法で撃ち、失敗',
  function () { return R.startBattle(R.loadPreset('tut1')).state; },
  function (g) {
    var me = R.controllableOf(g.state)[0].id;
    g.act(me, [2, 2], 'up');              // ターン1: 外す → 敵は (3,1) へ（まだ森）。撃たない
    check(!g.log.some(function (l) { return /山の魔法/.test(l); }), 'ターン1は進むだけで撃たない');
    g.act(me, [2, 2], 'up');              // ターン2: また外す → 敵は (2,1) へ進み、そのまま撃つ
    g.expectLog('── 敵の移動と魔法 ──');
    g.expectLog('敵Aが左へ山の魔法（盛る）');
    g.expectLog('構える味方「風」は倒れた');
    g.expectLog('構える味方が倒れた…（失敗）');
    check(g.state.result === 'lose' && g.state.turn === 2, 'ターン2で失敗');
  });

scenario('13. ステージ② 2人で守る: 1ターン目は何もしない → 2ターン目に山使いがその場で上に山 → 水使いが右の腕に水 → 4行目が山と川でふさがり、ターン終了を待たずにその場で勝ち',
  function () { return R.startBattle(R.loadPreset('tut2')).state; },
  function (g) {
    var mount = R.controllableOf(g.state).filter(function (a) { return a.magic === 'mount'; })[0].id;
    var water = R.controllableOf(g.state).filter(function (a) { return a.magic === 'water'; })[0].id;
    check(R.forecast(g.state).rushes.every(function (r) { return r.reach; }), '最初は2体とも村へ届く道（村に -1）');
    g.endTurn();                          // 1ターン目は様子見（まだ間に合う）
    check(!g.state.result && g.state.turn === 2, '1ターン目では負けない');
    g.act(mount, null, 'up');             // 頂上 (0,3)、腕 (0,2)(0,4)(1,3) の T 字の山
    g.expectLog('山ができた×4');
    check(!g.state.result, '山だけではまだ');
    g.act(water, [1, 4], 'up');           // 右の腕 (1,3) に水 → 頂上と反対の右へ川
    g.expectLog('山の腕に当たって、頂上と反対の右へ川が流れ出した、右へ川が4マス流れた、盤の端まで流れた');
    check([0, 1, 2, 3, 4, 5].map(function (x) { return g.tile(x, 3); }).join(',') === 'mountain,mountain,river,river,river,river', '4行目が端から端までふさがった');
    g.expectLog('村への道をふさいだ！（勝利）');
    check(g.state.result === 'win' && g.state.turn === 2 && R.objectsOf(g.state, 'village').length === 4, 'ターン2のうちに、村は4つとも残って勝ち');
    check(!g.log.some(function (l) { return /体当たり/.test(l); }), '一度も体当たりされない');
    check(B.waterLength === 2 && B.tutorial.slope === false && B.mission.defense.turns === 5 && B.mission.defense.sealWin === false, 'このステージの数値はほかに漏れていない');
  });

// ---------------------------------------------------------------
// デモ（demos.js）の手順が、今のルールでも最後まで通って勝てるか
var DEMOS = require('../demos.js');
DEMOS.forEach(function (d) {
  scenario('デモ: ' + d.name, function () {
    B.tornadoRecipe = d.recipe || 'off';
    B.windMode = d.windMode || 'breeze';
    var pre = R.PRESETS.filter(function (p) { return p.id === d.preset; })[0];
    B.sakura.from = (pre && pre.sakuraFrom) || 'grass';
    var st = R.loadPreset(d.preset);
    if (d.enemyActs === false) st = R.editSetEnemyActs(st, false).state;
    return R.startBattle(st).state;
  }, function (g) {
    d.turns.forEach(function (turn) {
      turn.forEach(function (a) { if (!g.state.result) g.act(a.id, a.to, a.dir, a.shoot); });
    });
    if (d.goal === 'show') {
      var big = g.log.filter(function (l) { return /！/.test(l); });
      check(big.length > 0, '見せ場の決め手が起きる（' + big.join(' / ') + '）');
      return;
    }
    check(g.state.result === 'win', 'デモの手順で勝てる');
    var left = d.alliesLeft || 3;
    check(R.alliesOf(g.state).length === left, left === 3 ? '味方は誰も倒れない' : '残る味方は ' + left + ' 人');
  });
});


// ---------------------------------------------------------------
// 新案プレイ（checks.js）の手順が今のルールで最後まで通り、見せたい盤面になるか
var CHECKS = require('../checks.js');
function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a[k]; }, o); }
function setPath(o, p, v) { var ks = p.split('.'), last = ks.pop(); ks.reduce(function (a, k) { return a[k]; }, o)[last] = v; }
CHECKS.forEach(function (c) {
  var saved = {};
  scenario('新案プレイ: ' + c.name, function () {
    B.tornadoRecipe = 'off'; B.windMode = 'breeze'; B.sakura.from = 'grass';
    Object.keys(c.set || {}).forEach(function (p) { saved[p] = getPath(B, p); setPath(B, p, c.set[p]); });
    var st = R.buildPreset(c.layout);
    if (c.enemyActs === false) st = R.editSetEnemyActs(st, false).state;
    return R.startBattle(st).state;
  }, function (g) {
    try {
      c.turns.forEach(function (turn) {
        turn.forEach(function (a) {
          if (g.state.result) return;
          if (a.endTurn) g.endTurn();
          else if (a.id) g.act(a.id, a.to, a.dir, a.shoot);
        });
      });
      var ex = c.expect || {};
      Object.keys(ex.tiles || {}).forEach(function (k) {
        var p = k.split(',').map(Number);
        check(g.tile(p[0], p[1]) === ex.tiles[k], '(' + k + ') が ' + ex.tiles[k] + '（今: ' + g.tile(p[0], p[1]) + '）');
      });
      Object.keys(ex.at || {}).forEach(function (id) {
        var u = g.unit(id);
        check(u && u.x === ex.at[id][0] && u.y === ex.at[id][1], id + ' が (' + ex.at[id] + ') にいる');
      });
      (ex.gone || []).forEach(function (id) { check(!g.unit(id), id + ' は倒れている'); });
      Object.keys(ex.hp || {}).forEach(function (id) {
        var u = g.unit(id);
        check(u && u.hp === ex.hp[id], id + ' の HP が ' + ex.hp[id] + '（今: ' + (u && u.hp) + '）');
      });
    } finally {
      Object.keys(saved).forEach(function (p) { setPath(B, p, saved[p]); });
    }
  });
});

console.log('\n' + (failures ? failures + ' 件の確認に失敗' : 'すべてのシナリオが期待どおり'));
if (failures) process.exitCode = 1;
