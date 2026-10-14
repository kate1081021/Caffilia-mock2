/*
 * texts_ui.js — 会話の窓と文章パネル（IMPROVE_simul）
 *   文の中身は texts.js（window.TEXTS）。読み書きの道具は texts_io.js（TextsIO）。ui.js・tune_ui.js のあとに読み込む。
 *
 *   会話の窓: ステージのきっかけ（始め・Nターン目・構えた・発動の前・決め手・敵の予告・クリア・負け・やり直し）で、
 *     そのきっかけの文を順に出す。押す（クリックかスペース）と次の文へ。窓は画面の下で、盤面は見えたまま。✎ で今の文を書き換える。
 *     同じ場面は1回の挑戦で1度だけ（やり直すとまた流れる）。デモの再生中は出さない。
 *   文章パネル: ステージ → きっかけ → 文の一覧を書き換える。書き換えはすぐゲームに出る。
 *   保存: ファイル保存の機能（File System Access API）が使えるときは、最初の1回だけ texts.js を選び、以後は押すだけで上書き。
 *     使えない環境（スマホ・Chrome 以外・公開版）では、新しい texts.js をダウンロードする（リポジトリの texts.js と入れ替える）。
 *   保存する前の書き換えは localStorage にも残す。texts.js のほうが新しいときは texts.js を使い、残っていた書き換えは「書き出す」で見られる。
 */
