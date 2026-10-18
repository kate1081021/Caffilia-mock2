/*
 * lab_trial_ui.js — 試作ラボ N「強化ためし」（10/19 オーナー「強化の組み直しと強化ためし」）。戦闘をしなくても、強化だけを試す画面（戦闘の外）。
 *   仲間（魔法）を選び、ミッションを選んで「クリアしたことにする」と、その魔法の道に1マス入る（形だけを選んで入れることもできる）。
 *   入れるたびに、どのマスに何の形が入り、何の小さな強化が入ったか、節目まであといくつか、このままならどちらの節目かを出す。
 *   節目に届いたら、変化・覚醒・範囲の大きな強化を、育ちの画面と同じ見せ方（金色の札・増えたマスが光る）で出す。
 *   道はクエスト制と同じ N の道（lab_target_ui.js の cafilia-lab-change）。どちらで入れた分も同じに扱う。
 *   1つ戻す（入れる前の道を覚えておく）・リセット・区切りの長さ（3・5・7）。進みは localStorage の cafilia-lab-trial。
 *   今の育ちのまま戦闘に入れる（盤面を選ぶ）。戦闘で取ったミッションも同じ道に入り、終わったら強化ためしに戻る。
 *   入口: 上のバーの「強化ためし」・クエスト制の拠点・判定パネルの N7・NT のカード・index.html#trial
 *   ui.js・lab_target_ui.js・lab_quest_ui.js のあとに読み込む。
 */
