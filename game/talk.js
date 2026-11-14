/*
 * talk.js — ステージの前後の会話（まえげき・あとげき。オーナー 11/13）
 *   ui.js のあとに読み込む。会話の中身はステージのデータ（定義の talk: { before: […], after: […] }）、キャラは chars.js（開発モードの「キャラ」で登録）。
 *   1行は { who: キャラの id（chars.js。登録のない名前を書くと、その名前の仮の絵）, side: 'left' | 'right', text: 文, face: 表情（省略で normal） }
 *
 *   見せ方: ステージの画面の上に重ねる（後ろに盤面が見える）。キャラが左右に大きく出て、向かい合って喋る。
 *     押す（タップ・クリック・Enter・スペース）と次の文へ。「とばす」（か Esc）でいつでも終わる。会話の間は盤面の操作を受け付けない。
 *     重ねる層の色と透明度は style.css の --talk-veil の1か所。
 *   いつ出すか（決めるのは stages_io.js の talkDue）:
 *     まえげき … そのステージを初めて始めたときだけ（やり直し・リセットでは出さない）。自分のステージ（テストプレイも）は、始めるたび・リセットのたび
 *     あとげき … そのステージに初めて勝ったときだけ（負けたときは出さない）。自分のステージは、勝つたび
 *     並びごとの入切は balance.js の talk.show（tutorial チュートリアル・shared みんなのステージ・own 自分のステージ・exhibit 展示モード）
 *   「初めて」の覚え: 開発モードはこのブラウザ（localStorage の SEEN_KEY）。展示モードは、題字の画面に戻るまで（次の人には、また出る）
 *   遊んでいる最中の会話（何ターン目・決め手が起きた など）はまだない。足すときは、ステージの条件（conditions）に
 *     then: 'talk' と talk の名前を書き、ここの play(名前) を条件のしくみから呼ぶ形にする（talk は 名前 → 行の並び なので、before・after のほかの名前を足せる）
 */