(function () {
  'use strict';

  var IO = window.TextsIO;
  var app = window.CafiliaApp;
  var R = window.Rules;
  var DRAFT_KEY = 'caffilia-texts-draft';

  var $ = function (id) { return document.getElementById(id); };
  var el = { panel: $('textsPanel'), btn: $('btnTexts'), unsaved: $('textsUnsaved'), dialog: $('dialog') };

  function esc(t) {
    return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function lsGet() { try { var r = window.localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function lsSet(v) { try { if (v === null) window.localStorage.removeItem(DRAFT_KEY); else window.localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); return true; } catch (e) { return false; } }

  // ---------------------------------------------------------------
  // 文の出どころ: FILE（texts.js の中身）・cur（今ゲームに出している文）・draft（localStorage）
  // ---------------------------------------------------------------
  var FILE = IO.clone(window.TEXTS || { savedAt: '', ui: {}, finishers: {}, stages: {} });
  var cur = IO.clone(FILE);
  var base = FILE.savedAt || '';      // 書き換えの元にした texts.js の日時（ダウンロードしたら、その版の日時）
  var downloaded = false;
  var stale = null;                   // texts.js のほうが新しかったので使わなかった、前の書き換え
  (function loadDraft() {
    var d = lsGet();
    if (!d || !d.texts) return;
    if ((FILE.savedAt || '') > (d.base || '')) { stale = d; return; }   // 黙って上書きしない
    cur = d.texts;
    base = d.base || base;
    downloaded = !!d.downloaded;
    if (IO.same(IO.diff(FILE, cur), []) && (FILE.savedAt || '') >= base) { lsSet(null); downloaded = false; }   // 入れ替え済み
  })();
  window.TEXTS = cur;

  function changes() { return IO.diff(FILE, cur); }
  function persist() {
    if (!changes().length && !downloaded) lsSet(null);
    else lsSet({ base: base, texts: cur, downloaded: downloaded, at: IO.stamp() });
    renderUnsaved();
  }
  function renderUnsaved() {
    var n = changes().length;
    el.unsaved.hidden = !n;
    el.unsaved.textContent = n ? '未保存' + (downloaded ? '（ダウンロード済み）' : '') : '';
    el.unsaved.title = n ? '書き換え ' + n + 'か所。「文章」→「保存」で texts.js に書き込む' : '';
  }
  // 書き換えたら、すぐゲームに出す
  function touched(structural) {
    persist();
    if (app.refreshTexts) app.refreshTexts();
    if (dlg.cur && !dlg.editing) renderDialog();   // 会話の窓に出ている文も、すぐ入れ替える
    if (structural) renderPanel(); else renderStatus();
  }

  // ---------------------------------------------------------------
  // 会話の窓
  // ---------------------------------------------------------------
  var dlg = { queue: [], cur: null, editing: false, done: [] };
  function stageId() { return (app.state && app.state.stage) || app.scenario || ''; }
  function stageOf(id) { return (cur.stages || {})[id] || null; }
  // 場面の文（今のターンの形に合う行だけ）を窓に積む。ref で、どの文かを覚える（✎ の書き換え用）
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
    if (dlg.editing) return;
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
    el.dialog.classList.remove('editing');
    el.dialog.innerHTML = (l.who ? '<div class="d-who">' + esc(l.who) + '</div>' : '') +
      '<div class="d-text">' + esc(l.text) + '</div>' +
      '<div class="d-foot"><span>' + esc(((cur.ui || {}).dialogNext) || 'クリックかスペースで次へ') + '</span><span>' + (dlg.queue.length ? 'あと' + dlg.queue.length : '') + '</span></div>' +
      '<button type="button" class="d-edit" title="この文を書き換える" aria-label="この文を書き換える">✎</button>';
  }
  function closeDialog() {
    el.dialog.hidden = true;
    el.dialog.innerHTML = '';
    dlg.cur = null;
    dlg.editing = false;
    var fns = dlg.done;
    dlg.done = [];
    fns.forEach(function (fn) { fn(); });
  }
  // 積んだ文を流す。done は窓が閉じたら（文がなければすぐ）呼ぶ
  function play(done) {
    if (done) dlg.done.push(done);
    if (!dlg.cur) showNext();
  }
  function editInDialog() {
    var l = lineOf(dlg.cur);
    if (!l) return;
    dlg.editing = true;
    el.dialog.classList.add('editing');
    el.dialog.innerHTML = '<label class="tx-field"><span>話す人（空でもよい）</span><input type="text" class="d-in-who" value="' + esc(l.who) + '"></label>' +
      '<label class="tx-field"><span>文</span><textarea class="d-in-text" rows="3">' + esc(l.text) + '</textarea></label>' +
      '<div class="d-edit-row"><button type="button" class="d-cancel">やめる</button><button type="button" class="primary d-ok">書き換える</button></div>';
    var ta = el.dialog.querySelector('.d-in-text');
    ta.focus();
  }
  el.dialog.addEventListener('click', function (e) {
    if (e.target.closest('.d-edit')) { e.stopPropagation(); editInDialog(); return; }
    if (dlg.editing) {
      if (e.target.closest('.d-ok')) {
        var l = lineOf(dlg.cur);
        if (l) {
          l.who = el.dialog.querySelector('.d-in-who').value;
          l.text = el.dialog.querySelector('.d-in-text').value;
          touched(false);
          if (!el.panel.hidden) renderPanel();
        }
        dlg.editing = false;
        renderDialog();
      } else if (e.target.closest('.d-cancel')) { dlg.editing = false; renderDialog(); }
      return;
    }
    showNext();
  });
  // スペースで次へ（窓が出ている間はゲームのキーより先に受け取る）
  document.addEventListener('keydown', function (e) {
    if (el.dialog.hidden || dlg.editing) return;
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
    if (app.demo || app.demoLoading || !stageOf(sid)) { if (done) done(); return; }
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
  app.onBeforeFire = function (go) { trigger(['beforeFire'], go); };
  app.onEvent = function (e) {
    if (e.type === 'finisher') trigger(['finisher:' + e.name, 'finisher']);
    else if (e.type === 'intent' && e.side === 'enemy') trigger(['enemyIntent']);
    else if (e.type === 'turnStart' && app.state) trigger(['turn:' + app.state.turn]);
    else if (e.type === 'result') trigger([e.result === 'win' ? 'win' : 'lose']);
  };

  // ---------------------------------------------------------------
  // 保存（File System Access API。使えなければダウンロード）
  // ---------------------------------------------------------------
  var handle = null;
  function canPick() { return typeof window.showSaveFilePicker === 'function' && !window.CAFFILIA_VERSION && window.isSecureContext !== false; }
  function idb(fn) {
    try {
      var req = window.indexedDB.open('caffilia-texts', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('h'); };
      req.onsuccess = function () { fn(req.result); };
      req.onerror = function () { fn(null); };
    } catch (e) { fn(null); }
  }
  function keepHandle(h) { idb(function (db) { if (!db) return; try { db.transaction('h', 'readwrite').objectStore('h').put(h, 'texts'); } catch (e) { /* 覚えられなくても保存はできる */ } }); }
  if (canPick()) idb(function (db) {
    if (!db) return;
    try { var r = db.transaction('h').objectStore('h').get('texts'); r.onsuccess = function () { if (r.result && !handle) { handle = r.result; renderPanel(); } }; } catch (e) { /* なし */ }
  });

  var note = '';
  function setNote(t) { note = t; var n = el.panel.querySelector('.tx-savenote'); if (n) n.textContent = t; }

  function fileText() {
    var out = IO.clone(cur);
    out.savedAt = IO.stamp();
    return { obj: out, text: IO.serialize(out) };
  }
  function savedOk(obj, how) {
    cur.savedAt = obj.savedAt;
    FILE = IO.clone(cur);
    base = cur.savedAt;
    downloaded = false;
    stale = null;
    lsSet(null);
    renderUnsaved();
    setNote(how);
    renderPanel();
  }
  function download() {
    var f = fileText();
    try {
      var blob = new Blob([f.text], { type: 'text/javascript' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'texts.js';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    } catch (e) { setNote('ダウンロードできませんでした。「書き出す」を使ってください'); return; }
    cur.savedAt = f.obj.savedAt;
    base = cur.savedAt;   // この版が、いま手元の書き換えの元
    downloaded = true;
    persist();
    setNote('texts.js をダウンロードしました（' + f.obj.savedAt + '）。リポジトリの texts.js と入れ替えてください');
    app.lastTextsDownload = f.text;   // 確かめ用
  }
  function save() {
    if (!canPick()) { download(); return; }
    var f = fileText();
    var write = function (h) {
      return h.createWritable().then(function (w) { return w.write(f.text).then(function () { return w.close(); }); }).then(function () {
        savedOk(f.obj, '保存しました: ' + (h.name || 'texts.js') + '（' + f.obj.savedAt + '）' + (h.name && h.name !== 'texts.js' ? '　※ texts.js ではないファイルに保存しました' : ''));
      });
    };
    var ask = function () {
      return window.showSaveFilePicker({ suggestedName: 'texts.js', types: [{ description: 'texts.js', accept: { 'text/javascript': ['.js'] } }] }).then(function (h) {
        handle = h;
        keepHandle(h);
        return write(h);
      });
    };
    var p;
    if (handle) {
      var perm = handle.queryPermission ? handle.queryPermission({ mode: 'readwrite' }) : Promise.resolve('granted');
      p = perm.then(function (st) { return st === 'granted' ? st : (handle.requestPermission ? handle.requestPermission({ mode: 'readwrite' }) : st); })
        .then(function (st) { return st === 'granted' ? write(handle) : ask(); });
    } else p = ask();
    p.catch(function (e) {
      if (e && e.name === 'AbortError') { setNote('保存をやめました'); return; }
      setNote('保存できませんでした（' + (e && e.message) + '）。ダウンロードします');
      download();
    });
  }

  // ---------------------------------------------------------------
  // 文章パネル
  // ---------------------------------------------------------------
  var TRIGGERS = [
    ['start', 'ステージの始め'], ['turn', 'Nターン目の始め'], ['stance', '構えたとき（1人ずつでは撃ったとき）'], ['beforeFire', '発動の前（1人ずつではターン終了の前）'],
    ['finisher', '決め手が起きたとき'], ['enemyIntent', '敵が予告したとき'], ['win', 'クリア'], ['lose', '負け'], ['retry', 'やり直し']
  ];
  var MODES = [['both', '両方'], ['simul', '一斉だけ'], ['single', '1人ずつだけ']];
  var UI_LABELS = {
    turnMode: 'ターンの形（見出し）', turnModeSimul: 'ターンの形: 一斉', turnModeSingle: 'ターンの形: 1人ずつ', stance: 'ボタン: 構える', shoot: 'ボタン: 撃つ',
    stayStance: 'ボタン: その場で構える', stayShoot: 'ボタン: その場で撃つ', wait: 'ボタン: 待機', fire: 'ボタン: 発動', endTurn: 'ボタン: ターン終了',
    combo: '合体の表示', chain: '決め手をつなぐ記号', order: '発動の順番（見出し）', orderLast: '構える味方の順番', pickAlly: '案内: 味方を選ぶ',
    guideSingle: '案内: 1人ずつ', guideSimul: '案内: 一斉', guideRestance: '案内: 構え直し', readyToFire: '案内: 全員構えた', notReady: '案内: まだ構えていない',
    dialogNext: '会話の窓: 次へ', actIdleSimul: '案内: 操作パネル（一斉）', actIdleSingle: '案内: 操作パネル（1人ずつ）', goal: '目標（見出し）', retry: 'ボタン: やり直す', howtoTitle: '遊び方（見出し）', howtoStart: '遊び方: はじめるボタン'
  };
  var view = { stage: null, scene: null };

  function sceneLabel(k) {
    var p = k.split(':'), t = TRIGGERS.filter(function (x) { return x[0] === p[0]; })[0];
    var name = t ? t[1] : p[0];
    if (p[0] === 'turn') return p[1] + 'ターン目の始め';
    if (p[1]) return name + '（' + (p[0] === 'stance' ? R.magicName(p[1]) : p[1]) + '）';
    return name;
  }
  function lineEditor(lines, i, path) {
    var l = lines[i];
    return '<div class="tx-line" data-i="' + i + '">' +
      '<div class="row"><input type="text" class="tx-who" placeholder="話す人" data-path="' + path + '" data-i="' + i + '" data-k="who" value="' + esc(l.who) + '">' +
      '<select data-path="' + path + '" data-i="' + i + '" data-k="mode" aria-label="ターンの形">' + MODES.map(function (m) { return '<option value="' + m[0] + '"' + ((l.mode || 'both') === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select>' +
      '<span class="tx-tools"><button type="button" data-act="up" data-path="' + path + '" data-i="' + i + '" aria-label="上へ"' + (i ? '' : ' disabled') + '>▲</button>' +
      '<button type="button" data-act="down" data-path="' + path + '" data-i="' + i + '" aria-label="下へ"' + (i < lines.length - 1 ? '' : ' disabled') + '>▼</button>' +
      '<button type="button" data-act="del" data-path="' + path + '" data-i="' + i + '" aria-label="この行を消す">消す</button></span></div>' +
      '<textarea rows="2" data-path="' + path + '" data-i="' + i + '" data-k="text">' + esc(l.text) + '</textarea></div>';
  }
  function field(label, path, value, multi) {
    return '<label class="tx-field"><span>' + esc(label) + '</span>' + (multi
      ? '<textarea rows="2" data-path="' + path + '">' + esc(value) + '</textarea>'
      : '<input type="text" data-path="' + path + '" value="' + esc(value) + '">') + '</label>';
  }
  function setPath(path, v) {
    var parts = path.split('.'), last = parts.pop(), o = cur;
    parts.forEach(function (k) { if (o[k] === undefined || o[k] === null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    o[last] = v;
  }
  // 「scenes」の中のキーは「:」を含むので、道筋は配列で持つ（data-path は | 区切り）
  function linesAt(path) {
    var p = path.split('|');
    if (p[0] === 'howto') return (cur.ui.howto = cur.ui.howto || []);
    var st = stageOf(p[0]);
    st.scenes = st.scenes || {};
    return (st.scenes[p[1]] = st.scenes[p[1]] || []);
  }

  function statusHtml() {
    var n = changes().length;
    return (n ? '書き換え ' + n + 'か所（未保存）。' : '書き換えはありません。') + 'texts.js の日時: ' + esc(FILE.savedAt || '不明') + '<br>' +
      (canPick() ? (handle ? '保存先: ' + esc(handle.name || 'texts.js') + '（押すだけで上書き）' : '保存: 最初の1回だけ、リポジトリの texts.js を選ぶ') : 'この環境では、保存すると新しい texts.js をダウンロードする（リポジトリの texts.js と入れ替える）');
  }
  function renderStatus() {
    if (el.panel.hidden) return;
    var p = el.panel.querySelector('.tx-status'), d = el.panel.querySelector('[data-act="discard"]');
    if (p) p.innerHTML = statusHtml();
    if (d) d.disabled = !(changes().length || downloaded);
  }
  function renderPanel() {
    if (el.panel.hidden) return;
    var stages = Object.keys(cur.stages || {});
    if (!view.stage || stages.indexOf(view.stage) < 0) view.stage = stages.indexOf(stageId()) >= 0 ? stageId() : stages[0];
    var st = stageOf(view.stage) || {};
    var scenes = Object.keys(st.scenes || {});
    if (!view.scene || scenes.indexOf(view.scene) < 0) view.scene = scenes[0] || null;
    var n = changes().length;
    var h = '<div class="tune-head"><h2>文章 <small>書き換えるとすぐゲームに出る</small></h2><button type="button" class="tune-x" data-act="close" aria-label="閉じる">×</button></div>' +
      '<div class="tune-actions"><button type="button" class="primary" data-act="save">保存</button><button type="button" data-act="export">書き出す</button>' +
      '<button type="button" data-act="discard"' + (n || downloaded ? '' : ' disabled') + '>書き換えを捨てる</button></div>' +
      '<p class="tx-note tx-status">' + statusHtml() + '</p>' +
      '<p class="tx-note tx-savenote">' + esc(note) + '</p>' +
      (stale ? '<p class="tx-warn">前に書き換えたまま保存していない文が残っています（' + esc(stale.at || stale.base || '') + '）。texts.js のほうが新しいので使っていません。<button type="button" data-act="staleExport">書き出して見る</button> <button type="button" data-act="staleDrop">消す</button></p>' : '') +
      '<textarea class="tx-out" rows="8" readonly hidden></textarea><div class="row tx-out-row" hidden><button type="button" data-act="copy">コピー</button></div>';

    // ステージ
    h += '<details class="tx-section" open><summary>ステージ</summary>' +
      '<div class="row"><select data-act="pickStage" aria-label="ステージ">' + stages.map(function (s) { return '<option value="' + esc(s) + '"' + (s === view.stage ? ' selected' : '') + '>' + esc((stageOf(s).name || s) + '（' + s + '）') + '</option>'; }).join('') + '</select></div>' +
      field('名前', 'stages.' + view.stage + '.name', st.name) +
      field('目標', 'stages.' + view.stage + '.goal', st.goal, true) +
      field('ヒント（やり直したとき・一斉）', 'stages.' + view.stage + '.hint.simul', (st.hint || {}).simul) +
      field('ヒント（やり直したとき・1人ずつ）', 'stages.' + view.stage + '.hint.single', (st.hint || {}).single) +
      field('クリアの文（空ならルールの文）', 'stages.' + view.stage + '.win', st.win) +
      field('負けの文（空ならルールの文）', 'stages.' + view.stage + '.lose', st.lose);
    // きっかけ → 文の一覧
    h += '<h3>きっかけと文</h3><div class="tx-scene-head"><select data-act="pickScene" aria-label="きっかけ">' +
      scenes.map(function (k) { return '<option value="' + esc(k) + '"' + (k === view.scene ? ' selected' : '') + '>' + esc(sceneLabel(k)) + '</option>'; }).join('') + '</select>' +
      (view.scene ? '<button type="button" data-act="playScene">この場面を流す</button><button type="button" data-act="delScene">場面を消す</button>' : '') + '</div>';
    if (view.scene) {
      var lines = st.scenes[view.scene], path = view.stage + '|' + view.scene;
      h += lines.map(function (l, i) { return lineEditor(lines, i, path); }).join('') +
        '<div class="row"><button type="button" data-act="addLine" data-path="' + path + '">＋ 行を足す</button></div>';
    }
    h += '<div class="tx-scene-head"><select class="tx-new-trigger" aria-label="足すきっかけ">' + TRIGGERS.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join('') + '</select>' +
      '<input type="text" class="tx-new-arg" placeholder="N・魔法・決め手の名前（空でもよい）" size="14"><button type="button" data-act="addScene">＋ 場面を足す</button></div>' +
      '<p class="tx-note">構えたとき: 魔法は grass・earth・fire・water・wind・mount など（空ならどの魔法でも）。決め手: 燃え広がり・桜吹雪 など（空ならどれでも）。Nターン目: 数字。</p></details>';
    // 決め手の表示名
    h += '<details class="tx-section"><summary>決め手の表示名</summary>' + Object.keys(cur.finishers || {}).map(function (k) { return field(k, 'finishers.' + k, cur.finishers[k]); }).join('') + '</details>';
    // 画面のことば
    h += '<details class="tx-section"><summary>画面のことば（操作の案内）</summary>' +
      Object.keys(cur.ui || {}).filter(function (k) { return k !== 'howto'; }).map(function (k) { return field(UI_LABELS[k] || k, 'ui.' + k, cur.ui[k], String(cur.ui[k]).length > 24); }).join('') +
      '<h3>遊び方の行</h3>' + (cur.ui.howto || []).map(function (l, i) { return lineEditor(cur.ui.howto, i, 'howto'); }).join('') +
      '<div class="row"><button type="button" data-act="addLine" data-path="howto">＋ 行を足す</button></div></details>';
    el.panel.innerHTML = h;
  }

  function showOut(text) {
    var ta = el.panel.querySelector('.tx-out'), row = el.panel.querySelector('.tx-out-row');
    ta.hidden = false; row.hidden = false;
    ta.value = text;
    ta.select();
  }

  el.panel.addEventListener('input', function (e) {
    var t = e.target, path = t.getAttribute('data-path');
    if (!path) return;
    if (t.hasAttribute('data-i')) {
      var lines = linesAt(path), i = Number(t.getAttribute('data-i'));
      if (lines[i]) lines[i][t.getAttribute('data-k')] = t.value;
    } else setPath(path, t.value);
    touched(false);
  });
  el.panel.addEventListener('change', function (e) {
    var t = e.target, act = t.getAttribute('data-act');
    if (act === 'pickStage') { view.stage = t.value; view.scene = null; renderPanel(); return; }
    if (act === 'pickScene') { view.scene = t.value; renderPanel(); return; }
    if (t.tagName === 'SELECT' && t.getAttribute('data-k') === 'mode') {
      var lines = linesAt(t.getAttribute('data-path'));
      lines[Number(t.getAttribute('data-i'))].mode = t.value;
      touched(false);
    }
  });
  el.panel.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    var act = b.getAttribute('data-act'), path = b.getAttribute('data-path'), i = Number(b.getAttribute('data-i'));
    if (act === 'close') { openPanel(false); return; }
    if (act === 'save') { save(); return; }
    if (act === 'export') {
      var ch = changes();
      showOut(IO.exportText(ch, '（texts.js ' + (FILE.savedAt || '') + ' から）'));
      return;
    }
    if (act === 'copy') {
      var ta = el.panel.querySelector('.tx-out');
      ta.select();
      try { (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).then(function () { setNote('コピーしました'); }, function () { document.execCommand('copy'); setNote('コピーしました'); }); }
      catch (err) { setNote('コピーできませんでした。選んでコピーしてください'); }
      return;
    }
    if (act === 'discard') {
      if (!window.confirm('保存していない書き換えを捨てて、texts.js の内容に戻しますか？')) return;
      cur = IO.clone(FILE); window.TEXTS = cur; base = FILE.savedAt || ''; downloaded = false;
      lsSet(null); renderUnsaved(); if (app.refreshTexts) app.refreshTexts(); setNote('texts.js の内容に戻しました'); renderPanel();
      return;
    }
    if (act === 'staleExport') { showOut(IO.exportText(IO.diff(FILE, stale.texts), '（前に残っていた書き換え。texts.js ' + (stale.base || '') + ' から）')); return; }
    if (act === 'staleDrop') { stale = null; persist(); renderPanel(); return; }
    if (act === 'playScene') {
      dlg.queue = []; if (dlg.cur) closeDialog();
      if (!queueScene(view.stage, view.scene)) setNote('今のターンの形に合う行がありません'); else play();
      return;
    }
    if (act === 'delScene') {
      if (!window.confirm('「' + sceneLabel(view.scene) + '」の場面を消しますか？')) return;
      delete stageOf(view.stage).scenes[view.scene]; view.scene = null; touched(true); return;
    }
    if (act === 'addScene') {
      var tr = el.panel.querySelector('.tx-new-trigger').value, arg = el.panel.querySelector('.tx-new-arg').value.trim();
      if (tr === 'turn' && !/^\d+$/.test(arg)) { setNote('Nターン目は数字を入れてください'); return; }
      var k = arg && ['turn', 'stance', 'finisher'].indexOf(tr) >= 0 ? tr + ':' + arg : tr;
      var stg = stageOf(view.stage); stg.scenes = stg.scenes || {};
      if (!stg.scenes[k]) stg.scenes[k] = [{ who: '', text: '（ここに文章）', mode: 'both' }];
      view.scene = k; touched(true); return;
    }
    var lines = path ? linesAt(path) : null;
    if (act === 'addLine') { lines.push({ who: '', text: '（ここに文章）', mode: 'both' }); touched(true); return; }
    if (act === 'del') { lines.splice(i, 1); touched(true); return; }
    if (act === 'up' && i > 0) { var a = lines[i]; lines[i] = lines[i - 1]; lines[i - 1] = a; touched(true); return; }
    if (act === 'down' && i < lines.length - 1) { var c = lines[i]; lines[i] = lines[i + 1]; lines[i + 1] = c; touched(true); return; }
  });

  function openPanel(open) {
    el.panel.hidden = !open;
    el.btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    el.btn.classList.toggle('active', open);
    document.body.classList.toggle('texts-open', open);
    if (open) renderPanel();
  }
  el.btn.addEventListener('click', function () { openPanel(el.panel.hidden); });
  el.unsaved.addEventListener('click', function () { openPanel(true); });

  // 確かめ用（コンソールから）
  app.texts = { cur: function () { return cur; }, file: function () { return FILE; }, changes: changes, save: save, download: download, open: openPanel,
    queueScene: queueScene, play: play, dialog: dlg, stale: function () { return stale; } };

  renderUnsaved();
  if (app.refreshTexts) app.refreshTexts();
  // 最初のシナリオの「ステージの始め」は、このファイルを読む前に済んでいるので、ここで流す
  if (app.onStage && stageOf(stageId())) app.onStage('start');
})();
