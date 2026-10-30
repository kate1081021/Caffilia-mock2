/*
 * texts_ui.js — 会話の窓（IMPROVE_simul）
 *   文の中身は texts.js（window.TEXTS）。ui.js のあとに読み込む。
 *
 *   会話の窓: ステージのきっかけ（始め・Nターン目・構えた・発動の前・決め手・敵の予告・クリア・負け・やり直し）で、
 *     そのきっかけの文を順に出す。押す（クリックかスペース）と次の文へ。窓は画面の下で、盤面は見えたまま。
 *     同じ場面は1回の挑戦で1度だけ（やり直すとまた流れる）。
 *   文章パネル（文を書き換えて texts.js に保存する）と、窓の ✎ は IMPROVE_v3 段1（オーナー 10/30）でアーカイブした。
 *     文を変えるときは texts.js を直す。エディットで作ったステージの文は、エディットの「会話の窓の文」で書く。
 */
(function () {
  'use strict';

  var app = window.CafiliaApp;
  var R = window.Rules;
  var cur = window.TEXTS || { ui: {}, finishers: {}, stages: {} };   // ui.js が、エディットで作ったステージの文を cur.stages に足す

  var $ = function (id) { return document.getElementById(id); };
  var el = { dialog: $('dialog') };

  function esc(t) {
    return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // ---------------------------------------------------------------
  // 会話の窓
  // ---------------------------------------------------------------
  var dlg = { queue: [], cur: null, done: [] };
  function stageId() { return (app.state && app.state.stage) || app.scenario || ''; }
  function stageOf(id) { return (cur.stages || {})[id] || null; }
  // 場面の文（今のターンの形に合う行だけ）を窓に積む。ref で、どの文かを覚える
  function queueScene(sid, sceneKey, force) {
    var st = stageOf(sid);
    var lines = st && st.scenes && st.scenes[sceneKey];
    if (!lines || !lines.length) return false;
    var any = false;
    lines.forEach(function (l, i) {
      if (!force && !app.modeOk(l)) return;
      dlg.queue.push({ stage: sid, scene: sceneKey, index: i });
      any = true;
    });
    return any;
  }
  function lineOf(ref) {
    var st = stageOf(ref.stage);
    return st && st.scenes && st.scenes[ref.scene] && st.scenes[ref.scene][ref.index];
  }
  function showNext() {
    dlg.cur = null;
    while (dlg.queue.length && !dlg.cur) {
      var ref = dlg.queue.shift();
      if (lineOf(ref)) dlg.cur = ref;
    }
    if (!dlg.cur) { closeDialog(); return; }
    renderDialog();
  }
  function renderDialog() {
    var l = lineOf(dlg.cur);
    if (!l) { showNext(); return; }
    el.dialog.hidden = false;
    el.dialog.innerHTML = (l.who ? '<div class="d-who">' + esc(l.who) + '</div>' : '') +
      '<div class="d-text">' + esc(l.text) + '</div>' +
      '<div class="d-foot"><span>' + esc(((cur.ui || {}).dialogNext) || 'クリックかスペースで次へ') + '</span><span>' + (dlg.queue.length ? 'あと' + dlg.queue.length : '') + '</span></div>';
  }
  function closeDialog() {
    el.dialog.hidden = true;
    el.dialog.innerHTML = '';
    dlg.cur = null;
    var fns = dlg.done;
    dlg.done = [];
    fns.forEach(function (fn) { fn(); });
  }
  // 積んだ文を流す。done は窓が閉じたら（文がなければすぐ）呼ぶ
  function play(done) {
    if (done) dlg.done.push(done);
    if (!dlg.cur) showNext();
  }
  el.dialog.addEventListener('click', function () { showNext(); });
  // スペースで次へ（窓が出ている間はゲームのキーより先に受け取る）
  document.addEventListener('keydown', function (e) {
    if (el.dialog.hidden) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); e.stopPropagation(); showNext(); }
  }, true);

  // ---------------------------------------------------------------
  // きっかけ（ui.js から呼ばれる）。同じ場面は1回の挑戦で1度だけ
  // ---------------------------------------------------------------
  var played = {};
  function trigger(keys, done) {
    var sid = stageId();
    if (!stageOf(sid)) { if (done) done(); return; }
    var any = false;
    keys.forEach(function (k) {
      if (played[sid + '|' + k]) return;
      var st = stageOf(sid);
      if (!st.scenes || !st.scenes[k]) return;
      played[sid + '|' + k] = true;
      if (queueScene(sid, k)) any = true;
    });
    if (any || dlg.cur) play(done); else if (done) done();
  }
  function resetPlayed(keep) {
    var sid = stageId();
    Object.keys(played).forEach(function (k) { if (k.indexOf(sid + '|') === 0 && keep.indexOf(k.slice(sid.length + 1)) < 0) delete played[k]; });
  }
  function enemyIntentNow() { return app.state && R.enemiesOf(app.state).some(function (e) { return e.intent; }); }
  app.onStage = function (kind) {
    dlg.queue = [];
    if (dlg.cur) closeDialog();
    if (kind === 'retry') {
      resetPlayed(['start', 'turn:1']);
      trigger(['retry']);
    } else {
      resetPlayed([]);
      trigger(['start', 'turn:1'].concat(enemyIntentNow() ? ['enemyIntent'] : []));
    }
  };
  app.onAct = function (u, shoot) { if (shoot) trigger(['stance:' + u.magic, 'stance']); };
  // 窓が閉じたら fn（出ていなければすぐ）。展示モードで、クリアの文を読み終えてから次のステージへ進むのに使う
  app.afterDialog = function (fn) { if (dlg.cur) dlg.done.push(fn); else fn(); };
  // エディットに入ったら、テストプレイで出ていた文は閉じる（盤面を隠さない）
  app.closeDialog = function () { dlg.queue = []; if (dlg.cur) closeDialog(); };
  // 発動（ターン終了）を押したら、出ている文（始めの文など）は閉じて、すぐ発動する。
  //   開いたままだと窓を閉じるまで発動が待たされ、「魔法を撃ってくれない」に見えていた（10/17）。発動の前の文（beforeFire）があるときだけ、読み終えてから
  app.onBeforeFire = function (go) {
    dlg.queue = [];
    if (dlg.cur) closeDialog();
    trigger(['beforeFire'], go);
  };
  app.onEvent = function (e) {
    if (e.type === 'finisher') trigger(['finisher:' + e.name, 'finisher']);
    else if (e.type === 'intent' && e.side === 'enemy') trigger(['enemyIntent']);
    else if (e.type === 'turnStart' && app.state) trigger(['turn:' + app.state.turn]);
    else if (e.type === 'result') trigger([e.result === 'win' ? 'win' : 'lose']);
    else if (e.type === 'exHint') trigger(['hint:' + e.key]);     // 展示ステージ③: 山がないまま・火山があるのに桜吹雪なし
    else if (e.type === 'mission') trigger(['mission:' + e.id, 'mission']);   // 展示ステージ③: ミッション達成
  };

  // 確かめ用（コンソールから）
  app.texts = { cur: function () { return cur; }, queueScene: queueScene, play: play, dialog: dlg };

  // 最初のシナリオの「ステージの始め」は、このファイルを読む前に済んでいるので、ここで流す
  if (app.onStage && stageOf(stageId())) app.onStage('start');
})();
