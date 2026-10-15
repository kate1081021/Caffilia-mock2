/*
 * lab_target_ui.js — 試作ラボ LAB_L「ターゲットで育つ」の画面（ルールは lab_rules.js の「L」の節）
 *   ・盤面の横の「ターゲット」の一覧（方向の印・名前・まだ／取った味方）。達成した瞬間に、その行が光る
 *   ・予測の一言（ターゲットの行は ui.js の予測にそのまま出る。「予告の決め手を潰す」「予告を別の敵に」だけここで足す）
 *   ・戦闘の終わりの「育ち」の画面（取ったターゲットを1つずつ → 道を1マス進める → 覚醒。得意でない方向は L5 の行き先へ）
 *   ・道の持ち越し（魔法ごとの道を localStorage の cafilia-lab-paths に。シナリオを読むと味方に入る）
 *   ・エディットで道を直接いじる（作るは 0〜3、得意な方向は 0〜3 で 3 が覚醒）・道を0に戻す
 *   ・判定パネルのカードに、そのシナリオのターゲット（lab_ui.js から LabTargetUI.cardHtml）
 *   ui.js・lab_ui.js のあとに読み込む。
 */
(function () {
  'use strict';
  var R = window.Rules, app = window.CafiliaApp;
  if (!R || !app || !R.LX || !R.LX.L) return;
  var LXL = R.LX.L;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---- 道の持ち越し（魔法ごと。M のときは別の入れ物 cafilia-lab-power） ----
  var STORE = 'cafilia-lab-paths', STORE_M = 'cafilia-lab-power', STORE_N = 'cafilia-lab-change';
  var paths = {}, pathsM = {}, pathsN = {}, storeOk = true;
  function loadBag(k) { var raw = localStorage.getItem(k), o = raw ? JSON.parse(raw) : {}; return o && typeof o === 'object' ? o : {}; }
  try { paths = loadBag(STORE); pathsM = loadBag(STORE_M); pathsN = loadBag(STORE_N); } catch (e) { storeOk = false; paths = {}; pathsM = {}; pathsN = {}; }
  function isN() { return !!(LXL.N && LXL.N.on()); }   // N 強化と変化（M の土台の上。N のときは M の描き分けはしない）
  function isM() { return !!(LXL.M && LXL.M.on()) && !isN(); }   // M 強化の方向（3つ）
  function bag() { return isN() ? pathsN : isM() ? pathsM : paths; }
  function savePaths() { try { localStorage.setItem(STORE, JSON.stringify(paths)); localStorage.setItem(STORE_M, JSON.stringify(pathsM)); localStorage.setItem(STORE_N, JSON.stringify(pathsN)); storeOk = true; } catch (e) { storeOk = false; } }
  function pathFor(m) { return LXL.normPath(m, bag()[m] || null); }
  function setPath(m, p) { bag()[m] = LXL.normPath(m, p); savePaths(); }
  function resetPaths() { if (isN()) pathsN = {}; else if (isM()) pathsM = {}; else paths = {}; savePaths(); }

  var SIMPLE = { name: '単純強化', mark: '＋', desc: '形が1マス増える（方向は進まない）' };
  function dirInfo(d) { if (d === 'simple') return SIMPLE; var T = LXL.dirTable ? LXL.dirTable() : LXL.DIRS; return T[d] || (LXL.M && LXL.M.DIRS[d]) || { name: d, mark: '？', desc: '' }; }
  function dcls(d) { return isM() && (d === 'make' || d === 'simple') ? 'mmake' : d; }   // M の作る系・単純強化は灰色
  function mark(d) { var i = dirInfo(d); return '<span class="lt-mark d-' + esc(dcls(d)) + '" title="' + esc(i.name + '（' + i.desc + '）') + '">' + esc(i.mark) + '</span>'; }
  // 方向が閉じているか（作るは閉じない。M は変化した方向以外）
  function closedDir(p, k) { if (isM()) return !!p.form && p.form !== k; return k !== 'make' && !!p.awake && p.awake !== k; }
  function awakenName(d, k) { return d.awaken[k] && (k !== 'make' || d.makeGood) ? d.awaken[k].name : ''; }
  // 作るは全魔法共通。作るが得意（草・土・水）なら3マス目で覚醒（森・山・川）
  function dirLabel(d, k) {
    if (k === 'make') return d.makeGood ? '作る（得意）→ 覚醒「' + awakenName(d, k) + '」' : '作る（全魔法共通・覚醒なし）';
    return dirInfo(k).name + ' → 覚醒「' + awakenName(d, k) + '」';
  }
  // 道の進み具合（方向の印＋●●○。覚醒した方向は光り、閉じた方向は薄い）
  // M: 方向ごとに変化までの ●○、最後に強化の数（覚醒まで）
  function marksHtmlM(m, p0) {
    var M = LXL.M, d = M.def(m);
    if (!d) return '';
    var p = M.norm(m, p0), C = M.changeAt(), A = M.awakeAt();
    var h = d.dirs.map(function (k) {
      var n = Math.min(C, p[k] || 0), dots = '', f = d.forms[k];
      for (var i = 0; i < C; i++) dots += '<i class="' + (i < n ? 'on' : '') + '"></i>';
      var cls = 'lt-path d-' + k + (p.form === k ? ' awake' : '') + (closedDir(p, k) ? ' closed' : '');
      var tip = dirInfo(k).name + ' → 変化「' + f.name + '」: ' + M.propText(f.prop, 1) + (closedDir(p, k) ? '（閉じた）' : p.form === k ? '（変化した）' : '');
      return '<span class="' + cls + '" title="' + esc(tip) + '">' + mark(k) + '<span class="dots">' + dots + '</span></span>';
    }).join('');
    var tot = Math.min(A, M.total(p)), dots2 = '', fo = p.form ? d.forms[p.form] : null;
    for (var j = 0; j < A; j++) dots2 += '<i class="' + (j < tot ? 'on' : '') + '"></i>';
    var tip2 = '強化の数（1回で形が1マス、上限' + M.shapeMax() + '）。' + (fo ? (p.awake ? '覚醒「' + fo.lv2.name + '」した' : 'あと' + (A - M.total(p)) + 'つで覚醒「' + fo.lv2.name + '」') : '変化してから、合計' + A + 'で覚醒');
    return h + '<span class="lt-path lt-pow' + (p.awake ? ' awake' : '') + '" title="' + esc(tip2) + '"><span class="lt-mark">強</span><span class="dots">' + dots2 + '</span></span>';
  }
  // L7 闇の力の印（持っているときだけ）
  function darkHtml(p) {
    var n = p && p.dark > 0 ? Math.min(p.dark, LXL.darkMax()) : 0;
    if (!n) return '';
    var dots = '';
    for (var i = 0; i < LXL.darkMax(); i++) dots += '<i class="' + (i < n ? 'on' : '') + '"></i>';
    return '<span class="lt-path d-dark" title="' + esc('闇の力（闇クエストで取った）: 直撃 +' + (n * LXL.darkPower()) + (R.lab('L7') ? '' : '（L7 がオフなので、いまは効かない）')) + '">' + mark('dark') + '<span class="dots">' + dots + '</span></span>';
  }
  function marksHtml(m, p) { return marksHtmlBase(m, p) + darkHtml(p); }
  function marksHtmlBase(m, p) {
    if (isN()) return marksHtmlN(m, p);
    if (isM()) return marksHtmlM(m, p);
    var d = LXL.pathDef(m);
    if (!d) return '';
    p = p || LXL.newPath(m);
    return LXL.dirsOf(m).map(function (k) {
      var n = p[k] || 0, dots = '';
      for (var i = 0; i < 3; i++) dots += '<i class="' + (i < n ? 'on' : '') + '"></i>';
      var cls = 'lt-path d-' + k + (p.awake === k ? ' awake' : '') + (closedDir(p, k) ? ' closed' : '');
      var tip = k !== 'make' ? dirLabel(d, k) + (closedDir(p, k) ? '（閉じた）' : '')
        : d.makeGood ? dirLabel(d, k) + '（形が1マス増える。3マス目で覚醒' + (p.awake && p.awake !== 'make' ? '。' + d.awaken[p.awake].name + 'に覚醒したので、もう覚醒しない' : '') + '）'
        : '作る（全魔法共通。形が1マス増える。3マスで上限、覚醒しない）';
      return '<span class="' + cls + '" title="' + esc(tip) + '">' + mark(k) + '<span class="dots">' + dots + '</span></span>';
    }).join('');
  }
  function magicLabel(m, p) {
    if (isN()) { var nf = nFormAfter(m, p); return nf ? nf.name + '（' + R.magicName(m) + '）' : R.magicName(m); }
    if (isM()) { var md = LXL.M.def(m), q = md ? LXL.M.norm(m, p) : null, mf = q && q.form ? md.forms[q.form] : null; return mf ? (q.awake ? mf.lv2.name : mf.name) + '（' + R.magicName(m) + '）' : R.magicName(m); }
    var d = LXL.pathDef(m), f = p && p.awake && d ? d.awaken[p.awake] : null;
    return f ? f.name + '（' + R.magicName(m) + '）' : R.magicName(m);
  }
  // 得意な方向の一言（草: 止める ／ 土: 止める・動かす）
  function goodText(m) { var d = LXL.pathDef(m); if (isN()) return d ? 'やりたいこと「' + dirInfo(d.want).name + '」' : '今回の育ちの対象ではない'; return d ? d.dirs.map(function (k) { return dirInfo(k).name; }).join('・') : ''; }
  var DEST = { make: '作るが進む', nothing: '何も起きない', remain: '取れずに残る' };
  var DEST_M = { simple: '単純強化', nothing: '何も起きない', remain: '取れずに残る' };
  function modesText() {
    if (isN()) {
      var N = LXL.N, ODD = { all: '全部融合方面', partner: '融合の相手と合うものだけ', step: '方面に数えない' };
      return '取り方: ' + (LXL.whoMode() === 'choose' ? '一手と材料から、終わりに選ぶ' : '最後の一手') + '／負けたら: ' + (LXL.loseMode() === 'keep' ? '残る' : 'なくなる') +
        '／変化 ' + N.changeAt() + '・覚醒 +' + N.awakeAt() + '／合わないミッション: ' + ODD[N.odd()] + '／土: ' + dirInfo(N.earth()).name + '／融合: ' + (N.weak() ? '控えめ' : '仲間と同じ') + '／間の強化: ' + (N.keep() ? '引き継ぐ' : '変化で0から');
    }
    if (isM()) {
      var M = LXL.M;
      return '取り方: ' + (LXL.whoMode() === 'choose' ? '一手と材料から、終わりに選ぶ' : '最後の一手') + '／敵の手: ' + (LXL.enemyMode() === 'preparer' ? '材料を作った味方' : '取れない') +
        '／負けたら: ' + (LXL.loseMode() === 'keep' ? '残る' : 'なくなる') + '／方向: ' + (M.dirsMode() === 'two' ? '属性ごとに2つ' : '3つとも') + '／持っていない方向: ' + DEST_M[M.dest()] +
        '／作る系: ' + (M.makeMode() === 'marker' ? '目印だけ' : '単純強化') + '／変化 ' + M.changeAt() + '・覚醒 ' + M.awakeAt() + '・形の上限 ' + M.shapeMax();
    }
    return '取り方: ' + (LXL.whoMode() === 'choose' ? '一手と材料から、終わりに選ぶ' : '最後の一手') +
      '／敵の手: ' + (LXL.enemyMode() === 'preparer' ? '材料を作った味方' : '取れない') +
      '／負けたら: ' + (LXL.loseMode() === 'keep' ? '残る' : 'なくなる') +
      '／得意でない方向: ' + DEST[LXL.destMode()];
  }

  // ---- シナリオを読んだら、味方に道を入れる（ui.js の loadScenario から） ----
  app.labPrepare = function (s, preset, opts) {
    if (!R.lab('L0')) return s;
    if (preset && preset.labSeriesStart && !opts.demo) {
      resetPaths();
      app.addLog('【ラボ L】連戦の1戦目: 道を0から始める（それまでの道は消した）');
    }
    s.units.forEach(function (u) {
      if (u.side === 'object' || !LXL.pathDef(u.magic)) return;
      if (u.labPath) { u.labPath = LXL.normPath(u.magic, u.labPath); return; }   // シナリオが決めた道
      if (u.side !== 'ally') return;
      u.labPath = opts.demo ? LXL.newPath(u.magic) : pathFor(u.magic);           // デモは0から（持ち越した道で動きが変わらないように）
    });
    // L6 クエストで方向を選ぶ: 選んだクエスト（なければお題に合うクエスト）のミッションにする。選んでいなければ、読んだあとに選ぶ画面を出す
    questPending = null;
    if (preset && preset.labDarkBoard) { s.labQuest = { dir: 'dark', name: '闇クエスト', fit: false }; return s; }   // L7: 闇クエストの盤面
    if (R.lab('L6') && preset && !opts.demo && LXL.questsOf(preset).length) {
      var q = LXL.questOf(preset, opts.labQuest);
      s.labTargetList = q.list.slice();
      s.labQuest = { dir: q.dir, name: q.name, fit: q.fit };
      if (!opts.labQuest) questPending = preset.id;
    }
    return s;
  };
  var questPending = null;

  // ---- 盤面の横の「ターゲット」 ----
  var playPanel = document.getElementById('playPanel');
  var box = document.createElement('div');
  box.id = 'labTargetBox'; box.className = 'lt-box'; box.hidden = true;
  if (playPanel) playPanel.insertBefore(box, playPanel.firstChild);
  var seenGot = {}, seenKey = null, boxSig = '';
  var HOW = { preparer: '材料', maker: '作った', stopper: '止めた', mover: '動かした', helper: '手を貸した', last: '決着', still: '歩かなかった', carrier: '運んだ', blocker: 'ふさいだ' };
  function whoHtml(st, t) {
    if (!t.got) return '<span class="lt-who none">まだ</span>';
    if (t.got.by) return '<span class="lt-who">' + esc(LXL.handName(st, t.got.by)) + (HOW[t.got.how] ? '<small>（' + HOW[t.got.how] + '）</small>' : '') + '</span>';
    return '<span class="lt-who choose">' + esc(t.got.cands.map(function (h) { return LXL.handName(st, h); }).join('・')) + '<small>から選ぶ</small></span>';
  }
  function takerHtml(t) { var T = LXL.takerTable ? LXL.takerTable() : LXL.TAKERS; return t.taker && t.taker !== 'hand' && T[t.taker] ? '（取る: ' + T[t.taker] + '）' : ''; }
  function renderBox() {
    var st = app.state;
    if (!box || !R.lab('L0') || app.editMode) { if (box) box.hidden = true; boxSig = ''; return; }
    if (seenKey !== app.resetPoint) { seenKey = app.resetPoint; seenGot = {}; (st.labTargets || []).forEach(function (t) { if (t.got) seenGot[t.id] = true; }); }
    var ts = st.labTargets || [];
    var flash = {};
    ts.forEach(function (t) { if (t.got && !seenGot[t.id]) { flash[t.id] = true; seenGot[t.id] = true; } else if (!t.got) delete seenGot[t.id]; });
    var allies = R.alliesOf(st).filter(function (a) { return LXL.pathDef(a.magic) && a.labPath; });
    var pre = app.scenario && R.findPreset(app.scenario);
    var html = '<div class="lt-head"><b>ターゲット</b>' + (pre && pre.labSeries ? ' <span class="lt-series">連戦 ' + esc(pre.labSeries) + '</span>' : '') +
      (st.labQuest ? ' <span class="lt-quest d-' + esc(dcls(st.labQuest.dir)) + '">' + mark(st.labQuest.dir) + 'クエスト「' + esc(st.labQuest.name) + '」</span>' : '') +
      ' <small>' + (isN() ? '1つ1回。取った魔法に印が1つ（やりたいことと合えば覚醒方面、合わなければ融合方面）。印1つで間の強化が1つ。どちらかの方面が' + LXL.N.changeAt() + 'つで変化' : isM() ? '1つ1回。取った魔法は、戦闘の終わりに強化（形が1マス）。同じ方向が' + LXL.M.changeAt() + 'つで変化、合計' + LXL.M.awakeAt() + 'で覚醒' : '1つ1回。取った魔法は、戦闘の終わりにその方向の道を1マス進む（得意でなければ作る）') + '</small></div>' +
      (ts.length ? '<ul class="lt-list">' + ts.map(function (t) {
        return '<li class="lt-row d-' + esc(dcls(t.dir)) + (t.got ? ' got' : '') + (flash[t.id] ? ' flash' : '') + '" data-tid="' + esc(t.id) + '">' + mark(t.dir) +
          '<span class="lt-name">' + esc(t.name) + '<small>' + esc(t.text + takerHtml(t)) + '</small></span>' + whoHtml(st, t) + '</li>';
      }).join('') + '</ul>' : '<p class="muted">このシナリオにはターゲットがない（道の効果だけ）</p>') +
      (allies.length ? '<div class="lt-party">' + allies.map(function (a) {
        return '<span class="lt-ally" title="' + esc('得意: ' + goodText(a.magic)) + '"><b>' + esc(magicLabel(a.magic, a.labPath)) + '</b>' + marksHtml(a.magic, a.labPath) + '</span>';
      }).join('') + '</div>' : '') +
      '<div class="lt-foot"><small>' + esc(modesText()) + '</small>' +
      '<span class="lt-btns">' + (st.result && ts.length ? '<button type="button" class="primary" data-lt="growth">育ちを見る</button>' : '') +
      (st.labQuest && !st.result ? '<button type="button" data-lt="quest">クエストを選び直す</button>' : '') + (isN() ? '<button type="button" data-lt="sort" title="44のミッションを、どのやりたいことに入れるか（ラボの中だけ）">ミッションの仕分け</button>' : isM() ? '<button type="button" data-lt="sort" title="41のミッションを、どの方向に入れるか（ラボの中だけ）">ミッションの仕分け</button>' : '') + '<button type="button" data-lt="paths">道を見る</button><button type="button" data-lt="reset" title="魔法ごとの道を全部0に戻す（持ち越しも消える）">道を0に戻す</button></span></div>' +
      (storeOk ? '' : '<p class="note danger">この環境では道を持ち越せません（localStorage が使えない）。</p>');
    if (html === boxSig) return;
    boxSig = html;
    box.innerHTML = html;
    box.hidden = false;
  }
  box.addEventListener('click', function (e) {
    var b = e.target.closest('[data-lt]');
    if (!b) return;
    var a = b.getAttribute('data-lt');
    if (a === 'growth') openGrowth(true);
    if (a === 'paths') openPaths();
    if (a === 'quest') openQuest();
    if (a === 'sort') { if (isN()) openSortN(); else openSort(); }
    if (a === 'reset') {
      if (!window.confirm('魔法ごとの道を全部0に戻します（持ち越しも消える）。よいですか？')) return;
      resetPaths();
      zeroUnits();
      app.addLog('【ラボ L】道を全部0に戻した');
    }
  });
  // 今の盤面の味方の道も0に（エディットの「0に」・道を0に戻す）
  function zeroUnits(id) {
    var st = app.state;
    st.units.forEach(function (u) { if (u.side === 'ally' && LXL.pathDef(u.magic) && (!id || u.id === id)) { var r = R.labSetPath(app.state, u.id, LXL.newPath(u.magic)); if (r.ok) app.state = r.state; } });
    app.clearCache(); app.render();
  }

  // ---- 予測の一言: 予告の決め手を潰す・予告を別の敵に（選んだ手のあとの予告で） ----
  var pvCache = { p: null, v: [] };
  app.labPreviewNotes = function (u, p) {
    var st = app.state;
    if (!R.lab('L0') || !p || !p.state || !st.labTargets) return [];
    var wantFoil = !!st.labPlanFin && LXL.openT(st, 'foiled').length, wantMove = LXL.openT(st, 'redirect').length;
    if (!wantFoil && !wantMove) return [];
    if (pvCache.p !== p) {
      var fc = null;
      try { fc = R.forecast(p.state); } catch (err) { fc = null; }
      var notes = LXL.foilPreview(st, fc).concat(LXL.redirectPreview(st, p.state, fc));
      pvCache = { p: p, v: notes.map(function (n) { return '<div class="pv-line ltarget d-' + esc(n.dir) + '">' + esc(n.text) + '</div>'; }) };
    }
    return pvCache.v;
  };

  // ---- 判定パネルのカード: このシナリオのターゲット ----
  function cardHtml(p) {
    var list = (p && p.labState && p.labState.labTargetList) || [];
    if (!list.length) return '';
    var n = LXL.targetCount();
    var nScen = (p.lab || []).indexOf('N0') >= 0 && LXL.N;   // N のシナリオは、N のミッションとやりたいことで見せる
    var mScen = !nScen && (p.lab || []).indexOf('M0') >= 0 && LXL.M;   // M のシナリオは、いまの切り替えに関係なく M のミッションと方向で見せる
    var defs = list.map(function (x) {
      if (nScen) { var nd = typeof x === 'string' ? (LXL.N.mission(x) || LXL.targetDef(x)) : x; if (nd) { nd = clone(nd); nd.dir = LXL.N.missionWant(nd); } return nd; }
      if (!mScen || typeof x !== 'string') return LXL.targetDef(x);
      var d = LXL.M.mission(x) || LXL.targetDef(x);
      if (d) { d = clone(d); d.dir = LXL.M.missionDir(d); }
      return d;
    }).filter(Boolean);
    var mk = function (d) {
      if (nScen) { var ni = LXL.N.WANTS[d] || { name: d, mark: '？', desc: '' }; return '<span class="lt-mark d-' + esc(d) + '" title="' + esc(ni.name + '（' + ni.desc + '）') + '">' + esc(ni.mark) + '</span>'; }
      if (!mScen) return mark(d);
      var i = LXL.M.DIRS[d] || { name: d, mark: '？', desc: '' };
      return '<span class="lt-mark d-' + esc(d === 'make' ? 'mmake' : d) + '" title="' + esc(i.name + '（' + i.desc + '）') + '">' + esc(i.mark) + '</span>';
    };
    var takerOf = function (t) { var T = (mScen || nScen) ? LXL.M.TAKERS : LXL.TAKERS; return t.taker && t.taker !== 'hand' && T[t.taker] ? '（取る: ' + T[t.taker] + '）' : ''; };
    return '<div class="lt-card"><b>このシナリオの' + (mScen || nScen ? 'ミッション' : 'ターゲット') + '</b> <small>（今の数 ' + n + '。上から' + n + 'つ）</small><ul>' + defs.map(function (t, i) {
      return '<li class="' + (i >= n ? 'off' : '') + '">' + mk(t.dir) + ' ' + esc(t.name) + ' <small>' + esc(t.text + takerOf(t)) + (t.needsGrow ? '（育つが入のときだけ）' : '') + (t.check && t.check.end ? '（勝ったときに決まる）' : '') + '</small></li>';
    }).join('') + '</ul></div>';
  }

  // ---- エディット: 道を直接いじる ----
  // L7 闇の力の数（エディット。0〜上限）
  function darkEditHtml(u) {
    if (!R.lab('L7') || u.side === 'object' || !LXL.pathDef(u.magic)) return '';
    var n = u.labPath && u.labPath.dark ? u.labPath.dark : 0, opts = '';
    for (var i = 0; i <= LXL.darkMax(); i++) opts += '<option value="' + i + '"' + (n === i ? ' selected' : '') + '>' + i + (i ? '（直撃 +' + (i * LXL.darkPower()) + '）' : '') + '</option>';
    return '<span class="persona-edit lt-edit lt-darkedit"><label>闇の力 <select data-id="' + u.id + '" data-field="lpath:dark">' + opts + '</select></label></span>';
  }
  app.labPathEditHtml = function (u) { return pathEditHtmlBase(u) + darkEditHtml(u); };
  function pathEditHtmlBase(u) {
    if (isN()) return pathEditHtmlN(u);
    if (isM()) return pathEditHtmlM(u);
    if (!R.lab('L0') || u.side === 'object' || !LXL.pathDef(u.magic)) return '';
    var d = LXL.pathDef(u.magic), p = LXL.normPath(u.magic, u.labPath);
    return '<span class="persona-edit lt-edit">道' + LXL.dirsOf(u.magic).map(function (k) {
      return '<label>' + esc(dirInfo(k).name) + ' <select data-id="' + u.id + '" data-field="lpath:' + k + '">' + [0, 1, 2, 3].map(function (n) {
        var tail = n !== 3 ? '' : awakenName(d, k) ? '（覚醒「' + esc(awakenName(d, k)) + '」）' : '（上限）';   // 作るも、得意なら3で覚醒（森・山・川）
        return '<option value="' + n + '"' + (p[k] === n ? ' selected' : '') + '>' + n + tail + '</option>';
      }).join('') + '</select></label>';
    }).join('') + '<button type="button" data-lt="pathzero" data-id="' + u.id + '">0に</button></span>';
  }
  // M: 方向ごとの数（change で変化）・単純強化の数・M5 の候補
  function pathEditHtmlM(u) {
    var M = LXL.M, d = u.side === 'object' ? null : M.def(u.magic);
    if (!d) return '';
    var p = M.norm(u.magic, u.labPath), C = M.changeAt();
    var h = '<span class="persona-edit lt-edit">道' + d.dirs.concat(['simple']).map(function (k) {
      var max = k === 'simple' ? 6 : C + 3, opts = '';
      for (var n = 0; n <= max; n++) opts += '<option value="' + n + '"' + ((p[k] || 0) === n ? ' selected' : '') + '>' + n + (k !== 'simple' && n === C ? '（変化「' + esc(d.forms[k].name) + '」）' : '') + '</option>';
      return '<label>' + esc(k === 'simple' ? '単純' : dirInfo(k).name) + ' <select data-id="' + u.id + '" data-field="lpath:' + k + '">' + opts + '</select></label>';
    }).join('') + '<button type="button" data-lt="pathzero" data-id="' + u.id + '">0に</button>';
    if (R.lab('M5')) h += '<span class="lt-cands">候補' + M.CANDS.map(function (c) {
      return '<label title="' + esc(c.text) + '"><input type="checkbox" data-id="' + u.id + '" data-field="lcand:' + c.id + '"' + (u.labCand && u.labCand[c.id] ? ' checked' : '') + '>' + esc(c.name) + '</label>';
    }).join('') + '</span>';
    return h + '</span>';
  }
  var unitList = document.getElementById('unitList');
  if (unitList) {
    unitList.addEventListener('change', function (e) {
      var sel = e.target.closest('select, input');
      var f = sel ? sel.getAttribute('data-field') || '' : '';
      if (f.indexOf('lcand:') === 0) {   // M5 の候補を付け外し
        var cu = R.findUnit(app.state, sel.getAttribute('data-id'));
        if (!cu) return;
        var cand = clone(cu.labCand || {});
        cand[f.slice(6)] = sel.checked;
        var cr = R.labSetCand(app.state, cu.id, cand);
        if (!cr.ok) { app.say(cr.error); return; }
        app.state = cr.state;
        app.addLog('【ラボ M5】' + R.unitLabel(cr.state, cu) + 'の候補: ' + (Object.keys(cand).filter(function (k) { return cand[k]; }).map(function (k) { return (LXL.M.CANDS.filter(function (c) { return c.id === k; })[0] || {}).name || k; }).join('・') || 'なし'));
        app.clearCache(); app.render();
        return;
      }
      if (f.indexOf('lpath:') !== 0) return;
      var id = sel.getAttribute('data-id'), k = f.slice(6), v = Number(sel.value);
      var u = R.findUnit(app.state, id);
      if (!u) return;
      var p = LXL.normPath(u.magic, u.labPath);
      if (isN() && k === 'nform') { p.form = sel.value || null; if (!p.form) delete p.form; }
      else if (isN() && (k === 'aw' || k === 'fu')) { var sync = (p.steps || 0) === (p.aw || 0) + (p.fu || 0); p[k] = v; if (sync) p.steps = (p.aw || 0) + (p.fu || 0); if (p.form && (p[p.form === 'awake' ? 'aw' : 'fu'] || 0) < LXL.N.changeAt()) delete p.form; }   // N: 間の強化は印と一緒に動かす（別にいじったときは、そのまま）
      else p[k] = v;
      if (isM() && k !== 'simple' && k !== 'dark') { if (v >= LXL.M.changeAt()) p.form = k; else if (p.form === k) p.form = null; }   // M: change に届いた方向で変化（闇の力は方向ではない）
      // 3 にした方向が覚醒（作るは、作るが得意な魔法だけ）。ほかの得意な方向は2まで。作るはほかに覚醒しても3まで残る
      if (!isM() && LXL.awakeDirs(u.magic).indexOf(k) >= 0) {
        if (v >= 3) { p.awake = k; LXL.pathDef(u.magic).dirs.forEach(function (o) { if (o !== k && p[o] > 2) p[o] = 2; }); }
        else if (p.awake === k) p.awake = null;
      }
      var res = R.labSetPath(app.state, id, p);
      if (!res.ok) { app.say(res.error); return; }
      app.state = res.state;
      var nu = R.findUnit(res.state, id);
      if (nu.side === 'ally') setPath(nu.magic, nu.labPath);   // 次の戦闘にも持ち越す
      app.addLog('【ラボ L】' + R.unitLabel(res.state, nu) + 'の道: ' + LXL.pathMarks(nu.magic, nu.labPath));
      app.clearCache(); app.render();
    });
    unitList.addEventListener('click', function (e) {
      var b = e.target.closest('[data-lt="pathzero"]');
      if (!b) return;
      var u = R.findUnit(app.state, b.getAttribute('data-id'));
      if (!u) return;
      if (u.side === 'ally') setPath(u.magic, LXL.newPath(u.magic));
      zeroUnits(u.id);
    });
  }

  // ---- 戦闘の終わり: 育ちの画面 ----
  var gbox = document.createElement('div');
  gbox.id = 'labGrowth'; gbox.className = 'lab-run lt-growth'; gbox.hidden = true;
  document.body.appendChild(gbox);
  var growth = null, autoKey = null, appliedKey = null, revealTimer = null;

  // この戦闘の始めの、魔法ごとの道（取った味方が倒れていても分かるように、リセットの戻り先から）
  function battlePaths() {
    var out = {};
    var base = app.resetPoint && app.resetPoint.units ? app.resetPoint.units : app.state.units;
    base.concat(app.state.units).forEach(function (u) {
      if (u.side === 'ally' && LXL.pathDef(u.magic) && !out[u.magic]) out[u.magic] = LXL.normPath(u.magic, u.labPath || pathFor(u.magic));
    });
    return out;
  }
  function newGrowth() {
    var st = app.state;
    var rows = LXL.gotOrder(st).map(function (t) {   // 取った順（道はこの順に進む）
      return { t: clone(t), by: t.got.by || null, cands: t.got.cands || null };
    });
    return { key: app.resetPoint, result: st.result, won: st.result === 'win', keep: LXL.loseMode() === 'keep', rows: rows, start: battlePaths(),
      shown: 0, applied: appliedKey === app.resetPoint, after: null };
  }
  function openGrowth(force) {
    var st = app.state;
    if (!st.labTargets || !st.result) return;
    if (force || !growth || growth.key !== app.resetPoint || growth.result !== st.result) growth = newGrowth();
    gbox.hidden = false;
    renderGrowth();
    clearTimeout(revealTimer);
    (function next() {
      if (!growth || gbox.hidden || growth.shown > growth.rows.length) return;
      growth.shown++;
      renderGrowth();
      revealTimer = setTimeout(next, 650);
    })();
  }
  // 行ごとに、取った魔法の道がどうなるか（前の行から順に進めた道で。得意でない方向は L5 の行き先へ）
  function plan() {
    var work = clone(growth.start), out = [];
    growth.rows.forEach(function (r) {
      var h = r.by;
      if (!h) { out.push({ need: 'who' }); return; }
      var m = h.magic, d = LXL.pathDef(m);
      if (!work[m] && d) work[m] = LXL.newPath(m);
      var before = work[m] ? clone(work[m]) : null;
      var g = work[m] ? LXL.gain(work[m], m, r.t.dir) : { dir: r.t.dir, res: { none: true } };
      out.push({ magic: m, dir: r.t.dir, g: g, before: before, after: work[m] ? clone(work[m]) : null });
    });
    return { rows: out, work: work };
  }
  function resText(p) {
    var t = LXL.gainText(p.magic, p.dir, p.g, p.before);
    return p.g.res.ok ? t : '達成したが、' + t;
  }
  function renderGrowth() {
    if (!growth) return;
    var st = app.state, pl = plan(), lost = !growth.won && !growth.keep;
    var allChosen = pl.rows.every(function (r) { return !r.need; });
    var h = '<div class="lab-run-card lt-gcard"><h2>戦闘の終わり — 育ち <small>試作ラボ ' + (isN() ? 'N（強化と変化）' : isM() ? 'M（強化の方向は3つ）' : 'L') + '</small></h2>' +
      '<p>' + (growth.won ? '<b>勝った！</b> 取ったターゲットを1つずつ、取った魔法の道に進める。' + (isN() ? '取った魔法に印が1つ（やりたいことと合えば覚醒方面、合わなければ融合方面）。印1つで間の強化が1つ。どちらかの方面が' + LXL.N.changeAt() + 'つで変化（もう片方は閉じる）、覚醒方面はさらに' + LXL.N.awakeAt() + 'つで覚醒。' : isM() ? '強化1回で形が1マス。同じ方向が' + LXL.M.changeAt() + 'つで変化、合計' + LXL.M.awakeAt() + 'で覚醒。持っていない方向は「' + esc(DEST_M[LXL.M.dest()]) + '」（M2）。' : '得意でない方向は「' + esc(DEST[LXL.destMode()]) + '」（L5）。') : '<b>負けた…</b> ' + (lost ? 'この戦闘で取ったターゲットは全部なくなる（L4: なくなる）。' : 'L4 が「残る」なので、取ったターゲットは道に進める。')) + '</p>';
    if (!growth.rows.length) h += '<p class="muted">この戦闘で取ったターゲットはない。</p>';
    h += '<ol class="lt-steps">' + growth.rows.map(function (r, i) {
      var p = pl.rows[i], cls = 'lt-step d-' + (p.g && p.g.via ? dcls(isM() ? 'simple' : 'make') : dcls(r.t.dir)) + (i < growth.shown ? ' show' : '') + (lost ? ' lost' : '');
      var who = r.by ? esc(LXL.handName(st, r.by)) : '';
      var line = mark(r.t.dir) + ' 「' + esc(r.t.name) + '」 ';
      if (p.need === 'who') {
        line += '<span class="lt-choose">だれが取る？ ' + r.cands.map(function (c, j) {
          return '<button type="button" data-pick="' + i + ':' + j + '">' + esc(R.magicName(c.magic)) + '</button>';
        }).join('') + '</span>';
      } else {
        line += '<b>' + who + '</b>が達成' + (HOW[r.t.got.how] ? '（' + HOW[r.t.got.how] + '）' : '') + ' → ' +
          (p.g.via ? mark(isM() ? 'simple' : 'make') + ' ' : '') + esc(resText(p)) + (p.after ? ' <span class="lt-inline">' + marksHtml(p.magic, p.after) + '</span>' : '');
      }
      return '<li class="' + cls + '">' + line + '</li>';
    }).join('') + '</ol>';
    // 魔法ごとの道（いま → 進めたあと）
    var mags = Object.keys(growth.start);
    var after = growth.applied && growth.after ? growth.after : pl.work;
    h += '<h3>魔法の道</h3><div class="lt-pathcards">' + mags.map(function (m) { return pathCardHtml(m, growth.start[m], after[m] || growth.start[m], growth.applied); }).join('') + '</div>';
    var pre = app.scenario && R.findPreset(app.scenario);
    h += '<div class="lab-run-buttons">' +
      (!lost && growth.rows.length ? '<button type="button" class="primary" data-g="apply"' + (growth.applied || !allChosen ? ' disabled' : '') + '>' + (growth.applied ? '道に進めた' : '道に進める') + '</button>' : '') +
      (pre && pre.labNext && growth.won ? '<button type="button"' + (growth.applied || lost || !growth.rows.length ? ' class="primary"' : '') + ' data-g="next">次の戦いへ: ' + esc((R.findPreset(pre.labNext) || {}).name || pre.labNext) + '</button>' : '') +
      (!growth.won ? '<button type="button" data-g="retry">もう一度</button>' : '') +
      '<button type="button" data-g="close">閉じる</button></div>' +
      (growth.applied ? '<p class="note">道は持ち越される（次に読むシナリオの味方に入る）。エディットで直接いじれる。</p>' : '') + '</div>';
    gbox.innerHTML = h;
  }
  // 魔法1つの道のカード（b: 前、a: あと）
  // M: 魔法1つの道のカード（変化・覚醒を見せる）
  function pathCardHtmlM(m, b0, a0, applied) {
    var M = LXL.M, d = M.def(m);
    if (!d) return '';
    var b = M.norm(m, b0), a = M.norm(m, a0), cur = applied ? a : b, fo = a.form ? d.forms[a.form] : null;
    var changed = a.form && !b.form, awoke = a.awake && !b.awake;
    var head = '<b>' + esc(magicLabel(m, cur)) + '</b> <small>' + esc(M.dirsMode() === 'two' ? '方向: ' + goodText(m) : '方向は3つとも') + '</small>';
    if (changed) head += applied ? ' <span class="lt-awake">変化！ ' + esc(R.magicName(m)) + ' → ' + esc(fo.name) + '</span>' : ' <small>（進めると変化「' + esc(fo.name) + '」）</small>';
    if (awoke) head += applied ? ' <span class="lt-awake">覚醒！ ' + esc(fo.name) + ' → ' + esc(fo.lv2.name) + '</span>' : ' <small>（進めると覚醒「' + esc(fo.lv2.name) + '」）</small>';
    return '<div class="lt-pathcard' + ((changed || awoke) && applied ? ' awoke' : '') + '"><div class="lt-pc-head">' + head + '</div>' +
      '<div class="lt-pc-row"><span class="lt-pc-l">' + (applied ? '前' : 'いま') + '</span>' + marksHtml(m, b) + '</div>' +
      (JSON.stringify(a) !== JSON.stringify(b) ? '<div class="lt-pc-row"><span class="lt-pc-l">' + (applied ? '今' : 'あと') + '</span>' + marksHtml(m, a) + '</div>' : '') +
      '<ul class="lt-pc-dirs">' + d.dirs.map(function (k) {
        var f = d.forms[k], closed = closedDir(a, k), left = M.changeAt() - (a[k] || 0);   // 進めたあとの道で
        var note = closed ? '閉じた' : a.form === k ? (a.awake ? '覚醒した' : '変化した（あと' + (M.awakeAt() - M.total(a)) + 'つで覚醒）') : 'あと' + left + 'つで変化';
        return '<li class="d-' + k + (closed ? ' closed' : '') + '">' + mark(k) + ' 変化「' + esc(f.name) + '」→ 覚醒「' + esc(f.lv2.name) + '」<small>' + esc(note + '。' + M.propText(f.prop, 1) + ' → ' + (M.PROPS[f.prop] || {}).t2) + '</small></li>';
      }).join('') + '</ul></div>';
  }
  function pathCardHtml(m, b, a, applied) {
    var base = pathCardHtmlBase(m, b, a, applied), cur = applied ? a : b, n = cur && cur.dark ? cur.dark : 0, nb = b && b.dark ? b.dark : 0, na = a && a.dark ? a.dark : 0;
    if (!n && !na) return base;
    var line = '<div class="lt-pc-dark">' + mark('dark') + ' 闇の力 ' + LXL.darkDots(applied ? na : nb) + (na !== nb && !applied ? ' → ' + LXL.darkDots(na) : '') + '<small>直撃 +' + ((applied ? na : Math.max(na, nb)) * LXL.darkPower()) + '</small></div>';
    return base.replace(/<\/div>$/, line + '</div>');
  }
  function pathCardHtmlBase(m, b, a, applied) {
    if (isN()) return pathCardHtmlN(m, b, a, applied);
    if (isM()) return pathCardHtmlM(m, b, a, applied);
    var d = LXL.pathDef(m), awoke = a.awake && !b.awake, cur = applied ? a : b;
    return '<div class="lt-pathcard' + (awoke && applied ? ' awoke' : '') + '"><div class="lt-pc-head"><b>' + esc(magicLabel(m, cur)) + '</b> <small>得意: ' + esc(goodText(m)) + '</small>' +
      (awoke ? (applied ? ' <span class="lt-awake">覚醒！ ' + esc(R.magicName(m)) + ' → ' + esc(d.awaken[a.awake].name) + '</span>' : ' <small>（進めると覚醒「' + esc(d.awaken[a.awake].name) + '」）</small>') : '') + '</div>' +
      '<div class="lt-pc-row"><span class="lt-pc-l">' + (applied ? '前' : 'いま') + '</span>' + marksHtml(m, b) + '</div>' +
      (JSON.stringify(a) !== JSON.stringify(b) ? '<div class="lt-pc-row"><span class="lt-pc-l">' + (applied ? '今' : 'あと') + '</span>' + marksHtml(m, a) + '</div>' : '') +
      '<ul class="lt-pc-dirs">' + LXL.dirsOf(m).map(function (k) {
        var n = cur[k] || 0, step = LXL.stepText(m, cur, k, Math.min(2, n)), closed = closedDir(cur, k);
        var note = closed ? '閉じた' : n < 3 ? '次: ' + step : cur.awake === k ? '覚醒した' : '作るはもう伸びない（3マス）';
        return '<li class="d-' + k + (closed ? ' closed' : '') + '">' + mark(k) + ' ' + esc(dirLabel(d, k)) + '<small>' + esc(note) + '</small></li>';
      }).join('') + '</ul></div>';
  }
  gbox.addEventListener('click', function (e) {
    if (e.target === gbox) { gbox.hidden = true; return; }
    var b = e.target.closest('button');
    if (!b || !growth) { if (b && b.getAttribute('data-g') === 'close') gbox.hidden = true; return; }
    if (b.hasAttribute('data-pick')) { var pk = b.getAttribute('data-pick').split(':').map(Number); var r = growth.rows[pk[0]]; r.by = r.cands[pk[1]]; renderGrowth(); return; }
    var a = b.getAttribute('data-g');
    if (a === 'close') { gbox.hidden = true; return; }
    if (a === 'apply' && !growth.applied) {
      var pl = plan();
      Object.keys(pl.work).forEach(function (m) { setPath(m, pl.work[m]); });
      growth.applied = true; growth.after = pl.work; appliedKey = growth.key;
      // 盤面の味方にも入れる（戦闘は終わっているので、見た目だけ）
      app.state.units.forEach(function (u) { if (u.side === 'ally' && pl.work[u.magic]) u.labPath = clone(pl.work[u.magic]); });
      pl.rows.forEach(function (r) {
        if (!r.g || !r.g.res.ok) return;
        if (isN()) app.addLog('【ラボ N】' + R.magicName(r.magic) + ': ' + (r.g.res.kind === 'awake' ? '覚醒方面の印' : r.g.res.kind === 'fuse' ? '融合方面の印' : '間の強化だけ') + (r.g.res.step ? '・間の強化「' + r.g.res.step.name + '」' : '') +
          (r.g.res.change ? '。変化「' + r.g.res.change.name + '」！' : '') + (r.g.res.awake ? '。覚醒「' + r.g.res.awake.name + '」！' : ''));
        else if (isM()) app.addLog('【ラボ M】' + R.magicName(r.magic) + ': ' + (r.g.dir === 'simple' ? '単純強化' : dirInfo(r.g.dir).name + 'が1つ進んだ') + (r.g.via ? '（持っていない・閉じた' + dirInfo(r.dir).name + 'で取った）' : '') +
          (r.g.res.change ? '。変化「' + r.g.res.change.name + '」！' : '') + (r.g.res.awake ? '。覚醒「' + r.g.res.awake.name + '」！' : ''));
        else app.addLog('【ラボ L】' + R.magicName(r.magic) + 'の' + dirInfo(r.g.dir).name + 'が1マス進んだ' + (r.g.via ? '（得意でない' + dirInfo(r.dir).name + 'で取った）' : '') + (r.g.res.awake ? '。覚醒「' + r.g.res.awake.name + '」！' : ''));
      });
      app.clearCache(); app.render();
      renderGrowth();
      return;
    }
    if (a === 'next') { var pre = R.findPreset(app.scenario); gbox.hidden = true; if (pre && pre.labNext) app.loadScenario(pre.labNext); return; }
    if (a === 'retry') { gbox.hidden = true; app.loadScenario(app.scenario, app.state.labQuest ? { labQuest: app.state.labQuest.dir } : undefined); return; }
  });

  // ---- L6 クエストを選ぶ（戦闘の前に。同じ盤面で、どの方向のミッションが出るか） ----
  var questFor = null;   // クエストを選ぶ盤面（闇クエストの盤面にいるときは、もとの盤面）
  function openQuest() {
    var pre = app.scenario && R.findPreset(app.scenario), st = app.state;
    if (pre && pre.labDarkFrom) pre = R.findPreset(pre.labDarkFrom);
    questFor = pre ? pre.id : null;
    var qs = pre ? LXL.questsOf(pre) : [];
    if (!qs.length) return;
    var n = LXL.targetCount();
    var allies = R.alliesOf(st).filter(function (a) { return LXL.pathDef(a.magic) && a.labPath; });
    var h = '<div class="lab-run-card lt-gcard"><h2>クエストを選ぶ <small>試作ラボ L6</small></h2>' +
      '<p class="note">' + esc(pre.name) + '。どのクエストを受けるかで、この戦闘で出るミッションの方向が決まる（育てたい方向を選べる）。お題に合うのは先頭のクエスト。</p>' +
      (allies.length ? '<div class="lt-party">' + allies.map(function (a) { return '<span class="lt-ally" title="' + esc('得意: ' + goodText(a.magic)) + '"><b>' + esc(magicLabel(a.magic, a.labPath)) + '</b>' + marksHtml(a.magic, a.labPath) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="lt-quests">' + qs.map(function (q) {
        var defs = q.list.map(LXL.targetDef).filter(Boolean).filter(function (t) { return !t.needsGrow || R.BALANCE.grow.enabled || (pre.overrides && pre.overrides['grow.enabled']); });
        return '<div class="lt-questcard d-' + esc(dcls(q.dir)) + (st.labQuest && st.labQuest.dir === q.dir ? ' now' : '') + '"><div class="lt-pc-head">' + mark(q.dir) + ' <b>' + esc(q.name) + '</b> <small>（' + esc(dirInfo(q.dir).name) + '寄り）' + (q.fit ? ' お題に合う' : '') + '</small></div>' +
          '<ul>' + defs.map(function (t, i) { return '<li class="' + (i >= n ? 'off' : '') + '">' + mark(t.dir) + ' ' + esc(t.name) + '</li>'; }).join('') + '</ul>' +
          '<button type="button" class="primary" data-quest="' + esc(q.dir) + '">このクエストで戦う</button></div>';
      }).join('') + darkQuestCard(pre, st, n) + '</div><div class="lab-run-buttons"><button type="button" data-g="close">閉じる（いまのクエストのまま）</button></div></div>';
    gbox.innerHTML = h;
    growth = null;
    gbox.hidden = false;
  }
  // L7 闇クエストの札（もとの盤面の labDark が、闇クエストの盤面）
  function darkQuestCard(pre, st, n) {
    var dp = R.lab('L7') && pre && pre.labDark ? R.findPreset(pre.labDark) : null;
    if (!dp) return '';
    var defs = ((dp.labState && dp.labState.labTargetList) || []).map(LXL.targetDef).filter(Boolean);
    var max = LXL.darkMax(), pw = LXL.darkPower();
    return '<div class="lt-questcard lt-darkq d-dark' + (st.labQuest && st.labQuest.dir === 'dark' ? ' now' : '') + '"><div class="lt-pc-head">' + mark('dark') + ' <b>闇クエスト</b> <small>' + esc(dp.labDarkName || dp.name) + '</small></div>' +
      '<ul>' + defs.map(function (t, i) { return '<li class="' + (i >= n ? 'off' : '') + '">' + mark(t.dir) + ' ' + esc(t.name) + '</li>'; }).join('') + '</ul>' +
      '<p class="lt-darknote">報酬: 闇の力（1つで直撃 +' + pw + '、' + max + 'つで +' + (pw * max) + '）。方向の道は進まない</p>' +
      '<button type="button" class="primary" data-darkq="' + esc(dp.id) + '">闇クエストを受ける</button></div>';
  }
  gbox.addEventListener('click', function (e) {
    var dk = e.target.closest('[data-darkq]');
    if (dk) { gbox.hidden = true; app.loadScenario(dk.getAttribute('data-darkq'), { labQuest: 'dark' }); app.addLog('【ラボ L7】闇クエストを受けた'); return; }
    var b = e.target.closest('[data-quest]');
    if (!b) return;
    var dir = b.getAttribute('data-quest'), id = questFor || app.scenario;
    gbox.hidden = true;
    app.loadScenario(id, { labQuest: dir });
    app.addLog('【ラボ L6】クエスト「' + ((LXL.questOf(R.findPreset(id), dir) || {}).name || dir) + '」を受けた');
  });

  // ---- 道を見る（戦闘の外でも） ----
  function openPathsM() {
    var M = LXL.M, mags = Object.keys(M.PW.FORMS);
    var h = '<div class="lab-run-card lt-gcard"><h2>魔法の道 <small>試作ラボ M（方向は 決める・止める・動かす の3つ。作るの方向はない）</small></h2>' +
      '<p class="note">道は魔法ごとに持ち越す（L の道とは別）。ミッションを取ると強化1回（形が1マス、上限' + M.shapeMax() + '）。同じ方向が' + M.changeAt() + 'つで<b>変化</b>（名前・駒の印・性質が変わる。ほかの方向は閉じる。戻れない）。' +
      '変化のあと、強化が合計' + M.awakeAt() + 'で<b>覚醒</b>（性質が1段強く・長く）。持っていない・閉じた方向は「' + esc(DEST_M[M.dest()]) + '」（M2）。作る系は「' + (M.makeMode() === 'marker' ? '目印だけ' : '単純強化') + '」（M4）。環境の変え方とシナジーは変わらない。性質は敵にも味方にも同じ。</p><div class="lt-pathcards">' +
      mags.map(function (m) {
        var d = M.def(m), p = pathFor(m);
        return '<div class="lt-pathcard"><div class="lt-pc-head"><b>' + esc(magicLabel(m, p)) + '</b> ' + marksHtml(m, p) + '</div><ul class="lt-pc-dirs">' + d.dirs.map(function (k) {
          var f = d.forms[k], P = M.PROPS[f.prop] || {};
          return '<li class="d-' + k + (closedDir(p, k) ? ' closed' : '') + '">' + mark(k) + ' ' + esc(dirInfo(k).name) + '<ol>' +
            '<li class="' + (p.form === k ? 'on' : '') + '">変化「' + esc(f.name) + '」: ' + esc(P.t1 || f.prop) + '</li>' +
            '<li class="' + (p.form === k && p.awake ? 'on' : '') + '">覚醒「' + esc(f.lv2.name) + '」: ' + esc(P.t2 || '') + '</li></ol></li>';
        }).join('') + '</ul></div>';
      }).join('') + '</div><div class="lab-run-buttons"><button type="button" data-g="close">閉じる</button></div></div>';
    gbox.innerHTML = h;
    growth = null;
    gbox.hidden = false;
  }
  // ---- M: ミッションの仕分け（41のミッションを、どの方向に入れるか。ラボの中だけ・localStorage） ----
  var SORT_STORE = 'cafilia-lab-mission-sort', sortMap = {};
  try { sortMap = loadBag(SORT_STORE); } catch (e) { sortMap = {}; }
  if (LXL.M) LXL.M.setSort(sortMap);
  var SORT_OPTS = [['decide', '決める'], ['stop', '止める'], ['move', '動かす'], ['make', '作る系（方向なし）'], ['off', '使わない']];
  function openSort() {
    var M = LXL.M;
    if (!M) return;
    var list = M.MISSIONS.slice().sort(function (a, b) { return a.no - b.no; });
    var count = {};
    list.forEach(function (t) { var d = M.missionDir(t); count[d] = (count[d] || 0) + 1; });
    var h = '<div class="lab-run-card lt-gcard lt-sortcard"><h2>ミッションの仕分け <small>試作ラボ M（材料まとめの41）</small></h2>' +
      '<p class="note">どのミッションを、どの方向に入れるか。変えた仕分けは、次にシナリオを読んだときから効く（「このシナリオで試す」でやり直す）。この画面の中だけで、ほかの人の画面には残らない。</p>' +
      '<p class="lt-sortcount">' + SORT_OPTS.map(function (o) { return (o[0] === 'off' ? '' : mark(o[0]) + ' ') + esc(o[1]) + ' ' + (count[o[0]] || 0); }).join('　') + '</p>' +
      '<table class="lt-sorttable"><tr><th>番号</th><th>ミッション</th><th>方向</th></tr>' + list.map(function (t) {
        var d = M.missionDir(t), T = M.TAKERS[t.taker];
        return '<tr class="d-' + esc(dcls(d)) + (sortMap[t.id] ? ' changed' : '') + '"><td>' + t.no + '</td><td><b>' + esc(t.name) + '</b><small>' + esc(t.text + (T && t.taker !== 'hand' ? '（取る: ' + T + '）' : '') + (t.check.end ? '（勝ったときに決まる）' : '')) + '</small></td>' +
          '<td><select data-sort="' + esc(t.id) + '">' + SORT_OPTS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === d ? ' selected' : '') + '>' + esc(o[1]) + (o[0] === t.dir ? '（初め）' : '') + '</option>'; }).join('') + '</select></td></tr>';
      }).join('') + '</table>' +
      '<div class="lab-run-buttons"><button type="button" data-sortreset="1">初めの仕分けに戻す</button><button type="button" class="primary" data-sortretry="1">このシナリオで試す</button><button type="button" data-g="close">閉じる</button></div></div>';
    gbox.innerHTML = h;
    growth = null;
    gbox.hidden = false;
  }
  gbox.addEventListener('change', function (e) {
    var sel = e.target.closest('[data-sort]');
    if (!sel || !LXL.M) return;
    var id = sel.getAttribute('data-sort'), def = LXL.M.mission(id);
    if (def && sel.value === def.dir) delete sortMap[id]; else sortMap[id] = sel.value;
    try { localStorage.setItem(SORT_STORE, JSON.stringify(sortMap)); } catch (err) { /* 残せないときも、この画面の間は効く */ }
    LXL.M.setSort(sortMap);
    openSort();
  });
  gbox.addEventListener('click', function (e) {
    if (e.target.closest('[data-sortreset]')) {
      sortMap = {};
      try { localStorage.setItem(SORT_STORE, '{}'); } catch (err) { /* なし */ }
      LXL.M.setSort(sortMap);
      openSort();
    }
    if (e.target.closest('[data-sortretry]')) { gbox.hidden = true; if (app.scenario) app.loadScenario(app.scenario); }
  });
  function openPaths() {
    if (isN()) { openPathsN(); return; }
    if (isM()) { openPathsM(); return; }
    var mags = Object.keys(LXL.PATHS);
    var h = '<div class="lab-run-card lt-gcard"><h2>魔法の道 <small>試作ラボ L（作るは全魔法共通。草の止めるは本物、ほかの決める・止める・動かすは共通の処理）</small></h2>' +
      '<p class="note">道は魔法ごとに持ち越す。ターゲットを取ると、その方向に1マス。得意でない方向で取ったら「' + esc(DEST[LXL.destMode()]) + '」（L5）。' +
      '得意な方向が3マスで覚醒（ほかの得意な方向は閉じる。戻れない）。作るは3マスが上限。作るが得意な草・土・水は、作るの3マス目で森・山・川に覚醒する（ほかの得意な方向は閉じる。先にほかの方向に覚醒したら、作るは覚醒しない）。</p><div class="lt-pathcards">' +
      mags.map(function (m) {
        var d = LXL.pathDef(m), p = pathFor(m);
        return '<div class="lt-pathcard"><div class="lt-pc-head"><b>' + esc(magicLabel(m, p)) + '</b> ' + marksHtml(m, p) + '</div><ul class="lt-pc-dirs">' + LXL.dirsOf(m).map(function (k) {
          return '<li class="d-' + k + (closedDir(p, k) ? ' closed' : '') + '">' + mark(k) + ' ' + esc(dirLabel(d, k)) + '<ol>' +
            d.steps[k].map(function (st, i) { return '<li class="' + (i < (p[k] || 0) ? 'on' : '') + '">' + esc(LXL.stepText(m, p, k, i)) + '</li>'; }).join('') + '</ol></li>';
        }).join('') + '</ul></div>';
      }).join('') + '</div><div class="lab-run-buttons"><button type="button" data-g="close">閉じる</button></div></div>';
    gbox.innerHTML = h;
    growth = null;
    gbox.hidden = false;
  }

  // ---- N 強化と変化（やりたいこと・覚醒方面と融合方面・間の強化） ----
  // 進めたあとの変化先（なければ null）
  function nFormAfter(m, p0) { var N = LXL.N, d = N.def(m); if (!d) return null; var p = N.norm(m, p0); if (!p.form) return null; return p.form === 'awake' ? (p.awake ? d.awake.lv2 : d.awake) : d.fuse; }
  function dotsHtml(n, max) { var t = ''; for (var i = 0; i < max; i++) t += '<i class="' + (i < n ? 'on' : '') + '"></i>'; return t; }
  // 進み具合: 覚（覚醒方面の印）●○ ・融（融合方面の印）●○ ・間の強化の印（威形効 …）
  function marksHtmlN(m, p0) {
    var N = LXL.N, d = N.def(m);
    if (!d) return '';
    var p = N.norm(m, p0), C = N.changeAt(), A = N.awakeAt(), h = '';
    var awT = '覚醒方面（やりたいこと「' + dirInfo(d.want).name + '」と合うミッション）: ' + (p.form === 'awake' ? (p.awake ? '覚醒「' + d.awake.lv2.name + '」した' : '変化「' + d.awake.name + '」した。あと' + (C + A - p.aw) + 'つで覚醒「' + d.awake.lv2.name + '」') : p.form ? '閉じた' : 'あと' + (C - p.aw) + 'つで変化「' + d.awake.name + '」');
    var fuT = '融合方面（合わないミッション）: ' + (p.form === 'fuse' ? '融合「' + d.fuse.name + '」した' : p.form ? '閉じた' : 'あと' + (C - p.fu) + 'つで融合「' + d.fuse.name + '」');
    if (p.form === 'awake') h += '<span class="lt-path d-awk awake" title="' + esc(awT) + '"><span class="lt-mark">' + (p.awake ? '醒' : '覚') + '</span><span class="dots">' + dotsHtml(p.awake ? A : p.aw - C, A) + '</span></span>';
    else h += '<span class="lt-path d-awk' + (p.form ? ' closed' : '') + '" title="' + esc(awT) + '"><span class="lt-mark">覚</span><span class="dots">' + dotsHtml(Math.min(C, p.aw), C) + '</span></span>';
    h += '<span class="lt-path d-fuse' + (p.form === 'fuse' ? ' awake' : p.form ? ' closed' : '') + '" title="' + esc(fuT) + '"><span class="lt-mark">融</span>' + (p.form === 'fuse' ? '' : '<span class="dots">' + dotsHtml(Math.min(C, p.fu), C) + '</span>') + '</span>';
    var st = N.stepsOf(m, p);
    if (st.length) h += '<span class="lt-nsteps" title="' + esc('間の強化: ' + st.map(function (x) { return x.name; }).join('・')) + '">' + st.map(function (x) { return '<b>' + esc(x.mark) + '</b>'; }).join('') + '</span>';
    return h;
  }
  // 2つの方面の中身（選ぶ前に違いが見えるように、何ができる魔法になるかを書く）
  function nDirsHtml(m, p) {
    var N = LXL.N, d = N.def(m), C = N.changeAt(), A = N.awakeAt();
    var aw = p.form === 'awake', fu = p.form === 'fuse';
    var awNote = aw ? (p.awake ? '覚醒した' : '変化した（あと' + (C + A - p.aw) + 'つで覚醒）') : fu ? '閉じた' : 'あと' + (C - p.aw) + 'つで変化';
    var fuNote = fu ? '融合した' : aw ? '閉じた' : 'あと' + (C - p.fu) + 'つで融合';
    return '<ul class="lt-pc-dirs">' +
      '<li class="d-awk' + (fu ? ' closed' : '') + '"><span class="lt-mark">覚</span> 覚醒方面 変化「' + esc(d.awake.name) + '」→ 覚醒「' + esc(d.awake.lv2.name) + '」' +
        '<small>' + esc(awNote) + '</small><small>変化「' + esc(d.awake.name) + '」: ' + esc(d.awake.text) + '</small><small>覚醒「' + esc(d.awake.lv2.name) + '」: ' + esc(d.awake.lv2.text) + '</small><small class="lt-ncombo">新しい組み合わせ: ' + esc(d.awake.lv2.combo) + '</small></li>' +
      '<li class="d-fuse' + (aw ? ' closed' : '') + '"><span class="lt-mark">融</span> 融合方面「' + esc(d.fuse.name) + '」（' + esc(R.magicName(d.fuse.with)) + 'と混ざる）' +
        '<small>' + esc(fuNote) + '</small><small>' + esc(d.fuse.text) + '（' + esc(N.weak() ? d.fuse.weak : d.fuse.same) + '）</small></li></ul>';
  }
  // 間の強化の並び（付いたものは太字）
  function nStepsHtml(m, p) {
    var N = LXL.N, d = N.def(m), have = N.stepsOf(m, p).length, out = [];
    for (var i = 0; i <= d.steps.length; i++) {
      var st = N.stepAt(d, i);
      if (!st) break;
      out.push('<li class="' + (i < have ? 'on' : '') + '" title="' + esc(st.text) + '">' + esc(st.name) + (i >= d.steps.length ? '（並びのあと、印1つで形が1マス' + (have > i ? '・いま' + (have - i) + 'つ' : '') + '）' : '') + '</li>');
    }
    return '<div class="lt-nstepbox">間の強化（' + esc(dirInfo(d.want).name) + 'の並び）<ol>' + out.join('') + '</ol></div>';
  }
  function pathCardHtmlN(m, b0, a0, applied) {
    var N = LXL.N, d = N.def(m);
    if (!d) return '';
    var b = N.norm(m, b0), a = N.norm(m, a0), cur = applied ? a : b;
    var changed = a.form && !b.form, awoke = a.awake && !b.awake, to = a.form === 'fuse' ? d.fuse.name : d.awake.name;
    var head = '<b>' + esc(magicLabel(m, cur)) + '</b> <small>やりたいこと「' + esc(dirInfo(d.want).name) + '」</small>';
    if (changed) head += applied ? ' <span class="lt-awake">' + (a.form === 'fuse' ? '融合！ ' : '変化！ ') + esc(R.magicName(m)) + ' → ' + esc(to) + '</span>' : ' <small>（進めると' + (a.form === 'fuse' ? '融合' : '変化') + '「' + esc(to) + '」）</small>';
    if (awoke) head += applied ? ' <span class="lt-awake">覚醒！ ' + esc(d.awake.name) + ' → ' + esc(d.awake.lv2.name) + '</span>' : ' <small>（進めると覚醒「' + esc(d.awake.lv2.name) + '」）</small>';
    return '<div class="lt-pathcard' + ((changed || awoke) && applied ? ' awoke' : '') + '"><div class="lt-pc-head">' + head + '</div>' +
      '<div class="lt-pc-row"><span class="lt-pc-l">' + (applied ? '前' : 'いま') + '</span>' + marksHtml(m, b) + '</div>' +
      (JSON.stringify(a) !== JSON.stringify(b) ? '<div class="lt-pc-row"><span class="lt-pc-l">' + (applied ? '今' : 'あと') + '</span>' + marksHtml(m, a) + '</div>' : '') +
      nDirsHtml(m, a) + nStepsHtml(m, a) + '</div>';
  }
  // エディット: 覚醒方面の印・融合方面の印・間の強化の数・どちらに変化したか
  function pathEditHtmlN(u) {
    var N = LXL.N, d = u.side === 'object' ? null : N.def(u.magic);
    if (!d) return '';
    var p = N.norm(u.magic, u.labPath), C = N.changeAt(), A = N.awakeAt();
    var sel = function (k, max, label, tail) {
      var o = '';
      for (var n = 0; n <= max; n++) o += '<option value="' + n + '"' + ((p[k] || 0) === n ? ' selected' : '') + '>' + n + (tail ? tail(n) : '') + '</option>';
      return '<label>' + esc(label) + ' <select data-id="' + u.id + '" data-field="lpath:' + k + '">' + o + '</select></label>';
    };
    return '<span class="persona-edit lt-edit">道' +
      sel('aw', C + A + 1, '覚醒方面', function (n) { return n === C ? '（変化「' + esc(d.awake.name) + '」）' : n === C + A ? '（覚醒「' + esc(d.awake.lv2.name) + '」）' : ''; }) +
      sel('fu', C + 2, '融合方面', function (n) { return n === C ? '（融合「' + esc(d.fuse.name) + '」）' : ''; }) +
      sel('steps', d.steps.length + 3, '間の強化', function (n) { var st = n ? N.stepAt(d, n - 1) : null; return st ? '（' + esc(st.name) + 'まで）' : ''; }) +
      '<label>変化 <select data-id="' + u.id + '" data-field="lpath:nform"><option value=""' + (!p.form ? ' selected' : '') + '>数のとおり</option>' +
      '<option value="awake"' + (p.form === 'awake' ? ' selected' : '') + '>覚醒方面「' + esc(d.awake.name) + '」</option><option value="fuse"' + (p.form === 'fuse' ? ' selected' : '') + '>融合方面「' + esc(d.fuse.name) + '」</option></select></label>' +
      '<button type="button" data-lt="pathzero" data-id="' + u.id + '">0に</button></span>';
  }
  // 道を見る（属性ごとに、やりたいこと・2つの方面・間の強化の並び）
  function openPathsN() {
    var N = LXL.N, mags = N.CH.ATTR_ORDER.filter(function (m) { return N.def(m); });
    var ODD = { all: '合わないミッションは全部融合方面', partner: '融合の相手の属性のやりたいことと合うものだけ融合方面', step: '合わないミッションは方面に数えない' };
    var h = '<div class="lab-run-card lt-gcard"><h2>魔法の道 <small>試作ラボ N（強化と変化）</small></h2>' +
      '<p class="note">道は魔法ごとに持ち越す（L・M の道とは別）。ミッションを取ると印が1つ: 属性のやりたいことと合えば覚醒方面、合わなければ融合方面（N2: ' + esc(ODD[N.odd()]) + '）。' +
      '印1つで、やりたいことの並びから間の強化が1つ付く（N5: ' + (N.keep() ? '変化しても引き継ぐ' : '変化したら0から') + '）。どちらかの方面が' + N.changeAt() + 'つで<b>変化</b>（名前も姿も変わった別の魔法。もう片方は閉じる。戻れない）。' +
      '覚醒方面だけ、さらに覚醒方面の印' + N.awakeAt() + 'つで<b>覚醒</b>（覚醒先は元の自然として振る舞い、新しい組み合わせを1つだけ持つ）。融合は' + (N.weak() ? '仲間と組むより控えめ' : '仲間と組むのと同じ大きさ') + '（N4）。' +
      '環境の変え方は、同じ魔法なら常に同じ（変化した魔法は別の魔法）。雷・氷・闇は今回の育ちの対象にしない。</p><div class="lt-pathcards lt-npaths">' +
      mags.map(function (m) {
        var p = N.norm(m, pathFor(m));
        return '<div class="lt-pathcard"><div class="lt-pc-head"><b>' + esc(magicLabel(m, p)) + '</b> <small>やりたいこと「' + esc(dirInfo(N.def(m).want).name) + '」</small><br>' + marksHtml(m, p) + '</div>' + nDirsHtml(m, p) + nStepsHtml(m, p) + '</div>';
      }).join('') + '</div><div class="lab-run-buttons"><button type="button" data-g="close">閉じる</button></div></div>';
    gbox.innerHTML = h;
    growth = null;
    gbox.hidden = false;
  }
  // ミッションの仕分け（44 → やりたいこと。ラボの中だけ・localStorage）
  var SORT_STORE_N = 'cafilia-lab-mission-sort-n', sortMapN = {};
  try { sortMapN = loadBag(SORT_STORE_N); } catch (e) { sortMapN = {}; }
  if (LXL.N) LXL.N.setSort(sortMapN);
  function openSortN() {
    var N = LXL.N;
    if (!N) return;
    var list = N.MISSIONS().slice().sort(function (a, b) { return a.no - b.no; });
    var opts = N.SORT_ORDER.map(function (k) { return [k, N.WANTS[k].name]; }).concat([['off', '使わない']]);
    var count = {};
    list.forEach(function (t) { var d = N.missionWant(t); count[d] = (count[d] || 0) + 1; });
    var attrs = N.CH.ATTR_ORDER.map(function (m) { var d = N.def(m); return d ? R.magicName(m) + '＝' + dirInfo(d.want).name : ''; }).filter(Boolean).join('・');
    var h = '<div class="lab-run-card lt-gcard lt-sortcard"><h2>ミッションの仕分け <small>試作ラボ N（44を、やりたいことに入れる）</small></h2>' +
      '<p class="note">取った魔法のやりたいこと（' + esc(attrs) + '）と合えば覚醒方面の印、合わなければ融合方面の印。「どれでも」はどの属性にも合う（覚醒方面）。変えた仕分けは、次にシナリオを読んだときから効く（「このシナリオで試す」でやり直す）。この画面の中だけ。</p>' +
      '<p class="lt-sortcount">' + opts.map(function (o) { return (o[0] === 'off' ? '' : mark(o[0]) + ' ') + esc(o[1]) + ' ' + (count[o[0]] || 0); }).join('　') + '</p>' +
      '<table class="lt-sorttable"><tr><th>番号</th><th>ミッション</th><th>やりたいこと</th></tr>' + list.map(function (t) {
        var d = N.missionWant(t), T = LXL.M.TAKERS[t.taker], def = N.CH.SORT[t.id] || 'free';
        return '<tr class="d-' + esc(d) + (sortMapN[t.id] ? ' changed' : '') + '"><td>' + t.no + '</td><td><b>' + esc(t.name) + '</b><small>' + esc(t.text + (T && t.taker !== 'hand' ? '（取る: ' + T + '）' : '') + (t.check.end ? '（勝ったときに決まる）' : '')) + '</small></td>' +
          '<td><select data-sortn="' + esc(t.id) + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === d ? ' selected' : '') + '>' + esc(o[1]) + (o[0] === def ? '（初め）' : '') + '</option>'; }).join('') + '</select></td></tr>';
      }).join('') + '</table>' +
      '<div class="lab-run-buttons"><button type="button" data-sortnreset="1">初めの仕分けに戻す</button><button type="button" class="primary" data-sortretry="1">このシナリオで試す</button><button type="button" data-g="close">閉じる</button></div></div>';
    gbox.innerHTML = h;
    growth = null;
    gbox.hidden = false;
  }
  gbox.addEventListener('change', function (e) {
    var sel = e.target.closest('[data-sortn]');
    if (!sel || !LXL.N) return;
    var id = sel.getAttribute('data-sortn'), def = LXL.N.CH.SORT[id] || 'free';
    if (sel.value === def) delete sortMapN[id]; else sortMapN[id] = sel.value;
    try { localStorage.setItem(SORT_STORE_N, JSON.stringify(sortMapN)); } catch (err) { /* 残せないときも、この画面の間は効く */ }
    LXL.N.setSort(sortMapN);
    openSortN();
  });
  gbox.addEventListener('click', function (e) {
    if (!e.target.closest('[data-sortnreset]') || !LXL.N) return;
    sortMapN = {};
    try { localStorage.setItem(SORT_STORE_N, '{}'); } catch (err) { /* なし */ }
    LXL.N.setSort(sortMapN);
    openSortN();
  });

  // ---- 毎回の描画のあと ----
  var prev = app.onRender;
  app.onRender = function () {
    if (prev) prev();
    renderBox();
    if (questPending && questPending === app.scenario && !app.busy && !app.demo) { questPending = null; setTimeout(openQuest, 0); }
    var st = app.state;
    if (R.lab('L0') && st.result && st.labTargets && !app.busy && !app.demo && !app.editMode && autoKey !== app.resetPoint) {
      autoKey = app.resetPoint;
      setTimeout(function () { openGrowth(false); }, 900);   // 勝敗の表示のあとに
    }
  };

  window.LabTargetUI = { cardHtml: cardHtml, openQuest: openQuest, openSort: openSort, openSortN: openSortN, paths: function () { return clone(paths); }, setPath: setPath, resetPaths: resetPaths, openGrowth: openGrowth, openPaths: openPaths, render: renderBox };
  renderBox();
})();