(function () {
  'use strict';

  var app = window.CafiliaApp;
  var R = window.Rules, SIO = window.StagesIO, B = window.BALANCE;
  if (!app || !R || !SIO) return;
  var CHARS = window.CHARS || {};
  var CC = window.CafiliaChars;
  var EXHIBIT = window.CAFILIA_MODE === 'exhibit';
  var SEEN_KEY = 'cafilia-mock-talk-seen-v1';

  function esc(t) {
    return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function uiText(k, d) { var T = window.TEXTS, u = (T && T.ui) || {}; return u[k] || d; }

  // ---------------------------------------------------------------
  // 「初めて」の覚え
  // ---------------------------------------------------------------
  var memSeen = {};   // 展示モード: 題字の画面に戻るまで
  function seenAll() {
    if (EXHIBIT) return memSeen;
    try { var raw = window.localStorage.getItem(SEEN_KEY); return raw ? JSON.parse(raw) : {}; } catch (e) { return memSeen; }
  }
  function seenKey(kind, id) { return kind + '|' + id; }
  function isSeen(kind, id) { return !!seenAll()[seenKey(kind, id)]; }
  function markSeen(kind, id) {
    var all = seenAll();
    all[seenKey(kind, id)] = 1;
    memSeen = all;
    if (!EXHIBIT) { try { window.localStorage.setItem(SEEN_KEY, JSON.stringify(all)); } catch (e) { /* 覚えられなくても、このページの間は出さない */ } }
  }
  function forget() {
    memSeen = {};
    if (!EXHIBIT) { try { window.localStorage.removeItem(SEEN_KEY); } catch (e) { /* 何もしない */ } }
  }

  // ---------------------------------------------------------------
  // 今のステージの会話
  // ---------------------------------------------------------------
  function stageId() { return app.scenario || ''; }
  // 並び（どこから遊んでいるか）: 展示モード／チュートリアル／自分のステージ（テストプレイも）／みんなのステージ
  function contextOf(id) {
    if (EXHIBIT) return 'exhibit';
    if (R.TUTORIALS.some(function (p) { return p.id === id; })) return 'tutorial';
    if (String(id).indexOf(SIO.PREFIX) === 0) return 'own';
    return 'shared';
  }
  function talkOf(id) {
    var p = id ? R.findPreset(id) : null;
    return (p && p.talk) || null;
  }
  function due(kind) {
    var id = stageId(), t = talkOf(id);
    return SIO.talkDue({ kind: kind, lines: t && t[kind], context: contextOf(id), show: (B.talk && B.talk.show) || {},
      seen: isSeen(kind, id), editMode: app.editMode, replay: !!app.replay });
  }

  // ---------------------------------------------------------------
  // 画面
  // ---------------------------------------------------------------
  var el = document.createElement('div');
  el.id = 'talk';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', '会話');
  document.body.appendChild(el);

  var now = null;   // { lines, i, cast: { left: 行, right: 行 }, done: [閉じたら呼ぶもの] }

  function charOf(who) { return CHARS[who] || { name: who || '', color: '#57534e', faces: {} }; }
  // キャラの絵。絵のファイルがなければ、色と名前の頭文字で作った仮の絵
  function portrait(line, side, speaking) {
    if (!line) return '<div class="talk-char ' + side + ' empty"></div>';
    var c = charOf(line.who), img = (CC ? CC.url(CC.faceRef(line.who, line.face)) : (c.faces && (c.faces[line.face || 'normal'] || c.faces.normal))) || '';   // 上げた絵を読み込み中なら、仮の絵
    var body = img
      ? '<img class="talk-img" src="' + esc(img) + '" alt="' + esc(c.name) + '">'
      : '<div class="talk-dummy" style="--c:' + esc(c.color || '#57534e') + '"><span class="talk-head"></span><span class="talk-body"><b>' + esc(String(c.name || '？').slice(-1)) + '</b></span></div>';
    return '<div class="talk-char ' + side + (speaking ? ' on' : ' off') + '" data-who="' + esc(line.who) + '">' + body + '</div>';
  }
  function render() {
    var l = now.lines[now.i], side = l.side === 'right' ? 'right' : 'left', narr = !l.who;
    if (!narr) now.cast[side] = l;
    var c = charOf(l.who), last = now.i === now.lines.length - 1;
    el.innerHTML =
      '<button type="button" class="talk-skip" data-talk="skip">' + esc(uiText('talkSkip', 'とばす')) + ' <kbd>Esc</kbd></button>' +
      '<div class="talk-stage">' + portrait(now.cast.left, 'left', !narr && side === 'left') + portrait(now.cast.right, 'right', !narr && side === 'right') + '</div>' +
      '<div class="talk-box ' + (narr ? 'narr' : side) + '">' +
        (narr ? '' : '<div class="talk-name" style="--c:' + esc(c.color || '#57534e') + '">' + esc(c.name) + '</div>') +
        '<div class="talk-text">' + esc(l.text) + '</div>' +
        '<div class="talk-foot"><span>' + (now.i + 1) + ' / ' + now.lines.length + '</span><span class="talk-next">' +
          esc(!last ? uiText('talkNext', 'タップで次へ ▼') : now.kind === 'after' ? uiText('talkClose', 'タップで閉じる ▶') : uiText('talkEnd', 'タップで始める ▶')) + '</span></div>' +
      '</div>';
  }
  // 最初から両側にいるように、それぞれの側で最初に喋るキャラを先に立たせる
  function castOf(lines) {
    var cast = { left: null, right: null };
    lines.forEach(function (l) { var s = l.side === 'right' ? 'right' : 'left'; if (l.who && !cast[s]) cast[s] = l; });
    return cast;
  }
  function open(lines, kind, done) {
    lines = (lines || []).filter(function (l) { return l && typeof l.text === 'string' && l.text; });
    if (!lines.length) { if (done) done(); return false; }
    if (now) close();
    now = { lines: lines, i: 0, kind: kind, cast: castOf(lines), done: done ? [done] : [] };
    app.talking = true;
    el.hidden = false;
    el.className = 'talk-' + kind;
    document.body.classList.add('talking');
    render();
    return true;
  }
  function close() {
    if (!now) return;
    var fns = now.done;
    now = null;
    app.talking = false;
    el.hidden = true;
    el.innerHTML = '';
    document.body.classList.remove('talking');
    fns.forEach(function (fn) { fn(); });
  }
  function next() {
    if (!now) return;
    if (now.i + 1 >= now.lines.length) { close(); return; }
    now.i++;
    render();
  }
  // 上げた絵を読み終えたら、出ている会話を描き直す
  if (CC) CC.onImg(function () { if (now) render(); });
  el.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    if (e.target.closest('[data-talk="skip"]')) close(); else next();
  });
  // 会話の間は、キーをゲームより先に受け取る（Enter が発動に、数字が味方の選択に届かないように）
  document.addEventListener('keydown', function (e) {
    if (!now) return;
    if (e.target && e.target.closest && e.target.closest('#talk-tune')) return;   // 設定の「会話で見ながら決める」の窓で打っているときは、窓へ
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') close();
    else if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') next();
  }, true);

  // ---------------------------------------------------------------
  // きっかけ（ui.js から呼ばれる）
  // ---------------------------------------------------------------
  // ステージの始め（読んだとき・リセット）とやり直し。まえげきは、初めて始めたときだけ
  app.onStage = function (kind) {
    if (now) close();
    if (kind !== 'start' || !due('before')) return;
    var id = stageId();
    markSeen('before', id);
    open(talkOf(id).before, 'before');
  };
  // 手の再生が終わったとき。あとげきは、初めて勝ったときだけ（負けでは出さない）
  var afterFor = null;
  app.onPlaybackEnd = function () {
    var st = app.state;
    if (!st || st.result !== 'win' || afterFor === st || !due('after')) return;
    afterFor = st;
    var id = stageId();
    markSeen('after', id);
    open(talkOf(id).after, 'after');
  };
  // 会話が閉じたら fn（出ていなければすぐ）。展示モードの「次へ」は、あとげきを読み終えてから出す
  app.afterDialog = function (fn) { if (now) now.done.push(fn); else fn(); };
  // エディットに入る・最初の画面へ戻るときは、出ている会話を閉じる
  app.closeDialog = function () { if (now) close(); };
  // 展示モード: 題字の画面に戻ったら、次の人にはまた出す
  app.onNewPlayer = function () { if (EXHIBIT) memSeen = {}; };

  // エディットの「見る」と、確かめ用（コンソールから）
  app.talk = {
    preview: function (kind, talk) { var t = talk || talkOf(stageId()); return open(t && t[kind], kind === 'after' ? 'after' : 'before'); },
    forget: forget, isSeen: isSeen, open: open, close: close, next: next,
    now: function () { return now; }, contextOf: contextOf, talkOf: talkOf, due: due
  };

  // 最初のステージの「始め」は、このファイルを読む前に済んでいるので、ここで見る（最初の画面が出ている間は出さない）
  if (!app.home && stageId()) app.onStage('start');
})();
