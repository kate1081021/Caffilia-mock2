/*
 * 一斉発動・チュートリアル3つ・文章（IMPROVE_simul）のテスト。  node tests/simul.js
 *   ターンの形は BALANCE.turnMode（'single' 1人ずつ／'simul' 一斉）。テストの中で切り替え、終わったら元に戻す。
 */
var R = require('../game/rules.js');
var B = require('../game/balance.js');
var IO = require('../game/texts_io.js');
var TEXTS = require('../game/texts.js');

var passed = 0, failed = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed.push(name); console.log('  NG  ' + name); console.log('        ' + (e && e.message)); }
  finally { B.turnMode = 'single'; }
}
function eq(a, b, msg) { var x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((msg ? msg + ': ' : '') + 'expected ' + y + ' but got ' + x); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function mode(m) { B.turnMode = m; }
// 3人の一斉発動を確かめる盤面（前のチュートリアル③「3人で合わせる」の配置。ステージは 10/17 に消し、テストの盤面としてだけ残した）。
//   土 (4,6)・草 (3,6)・風 (2,6)、火の敵2体。一例: 土がその場で上 → 草がその場で上 → 風が (3,5) で上 → 桜吹雪で敵2体
var TRIO = {
  rows: ['.......', '.......', '.......', '.......', '.......', '.......', '.......'],
  allies: [['earth', 4, 6], ['grass', 3, 6], ['wind', 2, 6]],
  enemies: [['fire', 2, 0], ['fire', 4, 0]],
  overrides: { 'enemy.move': 1, 'ally.move': 2, 'sakura.from': 'grass' }   // 土 → 草 → 風は元の試しの起こし方（標準は火山に風。オーナー 10/17）。一斉発動の仕組みを見る盤面なのでそのまま
};
function start(id) { return R.startBattle(id === 'trio' ? R.buildPreset(TRIO) : R.loadPreset(id)).state; }
function byMagic(s, m) { return R.controllableOf(s).filter(function (a) { return a.magic === m; })[0]; }
function act(s, id, to, dir, shoot) { var r = R.act(s, id, { to: to, dir: dir, shoot: shoot }); if (!r.ok) throw new Error(id + ': ' + r.error); return r; }
function names(ev, type) { return ev.filter(function (e) { return e.type === type; }).map(function (e) { return e.name; }); }
// 手順（[[魔法, [x,y], 向き], …]）をそのターンに打ち、ターンを終える（1人ずつ: 全員撃ったら終わる、一斉: 構えてから発動）
function playTurn(s, moves) {
  var ev = [];
  moves.forEach(function (m) {
    if (s.result) return;
    var u = byMagic(s, m[0]);
    var r = act(s, u.id, m[1], m[2], m[3]);
    ev = ev.concat(r.events);
    s = r.state;
  });
  if (!s.result) { var t = R.endTurn(s); ev = ev.concat(t.events); s = t.state; }
  return { state: s, events: ev };
}

console.log('\n■ ターンの形');
test('初期値は 1人ずつ（node のテスト・探索は今までどおり）', function () {
  eq(B.turnMode, 'single');
  ok(!R.simulOn());
});
test('1人ずつ: 撃つとすぐ起きる（構えは出ない）', function () {
  var s = start('tut1'), p = R.controllableOf(s)[0];
  var r = act(s, p.id, [1, 2], 'up');
  ok(r.events.some(function (e) { return e.type === 'cast'; }), 'すぐ撃つ');
  ok(!R.findUnit(r.state, p.id).stance, '構えはない');
});
test('一斉: 構えるとまだ起きず、盤面は変わらない。予告（forecast の allies）に、構えた順で出る', function () {
  mode('simul');
  var s = start('trio');
  var r = act(s, 'P1', [4, 6], 'up');
  ok(!r.events.some(function (e) { return e.type === 'cast'; }), '撃たない');
  eq(r.state.tiles, s.tiles, '盤面は変わらない');
  ok(r.events.some(function (e) { return e.type === 'stance' && e.order === 1; }), '構えの出来事（1番目）');
  var s2 = act(r.state, 'P2', [3, 6], 'up').state;
  eq(R.stanceList(s2).map(function (a) { return a.id; }), ['P1', 'P2']);
  var fc = R.forecast(s2);
  eq(fc.allies.map(function (p) { return [p.id, p.order]; }), [['P1', 1], ['P2', 2]]);
  ok(fc.allies[1].tileChanges.some(function (c) { return c.to === 'sakura'; }), '2番目（草）の予告で桜が咲く');
});
test('一斉: 構え直しは向きだけ（動けない）。順番はそのまま。待機にすると構えは消える', function () {
  mode('simul');
  var s = start('trio');
  s = act(s, 'P1', [4, 6], 'up').state;
  s = act(s, 'P2', [3, 6], 'up').state;
  ok(!R.act(s, 'P1', { to: [4, 5], dir: 'up' }).ok, '構え直しでは動けない');
  eq(Object.keys(R.reachableCells(s, 'P1')), ['4,6'], '動けるマスは今の所だけ');
  var r = act(s, 'P1', [4, 6], 'left');
  eq([R.findUnit(r.state, 'P1').facing, R.stanceOrder(r.state, 'P1')], ['left', 1], '向きが変わり、1番目のまま');
  ok(/構え直した/.test(r.events.map(function (e) { return e.text; }).join()), 'ログは「構え直した」');
  var w = act(r.state, 'P1', [4, 6], 'up', false);
  ok(!R.findUnit(w.state, 'P1').stance, '待機で構えが消える');
  eq(R.stanceOrder(w.state, 'P2'), 1, '草が1番目に繰り上がる');
});
test('一斉: 並べ替え（▲▼）で順番が入れ替わる。端より先へは動かせない。構える味方は動かせない', function () {
  mode('simul');
  var s = start('trio');
  s = act(s, 'P1', [4, 6], 'up').state;
  s = act(s, 'P2', [3, 6], 'up').state;
  var r = R.reorderStance(s, 'P2', -1);
  ok(r.ok);
  eq(R.stanceList(r.state).map(function (a) { return a.id; }), ['P2', 'P1']);
  ok(!R.reorderStance(s, 'P1', -1).ok, '1番目より前へは動かせない');
  var t = start('tut1');
  var npc = R.alliesOf(t).filter(function (a) { return a.npc; })[0];
  ok(!R.reorderStance(t, npc.id, -1).ok, '構える味方は動かせない');
});
test('一斉: 発動は構えた順に1人ずつ（出来事に順番）。そのあと敵が発動する', function () {
  mode('simul');
  var s = start('tut2');
  s = act(s, byMagic(s, 'mount').id, [0, 5], 'up').state;
  s = act(s, byMagic(s, 'water').id, [1, 4], 'up').state;
  var t = R.endTurn(s);
  var casts = t.events.filter(function (e) { return e.type === 'cast'; });
  eq(casts.slice(0, 2).map(function (e) { return [e.magic, e.order]; }), [['mount', 1], ['water', 2]]);
  var phases = t.events.filter(function (e) { return e.type === 'phase'; }).map(function (e) { return e.text; });
  ok(/構えの発動/.test(phases[0]), phases.join());
  ok(R.alliesOf(t.state).every(function (a) { return !a.stance && !a.acted; }), '次のターンは構えも行動も空に');
});
test('一斉: 予測（previewAct）は構えた順に全部起きたあと。敵の予告はその盤面で計算し直す', function () {
  mode('simul');
  var s = start('trio');
  s = act(s, 'P1', [4, 6], 'up').state;
  s = act(s, 'P2', [3, 6], 'up').state;
  var pv = R.previewAct(s, 'P3', [3, 5], 'up');
  eq(names(pv.events, 'finisher'), ['桜吹雪']);
  ok(pv.damages.filter(function (d) { return d.side === 'enemy' && d.dies; }).length === 2, '敵2体が倒れる予測');
  var fc = R.forecast(pv.state);
  ok(fc.enemies.every(function (e) { return e.cancelled; }), '敵の予告は「先に倒れるので発動しない」に変わる');
  eq(pv.order, 3);
});
test('一斉: 3人の魔法がつながった決め手は「合体」（参加した味方を発動した順に）', function () {
  mode('simul');
  var t = playTurn(start('trio'), [['earth', [4, 6], 'up'], ['grass', [3, 6], 'up'], ['wind', [3, 5], 'up']]);
  var f = t.events.filter(function (e) { return e.type === 'finisher'; })[0];
  eq([f.name, f.combo, f.comboMagics], ['桜吹雪', ['P1', 'P2', 'P3'], ['earth', 'grass', 'wind']]);
  eq(t.state.result, 'win');
});
test('一斉: 1人で起こした決め手は合体にならない', function () {
  mode('simul');
  var s = R.createState({ size: 6, blank: true, enemyActs: false });
  R.setTile(s, 2, 3, 'smallfire');
  R.addAlly(s, 'wind', 2, 5, 'up');
  R.addEnemy(s, 'fire', 0, 0, 'down');
  s = R.startBattle(s).state;
  var t = playTurn(s, [['wind', [2, 4], 'up']]);
  var f = t.events.filter(function (e) { return e.type === 'finisher'; })[0];
  ok(f && f.name === '燃え広がり' && !f.combo, '合体なし');
});
test('1人ずつ: 合体は出ない（今のまま）', function () {
  var t = playTurn(start('trio'), [['earth', [4, 6], 'up'], ['grass', [3, 6], 'up'], ['wind', [3, 5], 'up']]);
  var f = t.events.filter(function (e) { return e.type === 'finisher'; })[0];
  ok(f && !f.combo);
});

console.log('\n■ チュートリアル（両方のターンの形でクリアできる）');
['single', 'simul'].forEach(function (m) {
  test('① 重ねる（' + m + '）: 火を (1,2) から上へ → 構える味方の風で燃え広がり、1ターンで勝ち', function () {
    mode(m);
    var t = playTurn(start('tut1'), [['fire', [1, 2], 'up']]);
    eq(t.state.result, 'win');
    ok(names(t.events, 'finisher').indexOf('燃え広がり') >= 0);
    if (m === 'simul') {
      var f = t.events.filter(function (e) { return e.type === 'finisher'; })[0];
      eq(f.comboMagics, ['fire', 'wind'], '自分の火 → 仲間の風で合体');
    }
  });
  test('② 2人で守る（' + m + '）: 山 → 水で川の壁。ふさいだらキーでクリア', function () {
    mode(m);
    var t = playTurn(start('tut2'), [['mount', [0, 5], 'up'], ['water', [1, 4], 'up']]);
    eq([0, 1, 2, 3, 4, 5].map(function (x) { return R.getTile(t.state, x, 3); }), ['mountain', 'mountain', 'river', 'river', 'river', 'river']);
    eq([t.state.result, R.sealReady(t.state)], [null, true], '勝手には勝たない');
    var c = R.claimSeal(t.state);
    eq([c.state.result, c.state.resultText], ['win', '村への道をふさいだ！（勝利）']);
  });
});
test('② 一斉: 水 → 山の順だと泥沼（予測でも分かる）。並べ替えると川の壁', function () {
  mode('simul');
  var s = start('tut2');
  s = act(s, byMagic(s, 'water').id, [1, 4], 'up').state;
  s = act(s, byMagic(s, 'mount').id, [0, 5], 'up').state;
  var r = R.fireAllStances(s);
  eq(R.getTile(r.after, 1, 3), 'mud', '水 → 山: 泥沼');
  var sw = R.reorderStance(s, byMagic(s, 'water').id, 1).state;
  eq(R.getTile(R.fireAllStances(sw).after, 2, 3), 'river', '山 → 水: 川');
});
test('① 一斉: 構える味方は最初から構えていて、順番はいつも最後', function () {
  mode('simul');
  var s = start('tut1');
  var npc = R.alliesOf(s).filter(function (a) { return a.npc; })[0];
  eq(R.forecast(s).allies.map(function (p) { return p.id; }), [npc.id], '最初から予告に出る');
  s = act(s, byMagic(s, 'fire').id, [1, 2], 'up').state;
  eq(R.stanceList(s).map(function (a) { return a.npc ? 'npc' : a.magic; }), ['fire', 'npc']);
});
test('① 一斉: 外すと「火は点いたのに、風は別の所」。構える味方の風は (1,1)(2,1) を吹く（風は2マス）', function () {
  mode('simul');
  var t = playTurn(start('tut1'), [['fire', [0, 3], 'up']]);
  var casts = t.events.filter(function (e) { return e.type === 'cast'; });
  eq(casts.slice(0, 2).map(function (e) { return e.cells; }), [[[0, 2]], [[1, 1], [2, 1]]]);
  ok(!t.state.result);
});
test('やり直しのヒントはターンの形ごと（texts.js）', function () {
  ['single', 'simul'].forEach(function (m) {
    mode(m);
    var lost = R.startBattle(R.loadPreset('tut2')).state;
    for (var i = 0; i < 5 && !lost.result; i++) lost = R.endTurn(lost).state;
    var r = R.retryStage(lost);
    eq(R.stageHint(r.state), TEXTS.stages.tut2.hint[m]);
  });
});

console.log('\n■ 文章（texts.js・texts_io.js）');
test('texts.js は書き出し（serialize）と同じ形。読み込み直すと同じ中身', function () {
  var fs = require('fs'), path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'game', 'texts.js'), 'utf8');
  eq(IO.serialize(TEXTS), src, 'ファイルが serialize の出力どおり');
  eq(IO.parse(src), TEXTS);
});
test('3つのチュートリアルに名前・目標・場面がある。仮の文は【仮】か「（ここに文章）」', function () {
  ['tut1', 'tut2', 'ex3'].forEach(function (id) {
    var st = TEXTS.stages[id];
    ok(st && st.name && st.goal, id);
    ok(st.scenes.start.length >= 2, id + ' の始めの文');
    st.scenes.start.forEach(function (l) { ok(/【仮】|（ここに文章）/.test(l.text), id + ': ' + l.text); });
  });
});
test('書き換えた所だけを出す（diff・exportText）。文の並びはまるごと1つ', function () {
  var cur = IO.clone(TEXTS);
  cur.savedAt = '2099-01-01 00:00:00';
  cur.stages.tut1.goal = '新しい目標';
  cur.stages.tut1.scenes.start.push({ who: 'だれか', text: '新しい文', mode: 'simul' });
  var d = IO.diff(TEXTS, cur);
  eq(d.map(function (c) { return c.path; }), ['stages.tut1.goal', 'stages.tut1.scenes.start'], 'savedAt は数えない');
  var out = IO.exportText(d);
  ok(/新しい目標/.test(out) && /［一斉だけ］だれか「新しい文」/.test(out), out);
  eq(IO.exportText([]), '（書き換えた所はありません）');
});
test('書き換えて保存したファイルを読み込み直すと、書き換えが残っている', function () {
  var cur = IO.clone(TEXTS);
  cur.stages.ex3.scenes.win = [{ who: '', text: 'やった！', mode: 'both' }];
  cur.savedAt = IO.stamp(new Date(2099, 0, 2, 3, 4, 5));
  var back = IO.parse(IO.serialize(cur));
  eq(back.stages.ex3.scenes.win[0].text, 'やった！');
  eq(back.savedAt, '2099-01-02 03:04:05');
});
test('ルールの中に、チュートリアルのヒントの文を持たない（texts.js から読む）', function () {
  ok(!R.TUTORIALS.some(function (t) { return t.retryHint; }));
});

console.log('\n' + passed + ' 件成功 / ' + failed.length + ' 件失敗');
if (failed.length) { console.log('失敗: ' + failed.join(' / ')); process.exitCode = 1; }
