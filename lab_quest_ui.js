/*
 * lab_quest_ui.js — 試作ラボ N「クエスト制」の拠点の画面（戦闘の外）。データと進み方は lab_quest.js（LAB_QUEST）。
 *   拠点（クエストボード）→ クエストを選ぶ → 連れていく仲間3人を選ぶ → 戦闘 → 育ちの画面で「拠点に戻る」→ 拠点
 *   1周の進み（クリア・仲間・治安・キークエストの付け替え）は localStorage の cafilia-lab-quest。育った道は N の道（cafilia-lab-change）のまま。
 *   入口: 上のバーの「N クエスト」・判定パネルの「クエスト制」のカード・index.html#q
 *   ui.js・lab_target_ui.js のあとに読み込む。
 */
(function () {
  'use strict';
  var R = window.Rules, app = window.CafiliaApp, Q = window.LAB_QUEST;
  if (!R || !app || !Q || !R.LX || !R.LX.L || !R.LX.L.N) return;
  var LXL = R.LX.L;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function TUI() { return window.LabTargetUI; }

  // ---- 1周の進みの持ち越し ----
  var STORE = 'cafilia-lab-quest', storeOk = true;
  var camp = null;          // LAB_QUEST の1周の中身
  var view = 'board';       // board 拠点 ／party 仲間を選ぶ
  var pick = null;          // 仲間を選んでいるクエスト { id, party }
  var running = null;       // 戦っているクエストの id
  var notes = [];           // 拠点に戻ったときに見せる知らせ
  var acceptNotes = [];     // 受けたときに変わったこと（裏クエストの治安）。拠点に戻ったときにも見せる
  function load() {
    try { var raw = localStorage.getItem(STORE); camp = raw ? Q.norm(JSON.parse(raw)) : null; storeOk = true; } catch (e) { camp = null; storeOk = false; }
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(camp)); storeOk = true; } catch (e) { storeOk = false; } }
  // 1周目から（道も0から）
  function restart() {
    camp = Q.newCampaign();
    useN();
    if (TUI()) TUI().resetPaths();
    save();
    notes = ['1周目を始めた。仲間は ' + camp.roster.map(R.magicName).join('・') + '。魔法の道は0から。'];
    app.addLog('【クエスト制】最初から（道を0から始めた）');
  }
  // 拠点では N の切り替えだけをオンにする（ミッションの仕分け・道の形を N で見るため。戦闘の D2・L7 などは戻す）
  function useN() {
    var want = ['L0', 'M0', 'N0', 'N6'];
    if (R.labOnList().join('+') === want.join('+')) return;
    R.labApply(['N0', 'N6']);   // N6 1本の道
    if (app.onLabChange) app.onLabChange();
  }

  // ---- 画面 ----
  var box = document.createElement('div');
  box.id = 'labQuest'; box.className = 'lab-run lq-wrap'; box.hidden = true;
  document.body.appendChild(box);
  var bar = document.createElement('div');
  bar.id = 'labQuestBar'; bar.className = 'lab-bar lab-run-bar lq-bar'; bar.hidden = true;
  var labBar = document.getElementById('labBar');
  if (labBar && labBar.parentNode) labBar.parentNode.insertBefore(bar, labBar.nextSibling); else document.body.appendChild(bar);
  var btnLab = document.getElementById('btnLab');
  var openBtn = document.createElement('button');
  openBtn.type = 'button'; openBtn.className = 'lab ng-open lq-open'; openBtn.textContent = 'N クエスト';
  openBtn.title = 'クエスト制（拠点のクエストボードから、1戦ずつ選んで受ける）';
  var guideBtn = document.querySelector('.ng-open');
  if (guideBtn) guideBtn.insertAdjacentElement('afterend', openBtn); else if (btnLab) btnLab.insertAdjacentElement('afterend', openBtn);

  function mark(w, txt) { var W = LXL.N.WANTS[w] || {}, sh = !txt && W.shape && LXL.N.road && LXL.N.road(); return '<span class="lt-mark d-' + esc(w) + (sh ? ' lt-shape' : '') + '" title="' + esc((W.name || w) + (W.desc ? '（' + W.desc + '）' : '')) + '">' + esc(txt || (sh ? W.shape : W.mark) || '？') + '</span>'; }   // N6: 形で見せる
  function wantName(w) { return w === 'dark' ? '闇' : (LXL.N.WANTS[w] || {}).name || w; }
  function missionDefs(q) { return q.missions.map(LXL.targetDef).filter(Boolean); }
  // 育ちやすい方向（ミッションのやりたいことを数える）
  function leanOf(q) {
    var n = {};
    missionDefs(q).forEach(function (t) { n[t.dir] = (n[t.dir] || 0) + 1; });
    return Object.keys(n).sort(function (a, b) { return n[b] - n[a]; }).map(function (w) { return { w: w, n: n[w] }; });
  }
  function leanHtml(q) {
    var l = leanOf(q);
    if (l.length === 1 && l[0].w === 'dark') return '<span class="lq-lean">育つ方向: なし（取った魔法は闇の力。覚醒・融合の印は進まない）</span>';
    return '<span class="lq-lean">育ちやすい方向: ' + l.map(function (x) { return (x.w === 'dark' ? '' : mark(x.w)) + esc(wantName(x.w)) + '×' + x.n; }).join(' ') + '</span>';
  }
  // 仲間1人が、このクエストのミッションを取ったら、どちらの方面の印になるか（変化したあとは、閉じた方面の印は間の強化だけ）
  function forecast(m, q) {
    var aw = 0, fu = 0, no = 0, dark = 0, shut = 0;
    var T = TUI(), p = T ? LXL.N.norm(m, T.pathOf(m)) : null, form = p ? p.form : null;
    missionDefs(q).forEach(function (t) {
      if (t.dir === 'dark') { dark++; return; }
      var k = LXL.N.kind(m, t.dir);
      if (form && (k === 'awake' || k === 'fuse') && k !== form) shut++;
      else if (k === 'awake') aw++; else if (k === 'fuse') fu++; else no++;
    });
    var out = [];
    if (LXL.N.road && LXL.N.road() && p) {   // N6 1本の道: 自分の形・ほかの形で、道のマスがいくつ埋まるか
      var own = LXL.N.shape(LXL.N.def(m).want), past = form === 'fuse' ? aw + fu + shut : form === 'awake' ? fu + shut : 0;
      if (form === 'awake' && aw) out.push('<span class="lq-fc aw" title="覚醒へ進む">' + esc(own) + '×' + aw + '（覚醒へ）</span>');
      if (!form && aw) out.push('<span class="lq-fc aw" title="自分の形。道のマスを埋める">' + esc(own) + '×' + aw + '</span>');
      if (!form && fu) out.push('<span class="lq-fc fu" title="ほかの形。道のマスを埋める">ほか×' + fu + '</span>');
      if (past) out.push('<span class="lq-fc" title="変化したあとの、道を進めない印（間の強化だけ）">間の強化だけ ' + past + '</span>');
      if (no) out.push('<span class="lq-fc">印にならない ' + no + '</span>');
      if (dark) out.push('<span class="lq-fc dk">闇の力 ' + dark + '</span>');
      return out.join('');
    }
    if (aw) out.push('<span class="lq-fc aw">覚醒方面 ' + aw + '</span>');
    if (fu) out.push('<span class="lq-fc fu">融合方面 ' + fu + '</span>');
    if (shut) out.push('<span class="lq-fc" title="変化して閉じた方面。印は進まず、間の強化だけ付く">閉じた方面 ' + shut + '</span>');
    if (no) out.push('<span class="lq-fc">印にならない ' + no + '</span>');
    if (dark) out.push('<span class="lq-fc dk">闇の力 ' + dark + '</span>');
    return out.join('');
  }
  function fightText(q) {
    var p = R.findPreset(q.board);
    if (!p) return '';
    var MIS = { defense: '防衛', escort: '護衛', retrieve: '奪取' };
    var size = p.rows ? p.rows[0].length + '×' + p.rows.length : '';
    var foes = p.enemies.map(function (e) { return R.magicName(e[0]); });
    var objs = (p.villages || []).length ? '・村' + p.villages.length : '';
    return (MIS[p.mission] || '全滅') + '・' + size + '・敵' + foes.length + '体（' + foes.join('・') + '）' + (p.wagon ? '・馬車' : '') + objs;
  }
  function allyHtml(m) {
    var T = TUI(), p = T ? T.pathOf(m) : null;
    return '<span class="lt-ally"><b>' + esc(T ? T.magicLabel(m, p) : R.magicName(m)) + '</b>' + (T && p ? T.marksHtml(m, p) : '') + '</span>';
  }
  function rewardHtml(q) {
    var out = ['ミッション' + q.missions.length + 'つ（取った魔法が育つ）'];
    if (q.kind === 'dark') out = ['闇の力（ミッションを取った魔法の直撃の威力が上がる）'];
    if (q.reward && q.reward.join) out.push('<b class="lq-join">新しい仲間: ' + esc(R.magicName(q.reward.join)) + (camp.roster.indexOf(q.reward.join) >= 0 ? '（もういる）' : '') + '</b>');
    if (q.accept && q.accept.order) out.push('<span class="lq-warn">受けると、村の治安が「' + esc(Q.ORDER[q.accept.order].name) + '」になる</span>');
    return out.join('・');
  }

  function questCard(q) {
    var key = Q.isKey(camp, q), kind = q.kind === 'dark' ? 'dark' : key ? 'key' : 'side';
    var rec = Q.recommend(q, R.findPreset);
    return '<div class="lq-card lq-' + kind + '">' +
      '<div class="lq-card-head"><span class="lq-kind">' + esc(Q.KIND[kind].name) + '</span><b>' + esc(q.name) + '</b><small>' + esc(q.client) + 'の依頼</small></div>' +
      '<p class="lq-story">' + esc(q.story) + '</p>' +
      '<div class="lq-row"><span class="lq-l">戦い</span>' + esc(fightText(q)) + '</div>' +
      '<div class="lq-row"><span class="lq-l">ミッション</span><ul class="lq-ms">' + missionDefs(q).map(function (t) {
        return '<li title="' + esc(t.text) + '">' + (t.dir === 'dark' ? '<span class="lt-mark d-dark">闇</span>' : mark(t.dir)) + esc(t.name) + '</li>';
      }).join('') + '</ul></div>' +
      '<div class="lq-row"><span class="lq-l"></span>' + leanHtml(q) + '</div>' +
      '<div class="lq-row"><span class="lq-l">報酬</span>' + rewardHtml(q) + '</div>' +
      '<div class="lq-row"><span class="lq-l">おすすめ</span>' + rec.map(function (m) {
        var have = camp.roster.indexOf(m) >= 0;
        return '<span class="lq-rec' + (have ? '' : ' none') + '" title="' + esc(have ? '仲間にいる' : 'まだ仲間にいない') + '">' + esc(R.magicName(m)) + (have ? '' : '（まだいない）') + '</span>';
      }).join('') + '</div>' +
      '<div class="lq-row lq-fcs"><span class="lq-l">行き先</span><span>' + camp.roster.map(function (m) { return '<span class="lq-fcm"><b>' + esc(R.magicName(m)) + '</b>' + forecast(m, q) + '</span>'; }).join('') + '</span></div>' +
      '<button type="button" class="primary" data-q="take" data-id="' + esc(q.id) + '">' + (q.kind === 'dark' ? '裏クエストを受ける' : '受ける') + '</button></div>';
  }

  function boardHtml() {
    var top = Q.openChapter(camp), list = Q.board(camp), ord = Q.ORDER[camp.flags.order];
    var h = '<div class="lab-run-card lq-main"><h2>拠点 — クエストボード <small>試作ラボ N クエスト制</small></h2>';
    if (notes.length) h += '<div class="lq-notes">' + notes.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') + '</div>';
    if (camp.done) h += '<div class="lq-done"><b>1周の終わり！</b> 最後の章のキークエストを全部クリアした。残ったクエストは受けられる。「最初から」で1周目に戻る（道も0から）。</div>';
    h += '<div class="lq-status"><span><b>第' + top + '章「' + esc(Q.chapter(top).name) + '」</b> ' + esc(Q.chapter(top).text[camp.flags.order]) + '</span>' +
      '<span class="lq-order lq-' + esc(camp.flags.order) + '" title="' + esc(ord.text) + '">村の治安: ' + esc(ord.name) + '</span></div>' +
      '<div class="lq-party"><span class="lq-l">仲間</span>' + camp.roster.map(allyHtml).join('') + '</div>';
    for (var ch = 1; ch <= top; ch++) {
      var inCh = list.filter(function (q) { return q.ch === ch; });
      var keys = Q.keySlots(camp, ch), done = keys.filter(function (sl) { return camp.cleared[sl]; }).length;
      h += '<h3>第' + ch + '章「' + esc(Q.chapter(ch).name) + '」 <small>キークエスト ' + done + '/' + keys.length + (Q.chapterDone(camp, ch) ? '（クリア）' : '（全部クリアで次の章）') + '</small></h3>';
      h += inCh.length ? '<div class="lq-cards">' + inCh.map(questCard).join('') + '</div>' : '<p class="muted">この章のクエストは全部クリアした。</p>';
    }
    if (top < Q.CHAPTERS.length) h += '<p class="note x-more">第' + (top + 1) + '章「' + esc(Q.chapter(top + 1).name) + '」は、第' + top + '章のキークエストを全部クリアすると開く。</p>';
    h += keyEditHtml();
    if (camp.log.length) h += '<details class="lq-log"><summary>これまで（' + camp.log.length + '）</summary><ol>' + camp.log.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></details>';
    h += '<div class="lab-run-buttons"><button type="button" data-q="paths">道を見る</button><button type="button" data-q="restart">最初から（道も0から）</button><button type="button" data-q="close">閉じる</button></div>' +
      (storeOk ? '' : '<p class="note danger">この環境では1周の進みを持ち越せません（localStorage が使えない）。</p>') + '</div>';
    return h;
  }
  // 第1章のキークエストは未決（オーナー、10/16）。ラボの中で付け替えられる
  function keyEditHtml() {
    var chs = Q.CHAPTERS.filter(function (c) { return c.keyUndecided; });
    if (!chs.length) return '';
    return '<details class="lq-keyedit"><summary>キークエストの付け替え（ラボ。未決）</summary>' + chs.map(function (c) {
      return '<p>第' + c.no + '章: ' + Q.QUESTS.filter(function (q) { return q.ch === c.no && q.kind !== 'dark'; }).map(function (q) {
        return '<label><input type="checkbox" data-qkey="' + esc(q.id) + '"' + (Q.isKey(camp, q) ? ' checked' : '') + '> ' + esc(q.name) + '</label>';
      }).join(' ') + '</p>';
    }).join('') + '<p class="note">チェックしたものがキークエスト。全部クリアすると次の章が開く。クリアの記録は変わらない。</p></details>';
  }

  function partyHtml() {
    var q = Q.quest(pick.id), rec = Q.recommend(q, R.findPreset), n = Q.PARTY_SIZE;
    var h = '<div class="lab-run-card lq-main"><h2>連れていく仲間を選ぶ <small>' + esc(q.name) + '（' + esc(q.client) + 'の依頼）</small></h2>' +
      '<p class="lq-story">' + esc(q.story) + '</p>' +
      '<div class="lq-row"><span class="lq-l">戦い</span>' + esc(fightText(q)) + '</div>' +
      '<div class="lq-row"><span class="lq-l">ミッション</span><ul class="lq-ms">' + missionDefs(q).map(function (t) {
        return '<li title="' + esc(t.text) + '">' + (t.dir === 'dark' ? '<span class="lt-mark d-dark">闇</span>' : mark(t.dir)) + esc(t.name) + '</li>';
      }).join('') + '</ul></div>' +
      '<p class="note x-more">' + n + '人を選ぶ。おすすめの魔法は、盤面のその場所に立つ。ほかの仲間は、空いた場所に入る。ミッションを取った魔法に印が付く（やりたいことと合えば覚醒方面、合わなければ融合方面）。</p>' +
      '<div class="lq-picks">' + camp.roster.map(function (m) {
        var on = pick.party.indexOf(m) >= 0, W = LXL.N.wantOf(m);
        return '<button type="button" class="lq-pick' + (on ? ' on' : '') + '" data-q="pick" data-m="' + esc(m) + '">' +
          '<span class="lq-pick-head">' + (on ? '✓ ' : '') + allyHtml(m) + (rec.indexOf(m) >= 0 ? '<span class="lq-recmark">おすすめ</span>' : '') + '</span>' +
          '<small>やりたいこと「' + esc(wantName(W)) + '」</small><span class="lq-pick-fc">' + forecast(m, q) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="lab-run-buttons"><button type="button" class="primary" data-q="go"' + (pick.party.length === n ? '' : ' disabled') + '>出発（' + pick.party.length + '/' + n + '）</button><button type="button" data-q="back">ボードに戻る</button></div></div>';
    return h;
  }

  function render() {
    renderBar();
    if (view === 'battle') { box.hidden = true; return; }
    box.innerHTML = view === 'party' && pick ? partyHtml() : boardHtml();
    box.hidden = false;
  }
  function renderBar() {
    var q = running && Q.quest(running);
    var cur = app.scenario && R.findPreset(app.scenario);
    if (!q || !cur || cur.labQuestRun !== q.id) { bar.hidden = true; return; }
    var st = app.state;
    var h = '<span class="lab-bar-title">クエスト（第' + q.ch + '章）:</span><span class="lab-bar-on">' + esc(q.name) + '</span>' +
      (st && st.result ? '<button type="button" class="primary" data-q="growth">' + (st.result === 'win' ? '勝った → 育ちを見て拠点へ' : '負けた → 拠点へ') + '</button>' : '') +
      '<button type="button" data-q="home">' + (st && st.result ? '拠点に戻る' : 'やめて拠点に戻る') + '</button>';
    if (bar.innerHTML !== h) bar.innerHTML = h;
    bar.hidden = false;
  }

  // ---- 動き ----
  function open() {
    var cur = app.scenario && R.findPreset(app.scenario);
    if (running && !(cur && cur.labQuestRun === running)) running = null;   // 戦闘の途中でほかの盤面を読んだら、そのクエストはやめたことに
    load();
    useN();
    if (!camp) restart();
    var h = document.getElementById('howto'); if (h) h.hidden = true;
    if (TUI() && TUI().closeGrowth) TUI().closeGrowth();
    view = 'board';
    render();
  }
  function close() { box.hidden = true; notes = []; }
  function take(id) {
    var q = Q.quest(id);
    if (!q) return;
    pick = { id: id, party: Q.defaultParty(camp, q, R.findPreset) };
    view = 'party';
    notes = [];
    render();
  }
  function go() {
    var q = Q.quest(pick.id);
    if (!q || pick.party.length !== Q.PARTY_SIZE) return;
    var T = TUI(), dark = pick.party.some(function (m) { var p = T ? T.pathOf(m) : null; return p && p.dark > 0; });
    var p = Q.preset(q, pick.party, R.findPreset, { dark: dark });
    if (!p) { app.addLog('【クエスト制】盤面がない: ' + q.board); return; }
    var list = R.LAB_PRESETS;
    for (var i = list.length - 1; i >= 0; i--) if (list[i].id === p.id) list.splice(i, 1);
    list.push(p);
    var r = Q.accept(camp, q.id);
    camp = r.c; save();
    running = q.id; view = 'battle';
    box.hidden = true;
    app.loadScenario(p.id);
    app.addLog('【クエスト制】「' + q.name + '」を受けた（仲間: ' + pick.party.map(R.magicName).join('・') + '）');
    r.notes.forEach(function (t) { app.addLog('【クエスト制】' + t); });
    acceptNotes = r.notes;
    renderBar();
  }
  // 戦闘から拠点へ（勝っていればクリア。負け・途中でやめたらボードに残る）
  function back() {
    var q = running && Q.quest(running), st = app.state;
    var cur = app.scenario && R.findPreset(app.scenario);
    load();
    if (!camp) camp = Q.newCampaign();
    notes = [];
    if (q && cur && cur.labQuestRun === q.id && st && st.result) {
      var r = Q.finish(camp, q.id, st.result === 'win');
      camp = r.c; save();
      notes = r.notes;
    } else if (q) {
      camp.log.push('「' + q.name + '」を途中でやめた'); save();
      notes = ['「' + q.name + '」を途中でやめた（ボードに残る。受け直せる）'];
    }
    notes.forEach(function (t) { app.addLog('【クエスト制】' + t); });
    notes = acceptNotes.concat(notes);
    acceptNotes = [];
    running = null;
    useN();
    view = 'board';
    render();
  }
  function showGrowth() { if (TUI()) TUI().openGrowth(true); }

  box.addEventListener('click', function (e) {
    if (e.target === box) { close(); return; }
    var b = e.target.closest('[data-q]');
    if (!b) return;
    var a = b.getAttribute('data-q');
    if (a === 'close') close();
    else if (a === 'take') take(b.getAttribute('data-id'));
    else if (a === 'back') { view = 'board'; render(); }
    else if (a === 'go') go();
    else if (a === 'paths') { if (TUI()) TUI().openPaths(); }   // 道を見る画面は拠点の上に出る（閉じると拠点に戻る）
    else if (a === 'restart') { if (window.confirm('1周目からやり直します（クリアの記録・仲間・治安・魔法の道が全部消える）。よいですか？')) { restart(); view = 'board'; render(); } }
    else if (a === 'pick') {
      var m = b.getAttribute('data-m'), k = pick.party.indexOf(m);
      if (k >= 0) pick.party.splice(k, 1); else if (pick.party.length < Q.PARTY_SIZE) pick.party.push(m);
      render();
    }
  });
  box.addEventListener('change', function (e) {
    var c = e.target.closest('[data-qkey]');
    if (!c) return;
    camp = Q.setKey(camp, c.getAttribute('data-qkey'), c.checked);
    save(); render();
  });
  bar.addEventListener('click', function (e) {
    var a = e.target.getAttribute && e.target.getAttribute('data-q');
    if (a === 'home') back();
    if (a === 'growth') showGrowth();
  });
  openBtn.addEventListener('click', open);
  var prev = app.onRender;
  app.onRender = function () { if (prev) prev(); renderBar(); };

  // index.html#q で開く
  if (/^#q(uest)?$/i.test(location.hash)) setTimeout(open, 300);

  window.LabQuest = { open: open, back: back, close: close, state: function () { return camp; }, running: function () { return running; } };
})();
