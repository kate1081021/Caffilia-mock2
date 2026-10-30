/*
 * review.js — 見て判定（スマホ向け）
 *   ラボの案のデモを1つずつ流し、「次へ」で次の場面へ進む。場面ごとに 面白い／微妙／面白くない／分からない とひとことを残す。
 *   判定はラボの判定パネルと同じ所（localStorage の cafilia-lab-judge）に入る。
 *   Artifact で開いたときは db（collection "judge"、doc = 案の id）にも書き、Claude が読める。
 *   入り方: URL に #review か ?review、上のバーの「見て判定」、または window.CAFILIA_REVIEW = true。lab_ui.js のあとに読み込む。
 */
(function () {
  'use strict';

  var R = window.Rules;
  var app = window.CafiliaApp;
  var LabUI = window.LabUI;
  if (!R || !R.LAB || !app || !LabUI) return;
  var CATS = R.LAB.CATS, CARDS = R.LAB.CARDS;
  var JUDGE = [['good', '◎', '面白い'], ['meh', '△', '微妙'], ['bad', '×', '面白くない'], ['unknown', '？', '分からない']];
  var POS = 'cafilia-review-pos', OPT = 'cafilia-review-opt';

  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function load(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function keep(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できない環境 */ } }
  function catName(id) { var c = CATS.filter(function (x) { return x.id === id; })[0]; return c ? c.name.replace(/（.*）$/, '') : id; }
  function judgeOf(id) { return LabUI.judge()[id] || {}; }

  // ---- 場面の並び: カテゴリ順に、デモ1つ＝1場面（デモが2つある案は2場面）。デモのない案は「試し方」の盤面 ----
  function demoScens(c) { return (c.scen || []).filter(function (s) { var p = R.findPreset(s); return p && p.demo; }); }
  function buildScenes(withNoDemo) {
    var list = [];
    CATS.forEach(function (cat) {
      CARDS.filter(function (c) { return c.cat === cat.id; }).forEach(function (c) {
        if (c.demoCheck) { list.push({ card: c, i: 0, demo: true }); return; }
        var ds = demoScens(c);
        ds.forEach(function (sid, i) { list.push({ card: c, i: i, demo: true, sid: sid, of: ds.length }); });
        if (!ds.length && withNoDemo && (c.scen || []).length && c.scen[0] !== 'run') list.push({ card: c, i: 0, demo: false });
      });
    });
    return list;
  }

  var opt = load(OPT, { noDemo: false, todo: false });
  var scenes = buildScenes(opt.noDemo);
  var pos = Math.max(0, Math.min(scenes.length - 1, load(POS, 0) | 0));
  var active = false, db = null, sync = 'local', memoTimer = null;

  // ---- 画面 ----
  var sheet = document.createElement('section');
  sheet.id = 'reviewSheet';
  sheet.className = 'rv-sheet';
  sheet.setAttribute('aria-label', '見て判定');
  sheet.hidden = true;
  document.body.appendChild(sheet);

  var list = document.createElement('div');
  list.id = 'reviewList';
  list.className = 'rv-list';
  list.hidden = true;
  document.body.appendChild(list);

  function scene() { return scenes[pos]; }

  function render() {
    var s = scene();
    if (!s) { sheet.innerHTML = '<p class="rv-empty">見る場面がありません</p>'; return; }
    var c = s.card, j = judgeOf(c.id);
    var playing = !!app.demo;
    sheet.innerHTML =
      '<div class="rv-top">' +
        '<button type="button" class="rv-where" data-act="list" aria-label="場面の一覧を開く"><span class="rv-cat">' + esc(catName(c.cat)) + '</span> <span class="rv-count">' + (pos + 1) + ' / ' + scenes.length + '</span> ▾</button>' +
        '<span class="rv-sync rv-sync-' + sync + '">' + syncText() + '</span>' +
      '</div>' +
      '<h2 class="rv-name"><span class="rv-id">' + esc(c.id) + '</span>' + esc(c.name) + (s.of > 1 ? ' <small>デモ ' + (s.i + 1) + '/' + s.of + '</small>' : '') + (s.demo ? '' : ' <small>デモなし</small>') + '</h2>' +
      '<details class="rv-desc"' + (s.demo ? '' : ' open') + '><summary>' + esc(c.desc || '') + '</summary>' +
        (s.demo ? '' : '<p><b>試し方</b> ' + esc(c.howto || '') + '</p>') +
        (c.note ? '<p class="rv-note">' + esc(c.note) + '</p>' : '') +
        ((c.q || []).length ? '<ul>' + c.q.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul>' : '') +
      '</details>' +
      '<div class="rv-nav">' +
        '<button type="button" data-act="prev" aria-label="前の場面"' + (pos ? '' : ' disabled') + '>◀</button>' +
        '<button type="button" data-act="replay" class="rv-replay' + (playing ? '' : ' rv-ready') + '">' + (s.demo ? (playing ? '■ 止める' : '↻ もう一度') : '↻ 最初から') + '</button>' +
        '<button type="button" data-act="next" class="rv-next' + (j.judge ? ' rv-go' : '') + '"' + (pos < scenes.length - 1 ? '' : ' disabled') + '>次へ ▶</button>' +
      '</div>' +
      '<div class="rv-judge" role="radiogroup" aria-label="判定">' + JUDGE.map(function (x) {
        return '<button type="button" role="radio" aria-checked="' + (j.judge === x[0]) + '" class="rv-j rv-j-' + x[0] + (j.judge === x[0] ? ' on' : '') + '" data-j="' + x[0] + '"><b>' + x[1] + '</b>' + x[2] + '</button>';
      }).join('') + '</div>' +
      '<label class="rv-memo"><span class="sr">ひとこと</span><textarea id="rvMemo" rows="1" placeholder="ひとこと（なぜそう感じたか）" maxlength="600">' + esc(j.memo || '') + '</textarea></label>' +
      '<button type="button" class="rv-exit" data-act="exit" aria-label="見て判定を終える">×</button>';
    fit();
  }
  // 盤面がシートに隠れないよう、シートの高さを CSS に渡す
  function fit() { if (!sheet.hidden) document.documentElement.style.setProperty('--rv-h', sheet.offsetHeight + 'px'); }
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(sheet);

  function renderList() {
    var done = 0;
    scenes.forEach(function (s) { if (judgeOf(s.card.id).judge) done++; });
    var cur = '';
    var rows = scenes.map(function (s, i) {
      var j = judgeOf(s.card.id).judge;
      if (opt.todo && j && i !== pos) return '';
      var head = '';
      if (s.card.cat !== cur) { cur = s.card.cat; head = '<li class="rv-l-cat">' + esc(catName(cur)) + '</li>'; }
      var mark = j ? JUDGE.filter(function (x) { return x[0] === j; })[0][1] : '・';
      return head + '<li><button type="button" data-go="' + i + '" class="' + (i === pos ? 'cur ' : '') + (j ? 'rv-l-' + j : '') + '"><span class="rv-l-mark">' + mark + '</span>' +
        '<span class="rv-l-id">' + esc(s.card.id) + '</span>' + esc(s.card.name) + (s.of > 1 ? '（' + (s.i + 1) + '）' : '') + (s.demo ? '' : ' <small>デモなし</small>') + '</button></li>';
    }).join('');
    list.innerHTML = '<div class="rv-l-card">' +
      '<div class="rv-l-head"><h2>場面の一覧 <small>判定 ' + done + ' / ' + scenes.length + '</small></h2><button type="button" data-act="close" aria-label="閉じる">×</button></div>' +
      '<div class="rv-l-opts">' +
        '<label><input type="checkbox" id="rvTodo"' + (opt.todo ? ' checked' : '') + '> 未判定だけ</label>' +
        '<label><input type="checkbox" id="rvNoDemo"' + (opt.noDemo ? ' checked' : '') + '> デモのない案も並べる</label>' +
        '<button type="button" data-act="nextTodo">次の未判定へ</button>' +
        '<button type="button" data-act="copy">判定をコピー</button>' +
      '</div>' +
      '<ol>' + rows + '</ol></div>';
    var curEl = list.querySelector('button.cur');
    if (curEl) curEl.scrollIntoView({ block: 'center' });
  }

  // ---- 場面を流す ----
  function show(i) {
    pos = Math.max(0, Math.min(scenes.length - 1, i));
    keep(POS, pos);
    var s = scene();
    if (!s) { render(); return; }
    if (s.demo) LabUI.play(s.card.id, s.i);
    else LabUI.tryIt(s.card.id);
    render();
    window.scrollTo(0, 0);
  }
  function stop() { if (app.demo) { clearTimeout(app.demo.timer); app.demo = null; app.render(); } }

  function setJudge(v) {
    var s = scene();
    if (!s) return;
    var now = Date.now();
    LabUI.setJudge(s.card.id, { judge: v, at: now });
    render();
    push(s.card.id);
  }
  function setMemo(v) {
    var s = scene();
    if (!s) return;
    LabUI.setJudge(s.card.id, { memo: v, at: Date.now() });
    clearTimeout(memoTimer);
    var id = s.card.id;
    memoTimer = setTimeout(function () { push(id); }, 800);
  }

  // ---- db（Artifact で開いたとき）: judge/<案の id> = { judge, memo, name, at } ----
  function push(id) {
    if (!db) return;
    var j = judgeOf(id), c = CARDS.filter(function (x) { return x.id === id; })[0];
    db.collection('judge').doc(id).set({ judge: j.judge || '', memo: j.memo || '', name: c ? c.name : id, cat: c ? c.cat : '', at: j.at || Date.now() })
      .then(function () { if (sync !== 'db') { sync = 'db'; refreshSync(); } })
      .catch(function () { sync = 'err'; refreshSync(); });
  }
  function syncText() { return sync === 'db' ? '判定は Claude に届きます' : sync === 'err' ? '送れなかった（この端末には残っています）' : 'この端末に保存'; }
  function refreshSync() { var el = sheet.querySelector('.rv-sync'); if (el) { el.className = 'rv-sync rv-sync-' + sync; el.textContent = syncText(); } }
  function connect() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    window.claude.use('db').then(function (d) {
      if (!d) return;
      db = d;
      return db.collection('judge').get().then(function (snap) {
        // db の方が新しいものだけ、この端末に取り込む
        snap.docs.forEach(function (doc) {
          var v = doc.data() || {}, mine = judgeOf(doc.id);
          if ((v.at || 0) > (mine.at || 0)) LabUI.setJudge(doc.id, { judge: v.judge || '', memo: v.memo || '', at: v.at || 0 });
        });
        sync = 'db';
        if (active) render();
      });
    }).catch(function () { sync = 'err'; if (active) render(); });
  }

  // ---- 入る・出る ----
  function enter() {
    if (active) return;
    active = true;
    document.body.classList.add('review');
    var howto = document.getElementById('howto');
    if (howto) howto.hidden = true;
    if (LabUI.open) LabUI.open(false);
    sheet.hidden = false;
    show(pos);
  }
  function exit() {
    active = false;
    stop();
    document.body.classList.remove('review');
    sheet.hidden = true;
    list.hidden = true;
  }

  // 上のバーに入口を足す
  var btns = document.querySelector('.topbar .buttons');
  if (btns) {
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'btnReview';
    b.className = 'lab';
    b.textContent = '見て判定';
    btns.insertBefore(b, btns.firstChild);
    b.addEventListener('click', function () { enter(); b.blur(); });
  }

  sheet.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t) return;
    var a = t.getAttribute('data-act'), j = t.getAttribute('data-j');
    if (j) { setJudge(judgeOf(scene().card.id).judge === j ? '' : j); return; }
    if (a === 'prev') show(pos - 1);
    else if (a === 'next') show(pos + 1);
    else if (a === 'replay') { if (app.demo) { stop(); render(); } else show(pos); }
    else if (a === 'list') { renderList(); list.hidden = false; }
    else if (a === 'exit') exit();
  });
  sheet.addEventListener('input', function (e) { if (e.target.id === 'rvMemo') setMemo(e.target.value); });
  sheet.addEventListener('focusout', function (e) { if (e.target.id === 'rvMemo' && db) { clearTimeout(memoTimer); push(scene().card.id); } });
  sheet.addEventListener('keydown', function (e) { e.stopPropagation(); });

  list.addEventListener('click', function (e) {
    if (e.target === list) { list.hidden = true; return; }
    var t = e.target.closest('button');
    if (!t) return;
    var go = t.getAttribute('data-go'), a = t.getAttribute('data-act');
    if (go !== null) { list.hidden = true; show(Number(go)); }
    else if (a === 'close') list.hidden = true;
    else if (a === 'nextTodo') {
      for (var k = 1; k <= scenes.length; k++) { var i = (pos + k) % scenes.length; if (!judgeOf(scenes[i].card.id).judge) { list.hidden = true; show(i); return; } }
      app.say('未判定の場面はありません');
    } else if (a === 'copy') {
      var text = LabUI.exportText();
      var done = function () { t.textContent = 'コピーしました'; };
      try { navigator.clipboard.writeText(text).then(done, function () { showText(text); }); } catch (err) { showText(text); }
    }
  });
  list.addEventListener('change', function (e) {
    if (e.target.id === 'rvTodo') { opt.todo = e.target.checked; keep(OPT, opt); renderList(); }
    if (e.target.id === 'rvNoDemo') {
      var cur = scene();
      opt.noDemo = e.target.checked; keep(OPT, opt);
      scenes = buildScenes(opt.noDemo);
      var k = scenes.findIndex(function (s) { return cur && s.card.id === cur.card.id && s.i === cur.i; });
      pos = k < 0 ? 0 : k; keep(POS, pos);
      renderList(); render();
    }
  });
  function showText(text) {
    var box = list.querySelector('.rv-l-card');
    var ta = document.createElement('textarea');
    ta.className = 'rv-export'; ta.rows = 8; ta.readOnly = true; ta.value = text;
    box.insertBefore(ta, box.querySelector('ol'));
    ta.select();
  }

  // 再生が終わったら「もう一度」に戻す
  var wasPlaying = false;
  setInterval(function () {
    if (!active) return;
    var now = !!app.demo;
    if (now !== wasPlaying) { wasPlaying = now; var memo = document.getElementById('rvMemo'); if (document.activeElement !== memo) render(); }
  }, 300);

  // キー（PC）: ← → で前後、R でもう一度、1〜4 で判定
  window.addEventListener('keydown', function (e) {
    if (!active || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    var k = e.key, hit = true;
    if (k === 'ArrowRight') show(pos + 1);
    else if (k === 'ArrowLeft') show(pos - 1);
    else if (k === 'r' || k === 'R') show(pos);
    else if (k >= '1' && k <= '4') setJudge(JUDGE[k - 1][0]);
    else if (k === 'Escape') { if (!list.hidden) list.hidden = true; else exit(); }
    else hit = false;
    if (hit) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  connect();
  if (window.CAFILIA_REVIEW || /(^|[?#&])review\b/.test(location.search + location.hash)) enter();

  window.Review = { enter: enter, exit: exit, show: show, scenes: function () { return scenes; } };
})();
