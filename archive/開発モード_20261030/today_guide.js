/*
 * today_guide.js — 「今日やること」（オーナーがモックを見てやることを、1つずつ順に進める画面。10/16）
 *   上のバーの「今日やること」（または index.html#today）で開く。1回に1つだけ出す（短い文・大きいボタン）。
 *   1 強化と変化を見る → 2 クエスト制で遊ぶ → 3 決めること → 4 前からの分かれ道 → 5 書き出す
 *   見た印・答え・今どこかは localStorage の cafilia-today。判定（◎△×？とメモ）は判定パネルと同じ所（cafilia-lab-judge）に書く。
 *   ui.js・lab_ui.js・lab_target_ui.js・lab_quest_ui.js のあとに読み込む。
 */
(function () {
  'use strict';
  var R = window.Rules, app = window.CafiliaApp;
  if (!R || !app) return;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var SEC = { 1: '強化と変化を見る', 2: 'クエスト制で遊ぶ', 3: '決めること', 4: '前からの分かれ道', 5: '書き出す' };
  // kind: step 盤面を見る ／judge カードを判定 ／dec 選んで決める ／out 書き出す
  //   more は「くわしく」を開いたときだけ出す
  var ITEMS = [
    { sec: 1, kind: 'step', key: 'n0', title: '分かれ道', line: '火は炎に、風は砂嵐に分かれる', scen: 'labNv', growth: true },
    { sec: 1, kind: 'judge', card: 'NV', name: '分かれ道', q: '選ぶ前に、2つの違いが見えた？' },
    { sec: 1, kind: 'step', key: 'n1', title: '変化した魔法 ①', line: '旋風で、敵の向きを変える', scen: 'labNa' },
    { sec: 1, kind: 'step', key: 'n2', title: '変化した魔法 ②', line: '置いた岩を、湖で転がす', scen: 'labNb' },
    { sec: 1, kind: 'judge', card: 'NA', name: '変化した魔法', q: '変化したとき、手応えがあった？' },
    { sec: 1, kind: 'step', key: 'n3', title: '覚醒 ①', line: '大樹に水で森が広がる／業火に水で爆発', scen: 'labNw1' },
    { sec: 1, kind: 'step', key: 'n4', title: '覚醒 ②', line: '岩山に風で岩なだれ／氷に風で吹雪', scen: 'labNw2' },
    { sec: 1, kind: 'step', key: 'n5', title: '覚醒 ③', line: '竜巻に水で雨', scen: 'labNw3' },
    { sec: 1, kind: 'judge', card: 'NW', name: '覚醒', q: '強いのに、決め手には仲間が要るままだった？' },
    { sec: 1, kind: 'step', key: 'n6', title: '融合 ①', line: '1人で 火の渦・源流・桜', scen: 'labNf1' },
    { sec: 1, kind: 'step', key: 'n7', title: '融合 ②', line: '泥で足止め・砂嵐に火', scen: 'labNf2' },
    { sec: 1, kind: 'judge', card: 'NF', name: '融合', q: '仲間と組むより、控えめに収まった？' },
    { sec: 1, kind: 'step', key: 'n8', title: '間の強化 ①', line: '水の1発で、敵がほぼ止まる', scen: 'labNi' },
    { sec: 1, kind: 'step', key: 'n9', title: '間の強化 ②', line: '草が森の上で7マス', scen: 'labNi2' },
    { sec: 1, kind: 'judge', card: 'NI', name: '間の強化', q: 'その属性らしい育ち方だった？' },
    { sec: 1, kind: 'step', key: 'n10', title: '育ち先の一覧', line: '5つの属性が、何になれるか', scen: 'labNv', mode: 'paths' },
    { sec: 1, kind: 'judge', card: 'N0', name: '強化と変化 ぜんたい', q: '強化と変化、ぜんたいとしてどう？' },

    { sec: 2, kind: 'step', key: 'q0', title: '拠点を開く', line: 'ボードを見て、受けたいクエストを選ぶ', mode: 'quest',
      more: '前に遊んだ進みが残っていたら、拠点のいちばん下の「最初から」で始める。' },
    { sec: 2, kind: 'step', key: 'q1', title: '1件受けて、勝つ', line: '連れていく3人を選んで戦う', mode: 'quest',
      more: '勝つと育ちの画面 →「道に進めて拠点に戻る」。寄り道「谷の魔物を誘い出せ」に勝つと、土が仲間になる。' },
    { sec: 2, kind: 'step', key: 'q2', title: '裏クエストを受ける', line: 'ボードが変わるのを見る', mode: 'quest',
      more: '「守るはずの村」を受けると治安が荒れて、「畑の森を育てて」が消える。' },
    { sec: 2, kind: 'step', key: 'q3', title: '第2章を開く', line: 'キー2つをクリアする', mode: 'quest',
      more: 'キーは仮に「森の魔物を焼け」「村を守れ」。' },
    { sec: 2, kind: 'judge', card: 'NQ', name: 'クエスト制', q: '誰を育てるかで、クエストを選んだ？' },
    { sec: 2, kind: 'judge', card: 'L7', name: '裏クエスト', q: '裏クエストを受けるか、迷った？' },

    { sec: 3, kind: 'dec', id: 'keyq', title: '第1章のキークエストは？', multi: true,
      opts: [['burn', '燃え広がり'], ['guard', '守る'], ['lure', '動かす'], ['field', '森を育てる']],
      more: '全部クリアで第2章が開くクエスト。いまは仮に「燃え広がり」「守る」。' },
    { sec: 3, kind: 'dec', id: 'awmain', title: '覚醒方面を主にするには？',
      opts: [['mission', 'ミッションを直す'], ['taker', '取る魔法を直す'], ['quest', 'クエストで寄せる'], ['keep', '今のまま']],
      more: '今は、草以外はほとんど融合方面の印になる（広げるのミッションはだれでも取れる・倒すのミッションは決め手を起こす風が取る・変化前の水は止めるを取れない）。' },
    { sec: 3, kind: 'dec', id: 'bigtaker', title: '覚醒の大技で倒したら、だれが取る？', tryIt: 'labNw1',
      opts: [['last', '最後の一手（今）'], ['owner', '覚醒した本人'], ['both', '両方']],
      more: '業火に水なら、いまは水が取る。覚醒した火には入らない。' },
    { sec: 3, kind: 'dec', id: 'n2', title: '合わないミッションは？', tryIt: 'labNv_N2',
      opts: [['all', '全部 融合方面（今）'], ['partner', '融合の相手だけ'], ['step', '方面に数えない']],
      more: 'N2。「相手だけ」にすると、ほとんどの達成が印にならない。' },
    { sec: 3, kind: 'dec', id: 'n3', title: '土のやりたいことは？', tryIt: 'labN2_N3',
      opts: [['defeat', '倒す（今）'], ['stop', '止める']],
      more: 'N3。倒すだと、土は倒すのミッションをほとんど取れない。' },
    { sec: 3, kind: 'dec', id: 'n4', title: '1人で出す融合の大きさは？', tryIt: 'labNf1_N4',
      opts: [['weak', '控えめ（今）'], ['same', '仲間と同じ']], more: 'N4。' },
    { sec: 3, kind: 'dec', id: 'n5', title: '変化したら、間の強化は？', tryIt: 'labNv_N5',
      opts: [['keep', '残す（今）'], ['reset', '0から']], more: 'N5。' },
    { sec: 3, kind: 'dec', id: 'n1', title: '変化・覚醒までの印の数は？', tryIt: 'labNv_N1',
      opts: [['keep', '2・3のまま'], ['change', '変える']],
      more: 'N1。変えるなら、数をメモに。クエスト制では、火が1戦目で炎に変化した。' },
    { sec: 3, kind: 'dec', id: 'spread2', title: '広げるの2つ目「もう1ターン残る」は？', tryIt: 'labNi2',
      opts: [['swap', '中身を替える'], ['keep', 'このまま']], more: '草の自然はもともと残るので、効く場面がない。' },
    { sec: 3, kind: 'dec', id: 'earth3', title: '土の倒す3つ目「効き目が1段」は？',
      opts: [['swap', '中身を替える'], ['stop', '土を止めるに'], ['keep', 'このまま']], more: '土は当たった者への効き目を持たないので、ほとんど効かない。' },
    { sec: 3, kind: 'dec', id: 'steam3', title: '業火に水は「3段のシナジー」？', tryIt: 'labNw1',
      opts: [['yes', '数える（今）'], ['no', '数えない']] },
    { sec: 3, kind: 'dec', id: 'rockfall', title: '岩なだれ（岩山に風）は？', tryIt: 'labNw2',
      opts: [['keep', '残す'], ['swap', '替える'], ['drop', 'やめる']], more: '8章「やらないこと」の「落石」に近い。' },
    { sec: 3, kind: 'dec', id: 'sand', title: '砂嵐は、どちらの融合？', tryIt: 'labNf2',
      opts: [['wind', '風（今）'], ['earth', '土']], more: '6章の割り振りで見ると、風に土でできる砂嵐は土の融合になる。' },
    { sec: 3, kind: 'dec', id: 'forms', title: '変化した魔法の形は？', tryIt: 'labNa',
      opts: [['keep', 'このまま'], ['fix', '直す']], more: '炎＝前と左右の3マス、湖・旋風・竜巻＝前の2×2、岩＝前1マス、源流＝前へ一直線。直すなら、どれをメモに。' },
    { sec: 3, kind: 'dec', id: 'roster', title: '最初の仲間は？',
      opts: [['keep', '草火水風（今）'], ['earth', '土も最初から']], more: '今は、土は寄り道の報酬。「村を守れ」と第2章は、おすすめに土が入っている。' },
    { sec: 3, kind: 'dec', id: 'darkwhen', title: '裏クエストで治安が変わるのは？',
      opts: [['accept', '受けたとき（今）'], ['clear', 'クリアしたとき']] },

    { sec: 4, kind: 'dec', id: 'f1', title: '敵の手を、先に見せる？',
      opts: [['all', '全部見せる（今）'], ['aim', '狙いだけ'], ['none', '見せない']], more: '10/13 の分かれ道1。' },
    { sec: 4, kind: 'dec', id: 'f2', title: 'ターンの形は？',
      opts: [['single', '1人ずつ'], ['simul', '一斉に発動'], ['other', 'ほか']], more: '分かれ道2。上のバーの「ターンの形」で切り替えられる。' },
    { sec: 4, kind: 'dec', id: 'f3', title: '決め手を起こした本人は傷つく？',
      opts: [['own', '自分の属性では無傷'], ['move', '動かされるだけ'], ['hurt', '傷つく']], more: '分かれ道3。業火に水・砂嵐に火などで、本人が巻き込まれている。' },
    { sec: 4, kind: 'dec', id: 'f4', title: '時間の進み方は？', multi: true,
      opts: [['fast', '一気に進む'], ['less', '消えにくく'], ['grow', '自分で育てる']], more: '分かれ道4。' },
    { sec: 4, kind: 'dec', id: 'f5', title: '新しいものを、どんどん出す？',
      opts: [['new', 'どんどん出す'], ['known', '知ってる舞台を活かす']], more: '分かれ道5。' },
    { sec: 4, kind: 'dec', id: 'f6', title: '移動は？',
      opts: [['one', '移動1'], ['place', '移動2で地形'], ['both', '両方']], more: '分かれ道6。' },

    { sec: 5, kind: 'out', title: '書き出して、Claude に貼る' }
  ];

  // ---- 進み（このブラウザの中） ----
  var KEY = 'cafilia-today', st = { seen: {}, ans: {}, pos: 0 };
  try { var raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw && typeof raw === 'object') st = { seen: raw.seen || {}, ans: raw.ans || {}, pos: raw.pos || 0 }; } catch (e) { /* 残せないときも、この画面の間は効く */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* なし */ } }
  function ans(id) { return st.ans[id] || (st.ans[id] = { v: [], memo: '' }); }

  var JUDGE = [['good', '◎'], ['meh', '△'], ['bad', '×'], ['unknown', '？']];
  var JUDGE_NAME = { good: '◎ 面白い', meh: '△ 微妙', bad: '× 面白くない', unknown: '？ 分からない' };
  function labCard(id) { return ((R.LAB && R.LAB.CARDS) || []).filter(function (c) { return c.id === id; })[0] || null; }
  function judgeOf(id) { var j = window.LabUI ? window.LabUI.judge()[id] : null; return j || { judge: '', memo: '' }; }
  function done(it) {
    if (it.kind === 'step') return !!st.seen[it.key];
    if (it.kind === 'judge') return !!judgeOf(it.card).judge;
    if (it.kind === 'dec') { var a = st.ans[it.id]; return !!(a && (a.v.length || a.memo)); }
    return false;
  }

  // ---- 画面 ----
  var btnLab = document.getElementById('btnLab');
  var openBtn = document.createElement('button');
  openBtn.type = 'button'; openBtn.className = 'td-open'; openBtn.textContent = '今日やること';
  if (btnLab) btnLab.insertAdjacentElement('afterend', openBtn);
  var box = document.createElement('div');
  box.id = 'todayGuide'; box.className = 'lab-run td-wrap'; box.hidden = true;
  document.body.appendChild(box);
  var bar = document.createElement('div');
  bar.id = 'todayBar'; bar.className = 'ng-bar td-bar'; bar.hidden = true;
  document.body.appendChild(bar);
  var listOpen = false;

  function optsHtml(it, chosen, act) {
    return '<div class="td1-opts">' + it.opts.map(function (o) {
      return '<button type="button" class="td1-opt' + (chosen.indexOf(o[0]) >= 0 ? ' on' : '') + '" data-td="' + act + '" data-v="' + o[0] + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function bodyHtml(it) {
    if (it.kind === 'step') {
      var main = it.mode === 'quest' ? '拠点を開く' : it.mode === 'paths' ? '一覧を見る' : 'デモを見る ▶';
      return '<p class="td1-line">' + esc(it.line) + '</p>' +
        '<div class="td1-act"><button type="button" class="primary td1-big" data-td="go">' + main + '</button>' +
        (it.mode ? '' : '<button type="button" data-td="go" data-mode="play">自分で遊ぶ</button>') + '</div>';
    }
    if (it.kind === 'judge') {
      var j = judgeOf(it.card), c = labCard(it.card);
      return '<p class="td1-line">' + esc(it.q) + '</p>' +
        optsHtml({ opts: JUDGE }, [j.judge], 'judge') +
        '<input class="td1-memo" type="text" data-td="jmemo" value="' + esc(j.memo || '') + '" placeholder="ひとこと（なくてよい）">' +
        (c ? '<details class="td1-more"><summary>くわしく</summary><p>カード: ' + esc(c.name) + '</p><ul>' + (c.q || []).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></details>' : '');
    }
    if (it.kind === 'dec') {
      var a = st.ans[it.id] || { v: [], memo: '' };
      return (it.multi ? '<p class="td1-line">いくつでも</p>' : '') +
        optsHtml({ opts: it.opts.concat([['later', 'まだ']]) }, a.v, 'pick') +
        '<input class="td1-memo" type="text" data-td="memo" value="' + esc(a.memo) + '" placeholder="ひとこと（なくてよい）">' +
        (it.tryIt && R.findPreset(it.tryIt) ? '<div class="td1-act"><button type="button" data-td="try">盤面で試す</button></div>' : '') +
        (it.more ? '<details class="td1-more"><summary>くわしく</summary><p>' + esc(it.more) + '</p></details>' : '');
    }
    return '<p class="td1-line">ボタンを押して、コピーして、チャットに貼る。</p>' +
      '<div class="td1-act"><button type="button" class="primary td1-big" data-td="export">書き出す</button></div><div id="tdOut" class="td-out" hidden></div>';
  }
  function listHtml() {
    var h = '', sec = 0;
    ITEMS.forEach(function (it, i) {
      if (it.sec !== sec) { sec = it.sec; h += '<li class="td1-lsec">' + sec + ' ' + esc(SEC[sec]) + '</li>'; }
      var name = it.kind === 'judge' ? '判定: ' + it.name : it.title;
      h += '<li><button type="button" class="td1-li' + (i === st.pos ? ' now' : '') + (done(it) ? ' done' : '') + '" data-td="jump" data-i="' + i + '">' + (done(it) ? '✓ ' : '') + esc(name) + '</button></li>';
    });
    return '<ol class="td1-list">' + h + '</ol>';
  }
  function render() {
    var it = ITEMS[st.pos], n = ITEMS.filter(done).length;
    var title = it.kind === 'judge' ? '判定: ' + it.name : it.title;
    box.innerHTML = '<div class="lab-run-card td1-card">' +
      '<div class="td1-head"><span class="td1-sec">' + it.sec + ' ' + esc(SEC[it.sec]) + '</span><span class="td1-count">' + (st.pos + 1) + ' / ' + ITEMS.length + '</span>' +
      '<button type="button" class="td1-x" data-td="close" aria-label="閉じる">×</button></div>' +
      '<div class="td1-prog"><i style="width:' + Math.round(100 * n / ITEMS.length) + '%"></i></div>' +
      '<h2 class="td1-title">' + (done(it) ? '<span class="td1-ok">✓</span>' : '') + esc(title) + '</h2>' + bodyHtml(it) +
      '<div class="td1-nav"><button type="button" data-td="prev"' + (st.pos ? '' : ' disabled') + '>◀ 前へ</button>' +
      '<button type="button" data-td="list">' + (listOpen ? '一覧を閉じる' : '一覧') + '</button>' +
      (st.pos + 1 < ITEMS.length ? '<button type="button" class="primary" data-td="next">次へ ▶</button>' : '') + '</div>' +
      (listOpen ? listHtml() : '') + '</div>';
    box.hidden = false;
    hideBar();
  }
  function open() { hideHowto(); render(); }
  function close() { box.hidden = true; }
  function hideHowto() { var h = document.getElementById('howto'); if (h) h.hidden = true; }
  function hideBar() { bar.hidden = true; document.body.classList.remove('ng-bar-on'); }
  // 盤面を見ているあいだの下のバー（戻ると、同じ所の画面に）
  function showBar() {
    var it = ITEMS[st.pos];
    bar.innerHTML = '<b>' + esc(it.title) + '</b>' +
      (it.growth ? '<button type="button" data-td="growth">育ちの画面</button>' : '') +
      (it.mode === 'quest' ? '<button type="button" data-td="quest">拠点</button>' : it.kind === 'step' && !it.mode ? '<button type="button" data-td="again">もう一度</button>' : '') +
      '<button type="button" class="primary" data-td="back">今日やることに戻る</button>';
    bar.hidden = false;
    document.body.classList.add('ng-bar-on');
  }
  function go(mode) {
    var it = ITEMS[st.pos];
    if (it.kind === 'step') { st.seen[it.key] = true; save(); }
    box.hidden = true;
    hideHowto();
    var gb = document.getElementById('labGrowth'); if (gb) gb.hidden = true;
    var m = mode || it.mode || 'demo';
    if (m === 'quest') { if (window.LabQuest) window.LabQuest.open(); showBar(); return; }
    var p = R.findPreset(it.tryIt && it.kind === 'dec' ? it.tryIt : it.scen);
    if (!p) return;
    if (m === 'demo' && p.demo) app.playLabDemo(p); else app.loadScenario(p.id);
    if (m === 'paths' && window.LabTargetUI) setTimeout(function () { window.LabTargetUI.openPaths(); }, 50);
    showBar();
  }
  // 確認用: 勝ったことにして育ちの画面を出す（N 確認ガイドと同じ）
  function growth() {
    var s = app.state;
    if (app.demo) { app.addLog('【今日やること】デモが終わってから押してください'); return; }
    if (!s.result) { s.result = 'win'; s.resultText = '（確認用）勝ったことにした — 育ちの画面を見るため'; app.clearCache(); app.render(); }
    if (window.LabTargetUI) window.LabTargetUI.openGrowth(true);
  }
  function move(i) { st.pos = Math.max(0, Math.min(ITEMS.length - 1, i)); save(); render(); }

  // ---- 書き出し ----
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function exportText() {
    var L = ['# 今日やること（' + today() + '）'], sec = 0;
    ITEMS.forEach(function (it) {
      if (it.kind === 'out') return;
      if (it.sec !== sec) { sec = it.sec; L.push('', '## ' + sec + ' ' + SEC[sec]); }
      if (it.kind === 'step') { L.push('- ' + (st.seen[it.key] ? '見た' : '見ていない') + ': ' + it.title); return; }
      if (it.kind === 'judge') {
        var c = labCard(it.card), j = judgeOf(it.card);
        L.push('- 判定 ' + it.card + ' ' + (c ? c.name : '') + ': ' + (JUDGE_NAME[j.judge] || '未'));
        if (j.memo) L.push('  メモ: ' + String(j.memo).replace(/\s*\n\s*/g, ' / '));
        return;
      }
      var a = st.ans[it.id], opts = it.opts.concat([['later', 'まだ']]);
      var v = a && a.v.length ? a.v.map(function (k) { var o = opts.filter(function (x) { return x[0] === k; })[0]; return o ? o[1] : k; }).join('・') : '（未回答）';
      L.push('- ' + it.title + ' → ' + v);
      if (a && a.memo) L.push('  メモ: ' + String(a.memo).replace(/\s*\n\s*/g, ' / '));
    });
    return L.join('\n');
  }
  function showOut() {
    var out = document.getElementById('tdOut');
    if (!out) return;
    out.innerHTML = '<textarea readonly rows="8" spellcheck="false">' + esc(exportText()) + '</textarea><div class="td1-act"><button type="button" class="primary" data-td="copy">コピー</button><span class="td-copied" hidden>コピーした</span></div>';
    out.hidden = false;
    out.querySelector('textarea').select();
  }

  function onClick(e) {
    var b = e.target.closest('[data-td]');
    if (!b) { if (e.target === box) close(); return; }
    var a = b.getAttribute('data-td'), it = ITEMS[st.pos];
    if (a === 'memo' || a === 'jmemo') return;   // input で受ける
    if (a === 'go') go(b.getAttribute('data-mode'));
    else if (a === 'try') go('play');
    else if (a === 'back') render();
    else if (a === 'again') go('demo');
    else if (a === 'quest') { if (window.LabQuest) window.LabQuest.open(); }
    else if (a === 'growth') growth();
    else if (a === 'next') move(st.pos + 1);
    else if (a === 'prev') move(st.pos - 1);
    else if (a === 'jump') { listOpen = false; move(Number(b.getAttribute('data-i'))); }
    else if (a === 'list') { listOpen = !listOpen; render(); }
    else if (a === 'close') close();
    else if (a === 'export') showOut();
    else if (a === 'copy') { var ta = box.querySelector('#tdOut textarea'); if (ta) { ta.select(); try { document.execCommand('copy'); var m = box.querySelector('.td-copied'); if (m) m.hidden = false; } catch (err) { /* 手でコピー */ } } }
    else if (a === 'judge') { var v = b.getAttribute('data-v'); if (window.LabUI) window.LabUI.setJudge(it.card, { judge: judgeOf(it.card).judge === v ? '' : v }); render(); }
    else if (a === 'pick') {
      var x = ans(it.id), k = b.getAttribute('data-v'), i = x.v.indexOf(k);
      if (it.multi && k !== 'later') { x.v = x.v.filter(function (y) { return y !== 'later'; }); if (i >= 0) x.v.splice(i, 1); else x.v.push(k); }
      else x.v = i >= 0 ? [] : [k];
      save(); render();
    }
  }
  function onInput(e) {
    var t = e.target, a = t.getAttribute && t.getAttribute('data-td'), it = ITEMS[st.pos];
    if (a === 'memo') { ans(it.id).memo = t.value; save(); }
    else if (a === 'jmemo' && window.LabUI) window.LabUI.setJudge(it.card, { memo: t.value });   // 判定パネルのメモへ（この画面は描き直さない）
  }
  box.addEventListener('click', onClick);
  bar.addEventListener('click', onClick);
  box.addEventListener('input', onInput);
  openBtn.addEventListener('click', open);

  if (/^#today$/i.test(location.hash)) setTimeout(open, 300);

  window.TodayGuide = { open: open, exportText: exportText, ITEMS: ITEMS };
})();