(function () {
  'use strict';
  var R = window.Rules, app = window.CafiliaApp, Q = window.LAB_QUEST;
  if (!R || !app || !Q || !R.LX || !R.LX.L || !R.LX.L.N) return;
  var LXL = R.LX.L, N = LXL.N;
  function TUI() { return window.LabTargetUI; }
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var MAGICS = ['grass', 'earth', 'fire', 'water', 'wind'];
  var HIST_MAX = 40;

  // ---- 進み（選んだ魔法・ミッション・盤面・仲間・1つ戻すための道の記録） ----
  var STORE = 'cafilia-lab-trial', storeOk = true;
  var st = { magic: 'fire', mission: '', board: '', party: null, hist: [] };
  var last = null;          // 最後に入れたもの { magic, before, after, w, name, text, res } ／戦闘のあと { battle, before, after }
  var running = null;       // 戦っている盤面の id
  var battleBag = null;     // 戦闘に入る前の道（戻ったときに、入った分を「1つ戻す」で戻せるように）
  try { var raw = localStorage.getItem(STORE); if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object') Object.keys(st).forEach(function (k) { if (o[k] !== undefined && o[k] !== null) st[k] = o[k]; }); } } catch (e) { storeOk = false; }
  if (MAGICS.indexOf(st.magic) < 0) st.magic = 'fire';
  if (!Array.isArray(st.hist)) st.hist = [];
  function save() { try { localStorage.setItem(STORE, JSON.stringify(st)); storeOk = true; } catch (e) { storeOk = false; } }
  function useN() { if (TUI() && TUI().useN) TUI().useN(); }
  function pathOf(m) { return N.norm(m, TUI().pathOf(m)); }
  function seg() { return !!(N.seg && N.seg()); }
  function pushHist(text) {
    st.hist.push({ bag: TUI().bag(), text: text });
    if (st.hist.length > HIST_MAX) st.hist.splice(0, st.hist.length - HIST_MAX);
  }

  // ---- 画面 ----
  var box = document.createElement('div');
  box.id = 'labTrial'; box.className = 'lab-run tr-wrap'; box.hidden = true;
  document.body.appendChild(box);
  var bar = document.createElement('div');
  bar.id = 'labTrialBar'; bar.className = 'lab-bar lab-run-bar tr-bar'; bar.hidden = true;
  var labBar = document.getElementById('labBar');
  if (labBar && labBar.parentNode) labBar.parentNode.insertBefore(bar, labBar.nextSibling); else document.body.appendChild(bar);
  var openBtn = document.createElement('button');
  openBtn.type = 'button'; openBtn.className = 'lab ng-open tr-open'; openBtn.textContent = '強化ためし';
  openBtn.title = '戦闘をしなくても、強化だけを試す（ミッションを「クリアしたことにする」と道に1マス入る）';
  var after = document.querySelector('.lq-open') || document.querySelector('.ng-open') || document.getElementById('btnLab');
  if (after) after.insertAdjacentElement('afterend', openBtn);

  function shp(w) { return TUI().shp(w); }
  // 魔法の札（タブ）: 名前と、今の区切り
  function tabHtml(m) {
    var p = pathOf(m), on = st.magic === m;
    return '<button type="button" class="tr-tab' + (on ? ' on' : '') + '" data-tr="magic" data-m="' + m + '"><b>' + esc(TUI().magicLabel(m, p)) + '</b>' + TUI().marksHtml(m, p) + '</button>';
  }
  // 選んだ魔法の札（名前・動詞・形の図・性質）
  function magicHtml(m) {
    var p = pathOf(m), d = N.def(m), f = TUI().nFormAfter(m, p), tr = N.TRAITS[m] || {}, grow = R.BALANCE.grow && R.BALANCE.grow.enabled;
    var s = R.createState({ size: 7, blank: true, enemyActs: false }), u = R.addAlly(s, m, 3, 6, 'up');
    u.labPath = clone(p);
    var verb = f ? f.verb : (R.MAGIC_INFO[m] || {}).verb, trait = f ? f.text : (grow && tr.grow) || tr.text || '';
    var h = '<div class="nr-card tr-card"><div class="nr-head"><b class="nr-name">' + esc(f ? f.name : R.magicName(m)) + '</b>' + (f ? '<small>（' + esc(R.magicName(m)) + 'から' + (p.form === 'fuse' ? '融合' : p.awake ? '覚醒' : '変化') + '）</small>' : '') +
      '<small>やりたいこと「' + esc((N.WANTS[d.want] || {}).name) + '」' + esc(N.shape(d.want)) + '</small><span class="nr-verb">' + esc(verb || '') + '</span>' + TUI().shapeGridHtml(u, s) + '</div>';
    if (trait) h += '<p class="nr-trait">' + esc(trait) + (f && f.combo ? '<br><b>新しい組み合わせ:</b> ' + esc(f.combo) : '') + '</p>';
    var base = last && !last.battle && last.magic === m ? last.before : last && last.battle ? N.norm(m, last.before[m] || null) : null;
    if (seg()) {
      h += TUI().segAxisHtml(m, p, p, base ? N.norm(m, base) : null);
      h += '<p class="nr-next sg-count">' + TUI().segCountHtml(m, p) + '</p>';
      var sm = N.smallCells(m, p).filter(function (c) { return c.step; });
      h += '<p class="nr-steps">小さな強化: ' + (sm.length ? sm.map(function (c) { return '<b title="' + esc(c.step.text) + '">' + esc(c.step.name) + '</b>'; }).join('・') : 'まだない') + '</p>';
      h += '<p class="nr-steps">範囲の大きな強化: ' + (p.range ? '×' + p.range + ' — ' + esc(N.rangeInfo(d, p).text) : 'まだない') + '</p>';
      h += '<details class="tr-more"><summary>節目の決まりと小さな強化の表</summary>' + TUI().segRulesHtml(m, p) + TUI().segSmallHtml(m, p) + '</details>';
    } else {
      h += TUI().axisHtml(m, p, p, base ? N.norm(m, base) : null);
      h += '<p class="nr-next">' + esc(N.nextText(m, p)) + '</p>';
      h += '<details class="tr-more"><summary>2つの方面と間の強化</summary>' + TUI().nDirsHtml(m, p) + TUI().nStepsHtml(m, p) + '</details>';
    }
    return h + '</div>';
  }
  // 最後に入れたもの（節目に届いたら、育ちの画面と同じ札で大きく）
  function lastHtml() {
    if (!last) return '<div class="tr-last muted">ミッションを「クリアしたことにする」か、形だけを入れると、ここに何が入ったかが出る。</div>';
    if (last.battle) {
      var rows = MAGICS.map(function (m) {
        var b = N.norm(m, last.before[m] || null), a = N.norm(m, last.after[m] || null), n = a.road.length - b.road.length;
        if (JSON.stringify(a) === JSON.stringify(b)) return '';
        var badge = seg() ? TUI().segBadges(m, b, a) : '';
        return '<div class="nr-gpath' + (badge ? ' big' : '') + '"><div class="nr-gpath-head"><b>' + esc(R.magicName(m)) + '</b> +' + Math.max(0, n) + 'マス' + badge + '</div>' + (seg() ? TUI().segMsDetail(m, b, a) : '') + '</div>';
      }).join('');
      return '<div class="tr-last"><b>戦闘「' + esc(last.battle) + '」で入った分</b>' + (rows || '<p class="muted">道に入ったものはない（負けた・取ったミッションがない）</p>') + '</div>';
    }
    var m = last.magic, r = last.res || {}, b = N.norm(m, last.before), a = N.norm(m, last.after);
    var head = '<b>' + esc(R.magicName(m)) + '</b>の道' + (r.slot ? 'の<b>' + r.slot + 'マス目</b>' + (r.seg ? '（区切り' + r.seg + 'の' + r.inSeg + '/' + r.segLen + '）' : '') : '') + 'に ' + shp(last.w) + (last.name ? '「' + esc(last.name) + '」' : '') + ' が入った';
    var small = seg() ? (r.small ? ' → 小さな強化「<b>' + esc(r.small.name) + '</b>」<small>' + esc(r.small.text) + '</small>' : ' → 小さな強化は<b>未定</b>') : (r.step ? ' → 間の強化「<b>' + esc(r.step.name) + '</b>」' : '');
    var badge = seg() ? TUI().segBadges(m, b, a) : (a.form && !b.form ? '<span class="lt-awake">' + (a.form === 'fuse' ? '融合！ ' : '変化！ ') + esc(R.magicName(m)) + '</span>' : '') + (a.awake && !b.awake ? '<span class="lt-awake">覚醒！</span>' : '');
    return '<div class="tr-last nr-gpath' + (badge ? ' big' : '') + '"><div class="nr-gpath-head tr-lasthead">' + head + small + '</div>' + (badge ? '<div class="tr-badges">' + badge + '</div>' + (seg() ? TUI().segMsDetail(m, b, a) : '') : '') +
      '<p class="tr-text"><small>' + esc(last.text) + '</small></p></div>';
  }
  // 入れる（ミッションを選んでクリアしたことにする／形だけ）
  function missionOpts() {
    var list = N.MISSIONS().slice().sort(function (a, b) { return a.no - b.no; }), groups = {};
    list.forEach(function (t) { var w = N.missionWant(t); if (w === 'off') return; (groups[w] = groups[w] || []).push(t); });
    return N.SORT_ORDER.map(function (w) {
      var W = N.WANTS[w] || {};
      return (groups[w] || []).length ? '<optgroup label="' + esc(W.shape + ' ' + W.name) + '">' + groups[w].map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (st.mission === t.id ? ' selected' : '') + '>' + esc(W.shape + ' ' + t.no + '. ' + t.name) + '</option>';
      }).join('') + '</optgroup>' : '';
    }).join('');
  }
  function curMission() { var t = st.mission && N.mission(st.mission); if (!t) { var l = N.MISSIONS(); t = l[0]; st.mission = t.id; } return t; }
  function addHtml(m) {
    var p = pathOf(m), t = curMission(), w = N.missionWant(t);
    var h = '<div class="tr-add"><h3>入れる <small>（' + esc(R.magicName(m)) + 'の道に1マス）</small></h3>' +
      '<div class="tr-row"><span class="lq-l">ミッション</span><select data-tr="mission">' + missionOpts() + '</select><button type="button" class="primary" data-tr="clear">クリアしたことにする</button></div>' +
      '<p class="tr-outlook"><small>' + esc(t.text) + '</small><br>取ったら: ' + esc(LXL.outlook(m, p, w)) + '</p>' +
      '<div class="tr-row"><span class="lq-l">形だけ</span>' + N.SORT_ORDER.map(function (k) {
        var W = N.WANTS[k];
        return '<button type="button" class="tr-shape d-' + k + '" data-tr="shape" data-w="' + k + '" title="' + esc('取ったら: ' + LXL.outlook(m, p, k)) + '">' + shp(k) + ' ' + esc(W.name) + '</button>';
      }).join('') + '</div></div>';
    return h;
  }
  // 戦闘に入る（今の育ちのまま。盤面はクエスト制の盤面から選ぶ）
  function boards() {
    var seen = {}, out = [];
    Q.QUESTS.forEach(function (q) {
      if (q.kind === 'dark' || seen[q.board]) return;
      var p = R.findPreset(q.board);
      if (!p) return;
      seen[q.board] = true;
      out.push({ id: q.board, name: p.name, quest: q });
    });
    return out;
  }
  function curBoard() { var bs = boards(), b = bs.filter(function (x) { return x.id === st.board; })[0] || bs[0]; if (b) st.board = b.id; return b; }
  function partyOf(b) {
    if (Array.isArray(st.party) && st.party.length === Q.PARTY_SIZE && st.partyFor === b.id) return st.party;
    var rec = Q.recommend(b.quest, R.findPreset).filter(function (m) { return MAGICS.indexOf(m) >= 0; });
    MAGICS.forEach(function (m) { if (rec.length < Q.PARTY_SIZE && rec.indexOf(m) < 0) rec.push(m); });
    st.party = rec.slice(0, Q.PARTY_SIZE); st.partyFor = b.id;
    return st.party;
  }
  function battleHtml() {
    var b = curBoard();
    if (!b) return '';
    var party = partyOf(b), ms = b.quest.missions.map(LXL.targetDef).filter(Boolean);
    return '<div class="tr-battle"><h3>この育ちで戦う <small>（戦闘で取ったミッションも同じ道に入る。終わったら強化ためしに戻る）</small></h3>' +
      '<div class="tr-row"><span class="lq-l">盤面</span><select data-tr="board">' + boards().map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === b.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>' +
      '<span class="tr-ms">' + ms.map(function (t) { return '<span class="nr-m" title="' + esc(t.text) + '">' + shp(t.dir) + '<span>' + esc(t.name) + '</span></span>'; }).join('') + '</span></div>' +
      '<div class="tr-row"><span class="lq-l">仲間（' + party.length + '/' + Q.PARTY_SIZE + '）</span>' + MAGICS.map(function (m) {
        var on = party.indexOf(m) >= 0;
        return '<button type="button" class="tr-pick' + (on ? ' on' : '') + '" data-tr="pick" data-m="' + m + '">' + (on ? '✓ ' : '') + esc(TUI().magicLabel(m, pathOf(m))) + '</button>';
      }).join('') + '<button type="button" class="primary" data-tr="fight"' + (party.length === Q.PARTY_SIZE ? '' : ' disabled') + '>戦闘に入る</button></div></div>';
  }
  function optsHtml() {
    var S = TUI().segSettings();
    var sel = function (k, vals) { return '<select data-tr="opt" data-k="' + k + '">' + Object.keys(vals).map(function (v) { return '<option value="' + v + '"' + (String(S[k]) === v ? ' selected' : '') + '>' + esc(vals[v]) + '</option>'; }).join('') + '</select>'; };
    return '<div class="tr-opts"><label class="tr-segon"><input type="checkbox" data-tr="segon"' + (S.on ? ' checked' : '') + '> 区切りの道（10/19）</label>' +
      (S.on ? '<span class="tr-lens"><span class="lq-l">区切り</span>' + Q.SEG_LENS.map(function (n) { return '<button type="button" class="tr-len' + (S.len === n ? ' on' : '') + '" data-tr="len" data-n="' + n + '">' + n + 'マス</button>'; }).join('') + '</span>' +
        '<details class="tr-more"><summary>ほかの切り替え</summary><label>★の数え方 ' + sel('star', { own: '自分の方向', other: 'ほかの方向', none: 'どちらでもない' }) + '</label>' +
        '<label>2つ目からの節目（覚醒方面） ' + sel('awakeLater', { own: '自分が多ければ覚醒・ほかなら範囲', any: '多い方に関係なく覚醒' }) + '</label>' +
        '<label>2つ目からの節目（融合方面） ' + sel('fuseLater', { range: '範囲の大きな強化', none: '何もない（未定）' }) + '</label></details>'
        : '<small class="muted">切: 10/16 の3マスの道（変化までの3マスと覚醒までのマス）</small>') + '</div>';
  }
  function render() {
    renderBar();
    if (running) { box.hidden = true; return; }
    useN();
    var m = st.magic;
    var h = '<div class="lab-run-card lq-main tr-main"><h2>強化ためし <small>戦闘をしなくても、強化だけを試す（道はクエスト制と同じ）</small></h2>' + optsHtml() +
      '<div class="tr-tabs">' + MAGICS.map(tabHtml).join('') + '</div>' +
      '<div class="tr-body"><div class="tr-left">' + magicHtml(m) + '</div><div class="tr-right">' + lastHtml() + addHtml(m) + '</div></div>' + battleHtml() +
      '<div class="lab-run-buttons"><button type="button" data-tr="undo"' + (st.hist.length ? '' : ' disabled') + ' title="' + esc(st.hist.length ? '戻す: ' + st.hist[st.hist.length - 1].text : '戻すものがない') + '">1つ戻す' + (st.hist.length ? '（' + st.hist.length + '）' : '') + '</button>' +
      '<button type="button" data-tr="reset">リセット（道を全部0に）</button><button type="button" data-tr="paths">道を見る</button>' + (window.LabQuest ? '<button type="button" data-tr="quest">拠点（クエスト制）</button>' : '') + '<button type="button" data-tr="close">閉じる</button></div>' +
      (st.hist.length ? '<details class="lq-log"><summary>入れたもの（' + st.hist.length + '）</summary><ol>' + st.hist.map(function (x) { return '<li>' + esc(x.text) + '</li>'; }).join('') + '</ol></details>' : '') +
      (storeOk ? '' : '<p class="note danger">この環境では、1つ戻すの記録を持ち越せません（localStorage が使えない）。道はこの画面の間は効く。</p>') + '</div>';
    box.innerHTML = h;
    box.hidden = false;
  }
  function renderBar() {
    var cur = app.scenario && R.findPreset(app.scenario);
    if (!running || !cur || cur.id !== running) { bar.hidden = true; return; }
    var s = app.state;
    var h = '<span class="lab-bar-title">強化ためし:</span><span class="lab-bar-on">' + esc(cur.name) + '</span>' +
      (s && s.result ? '<button type="button" class="primary" data-tr="growth">' + (s.result === 'win' ? '勝った → 育ちを見る' : '負けた → 育ちを見る') + '</button>' : '') +
      '<button type="button" data-tr="home">' + (s && s.result ? '強化ためしに戻る' : 'やめて強化ためしに戻る') + '</button>';
    if (bar.innerHTML !== h) bar.innerHTML = h;
    bar.hidden = false;
  }

  // ---- 動き ----
  function insert(m, w, name) {
    useN();
    var before = pathOf(m), p = clone(before), g = LXL.gain(p, m, w);
    var text = LXL.gainText(m, w, g, before);
    if (!g.res.ok || g.res.noRoad) { last = { magic: m, w: w, name: name, before: before, after: before, res: g.res, text: text }; render(); return; }
    pushHist(R.magicName(m) + ' に ' + N.shape(w) + (name ? '「' + name + '」' : '（形だけ）'));
    TUI().setPath(m, p);
    last = { magic: m, w: w, name: name, before: before, after: pathOf(m), res: g.res, text: text };
    app.addLog('【強化ためし】' + text);
    save(); render();
  }
  function undo() {
    var h = st.hist.pop();
    if (!h) return;
    TUI().setBag(h.bag);
    last = null;
    app.addLog('【強化ためし】1つ戻した（' + h.text + '）');
    save(); render();
  }
  function reset() {
    if (!window.confirm('魔法の道を全部0に戻します（クエスト制の道も同じなので、そちらも0になる）。「1つ戻す」で戻せます。よいですか？')) return;
    pushHist('リセット');
    TUI().resetPaths();
    last = null;
    app.addLog('【強化ためし】道を全部0に戻した');
    save(); render();
  }
  function fight() {
    var b = curBoard(), party = partyOf(b);
    if (!b || party.length !== Q.PARTY_SIZE) return;
    var dark = party.some(function (m) { var p = TUI().pathOf(m); return p && p.dark > 0; });
    var p = Q.preset(b.quest, party, R.findPreset, { dark: dark, seg: TUI().segSettings() });
    if (!p) return;
    p.id = 'labT_' + b.id;
    p.name = '強化ためし「' + (R.findPreset(b.id) || {}).name + '」';
    p.desc = '【強化ためし】今の育ちのまま戦う。取ったミッションは、勝つと道に入る。' + (R.findPreset(b.id) || {}).desc;
    delete p.labQuestRun;
    p.labTrialRun = true;
    p.allies.forEach(function (a) { if (a[3] && a[3].lab) { delete a[3].lab.labPath; if (!Object.keys(a[3].lab).length) delete a[3].lab; } });   // 味方の道は今の育ち（盤面が決めた道は使わない）
    var list = R.LAB_PRESETS;
    for (var i = list.length - 1; i >= 0; i--) if (list[i].id === p.id) list.splice(i, 1);
    list.push(p);
    battleBag = TUI().bag();
    running = p.id;
    save();
    box.hidden = true;
    app.loadScenario(p.id);
    app.addLog('【強化ためし】「' + p.name + '」で戦う（仲間: ' + party.map(R.magicName).join('・') + '）');
    renderBar();
  }
  // 戦闘から戻る（勝っていれば、取ったミッションはもう道に入っている。入った分は「1つ戻す」で戻せる）
  function back() {
    var bag = TUI().bag(), cur = running && R.findPreset(running);
    if (battleBag && JSON.stringify(bag) !== JSON.stringify(battleBag)) {
      st.hist.push({ bag: battleBag, text: '戦闘「' + (cur ? cur.name : '') + '」で入った分' });
      if (st.hist.length > HIST_MAX) st.hist.splice(0, st.hist.length - HIST_MAX);
      last = { battle: cur ? cur.name : '', before: battleBag, after: bag };
    } else if (cur) last = { battle: cur.name, before: bag, after: bag };
    running = null; battleBag = null;
    if (TUI() && TUI().closeGrowth) TUI().closeGrowth();
    save();
    render();
  }
  function open() {
    var cur = app.scenario && R.findPreset(app.scenario);
    if (running && !(cur && cur.id === running)) { running = null; battleBag = null; }
    var h = document.getElementById('howto'); if (h) h.hidden = true;
    if (TUI() && TUI().closeGrowth) TUI().closeGrowth();
    if (window.LabQuest && window.LabQuest.close) window.LabQuest.close();
    if (running) { back(); return; }
    render();
  }
  function close() { box.hidden = true; }

  box.addEventListener('click', function (e) {
    if (e.target === box) { close(); return; }
    var b = e.target.closest('[data-tr]');
    if (!b) return;
    var a = b.getAttribute('data-tr');
    if (a === 'magic') { st.magic = b.getAttribute('data-m'); save(); render(); }
    else if (a === 'clear') { var t = curMission(); insert(st.magic, N.missionWant(t), t.name); }
    else if (a === 'shape') insert(st.magic, b.getAttribute('data-w'), '');
    else if (a === 'undo') undo();
    else if (a === 'reset') reset();
    else if (a === 'len') { TUI().setSegSettings({ len: Number(b.getAttribute('data-n')) }); last = null; useN(); app.addLog('【強化ためし】区切りを' + b.getAttribute('data-n') + 'マスに'); render(); }
    else if (a === 'pick') {
      var m = b.getAttribute('data-m'), k = st.party.indexOf(m);
      if (k >= 0) st.party.splice(k, 1); else if (st.party.length < Q.PARTY_SIZE) st.party.push(m);
      save(); render();
    }
    else if (a === 'fight') fight();
    else if (a === 'paths') { if (TUI()) TUI().openPaths(); }
    else if (a === 'quest') { close(); if (window.LabQuest) window.LabQuest.open(); }
    else if (a === 'close') close();
  });
  box.addEventListener('change', function (e) {
    var el = e.target.closest('[data-tr]');
    if (!el) return;
    var a = el.getAttribute('data-tr');
    if (a === 'mission') { st.mission = el.value; save(); render(); }
    else if (a === 'board') { st.board = el.value; st.party = null; save(); render(); }
    else if (a === 'segon') { TUI().setSegSettings({ on: el.checked }); last = null; useN(); app.addLog('【強化ためし】道の決まり: ' + (el.checked ? '区切りの道（10/19）' : '3マスの道（10/16）')); render(); }
    else if (a === 'opt') { var o = {}; o[el.getAttribute('data-k')] = el.value; TUI().setSegSettings(o); last = null; useN(); render(); }
  });
  bar.addEventListener('click', function (e) {
    var a = e.target.getAttribute && e.target.getAttribute('data-tr');
    if (a === 'home') back();
    if (a === 'growth' && TUI()) TUI().openGrowth(true);
  });
  openBtn.addEventListener('click', open);
  var prev = app.onRender;
  app.onRender = function () { if (prev) prev(); renderBar(); };

  // index.html#trial で開く
  if (/^#trial$/i.test(location.hash)) setTimeout(open, 300);

  window.LabTrial = { open: open, back: back, close: close, running: function () { return running; }, state: function () { return clone(st); } };
})();
