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

  // ---- 道の持ち越し（魔法ごと） ----
  var STORE = 'cafilia-lab-paths';
  var paths = {}, storeOk = true;
  try { var raw = localStorage.getItem(STORE); paths = raw ? JSON.parse(raw) : {}; if (!paths || typeof paths !== 'object') paths = {}; } catch (e) { storeOk = false; paths = {}; }
  function savePaths() { try { localStorage.setItem(STORE, JSON.stringify(paths)); storeOk = true; } catch (e) { storeOk = false; } }
  function pathFor(m) { return LXL.normPath(m, paths[m] || null); }
  function setPath(m, p) { paths[m] = LXL.normPath(m, p); savePaths(); }
  function resetPaths() { paths = {}; savePaths(); }

  function dirInfo(d) { return LXL.DIRS[d] || { name: d, mark: '？', desc: '' }; }
  function mark(d) { var i = dirInfo(d); return '<span class="lt-mark d-' + esc(d) + '" title="' + esc(i.name + '（' + i.desc + '）') + '">' + esc(i.mark) + '</span>'; }
  // 方向が閉じているか（作るは閉じない）
  function closedDir(p, k) { return k !== 'make' && !!p.awake && p.awake !== k; }
  function awakenName(d, k) { return d.awaken[k] && (k !== 'make' || d.makeGood) ? d.awaken[k].name : ''; }
  // 作るは全魔法共通。作るが得意（草・土・水）なら3マス目で覚醒（森・山・川）
  function dirLabel(d, k) {
    if (k === 'make') return d.makeGood ? '作る（得意）→ 覚醒「' + awakenName(d, k) + '」' : '作る（全魔法共通・覚醒なし）';
    return dirInfo(k).name + ' → 覚醒「' + awakenName(d, k) + '」';
  }
  // 道の進み具合（方向の印＋●●○。覚醒した方向は光り、閉じた方向は薄い）
  function marksHtml(m, p) {
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
    var d = LXL.pathDef(m), f = p && p.awake && d ? d.awaken[p.awake] : null;
    return f ? f.name + '（' + R.magicName(m) + '）' : R.magicName(m);
  }
  // 得意な方向の一言（草: 止める ／ 土: 止める・動かす）
  function goodText(m) { var d = LXL.pathDef(m); return d ? d.dirs.map(function (k) { return dirInfo(k).name; }).join('・') : ''; }
  var DEST = { make: '作るが進む', nothing: '何も起きない', remain: '取れずに残る' };
  function modesText() {
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
  var HOW = { preparer: '材料', maker: '作った', stopper: '止めた', mover: '動かした' };
  function whoHtml(st, t) {
    if (!t.got) return '<span class="lt-who none">まだ</span>';
    if (t.got.by) return '<span class="lt-who">' + esc(LXL.handName(st, t.got.by)) + (HOW[t.got.how] ? '<small>（' + HOW[t.got.how] + '）</small>' : '') + '</span>';
    return '<span class="lt-who choose">' + esc(t.got.cands.map(function (h) { return LXL.handName(st, h); }).join('・')) + '<small>から選ぶ</small></span>';
  }
  function takerHtml(t) { return t.taker && t.taker !== 'hand' && LXL.TAKERS[t.taker] ? '（取る: ' + LXL.TAKERS[t.taker] + '）' : ''; }
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
      (st.labQuest ? ' <span class="lt-quest d-' + esc(st.labQuest.dir) + '">' + mark(st.labQuest.dir) + 'クエスト「' + esc(st.labQuest.name) + '」</span>' : '') +
      ' <small>1つ1回。取った魔法は、戦闘の終わりにその方向の道を1マス進む（得意でなければ作る）</small></div>' +
      (ts.length ? '<ul class="lt-list">' + ts.map(function (t) {
        return '<li class="lt-row d-' + esc(t.dir) + (t.got ? ' got' : '') + (flash[t.id] ? ' flash' : '') + '" data-tid="' + esc(t.id) + '">' + mark(t.dir) +
          '<span class="lt-name">' + esc(t.name) + '<small>' + esc(t.text + takerHtml(t)) + '</small></span>' + whoHtml(st, t) + '</li>';
      }).join('') + '</ul>' : '<p class="muted">このシナリオにはターゲットがない（道の効果だけ）</p>') +
      (allies.length ? '<div class="lt-party">' + allies.map(function (a) {
        return '<span class="lt-ally" title="' + esc('得意: ' + goodText(a.magic)) + '"><b>' + esc(magicLabel(a.magic, a.labPath)) + '</b>' + marksHtml(a.magic, a.labPath) + '</span>';
      }).join('') + '</div>' : '') +
      '<div class="lt-foot"><small>' + esc(modesText()) + '</small>' +
      '<span class="lt-btns">' + (st.result && ts.length ? '<button type="button" class="primary" data-lt="growth">育ちを見る</button>' : '') +
      (st.labQuest && !st.result ? '<button type="button" data-lt="quest">クエストを選び直す</button>' : '') + '<button type="button" data-lt="paths">道を見る</button><button type="button" data-lt="reset" title="魔法ごとの道を全部0に戻す（持ち越しも消える）">道を0に戻す</button></span></div>' +
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
    var defs = list.map(LXL.targetDef).filter(Boolean);
    return '<div class="lt-card"><b>このシナリオのターゲット</b> <small>（今の数 ' + n + '。上から' + n + 'つ）</small><ul>' + defs.map(function (t, i) {
      return '<li class="' + (i >= n ? 'off' : '') + '">' + mark(t.dir) + ' ' + esc(t.name) + ' <small>' + esc(t.text + takerHtml(t)) + (t.needsGrow ? '（育つが入のときだけ）' : '') + '</small></li>';
    }).join('') + '</ul></div>';
  }

  // ---- エディット: 道を直接いじる ----
  app.labPathEditHtml = function (u) {
    if (!R.lab('L0') || u.side === 'object' || !LXL.pathDef(u.magic)) return '';
    var d = LXL.pathDef(u.magic), p = LXL.normPath(u.magic, u.labPath);
    return '<span class="persona-edit lt-edit">道' + LXL.dirsOf(u.magic).map(function (k) {
      return '<label>' + esc(dirInfo(k).name) + ' <select data-id="' + u.id + '" data-field="lpath:' + k + '">' + [0, 1, 2, 3].map(function (n) {
        var tail = n !== 3 ? '' : awakenName(d, k) ? '（覚醒「' + esc(awakenName(d, k)) + '」）' : '（上限）';   // 作るも、得意なら3で覚醒（森・山・川）
        return '<option value="' + n + '"' + (p[k] === n ? ' selected' : '') + '>' + n + tail + '</option>';
      }).join('') + '</select></label>';
    }).join('') + '<button type="button" data-lt="pathzero" data-id="' + u.id + '">0に</button></span>';
  };
  var unitList = document.getElementById('unitList');
  if (unitList) {
    unitList.addEventListener('change', function (e) {
      var sel = e.target.closest('select');
      var f = sel ? sel.getAttribute('data-field') || '' : '';
      if (f.indexOf('lpath:') !== 0) return;
      var id = sel.getAttribute('data-id'), k = f.slice(6), v = Number(sel.value);
      var u = R.findUnit(app.state, id);
      if (!u) return;
      var p = LXL.normPath(u.magic, u.labPath);
      p[k] = v;
      // 3 にした方向が覚醒（作るは、作るが得意な魔法だけ）。ほかの得意な方向は2まで。作るはほかに覚醒しても3まで残る
      if (LXL.awakeDirs(u.magic).indexOf(k) >= 0) {
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
    var h = '<div class="lab-run-card lt-gcard"><h2>戦闘の終わり — 育ち <small>試作ラボ L</small></h2>' +
      '<p>' + (growth.won ? '<b>勝った！</b> 取ったターゲットを1つずつ、取った魔法の道に進める。得意でない方向は「' + esc(DEST[LXL.destMode()]) + '」（L5）。' : '<b>負けた…</b> ' + (lost ? 'この戦闘で取ったターゲットは全部なくなる（L4: なくなる）。' : 'L4 が「残る」なので、取ったターゲットは道に進める。')) + '</p>';
    if (!growth.rows.length) h += '<p class="muted">この戦闘で取ったターゲットはない。</p>';
    h += '<ol class="lt-steps">' + growth.rows.map(function (r, i) {
      var p = pl.rows[i], cls = 'lt-step d-' + (p.g && p.g.via ? 'make' : r.t.dir) + (i < growth.shown ? ' show' : '') + (lost ? ' lost' : '');
      var who = r.by ? esc(LXL.handName(st, r.by)) : '';
      var line = mark(r.t.dir) + ' 「' + esc(r.t.name) + '」 ';
      if (p.need === 'who') {
        line += '<span class="lt-choose">だれが取る？ ' + r.cands.map(function (c, j) {
          return '<button type="button" data-pick="' + i + ':' + j + '">' + esc(R.magicName(c.magic)) + '</button>';
        }).join('') + '</span>';
      } else {
        line += '<b>' + who + '</b>が達成' + (HOW[r.t.got.how] ? '（' + HOW[r.t.got.how] + '）' : '') + ' → ' +
          (p.g.via ? mark('make') + ' ' : '') + esc(resText(p)) + (p.after ? ' <span class="lt-inline">' + marksHtml(p.magic, p.after) + '</span>' : '');
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
  function pathCardHtml(m, b, a, applied) {
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
      pl.rows.forEach(function (r) { if (r.g && r.g.res.ok) app.addLog('【ラボ L】' + R.magicName(r.magic) + 'の' + dirInfo(r.g.dir).name + 'が1マス進んだ' + (r.g.via ? '（得意でない' + dirInfo(r.dir).name + 'で取った）' : '') + (r.g.res.awake ? '。覚醒「' + r.g.res.awake.name + '」！' : '')); });
      app.clearCache(); app.render();
      renderGrowth();
      return;
    }
    if (a === 'next') { var pre = R.findPreset(app.scenario); gbox.hidden = true; if (pre && pre.labNext) app.loadScenario(pre.labNext); return; }
    if (a === 'retry') { gbox.hidden = true; app.loadScenario(app.scenario, app.state.labQuest ? { labQuest: app.state.labQuest.dir } : undefined); return; }
  });

  // ---- L6 クエストを選ぶ（戦闘の前に。同じ盤面で、どの方向のミッションが出るか） ----
  function openQuest() {
    var pre = app.scenario && R.findPreset(app.scenario), st = app.state;
    var qs = pre ? LXL.questsOf(pre) : [];
    if (!qs.length) return;
    var n = LXL.targetCount();
    var allies = R.alliesOf(st).filter(function (a) { return LXL.pathDef(a.magic) && a.labPath; });
    var h = '<div class="lab-run-card lt-gcard"><h2>クエストを選ぶ <small>試作ラボ L6</small></h2>' +
      '<p class="note">' + esc(pre.name) + '。どのクエストを受けるかで、この戦闘で出るミッションの方向が決まる（育てたい方向を選べる）。お題に合うのは先頭のクエスト。</p>' +
      (allies.length ? '<div class="lt-party">' + allies.map(function (a) { return '<span class="lt-ally" title="' + esc('得意: ' + goodText(a.magic)) + '"><b>' + esc(magicLabel(a.magic, a.labPath)) + '</b>' + marksHtml(a.magic, a.labPath) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="lt-quests">' + qs.map(function (q) {
        var defs = q.list.map(LXL.targetDef).filter(Boolean).filter(function (t) { return !t.needsGrow || R.BALANCE.grow.enabled || (pre.overrides && pre.overrides['grow.enabled']); });
        return '<div class="lt-questcard d-' + esc(q.dir) + (st.labQuest && st.labQuest.dir === q.dir ? ' now' : '') + '"><div class="lt-pc-head">' + mark(q.dir) + ' <b>' + esc(q.name) + '</b> <small>（' + esc(dirInfo(q.dir).name) + '寄り）' + (q.fit ? ' お題に合う' : '') + '</small></div>' +
          '<ul>' + defs.map(function (t, i) { return '<li class="' + (i >= n ? 'off' : '') + '">' + mark(t.dir) + ' ' + esc(t.name) + '</li>'; }).join('') + '</ul>' +
          '<button type="button" class="primary" data-quest="' + esc(q.dir) + '">このクエストで戦う</button></div>';
      }).join('') + '</div><div class="lab-run-buttons"><button type="button" data-g="close">閉じる（いまのクエストのまま）</button></div></div>';
    gbox.innerHTML = h;
    growth = null;
    gbox.hidden = false;
  }
  gbox.addEventListener('click', function (e) {
    var b = e.target.closest('[data-quest]');
    if (!b) return;
    var dir = b.getAttribute('data-quest');
    gbox.hidden = true;
    app.loadScenario(app.scenario, { labQuest: dir });
    app.addLog('【ラボ L6】クエスト「' + ((LXL.questOf(R.findPreset(app.scenario), dir) || {}).name || dir) + '」を受けた');
  });

  // ---- 道を見る（戦闘の外でも） ----
  function openPaths() {
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

  window.LabTargetUI = { cardHtml: cardHtml, openQuest: openQuest, paths: function () { return clone(paths); }, setPath: setPath, resetPaths: resetPaths, openGrowth: openGrowth, openPaths: openPaths, render: renderBox };
  renderBox();
})();
