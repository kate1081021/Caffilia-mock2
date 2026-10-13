/*
 * lab_ui.js — 試作ラボの判定パネル（LAB_00）
 *   上のバーの「ラボ」で左から開く。カテゴリごとの案の一覧 → カード（説明・試し方・問い・ボタン・判定・メモ）。
 *   判定とメモは localStorage（cafilia-lab-judge）。書き出し・読み込みは Markdown のテキスト。
 *   カードの中身は lab_cards.js、ラボ用シナリオは lab_scenarios.js、ルールは lab_rules.js。ui.js・tune_ui.js のあとに読み込む。
 */
(function () {
  'use strict';

  var R = window.Rules;
  var B = window.BALANCE;
  var app = window.CafiliaApp;
  var CATS = R.LAB.CATS, CARDS = R.LAB.CARDS, COMMON_Q = R.LAB.COMMON_Q;
  var STORE = 'cafilia-lab-judge';
  var JUDGE = [['good', '面白い'], ['meh', '微妙'], ['bad', '面白くない'], ['unknown', '分からない']];
  var ADOPT = [['use', '使う'], ['fix', '直して使う'], ['no', '使わない'], ['later', 'まだ']];
  var JUDGE_MARK = { good: '◎', meh: '△', bad: '×', unknown: '？' };

  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function card(id) { return CARDS.filter(function (c) { return c.id === id; })[0] || null; }
  function catName(id) { var c = CATS.filter(function (x) { return x.id === id; })[0]; return c ? c.name : id; }
  function label(list, v) { var p = list.filter(function (x) { return x[0] === v; })[0]; return p ? p[1] : ''; }
  function value(list, l) { var p = list.filter(function (x) { return x[1] === l; })[0]; return p ? p[0] : null; }

  // ---- 保存（使えない環境では、書き出しだけで使う） ----
  var judge = {}, storeOk = true;
  try { var raw = localStorage.getItem(STORE); judge = raw ? JSON.parse(raw) : {}; if (!judge || typeof judge !== 'object') judge = {}; } catch (e) { storeOk = false; judge = {}; }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(judge)); storeOk = true; } catch (e) { storeOk = false; } }
  function entry(id) { return judge[id] || (judge[id] = { judge: '', adopt: '', memo: '' }); }

  // ---- 案の状態 ----
  function kind(c) { return c.kind || 'switch'; }
  function implemented(c) {
    if (kind(c) === 'exist') return true;
    if (kind(c) === 'switch' && !(B.lab && B.lab[c.id])) return false;
    return (c.scen || []).some(function (sid) { return sid === 'run' || !!R.findPreset(sid) || sid === 'plaza'; });
  }
  function hasDemo(c) {
    if (c.demoCheck) return true;
    return (c.scen || []).some(function (sid) { var p = R.findPreset(sid); return !!(p && p.demo); });
  }
  function isOn(c) {
    if (kind(c) === 'exist') { var v = getPath(c.toggle.path); return v === c.toggle.on; }
    return !!(B.lab && B.lab[c.id] && B.lab[c.id].on);
  }
  function getPath(p) { return p.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, B); }
  function setPath(p, v) { var parts = p.split('.'), last = parts.pop(); parts.reduce(function (o, k) { return o[k]; }, B)[last] = v; }

  // ---- 要素 ----
  var $ = function (id) { return document.getElementById(id); };
  var panel = $('labPanel'), btn = $('btnLab'), bar = $('labBar');
  var view = { card: null };

  function render() {
    if (panel.hidden) return;
    var head = '<div class="lab-head"><h2>試作ラボ <small>案を遊んで判定する</small></h2><button type="button" class="tune-x" data-act="close" aria-label="閉じる">×</button></div>';
    var common = '<details class="lab-common" open><summary>全部の案に共通の問い</summary><ul>' + COMMON_Q.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></details>';
    var actions = '<div class="lab-actions"><button type="button" data-act="export">判定を書き出す</button><button type="button" data-act="import">読み込む</button>' +
      '<button type="button" data-act="alloff">ラボの案を全部オフ</button></div>' +
      (storeOk ? '' : '<p class="note danger">この環境では判定を保存できません（localStorage が使えない）。「判定を書き出す」でテキストにして残してください。</p>') +
      '<div id="labIO" class="lab-io" hidden></div>';
    panel.innerHTML = head + common + actions + (view.card ? cardHtml(card(view.card)) : listHtml());
  }

  function badges(c) {
    var b = '';
    if (c.star) b += '<span class="lb star">' + c.star + '</span>';
    if (c.existing || kind(c) === 'exist') b += '<span class="lb exist">既存' + (c.existing === 'part' ? '（一部）' : '') + '</span>';
    if (hasDemo(c)) b += '<span class="lb demo">デモあり</span>';
    if (c.deviates) b += '<span class="lb dev" title="' + esc(c.deviates) + '">CLAUDE.md から外れる</span>';
    if (kind(c) === 'scen') b += '<span class="lb scen">シナリオだけ</span>';
    if (!implemented(c)) b += '<span class="lb todo">未実装</span>';
    if (isOn(c) && kind(c) !== 'exist') b += '<span class="lb on">オン</span>';
    return b;
  }

  function listHtml() {
    return '<div class="lab-list">' + CATS.map(function (cat) {
      var list = CARDS.filter(function (c) { return c.cat === cat.id; });
      if (!list.length) return '';
      var done = list.filter(function (c) { return judge[c.id] && judge[c.id].judge; }).length;
      return '<details class="lab-cat"' + (cat.id === 'C' ? ' open' : '') + '><summary>' + esc(cat.name) + ' <small>判定済み ' + done + ' / 全 ' + list.length + '</small></summary>' +
        list.map(function (c) {
          var j = judge[c.id] && judge[c.id].judge;
          return '<button type="button" class="lab-item' + (j ? ' judged j-' + j : '') + '" data-card="' + c.id + '">' +
            '<span class="lab-mark">' + (j ? JUDGE_MARK[j] : '未') + '</span>' +
            '<span class="lab-name"><small>' + esc(c.id) + '</small> ' + esc(c.name) + '</span><span class="lab-badges">' + badges(c) + '</span></button>';
        }).join('') + '</details>';
    }).join('') + '</div>';
  }

  function scenName(sid) {
    if (sid === 'run') return '周回を始める';
    if (sid === 'plaza') return '広場';
    var p = R.findPreset(sid);
    return p ? p.name : sid + '（まだない）';
  }

  function optsHtml(c) {
    var out = '';
    if (kind(c) === 'switch' && B.lab && B.lab[c.id]) {
      Object.keys(c.opts || {}).forEach(function (k) {
        var o = c.opts[k];
        out += '<label class="lab-opt">' + esc(o.label) + ' <select data-opt="' + k + '">' + Object.keys(o.values).map(function (v) {
          return '<option value="' + esc(v) + '"' + (B.lab[c.id][k] === v ? ' selected' : '') + '>' + esc(o.values[v]) + '</option>';
        }).join('') + '</select></label>';
      });
      Object.keys(c.params || {}).forEach(function (k) {
        var v = B.lab[c.id][k];
        if (typeof v === 'boolean') out += '<label class="lab-opt"><input type="checkbox" data-param="' + k + '"' + (v ? ' checked' : '') + '> ' + esc(c.params[k]) + '</label>';
        else if (typeof v === 'number') out += '<label class="lab-opt">' + esc(c.params[k]) + ' <input type="number" step="1" data-param="' + k + '" value="' + v + '"></label>';
      });
    }
    return out ? '<div class="lab-opts"><b>切り替え</b>（変えたら「このシナリオで試す」でやり直す）' + out + '</div>' : '';
  }

  function cardHtml(c) {
    if (!c) return '';
    var e = entry(c.id);
    var scen = (c.scen || []);
    var scenSel = scen.length > 1 ? '<select data-act="scenpick">' + scen.map(function (sid, i) { return '<option value="' + esc(sid) + '"' + (i === (view.scen || 0) ? ' selected' : '') + '>' + esc(scenName(sid)) + '</option>'; }).join('') + '</select>' : '';
    var curScen = scen[view.scen || 0];
    var p = curScen && R.findPreset(curScen);
    var canCompare = kind(c) !== 'scen' && implemented(c);
    var comparing = app.labCompare === c.id || (kind(c) === 'exist' && view.existOff === c.id);
    return '<div class="lab-card">' +
      '<button type="button" class="lab-back" data-act="back">← 一覧へ</button>' +
      '<h3><small>' + esc(c.id) + '（' + esc(catName(c.cat)) + '）</small><br>' + esc(c.name) + '</h3>' +
      '<div class="lab-badges">' + badges(c) + '</div>' +
      (c.needs && c.needs.length ? '<p class="note">一緒にオンになる案: ' + esc(c.needs.map(function (n) { var x = card(n); return n + (x ? ' ' + x.name : ''); }).join('・')) + '</p>' : '') +
      '<p class="lab-desc">' + esc(c.desc) + '</p>' +
      '<div class="lab-howto"><b>試し方</b><p>' + esc(c.howto) + '</p></div>' +
      (c.deviates ? '<p class="note dev">CLAUDE.md から外れる: ' + esc(c.deviates) + '</p>' : '') +
      (c.note ? '<p class="note">作ってみて: ' + esc(c.note) + '</p>' : '') +
      shapesHtml(c) +
      '<div class="lab-q"><b>判定の問い</b><ul>' + (c.q || []).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></div>' +
      optsHtml(c) +
      '<div class="lab-buttons">' + scenSel +
      '<button type="button" class="primary" data-act="try"' + (implemented(c) ? '' : ' disabled') + '>このシナリオで試す</button>' +
      '<button type="button" data-act="compare"' + (canCompare ? '' : ' disabled title="シナリオだけの案は、くらべるオフがない"') + '>' + (comparing ? 'オンに戻す' : 'オフでくらべる') + '</button>' +
      '<button type="button" class="check" data-act="demo"' + (hasDemo(c) ? '' : ' disabled title="デモはない（カードの試し方を見てください）"') + '>デモを見る</button></div>' +
      (p && p.demo && p.demo.desc ? '<p class="note">デモ: ' + esc(p.demo.desc) + '</p>' : (!hasDemo(c) && implemented(c) ? '<p class="note">デモ: なし（探索でも手で組んでも、この案の良い瞬間を短く見せる手順を作れなかった。試し方から遊んでください）</p>' : '')) +
      '<div class="lab-judge"><b>判定</b>' + JUDGE.map(function (j) {
        return '<label><input type="radio" name="lj" value="' + j[0] + '"' + (e.judge === j[0] ? ' checked' : '') + '> ' + j[1] + '</label>';
      }).join('') + '</div>' +
      '<div class="lab-judge"><b>本実装に</b>' + ADOPT.map(function (j) {
        return '<label><input type="radio" name="la" value="' + j[0] + '"' + (e.adopt === j[0] ? ' checked' : '') + '> ' + j[1] + '</label>';
      }).join('') + '</div>' +
      '<label class="lab-memo">メモ<textarea data-act="memo" rows="3" placeholder="気づいたこと・直したいこと">' + esc(e.memo) + '</textarea></label>' +
      '<p class="lab-origin">元: ' + esc(c.origin) + '</p></div>';
  }

  // ---- 上のバー: 今どちらで遊んでいるかを大きく出す ----
  var barSig = '';
  // G2・G3 のカード: 強化前と後の形を小さな図で（青が術者、橙が形のマス。正面は上）
  function shapeGrid(cells) {
    var pts = cells.concat([[0, 0]]);
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y1 = Math.max.apply(null, ys);
    var h = '<span class="g" style="grid-template-columns:repeat(' + (x1 - x0 + 1) + ',11px)">';
    for (var y = y1; y >= 0; y--) for (var x = x0; x <= x1; x++) {
      var isC = cells.some(function (p) { return p[0] === x && p[1] === y; });
      h += '<i class="' + (x === 0 && y === 0 ? 'me' : isC ? 'c' : '') + '"></i>';
    }
    return h + '</span>';
  }
  function baseCells(m) {
    if (B.shapes[m]) return B.shapes[m];
    var n = m === 'water' ? B.waterLength : B.breezeLength, out = [];
    for (var i = 1; i <= n; i++) out.push([0, i]);
    return out;
  }
  function shapesHtml(c) {
    if (!R.LX || (c.id !== 'G2' && c.id !== 'G3')) return '';
    var items = [];
    if (c.id === 'G3') Object.keys(R.LX.FORMS).forEach(function (m) {
      var f = R.LX.FORMS[m], cellsOf = function (x) {
        if (x.cells) return x.cells;
        var base = baseCells(m);
        if (x.lanes) { var out = []; x.lanes.forEach(function (sd) { base.forEach(function (p) { out.push([sd, p[1]]); }); }); return out; }
        var n = base.length + (x.len || 0), o = []; for (var i = 1; i <= n; i++) o.push([0, i]); return o;
      };
      items.push('<span class="lab-shape">' + esc(R.magicName(m)) + '（今）' + shapeGrid(baseCells(m)) + '</span>');
      ['A', 'B'].forEach(function (k) { items.push('<span class="lab-shape" title="' + esc(f[k].note) + '">' + k + ' ' + esc(f[k].name) + shapeGrid(cellsOf(f[k])) + '</span>'); });
    });
    if (c.id === 'G2') Object.keys(R.LX.GROW_DIR).forEach(function (m) {
      var g = R.LX.GROW_LIST[R.LX.GROW_DIR[m]];
      [0, 1, 3].forEach(function (n) { items.push('<span class="lab-shape">' + esc(R.magicName(m)) + ' ' + n + '回' + shapeGrid(g.slice(0, 1 + n)) + '</span>'); });
    });
    return '<div class="lab-shapes">' + items.join('') + '</div>';
  }

  function renderBar() {
    var onList = Object.keys(B.lab || {}).filter(function (k) { return B.lab[k].on; });
    var cmp = app.labCompare ? card(app.labCompare) : null;
    var html = '';
    if (onList.length || cmp) {
      html = '<span class="lab-bar-title">ラボ:</span>' +
        onList.map(function (k) { var c = card(k); return '<span class="lab-bar-on">' + esc(c ? c.name : k) + '　オン</span>'; }).join('') +
        (cmp ? '<span class="lab-bar-off">' + esc(cmp.name) + '　オフでくらべ中</span>' : '') +
        '<button type="button" data-act="openlab">ラボを開く</button><button type="button" data-act="alloff">全部オフ</button>';
      // 続きのシナリオ（G8 敵の技を覚える など）: 勝ったら次の戦いへ
      var cur = app.scenario && R.findPreset(app.scenario);
      if (cur && cur.labNext && app.state && app.state.result === 'win') html += '<button type="button" class="primary" data-act="next">次の戦いへ: ' + esc(scenName(cur.labNext)) + '</button>';
    }
    if (html === barSig) return;
    barSig = html;
    bar.innerHTML = html;
    bar.hidden = !html;
  }
  app.onRender = renderBar;

  // ラボの切り替えを変えたあと: 調整パネルにも映し、盤面の計算をやり直す
  function changed() {
    if (app.tuneSync) app.tuneSync();
    app.clearCache();
    app.render();
    render();
  }
  app.onLabChange = function () { if (app.tuneSync) app.tuneSync(); render(); };

  // ---- 試す・くらべる・デモ ----
  function tryCard(c, labOff) {
    var sid = (c.scen || [])[view.scen || 0];
    if (!sid) return;
    if (sid === 'run') { if (window.LabRun) window.LabRun.start(c.id); else app.say('周回はまだ作っていません'); return; }
    var p = R.findPreset(sid);
    if (kind(c) === 'exist') {
      // 既存の切り替え: 値を入れて（オフでくらべるなら off の値）、そのシナリオを最初から
      Object.keys(c.needsSet || {}).forEach(function (k) { setPath(k, c.needsSet[k]); });
      setPath(c.toggle.path, labOff ? c.toggle.off : c.toggle.on);
      view.existOff = labOff ? c.id : null;
      app.loadScenario(sid === 'plaza' ? 'plaza' : sid);
      changed();
      app.addLog('ラボ（既存）: ' + c.name + ' を' + (labOff ? 'オフ' : 'オン') + 'にして「' + scenName(sid) + '」を最初から');
      return;
    }
    if (p && p.lab) app.loadScenario(sid, { labOff: labOff ? c.id : null });
    else {
      // 既存のシナリオで試す案（J など）: この案（と needs）だけオンにして読み込む
      R.labApply(labOff ? [] : [c.id]);
      if (labOff) (R.labNeedsAll([c.id]).filter(function (n) { return n !== c.id; })).forEach(function (n) { if (B.lab[n]) B.lab[n].on = true; });
      app.loadScenario(sid);
      app.labCompare = labOff ? c.id : null;
    }
    changed();
  }

  function demoCard(c) {
    if (c.demoCheck) { app.playCheckById(c.demoCheck); return; }
    var sid = (c.scen || []).filter(function (s) { var p = R.findPreset(s); return p && p.demo; })[view.scen || 0] ||
      (c.scen || []).filter(function (s) { var p = R.findPreset(s); return p && p.demo; })[0];
    var p = sid && R.findPreset(sid);
    if (!p) return;
    app.playLabDemo(p);
    changed();
  }

  // ---- 書き出し・読み込み ----
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function exportText() {
    var lines = ['# ラボ判定（' + today() + '）', ''];
    var undone = [];
    CATS.forEach(function (cat) {
      var list = CARDS.filter(function (c) { return c.cat === cat.id; });
      var judged = list.filter(function (c) { var e = judge[c.id]; return e && (e.judge || e.adopt || e.memo); });
      list.forEach(function (c) { var e = judge[c.id]; if (!e || !e.judge) undone.push('- ' + c.name + '（' + cat.name + '）'); });
      if (!judged.length) return;
      lines.push('## ' + cat.name);
      judged.forEach(function (c) {
        var e = judge[c.id];
        lines.push('- ' + c.name + ': ' + (label(JUDGE, e.judge) || '未') + ' ／ 本実装に: ' + (label(ADOPT, e.adopt) || 'まだ'));
        if (e.memo) lines.push('  メモ: ' + String(e.memo).replace(/\s*\n\s*/g, ' / '));
      });
      lines.push('');
    });
    lines.push('## 未判定');
    lines = lines.concat(undone.length ? undone : ['（なし）']);
    return lines.join('\n');
  }
  function importText(text) {
    var n = 0, cur = null;
    String(text || '').split(/\r?\n/).forEach(function (line) {
      if (/^## 未判定/.test(line)) { cur = null; return; }
      var m = /^- (.+?): (面白い|微妙|面白くない|分からない|未) ／ 本実装に: (使う|直して使う|使わない|まだ)\s*$/.exec(line);
      if (m) {
        var c = CARDS.filter(function (x) { return x.name === m[1]; })[0];
        cur = c ? entry(c.id) : null;
        if (cur) { cur.judge = value(JUDGE, m[2]) || ''; cur.adopt = value(ADOPT, m[3]) || ''; cur.memo = ''; n++; }
        return;
      }
      var mm = /^\s+メモ: (.*)$/.exec(line);
      if (mm && cur) cur.memo = mm[1];
    });
    save();
    return n;
  }
  function showIO(kindIO) {
    var io = document.getElementById('labIO');
    io.hidden = false;
    if (kindIO === 'export') {
      var t = exportText();
      io.innerHTML = '<textarea readonly rows="8" spellcheck="false">' + esc(t) + '</textarea><div class="row"><button type="button" data-act="copy">コピー</button><button type="button" data-act="closeio">閉じる</button></div>';
      var ta = io.querySelector('textarea');
      ta.focus(); ta.select();
    } else {
      io.innerHTML = '<textarea rows="6" spellcheck="false" placeholder="書き出したテキストをまるごと貼る"></textarea><div class="row"><button type="button" class="primary" data-act="doimport">読み込む</button><button type="button" data-act="clearall">判定を全部消す</button><button type="button" data-act="closeio">閉じる</button></div>';
    }
  }

  // ---- 入力 ----
  panel.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act], [data-card]');
    if (!t) return;
    var a = t.getAttribute('data-act');
    if (t.getAttribute('data-card')) { view.card = t.getAttribute('data-card'); view.scen = 0; render(); panel.scrollTop = 0; return; }
    var c = view.card ? card(view.card) : null;
    if (a === 'close') setOpen(false);
    else if (a === 'back') { view.card = null; render(); }
    else if (a === 'try' && c) tryCard(c, false);
    else if (a === 'compare' && c) {
      var comparing = app.labCompare === c.id || (kind(c) === 'exist' && view.existOff === c.id);
      tryCard(c, !comparing);
    }
    else if (a === 'demo' && c) demoCard(c);
    else if (a === 'export') showIO('export');
    else if (a === 'import') showIO('import');
    else if (a === 'closeio') { document.getElementById('labIO').hidden = true; }
    else if (a === 'copy') {
      var ta = panel.querySelector('#labIO textarea');
      ta.select();
      var done = function () { app.say('判定をコピーしました。チャットにそのまま貼れます'); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(ta.value).then(done, function () { app.say('Ctrl+C でコピーしてください'); });
      else { try { document.execCommand('copy'); done(); } catch (err) { app.say('Ctrl+C でコピーしてください'); } }
    }
    else if (a === 'doimport') {
      var n = importText(panel.querySelector('#labIO textarea').value);
      app.say(n + '件の判定を読み込みました');
      render();
    }
    else if (a === 'clearall') {
      if (!window.confirm('判定とメモを全部消します。よいですか？（書き出したテキストがあれば読み込みで戻せます）')) return;
      judge = {}; save(); render();
    }
    else if (a === 'alloff') { R.labApply([]); app.labCompare = null; changed(); app.addLog('ラボの案を全部オフにした（盤面はそのまま。やり直すと反映）'); }
  });
  panel.addEventListener('change', function (e) {
    var c = view.card ? card(view.card) : null;
    if (!c) return;
    var t = e.target;
    if (t.name === 'lj') { entry(c.id).judge = t.value; save(); render(); }
    else if (t.name === 'la') { entry(c.id).adopt = t.value; save(); render(); }
    else if (t.getAttribute('data-opt')) { B.lab[c.id][t.getAttribute('data-opt')] = t.value; changed(); }
    else if (t.getAttribute('data-param')) {
      var k = t.getAttribute('data-param');
      B.lab[c.id][k] = t.type === 'checkbox' ? t.checked : Number(t.value);
      changed();
    }
    else if (t.getAttribute('data-act') === 'scenpick') { view.scen = Math.max(0, (c.scen || []).indexOf(t.value)); render(); }
  });
  panel.addEventListener('input', function (e) {
    var c = view.card ? card(view.card) : null;
    if (c && e.target.getAttribute('data-act') === 'memo') { entry(c.id).memo = e.target.value; save(); }
  });
  // パネルの中のキー入力は、ゲームの操作に回さない
  panel.addEventListener('keydown', function (e) { e.stopPropagation(); });
  bar.addEventListener('click', function (e) {
    var a = e.target.getAttribute && e.target.getAttribute('data-act');
    if (a === 'openlab') setOpen(true);
    if (a === 'next') { var cur = app.scenario && R.findPreset(app.scenario); if (cur && cur.labNext) app.loadScenario(cur.labNext); }
    if (a === 'alloff') { R.labApply([]); app.labCompare = null; changed(); app.addLog('ラボの案を全部オフにした（盤面はそのまま。やり直すと反映）'); }
  });

  function setOpen(on) {
    panel.hidden = !on;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    document.body.classList.toggle('lab-open', on);
    if (on) render();
  }
  btn.addEventListener('click', function () { setOpen(panel.hidden); btn.blur(); });

  window.LabUI = { render: render, open: setOpen, exportText: exportText, importText: importText, judge: function () { return judge; } };
  renderBar();
})();
