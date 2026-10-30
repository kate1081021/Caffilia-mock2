/*
 * progress_ui.js — 進行モック（クエスト制とステージ制）の画面。決まりは progress.js、中身は progress_data.js。
 *   ui.js・texts_ui.js のあとに読み込む。戦闘は既存の画面（ui.js）をそのまま使い、盤面を作って渡すだけ（app.startCustom）。
 *
 *   画面: タイトル（進行の形を選ぶ）→ クエストボード／ステージの道 → 連れていく仲間 → 戦闘 → 報酬 → … → 1周の結果
 *         パーティ（今の仲間と強化）はいつでも見られる
 *   1周の状態は localStorage（caffilia-run。読み書きは try/catch）に残す。読み込み直すと、戦闘中なら その戦闘の最初から。
 *   上のバーの「進行モック」で開く（URL の末尾が #run でも開く）。
 */
(function () {
  'use strict';

  var P = window.Progress, R = window.Rules, D = window.RUN_DATA, app = window.CafiliaApp;
  var RUN_KEY = 'caffilia-run';
  var $ = function (id) { return document.getElementById(id); };
  var el = { screen: $('runScreen'), bar: $('runBar'), btn: $('btnRun'), modal: $('runModal') };

  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function T(k, fb) { var r = (window.TEXTS || {}).run || {}; return r[k] !== undefined && r[k] !== '' ? r[k] : (fb || k); }
  function mag(m) { return R.magicName(m); }
  function save() { try { if (run) window.localStorage.setItem(RUN_KEY, JSON.stringify(run)); else window.localStorage.removeItem(RUN_KEY); } catch (e) { /* 残せなくても遊べる */ } }
  function load() { try { var r = window.localStorage.getItem(RUN_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }

  var run = null;          // 1周の状態（progress.js）
  var view = 'title';      // title | hub | team | battle | reward | result
  var pickRef = null;      // 受けようとしている戦闘
  var team = [];           // 選んでいる仲間（並び ＝ 置き場所の順）
  var rewardPick = -1;
  var battleOver = false;

  // ---------------------------------------------------------------
  // 小さな部品
  // ---------------------------------------------------------------
  var TYPE = { key: function () { return T('key', 'キークエスト'); }, rich: function () { return T('rich', 'おいしい寄り道'); }, easy: function () { return T('easy', '簡単な寄り道'); }, stage: function () { return T('stageLabel', 'ステージ'); } };
  var MINI = { '.': 'e', F: 'f', M: 'm', R: 'r', X: 'x', s: 'x', P: 'r', h: 'm', g: 'f' };
  // 盤面の小さな絵（地形・敵・村・連れていく仲間の置き場所に番号）
  function miniMap(def, names) {
    var w = def.rows[0].length, h = def.rows.length, cells = [];
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) cells.push({ c: MINI[def.rows[y][x]] || 'e', t: '' });
    var at = function (x, y) { return cells[y * w + x]; };
    def.enemies.forEach(function (e, i) { var c = at(e[1], e[2]); c.t = (def.enemyHp && def.enemyHp[i] ? '主' : '敵'); c.u = 'en'; });
    (def.villages || []).forEach(function (v) { var c = at(v[0], v[1]); c.t = '村'; c.u = 'vi'; });
    def.slots.forEach(function (sl, i) { var c = at(sl[0], sl[1]); c.t = names && names[i] ? names[i] : '①②③'[i]; c.u = 'al'; });
    return '<div class="mini" style="--w:' + w + '">' + cells.map(function (c) { return '<span class="m-' + c.c + (c.u ? ' u-' + c.u : '') + '">' + esc(c.t) + '</span>'; }).join('') + '</div>';
  }
  function recHtml(list) {
    return '<span class="rec"><b>' + esc(T('recommend', 'おすすめ')) + '</b> ' + list.map(function (m) {
      return '<span class="mg' + (run && !P.owned(run, m) ? ' not-owned' : '') + '" title="' + (run && !P.owned(run, m) ? esc(T('notOwned', 'まだ持っていない')) : '') + '">' + esc(mag(m)) + '</span>';
    }).join('') + (run && list.some(function (m) { return !P.owned(run, m); }) ? '<small>' + esc(T('notOwnedNote', '（色の薄い魔法は、まだ持っていない）')) + '</small>' : '') + '</span>';
  }
  function enemiesText(def) {
    var by = {};
    def.enemies.forEach(function (e, i) { var k = mag(e[0]) + (def.enemyHp && def.enemyHp[i] ? '（HP' + def.enemyHp[i] + '）' : ''); by[k] = (by[k] || 0) + 1; });
    return Object.keys(by).map(function (k) { return k + '×' + by[k]; }).join('・');
  }
  function rewardHtml(e) {
    return '<span class="rw"><b>' + esc(T('reward', '報酬')) + '</b> ' + (e.magic ? '<span class="mg new">' + esc(T('newMagic', '新しい魔法')) + ' ' + esc(mag(e.magic)) + '</span> ' : '') +
      esc(T('upgradePicks', '強化の候補')) + ' ' + e.candidates + esc(T('choices', '択')) + '</span>';
  }
  function upgradeBars(magic) {
    return (D.directions[magic] || []).map(function (d) {
      var lv = (run.upgrades[magic] || {})[d.id] || 0, bar = '';
      for (var i = 1; i <= D.maxLevel; i++) bar += '<i class="' + (i <= lv ? 'on' : '') + '"></i>';
      return '<span class="up" title="' + esc(d.note) + '"><span class="up-n">' + esc(d.name) + '</span><span class="bar">' + bar + '</span></span>';
    }).join('');
  }
  function upgradeTag(magic) {
    var ef = P.effectsOf(run, magic), parts = (D.directions[magic] || []).map(function (d) { return d.name + ((run.upgrades[magic] || {})[d.id] || 0); });
    return T('upgradeLabel', '強化') + ' ' + parts.join('・') + (ef.power ? '（' + T('powerShort', '直撃') + '+' + ef.power + '）' : '');
  }
  function card(e, opts) {
    var def = D.battles[e.battle];
    var state = e.state === 'win' ? T('done', 'クリア') : e.state === 'lose' ? T('failed', '失敗') : e.state === 'locked' ? T('locked', '寄り道の回数を使い切った') : '';
    return '<div class="q-card t-' + e.type + (e.boss ? ' boss' : '') + ' s-' + e.state + '">' +
      '<div class="q-head"><span class="q-type">' + esc(TYPE[e.type]()) + (e.boss ? ' ・' + esc(T('boss', 'ボス')) : '') + '</span><b>' + esc(def.name) + '</b>' + (state ? '<span class="q-state">' + esc(state) + '</span>' : '') + '</div>' +
      '<div class="q-body">' + miniMap(def) + '<div class="q-info">' +
      '<div><b>' + esc(T('mission', 'お題')) + '</b> ' + esc(R.MISSION_INFO[def.mission].name) + '　<b>' + esc(T('enemies', '敵')) + '</b> ' + esc(enemiesText(def)) + '</div>' +
      '<div class="q-desc">' + esc(def.desc) + '</div>' +
      '<div>' + recHtml(e.recommend) + '</div><div>' + rewardHtml(e) + (e.type === 'key' ? '　<small>' + esc(e.last ? T('keyLast', 'これを倒すと1周クリア') : T('keyNext', 'クリアすると次の章へ')) + '</small>' : '') + '</div>' +
      (opts && opts.action && e.state === 'open' || opts && opts.action && e.state === 'current' ? '<button type="button" class="primary q-go" data-go="' + esc(e.ref) + '">' + esc(opts.action) + '</button>' : '') +
      '</div></div></div>';
  }

  // ---------------------------------------------------------------
  // 画面
  // ---------------------------------------------------------------
  function show(v) { view = v; render(); }
  function render() {
    document.body.classList.toggle('run-on', view !== 'off');
    document.body.classList.toggle('run-battle', view === 'battle');
    app.runLock = view === 'battle';
    if (view !== 'battle') app.onRestart = null;   // 戦闘の外では、ターンの形の切り替えなどで戦闘を作り直さない
    el.screen.hidden = view === 'battle' || view === 'off';
    el.bar.hidden = view !== 'battle';
    if (view === 'off') { document.body.classList.remove('run-on', 'run-battle'); app.runLock = false; return; }
    if (view === 'battle') { renderBar(); return; }
    var h = '<div class="run-wrap">';
    h += '<div class="run-top"><h2>' + esc(T('title', '進行モック')) + (run ? ' <small>' + esc(run.mode === 'quest' ? T('quest', 'クエスト制') : T('stage', 'ステージ制')) + '</small>' : '') + '</h2>' +
      (run && view !== 'title' ? '<button type="button" data-act="party">' + esc(T('party', 'パーティ')) + '</button>' : '') +
      '<button type="button" data-act="close">' + esc(T('close', '閉じる（いつもの画面へ）')) + '</button></div>';
    if (view === 'title') h += titleHtml();
    else if (view === 'hub') h += run.mode === 'quest' ? boardHtml() : pathHtml();
    else if (view === 'team') h += teamHtml();
    else if (view === 'reward') h += rewardScreen();
    else if (view === 'result') h += resultHtml();
    el.screen.innerHTML = h + '</div>';
    save();
  }

  function titleHtml() {
    return '<div class="run-title"><p>' + esc(T('pickMode', '進行の形を選んで、1周を始める')) + '</p>' +
      '<div class="mode-pick"><button type="button" class="mode-btn" data-act="new" data-mode="quest"><b>' + esc(T('quest', 'クエスト制')) + '</b><span>' + esc(T('questNote', '拠点のボードから、次にやるクエストを自分で選ぶ。寄り道は章ごとに2回まで')) + '</span></button>' +
      '<button type="button" class="mode-btn" data-act="new" data-mode="stage"><b>' + esc(T('stage', 'ステージ制')) + '</b><span>' + esc(T('stageNote', '決まった順にステージを進む。分かれ道はない')) + '</span></button></div>' +
      (run && !run.over ? '<p><button type="button" data-act="resume">' + esc(T('resume', '続きから')) + '（' + esc(run.mode === 'quest' ? T('quest', 'クエスト制') : T('stage', 'ステージ制')) + '）</button></p>' : '') +
      '<p class="note">' + esc(T('titleNote', '最初の仲間は草・火・風の3人。戦闘に勝つと、連れていった仲間の魔法から強化を1つ選ぶ。最後のボスを倒すとクリア。')) + '</p></div>';
  }

  function boardHtml() {
    var b = P.board(run);
    return '<div class="hub"><h3>' + esc(b.name) + ' <small>' + (b.chapter + 1) + '/' + b.chapters + '</small></h3>' +
      '<p class="sides-left">' + esc(T('sidesLeft', '寄り道できる回数')) + ' <b>' + b.sidesLeft + '</b> / ' + b.sideLimit + '</p>' +
      '<div class="q-list">' + card(b.key, { action: T('take', '受ける') }) + b.sides.map(function (e) { return card(e, { action: T('take', '受ける') }); }).join('') + '</div></div>';
  }

  function pathHtml() {
    var path = P.stagePath(run), cur = path.filter(function (e) { return e.state === 'current'; })[0];
    return '<div class="hub"><div class="path">' + path.map(function (e, i) {
      var def = D.battles[e.battle];
      return '<div class="node s-' + e.state + (e.boss ? ' boss' : '') + '"><span class="n-no">' + (i + 1) + '</span><span class="n-name">' + esc(def.name) + '</span>' +
        (e.magic ? '<span class="mg new" title="' + esc(T('newMagic', '新しい魔法')) + '">＋' + esc(mag(e.magic)) + '</span>' : '') +
        '<span class="n-rec">' + e.recommend.map(mag).join('・') + '</span></div>' + (i < path.length - 1 ? '<span class="n-arrow">→</span>' : '');
    }).join('') + '</div>' + (cur ? card(cur, { action: T('challenge', '挑む') }) : '') + '</div>';
  }

  function teamHtml() {
    var e = P.findEntry(run, pickRef), def = D.battles[e.battle], n = P.teamSize(run);
    var names = team.map(function (id) { return mag(P.member(run, id).magic); });
    return '<div class="team"><h3>' + esc(T('choose', '連れていく仲間を選ぶ')) + ' <small>' + n + esc(T('teamHint', '人。選んだ順に ①②③ の場所に立つ')) + '</small></h3>' +
      '<div class="team-top">' + miniMap(def, names) + '<div><b>' + esc(def.name) + '</b>（' + esc(TYPE[e.type]()) + '）<div>' + recHtml(e.recommend) + '</div><div>' + rewardHtml(e) + '</div>' +
      '<p class="note">' + esc(T('teamNote', '強化の候補は、連れていった仲間の魔法からしか出ない。')) + '</p></div></div>' +
      '<div class="members">' + run.party.map(function (p) {
        var k = team.indexOf(p.id), rec = e.recommend.indexOf(p.magic) >= 0;
        return '<button type="button" class="member' + (k >= 0 ? ' on' : '') + (rec ? ' rec' : '') + '" data-member="' + p.id + '">' +
          '<span class="m-no">' + (k >= 0 ? '①②③'[k] : '') + '</span><span class="m-dot">' + esc(mag(p.magic)) + '</span>' +
          '<span class="m-info"><b>' + esc(mag(p.magic)) + '</b>' + (rec ? '<span class="rec-tag">' + esc(T('recommend', 'おすすめ')) + '</span>' : '') + '<span class="ups">' + upgradeBars(p.magic) + '</span></span></button>';
      }).join('') + '</div>' +
      '<div class="row"><button type="button" data-act="hub">' + esc(T('back', '戻る')) + '</button><button type="button" class="primary" data-act="go"' + (team.length === n ? '' : ' disabled') + '>' + esc(T('go', '出発')) + '</button></div></div>';
  }

  function rewardScreen() {
    var of = run.offer, def = D.battles[of.battle];
    return '<div class="reward"><h3>' + esc(T('win', '勝った！')) + ' <small>' + esc(def.name) + '</small></h3>' +
      (of.magic ? '<div class="new-magic"><span class="m-dot big">' + esc(mag(of.magic)) + '</span>' + esc(mag(of.magic)) + esc(T('joined', 'の仲間が加わる')) + '</div>' : '') +
      (of.candidates.length ? '<h3>' + esc(T('pickUpgrade', '強化を1つ選ぶ')) + ' <small>' + of.candidates.length + esc(T('choices', '択')) + '</small></h3><div class="cands">' + of.candidates.map(function (c, i) {
        var d = P.direction(c.magic, c.dir);
        return '<button type="button" class="cand' + (rewardPick === i ? ' on' : '') + '" data-cand="' + i + '"><span class="m-dot">' + esc(mag(c.magic)) + '</span>' +
          '<b>' + esc(mag(c.magic)) + ' ・ ' + esc(d.name) + '</b><span class="lv">' + (c.level - 1) + ' → ' + c.level + esc(T('level', '段')) + '</span><span class="note">' + esc(d.note) + '</span></button>';
      }).join('') + '</div>' : '<p class="note">' + esc(T('noCandidate', '強化できる方向がもうない')) + '</p>') +
      '<div class="row"><button type="button" class="primary" data-act="claim"' + (of.candidates.length && rewardPick < 0 ? ' disabled' : '') + '>' + esc(T('receive', '受け取る')) + '</button></div></div>';
  }

  function resultHtml() {
    var s = P.summary(run);
    return '<div class="result"><h3 class="' + s.over + '">' + esc(s.over === 'clear' ? T('clear', '1周クリア！') : T('fail', '1周が終わった')) + '</h3>' +
      '<p>' + esc(s.mode === 'quest' ? T('quest', 'クエスト制') : T('stage', 'ステージ制')) + '　' + esc(T('battlesLabel', '戦闘')) + ' ' + s.battles + '（' + esc(T('resWin', '勝ち')) + ' ' + s.wins + '・' + esc(T('resLose', '負け')) + ' ' + s.losses + '）　' + esc(T('turnsTotal', 'ターンの合計')) + ' ' + s.turns + '</p>' +
      '<ol class="hist">' + s.history.map(function (h) {
        var def = D.battles[h.battle];
        return '<li><b>' + esc(def.name) + '</b>（' + esc(TYPE[h.type]()) + '）' + esc(h.result === 'win' ? T('resWin', '勝ち') : T('resLose', '負け')) + (h.turns ? '・' + h.turns + esc(T('turnsUnit', 'ターン')) : '') +
          '　' + esc(T('brought', '連れていった')) + ': ' + esc(h.party.map(mag).join('・')) + (h.newMagic ? '　＋' + esc(mag(h.newMagic)) : '') +
          (h.upgrade ? '　' + esc(T('upgradeLabel', '強化')) + ': ' + esc(mag(h.upgrade.magic) + '・' + P.direction(h.upgrade.magic, h.upgrade.dir).name + ' ' + h.upgrade.level + T('level', '段')) : '') + '</li>';
      }).join('') + '</ol>' + partyTable() +
      '<div class="row"><button type="button" class="primary" data-act="title">' + esc(T('again', 'タイトルへ')) + '</button></div></div>';
  }

  function partyTable() {
    return '<div class="party-list">' + run.party.map(function (p) {
      return '<div class="pm"><span class="m-dot">' + esc(mag(p.magic)) + '</span><b>' + esc(mag(p.magic)) + '</b><span class="ups">' + upgradeBars(p.magic) + '</span></div>';
    }).join('') + '</div>';
  }
  function openParty() {
    el.modal.hidden = false;
    el.modal.innerHTML = '<div class="run-modal-card"><h3>' + esc(T('party', 'パーティ')) + ' <small>' + run.party.length + '人</small></h3>' + partyTable() +
      '<p class="note">' + (D.directions.grass ? esc(T('partyNote', '強化は「どの魔法の、どの方向の、何段目か」。効果は仮（直撃の威力など）。')) : '') + '</p>' +
      '<div class="row"><button type="button" class="primary" data-act="closeModal">' + esc(T('back', '戻る')) + '</button></div></div>';
  }

  // 戦闘中の帯（盤面の上）
  function renderBar() {
    var cur = run.current, def = D.battles[cur.battle];
    var over = app.state && app.state.result;
    el.bar.innerHTML = '<span class="rb-type">' + esc(TYPE[cur.type]()) + '</span><b>' + esc(def.name) + '</b>' + recHtml(D.battles[cur.battle].recommend) +
      '<span class="rb-tools"><button type="button" data-act="party">' + esc(T('party', 'パーティ')) + '</button>' +
      (over ? '<button type="button" class="primary" data-act="after">' + esc(over === 'win' ? T('toReward', '報酬へ') : run.mode === 'stage' || cur.type === 'key' ? T('toResult', '1周の結果へ') : T('toBoard', '拠点へ戻る')) + '</button>'
        : '<button type="button" data-act="giveup">' + esc(T('giveUp', '諦める')) + '</button>') + '</span>';
  }

  // ---------------------------------------------------------------
  // 戦闘
  // ---------------------------------------------------------------
  function startCurrentBattle() {
    var cur = run.current, def = D.battles[cur.battle];
    var s = P.buildBattle(run, cur.battle, cur.party);
    R.alliesOf(s).forEach(function (u) { u.runTag = upgradeTag(u.magic); });
    battleOver = false;
    app.onRestart = function () { startCurrentBattle(); };
    app.startCustom(s, '進行モック: 「' + def.name + '」（' + TYPE[cur.type]() + '）を始めた。連れていった仲間: ' + cur.party.map(function (id) { return mag(P.member(run, id).magic); }).join('・'));
    show('battle');
  }
  function endBattle(result) {
    var r = P.finishBattle(run, result, { turns: app.state ? app.state.turn : null });
    if (!r.ok) return;
    run = r.run;
    app.onRestart = null;
    app.runLock = false;
    rewardPick = -1;
    if (run.offer) show('reward');
    else if (run.over) show('result');
    else show('hub');
  }
  app.afterPlayback = function () {
    if (view !== 'battle') return;
    if (app.state.result && !battleOver) { battleOver = true; renderBar(); }
  };

  // ---------------------------------------------------------------
  // 入力
  // ---------------------------------------------------------------
  function onClick(e) {
    var b = e.target.closest && e.target.closest('button');
    if (!b || b.disabled) return;
    var act = b.getAttribute('data-act');
    if (b.hasAttribute('data-go')) { pickRef = b.getAttribute('data-go'); team = []; show('team'); return; }
    if (b.hasAttribute('data-member')) {
      var id = b.getAttribute('data-member'), k = team.indexOf(id);
      if (k >= 0) team.splice(k, 1); else if (team.length < P.teamSize(run)) team.push(id);
      render(); return;
    }
    if (b.hasAttribute('data-cand')) { rewardPick = Number(b.getAttribute('data-cand')); render(); return; }
    if (act === 'new') { run = P.newRun(b.getAttribute('data-mode'), (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0); show('hub'); return; }
    if (act === 'resume') { resume(); return; }
    if (act === 'close') { closeRun(); return; }
    if (act === 'party') { openParty(); return; }
    if (act === 'closeModal') { el.modal.hidden = true; return; }
    if (act === 'hub') { show('hub'); return; }
    if (act === 'title') { if (run && run.over) run = null; save(); show('title'); return; }
    if (act === 'go') {
      var r = P.startBattle(run, pickRef, team);
      if (!r.ok) { window.alert(r.error); return; }
      run = r.run; save();
      startCurrentBattle();
      return;
    }
    if (act === 'giveup') { if (window.confirm(T('giveUpConfirm', 'この戦闘を諦めますか？（負けになる）'))) endBattle('lose'); return; }
    if (act === 'after') { endBattle(app.state.result === 'win' ? 'win' : 'lose'); return; }
    if (act === 'claim') {
      var c = P.claimReward(run, run.offer.candidates.length ? rewardPick : -1);
      if (!c.ok) return;
      run = c.run;
      show(run.over ? 'result' : 'hub');
    }
  }
  el.screen.addEventListener('click', onClick);
  el.bar.addEventListener('click', onClick);
  el.modal.addEventListener('click', function (e) { if (e.target === el.modal) { el.modal.hidden = true; return; } onClick(e); });

  function resume() {
    if (!run) { show('title'); return; }
    if (run.current) { startCurrentBattle(); return; }   // 戦闘中に閉じた・読み込み直したときは、その戦闘の最初から
    show(run.offer ? 'reward' : run.over ? 'result' : 'hub');
  }
  function openRun() {
    el.screen.hidden = false;
    run = run || load();
    show('title');
  }
  function closeRun() {
    save();
    app.onRestart = null;
    app.runLock = false;
    el.modal.hidden = true;
    view = 'off';
    render();
  }
  el.btn.addEventListener('click', openRun);

  // 文章パネルで文を書き換えたら、進行の画面も描き直す
  var prevRefresh = app.refreshTexts;
  app.refreshTexts = function () { if (prevRefresh) prevRefresh(); if (view !== 'off') render(); };

  // 確かめ用
  app.run = { get: function () { return run; }, set: function (r) { run = r; }, view: function () { return view; }, show: show, open: openRun, close: closeRun };

  view = 'off';
  render();
  if (/#run\b/.test(window.location.hash)) openRun();
})();
