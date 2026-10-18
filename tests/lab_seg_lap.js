/*
 * N7 区切りの道（10/19）: 今のクエストの数で1周したとき、節目にいくつ届くか・覚醒に届くかを数える。  node tests/lab_seg_lap.js
 *   1周 = 第1章と第2章のキークエストと寄り道を全部（裏クエストを受けない「おだやか」の道と、受ける「荒れている」の道）。
 *   誰がミッションを取るかは遊び方しだいなので、3つの取り方で数える（どれも【仮】の見積もり）。
 *     match: ミッションのやりたいことと合う仲間（連れていく3人の中）が取る。いなければ、おすすめの先頭の仲間
 *     even : 連れていく3人に、ミッションを順に1つずつ
 *     one  : 1人（火）が全部取る（上限の見積もり）
 *   連れていく3人は、クエストのおすすめの魔法（盤面の味方の並び）。土は「谷の魔物を誘い出せ」のあとに仲間になる。
 */
var R = require('../rules.js');
var Q = require('../lab_quest.js');
var LL = R.LX.L, N = LL.N;

function route(order) {
  var c = Q.newCampaign(), out = [];
  if (order === 'rough') c = Q.accept(c, 'c1dark').c;
  for (var guard = 0; guard < 20; guard++) {
    var b = Q.board(c).filter(function (q) { return q.kind !== 'dark' || order === 'rough'; });
    if (!b.length) break;
    var q = b[0];
    out.push(q);
    c = Q.finish(c, q.id, true).c;
  }
  return out;
}
function party(q, roster) {
  var rec = Q.recommend(q, R.findPreset).filter(function (m) { return roster.indexOf(m) >= 0; });
  roster.forEach(function (m) { if (rec.length < 3 && rec.indexOf(m) < 0) rec.push(m); });
  return rec.slice(0, 3);
}
function lap(order, mode, len) {
  R.labApply(['N7'], { N7: { len: len } });
  var roster = Q.ROSTER_START.slice(), paths = {}, list = route(order), missions = 0, dark = 0;
  list.forEach(function (q) {
    var pt = party(q, roster), i = 0;
    q.missions.forEach(function (id) {
      var t = LL.targetDef(id);
      if (!t) return;
      if (t.dir === 'dark') { dark++; return; }
      missions++;
      var who = mode === 'one' ? 'fire' : mode === 'even' ? pt[i++ % pt.length] : (pt.filter(function (m) { return N.wantOf(m) === t.dir; })[0] || pt[0]);
      if (mode === 'one' && pt.indexOf('fire') < 0) who = 'fire';
      paths[who] = paths[who] || LL.newPath(who);
      LL.gain(paths[who], who, t.dir);
    });
    if (q.reward && q.reward.join && roster.indexOf(q.reward.join) < 0) roster.push(q.reward.join);
  });
  var rows = Object.keys(paths).map(function (m) {
    var p = LL.normPath(m, paths[m]);
    return { m: m, cells: p.road.length, ms: p.ms.map(function (x) { return x.kind; }), form: p.form, awake: p.awake };
  });
  return { quests: list.map(function (q) { return q.name; }), missions: missions, dark: dark, rows: rows };
}
var NAME = { change: '変化', fuse: '融合', awake: '覚醒', range: '範囲', tbd: '未定' };
['calm', 'rough'].forEach(function (order) {
  var first = lap(order, 'match', 5);
  console.log('\n■ ' + (order === 'calm' ? 'おだやか（裏クエストを受けない）' : '荒れている（裏クエストを受ける）') + ': クエスト' + first.quests.length + '件（' + first.quests.join('・') + '）・道に入るミッション ' + first.missions + '（闇のミッション ' + first.dark + '）');
  [3, 5, 7].forEach(function (len) {
    ['match', 'even', 'one'].forEach(function (mode) {
      var r = lap(order, mode, len);
      console.log('  区切り' + len + ' ' + mode + ': ' + r.rows.map(function (x) {
        return R.magicName(x.m) + ' ' + x.cells + 'マス 節目' + x.ms.length + (x.ms.length ? '（' + x.ms.map(function (k) { return NAME[k]; }).join('→') + '）' : '') + (x.awake ? ' 覚醒' : '');
      }).join(' ／ '));
    });
  });
});
R.labApply([]);
