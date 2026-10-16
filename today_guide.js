/*
 * today_guide.js — 「今日やること」（オーナーがモックを見てやることを、上から順に進める画面。10/16）
 *   上のバーの「今日やること」（または index.html#today）で開く。
 *   1. 強化と変化をデモで見る → 2. クエスト制で遊ぶ → 3. 決めること → 4. 前からの分かれ道 → 5. 書き出して Claude に渡す
 *   見た印・決めたことは localStorage の cafilia-today。判定（◎△×？とメモ）は判定パネルと同じ所（cafilia-lab-judge）に書く。
 *   1 のデモの中身は lab_n_guide.js の STEPS をそのまま使う。ui.js・lab_ui.js・lab_target_ui.js・lab_n_guide.js・lab_quest_ui.js のあとに読み込む。
 */
(function () {
  'use strict';
  var R = window.Rules, app = window.CafiliaApp;
  if (!R || !app) return;
  function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---- 1. 強化と変化（N 確認ガイドの 1〜11 番目）。その組の最後の盤面のあとで、カードを判定する ----
  var NG = window.LabNGuide ? window.LabNGuide.STEPS.slice(0, 11) : [];
  var N_CARD = ['NV', null, 'NA', null, null, 'NW', null, 'NF', null, 'NI', 'N0'];

  // ---- 2. クエスト制 ----
  var QSTEPS = [
    { title: '拠点を開いて、ボードを読む',
      look: ['前に遊んだ進みが残っていたら、拠点のいちばん下の「最初から」で1周目から始める', 'クエストの札: 戦い・ミッションの印（倒広動止）・育ちやすい方向・報酬・おすすめの魔法・仲間ごとの行き先（覚醒方面／融合方面）',
        '第1章は「キー」2つ・「寄り道」2つ・「裏」1つ。順番は決まっていない'],
      q: ['受ける前に見える情報で、どれを受けるか選べたか'] },
    { title: '1件受けて、仲間を選んで、勝って、拠点に戻る',
      look: ['「受ける」→ 連れていく3人を選ぶ（おすすめの魔法は盤面のその場所に立つ）', '勝つと育ちの画面。「道に進めて拠点に戻る」でボードへ。クリアしたクエストは消える',
        '寄り道「谷の魔物を誘い出せ」に勝つと、土が仲間に加わる'],
      q: ['クエストを選ぶ理由が「誰をどの方向に育てたいか」になったか', '連れていく仲間を選ぶことで、育て方を考えたか'] },
    { title: '裏クエストを受けてみる',
      look: ['「守るはずの村」を受けた時点で、村の治安が「荒れている」になる', '拠点に戻ると、寄り道「畑の森を育てて」が消えている'],
      q: ['受けるかどうかで迷ったか', '受けたあと、ボードが変わったことが伝わったか'] },
    { title: '第1章のキークエストを全部クリアして、第2章を開く',
      look: ['キー2つ（仮: 森の魔物を焼け・村を守れ）をクリアすると、第2章「街道」が開く', '裏クエストを受けていたら、第2章の荷運びが黒衣の男の依頼に入れ替わっている', '第2章のキーも全部クリアすると「1周の終わり」'],
      q: ['キークエストと寄り道の分け方で、寄り道を受けたくなったか', 'クリアしたクエストが消えることで、強化の分け方を考えたか'], cards: ['NQ', 'L7'] }
  ];

  // ---- 3. 決めること（上ほど、次に作るときに要る）。どれも「まだ」でよい ----
  var DECIDE = [
    { id: 'keyq', title: '第1章のキークエスト（クエスト制）', multi: true,
      why: '未決のまま、仮に「燃え広がり」「守る」にしてある。チェックしたものがキークエスト（全部クリアで第2章）。',
      opts: [['burn', '森の魔物を焼け（燃え広がり）'], ['guard', '村を守れ（守る）'], ['lure', '谷の魔物を誘い出せ（動かす）'], ['field', '畑の森を育てて（森を育てる）']] },
    { id: 'awmain', title: '覚醒方面を主にするには',
      why: '計測では、草以外は1ターン目に取れるミッションのほとんどが融合方面の印になる（広げるのミッションはだれでも取れる・倒すのミッションは決め手を起こす風が取る・変化前の水は止めるを取れない）。',
      opts: [['mission', 'ミッションの側を直す（だれでも取れる広げる3つを、印にならない目印にする など）'], ['taker', '取る魔法の決め方を直す（材料を作った魔法も取れる など）'], ['quest', 'クエストのミッション選びで寄せる（クエスト制で足りる）'], ['keep', '今のままでよい（融合方面が多くてよい）']] },
    { id: 'bigtaker', title: '覚醒の大技（業火に水・岩山に風）で倒したとき、ミッションを取るのは',
      why: '今は最後の一手の仲間（水・風）が取り、覚醒した本人には入らない。',
      opts: [['last', '最後の一手の仲間（今）'], ['owner', '覚醒した本人'], ['both', '両方']], tryIt: 'labNw1' },
    { id: 'n2', title: 'N2 合わないミッションを、どこまで融合方面に数えるか',
      why: '全部（今）だと融合方面に流れやすい。「相手と合うものだけ」だと、ほとんどの達成が印にならない。',
      opts: [['all', '全部融合方面（今）'], ['partner', '融合の相手と合うものだけ'], ['step', '方面に数えない（間の強化だけ）']], tryIt: 'labNv_N2' },
    { id: 'n3', title: 'N3 土のやりたいこと',
      why: '倒す（今）だと、土は倒すのミッションをほとんど取れない（計測で0回）。止めるにすると「予告の決め手を潰す」が覚醒方面になる。',
      opts: [['defeat', '倒す（今）'], ['stop', '止める']], tryIt: 'labN2_N3' },
    { id: 'n4', title: 'N4 1人で出す融合の大きさ',
      why: '控えめ（今）: 桜は丘の桜・泥2マス・火の渦1マス・源流3マス・砂嵐2マス。1マスの火の渦でも、森の上の敵なら倒せる。',
      opts: [['weak', '控えめ（今）'], ['same', '仲間と組むのと同じ']], tryIt: 'labNf1_N4' },
    { id: 'n5', title: 'N5 間の強化を、変化した魔法に引き継ぐか',
      why: '',
      opts: [['keep', '引き継ぐ（今）'], ['reset', '変化したら0から']], tryIt: 'labNv_N5' },
    { id: 'n1', title: 'N1 変化・覚醒までの印の数',
      why: '今は変化まで2つ、変化から覚醒まで覚醒方面の印3つ。クエスト制では、倒す寄りのクエスト1つで火が1戦目に「炎」へ変化した。数を変えるならメモに。',
      opts: [['keep', '2・3のまま'], ['change', '変える（メモに数）']], tryIt: 'labNv_N1' },
    { id: 'spread2', title: '広げるの並びの2つ目「もう1ターン残る」',
      why: '広げるを持つのは草だけで、草の自然はもともと残るので、効く場面がない。',
      opts: [['swap', '中身を替える（メモに案）'], ['keep', 'このまま']], tryIt: 'labNi2' },
    { id: 'earth3', title: '土の倒す3つ目「効き目が1段」',
      why: '土の魔法は当たった者への効き目（足止め・火傷・押す）を持たないので、ほとんど効かない（泥のときだけ）。',
      opts: [['swap', '中身を替える（メモに案）'], ['stop', '土を止めるにすれば済む（N3）'], ['keep', 'このまま']] },
    { id: 'steam3', title: '業火に水（水蒸気爆発）を「3段のシナジー」に数えるか',
      why: '名前が3段のシナジーの水蒸気爆発と同じなので、今はミッション「3段のシナジー」も取れる。',
      opts: [['yes', '数える（今）'], ['no', '数えない']], tryIt: 'labNw1' },
    { id: 'rockfall', title: '岩なだれ（岩山に風）',
      why: '風下の斜面を岩が転がり落ちる。CLAUDE.md 8章「やらないこと」の「落石」に近い。',
      opts: [['keep', '残す'], ['swap', '別の組み合わせに替える（メモに案）'], ['drop', 'やめる']], tryIt: 'labNw2' },
    { id: 'sand', title: '砂嵐は、どちらの属性の融合か',
      why: 'まとめでは風の融合。6章の割り振り（後から来た魔法の側の融合）で見ると、風に土でできる砂嵐は土の融合になる（土の融合は泥）。',
      opts: [['wind', '風（今）'], ['earth', '土']], tryIt: 'labNf2' },
    { id: 'forms', title: '変化先の形と作用（仮で決めたもの）',
      why: '炎＝正面と左右の3マス、湖・旋風・竜巻＝正面の2×2、岩＝正面1マス、岩山＝土の形、源流＝撃った所から正面へ一直線。旋風の「向きを変える」は右回りに1つ。覚醒先の自然は元の自然のマスに印（大樹は森として燃える など）。',
      opts: [['keep', 'このまま'], ['fix', '直す（メモにどれを）']], tryIt: 'labNa' },
    { id: 'roster', title: 'クエスト制: 最初の仲間',
      why: '最初は草・火・水・風で、土は寄り道「谷の魔物を誘い出せ」の報酬。キー「村を守れ」と第2章の3つは、おすすめに土が入っている。',
      opts: [['keep', 'このまま'], ['earth', '土も最初からいる'], ['other', '別の形（メモに）']] },
    { id: 'darkwhen', title: 'クエスト制: 裏クエストで治安が変わるのは',
      why: '今は「受けたとき」（負けても、途中でやめても変わる）。',
      opts: [['accept', '受けたとき（今）'], ['clear', 'クリアしたとき']] }
  ];

  // ---- 4. 前から残っている分かれ道（10/13 見て判定まとめ）。決めきれなければ「まだ」 ----
  var FORKS = [
    { id: 'f1', title: '分かれ道1 敵の手を先に見せるか', why: '今は、敵の狙いも動きも先に見せる（予告）。',
      opts: [['all', '今のまま、狙いも動きも見せる'], ['aim', '狙いは見せ、どこへ動くかは見せない'], ['none', '敵は自分の番に最善手で動く（予告なし）']] },
    { id: 'f2', title: '分かれ道2 ターンの形', why: '上のバーの「ターンの形」で切り替えられる（展示用に作った一斉に発動）。',
      opts: [['single', '1人ずつ撃って、すぐ結果が出る'], ['simul', '構えて、ターンの終わりに一斉に発動'], ['other', 'ほかの形（交互に発動 など）']] },
    { id: 'f3', title: '分かれ道3 決め手を起こした本人は傷つくか', why: '本人が巻き込まれる問題は、ラボのあちこち（オバケヤシキ・水蒸気爆発・粉塵爆発・業火に水 …）でくり返し出ている。',
      opts: [['own', '自分の属性の自然・魔法では傷つかない（敵も同じ）'], ['move', '決め手の外にいる者は、動かされるだけ'], ['hurt', '傷つくまま（形が離れて届くことで避ける）']] },
    { id: 'f4', title: '分かれ道4 時間: 何がどれくらいの速さで進むか', why: '「時間をなくしたくない」「1ターンに1マスは遅い」「勝手に消えていくのは違う」（10/13 のコメント）。',
      opts: [['fast', '1回のターン終了で大きく進む'], ['less', '勝手に消えるものを減らす'], ['grow', '時間で育つより、プレイヤーが育てる']], multi: true },
    { id: 'f5', title: '分かれ道5 新しいものをどんどん出すか、知っていることを活かすか', why: '',
      opts: [['new', '新しい自然・決め手をどんどん出す'], ['known', '舞台の数はしぼり、知っている舞台から出口を増やす']] },
    { id: 'f6', title: '分かれ道6 移動: 減らすか、行きたい理由を作るか', why: '7章は 6×6・移動2。',
      opts: [['one', '移動1にして、足りない分は魔法で運ぶ'], ['place', '移動2のまま、地形で「行きたいマス」を作る'], ['both', '両方（先に地形、あとで移動を減らす）']] }
  ];

  // ---- 進み（このブラウザの中） ----
  var KEY = 'cafilia-today', st = { seen: {}, ans: {} };
  try { var raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw && typeof raw === 'object') st = { seen: raw.seen || {}, ans: raw.ans || {} }; } catch (e) { /* 残せないときも、この画面の間は効く */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* なし */ } }
  function ans(id) { return st.ans[id] || (st.ans[id] = { v: [], memo: '' }); }
  function answered(id) { var a = st.ans[id]; return !!(a && (a.v.length || a.memo)); }

  // 盤面で見るステップの並び（下のバーの「次へ」はこの順）
  var FLAT = NG.map(function (s, i) { return { key: 'n' + i, sec: 1, no: i + 1, s: s, card: N_CARD[i] }; })
    .concat(QSTEPS.map(function (s, i) { return { key: 'q' + i, sec: 2, no: i + 1, s: s, quest: true }; }));
  var cur = -1;

  // ---- 判定（判定パネルと同じ所に書く） ----
  var JUDGE = [['good', '◎ 面白い'], ['meh', '△ 微妙'], ['bad', '× 面白くない'], ['unknown', '？ 分からない']];
  function labCard(id) { return ((R.LAB && R.LAB.CARDS) || []).filter(function (c) { return c.id === id; })[0] || null; }
  function judgeOf(id) { var j = window.LabUI ? window.LabUI.judge()[id] : null; return j || { judge: '', memo: '' }; }
  function judgeHtml(id) {
    var c = labCard(id), j = judgeOf(id);
    if (!c) return '';
    return '<div class="td-judge' + (j.judge ? ' done' : '') + '"><div class="td-jhead"><b>判定: ' + esc(c.id + ' ' + c.name) + '</b></div>' +
      '<details class="td-cq"><summary>カードの問い（' + (c.q || []).length + '）</summary><ul>' + (c.q || []).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></details>' +
      '<div class="td-opts">' + JUDGE.map(function (o) { return '<button type="button" class="td-opt' + (j.judge === o[0] ? ' on' : '') + '" data-td="judge" data-card="' + esc(id) + '" data-v="' + o[0] + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>' +
      '<textarea class="td-memo" rows="2" data-td="jmemo" data-card="' + esc(id) + '" placeholder="メモ（気づいたこと・直したいこと）">' + esc(j.memo || '') + '</textarea></div>';
  }

  // ---- 画面 ----
  var btnLab = document.getElementById('btnLab');
  var openBtn = document.createElement('button');
  openBtn.type = 'button'; openBtn.className = 'td-open'; openBtn.textContent = '今日やること';
  openBtn.title = 'オーナーがモックを見てやることを、上から順に（10/16）';
  if (btnLab) btnLab.insertAdjacentElement('afterend', openBtn);
  var box = document.createElement('div');
  box.id = 'todayGuide'; box.className = 'lab-run td-wrap'; box.hidden = true;
  document.body.appendChild(box);
  var bar = document.createElement('div');
  bar.id = 'todayBar'; bar.className = 'ng-bar td-bar'; bar.hidden = true;
  document.body.appendChild(bar);

  function stepHtml(f, i) {
    var s = f.s, p = s.scen ? R.findPreset(s.scen) : null, demo = !!(p && p.demo && !s.play && !s.panels);
    var btns = f.quest ? '<button type="button" class="primary" data-td="go" data-i="' + i + '">拠点を開く</button>'
      : s.panels ? '<button type="button" class="primary" data-td="go" data-i="' + i + '" data-mode="paths">道を見る</button><button type="button" data-td="go" data-i="' + i + '" data-mode="sort">ミッションの仕分け</button>'
      : (demo ? '<button type="button" class="primary" data-td="go" data-i="' + i + '" data-mode="demo">デモを見る ▶</button>' : '') + '<button type="button"' + (demo ? '' : ' class="primary"') + ' data-td="go" data-i="' + i + '" data-mode="play">自分で遊ぶ</button>';
    return '<li class="ng-step' + (st.seen[f.key] ? ' seen' : '') + (i === cur ? ' now' : '') + '">' +
      '<div class="ng-head"><span class="ng-no">' + (st.seen[f.key] ? '✓' : f.sec + '-' + f.no) + '</span><b>' + esc(s.title) + '</b></div>' +
      '<ul class="ng-look">' + s.look.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '<div class="ng-q">問い: ' + s.q.map(esc).join('／') + '</div>' +
      '<div class="ng-btns">' + btns + '<label class="ng-seen"><input type="checkbox" data-td="seen" data-key="' + f.key + '"' + (st.seen[f.key] ? ' checked' : '') + '> 見た</label></div></li>' +
      (f.card ? '<li class="td-jrow">' + judgeHtml(f.card) + '</li>' : '') +
      (s.cards ? s.cards.map(function (c) { return '<li class="td-jrow">' + judgeHtml(c) + '</li>'; }).join('') : '');
  }
  function decideHtml(d, no) {
    var a = st.ans[d.id] || { v: [], memo: '' }, done = answered(d.id);
    var opts = d.opts.concat([['later', 'まだ（あとで）']]);
    return '<li class="td-dec' + (done ? ' done' : '') + '"><div class="ng-head"><span class="ng-no">' + (done ? '✓' : no) + '</span><b>' + esc(d.title) + '</b>' + (d.multi ? '<small>（いくつでも）</small>' : '') + '</div>' +
      (d.why ? '<p class="td-why">' + esc(d.why) + '</p>' : '') +
      '<div class="td-opts">' + opts.map(function (o) { return '<button type="button" class="td-opt' + (a.v.indexOf(o[0]) >= 0 ? ' on' : '') + '" data-td="pick" data-id="' + d.id + '" data-v="' + o[0] + '"' + (d.multi ? ' data-multi="1"' : '') + '>' + esc(o[1]) + '</button>'; }).join('') +
      (d.tryIt && R.findPreset(d.tryIt) ? '<button type="button" class="td-try" data-td="try" data-scen="' + esc(d.tryIt) + '">盤面で試す</button>' : '') + '</div>' +
      '<textarea class="td-memo" rows="1" data-td="memo" data-id="' + d.id + '" placeholder="メモ（理由・案・数）">' + esc(a.memo) + '</textarea></li>';
  }
  function counts() {
    var seen = FLAT.filter(function (f) { return st.seen[f.key]; }).length;
    var cards = ['NV', 'NA', 'NW', 'NF', 'NI', 'N0', 'NQ', 'L7'], judged = cards.filter(function (c) { return judgeOf(c).judge; }).length;
    var dec = DECIDE.filter(function (d) { return answered(d.id); }).length, fk = FORKS.filter(function (d) { return answered(d.id); }).length;
    return { seen: seen, judged: judged, cards: cards.length, dec: dec, fk: fk };
  }
  function open() {
    var n = counts(), h = '<div class="lab-run-card ng-card td-card"><h2>今日やること <small>見た ' + n.seen + '/' + FLAT.length + '・判定 ' + n.judged + '/' + n.cards + '・決めた ' + n.dec + '/' + DECIDE.length + '・分かれ道 ' + n.fk + '/' + FORKS.length + '</small></h2>' +
      '<p class="note">上から順に進める。盤面を開いたら、画面の下のバーの「次へ ▶」で次の盤面へ。判定と答えはこの画面で選ぶ（このブラウザに残る。判定は判定パネルにも入る）。最後に「5. 書き出す」でテキストにして、Claude のチャットに貼る。全部で1時間半くらい。</p>' +
      '<details class="td-skip"><summary>今日は見なくていいもの</summary><ul>' +
      '<li>ラボの A〜K（10/13 にスマホの「見て判定」で85案を判定済み）</li>' +
      '<li>ラボの L・M のカード（N の前の試し。N で置き換えた。気になったことは N の判定のメモに）</li>' +
      '<li>上のバーの「進行モック」（10/14。クエスト制は、今日の 2 で新しい形を見る）</li>' +
      '<li>闇クエストの損（失うもの）の作り（オーナーが作る予定）・難易度（ステージを作ってから）</li></ul></details>' +
      '<h3>1. 強化と変化をデモで見る（約20分）</h3><p class="td-sub">ミッションを取った魔法に印。やりたいこと（火 倒す・草 広げる・水 止める・風 動かす・土 倒す）と合えば覚醒方面、合わなければ融合方面。2つで変化、覚醒方面はさらに3つで覚醒。組の終わりで、判定パネルのカードを判定する。</p>' +
      '<ol class="ng-steps">' + FLAT.map(function (f, i) { return f.sec === 1 ? stepHtml(f, i) : ''; }).join('') + '</ol>' +
      '<h3>2. クエスト制で遊ぶ（約30〜40分）</h3><p class="td-sub">拠点のクエストボードから1件ずつ選んで受ける。勝つと育ちの画面で印が進み、拠点に戻る。</p>' +
      '<ol class="ng-steps">' + FLAT.map(function (f, i) { return f.sec === 2 ? stepHtml(f, i) : ''; }).join('') + '</ol>' +
      '<h3>3. 決めること（約20分）</h3><p class="td-sub">上ほど、次に作るときに要る。迷ったら「まだ（あとで）」。メモだけでもよい。</p>' +
      '<ol class="ng-steps">' + DECIDE.map(function (d, i) { return decideHtml(d, '3-' + (i + 1)); }).join('') + '</ol>' +
      '<h3>4. 前から残っている分かれ道（10/13。時間があれば）</h3><p class="td-sub">くわしくは .claude/見て判定まとめ_20261013.md の「決めないと進めない分かれ道」。どれも CLAUDE.md の約束に触れるので、決めたら Claude が CLAUDE.md の書き換えを提案する。</p>' +
      '<ol class="ng-steps">' + FORKS.map(function (d, i) { return decideHtml(d, '4-' + (i + 1)); }).join('') + '</ol>' +
      '<h3>5. 書き出して Claude に渡す（2分）</h3><p class="td-sub">ボタンを押すと、判定・決めたこと・見たものが1つのテキストになる。コピーして、Claude のチャットに貼る。</p>' +
      '<div class="lab-run-buttons"><button type="button" class="primary" data-td="export">書き出す</button><button type="button" data-td="close">閉じる</button></div>' +
      '<div id="tdOut" class="td-out" hidden></div>' +
      '<div class="lab-run-buttons td-foot"><button type="button" data-td="reset">見た印と答えを全部消す</button></div></div>';
    box.innerHTML = h;
    box.hidden = false;
    hideBar();
  }
  function close() { box.hidden = true; if (cur >= 0) showBar(); }
  function hideBar() { bar.hidden = true; document.body.classList.remove('ng-bar-on'); }
  function showBar() {
    var f = FLAT[cur];
    if (!f) { hideBar(); return; }
    bar.innerHTML = '<b>今日 ' + f.sec + '-' + f.no + '</b><span class="ng-title">' + esc(f.s.title) + '</span>' +
      (f.s.growth ? '<button type="button" data-td="growth" title="確認用に、この戦闘を勝ったことにして育ちの画面を出す">育ちの画面を見る</button>' : '') +
      (f.quest ? '<button type="button" data-td="quest">拠点を開く</button>' : '<button type="button" data-td="again">もう一度</button>') +
      '<button type="button" class="primary" data-td="next">' + (cur + 1 < FLAT.length ? '次へ ▶' : '3. 決めることへ') + '</button>' +
      '<button type="button" data-td="open">一覧</button><button type="button" data-td="hide" aria-label="バーを閉じる">×</button>';
    bar.hidden = false;
    document.body.classList.add('ng-bar-on');
  }
  function hideHowto() { var h = document.getElementById('howto'); if (h) h.hidden = true; }
  function go(i, mode) {
    var f = FLAT[i];
    if (!f) return;
    cur = i;
    st.seen[f.key] = true; save();
    box.hidden = true;
    hideHowto();
    var gb = document.getElementById('labGrowth'); if (gb) gb.hidden = true;
    if (f.quest) { showBar(); if (window.LabQuest) window.LabQuest.open(); return; }
    var s = f.s, p = R.findPreset(s.scen);
    if (!p) { app.addLog('【今日やること】盤面がない: ' + s.scen); return; }
    var m = mode || (s.panels ? 'paths' : p.demo && !s.play ? 'demo' : 'play');
    if (m === 'demo' && p.demo) app.playLabDemo(p); else app.loadScenario(p.id);
    if (s.panels && window.LabTargetUI) setTimeout(function () { if (m === 'sort') window.LabTargetUI.openSortN(); else window.LabTargetUI.openPaths(); }, 50);
    showBar();
  }
  // 確認用: 勝ったことにして育ちの画面を出す（N 確認ガイドと同じ）
  function growth() {
    var s = app.state;
    if (app.demo) { app.addLog('【今日やること】デモが終わってから「育ちの画面を見る」を押してください'); return; }
    if (!s.result) { s.result = 'win'; s.resultText = '（確認用）勝ったことにした — 育ちの画面を見るため'; app.clearCache(); app.render(); }
    if (window.LabTargetUI) window.LabTargetUI.openGrowth(true);
  }

  // ---- 書き出し ----
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function ansText(d) {
    var a = st.ans[d.id], opts = d.opts.concat([['later', 'まだ（あとで）']]);
    if (!a || (!a.v.length && !a.memo)) return '- ' + d.title + ': （未回答）';
    var v = a.v.map(function (k) { var o = opts.filter(function (x) { return x[0] === k; })[0]; return o ? o[1] : k; }).join('・');
    return '- ' + d.title + ': ' + (v || '（選ばず）') + (a.memo ? '\n  メモ: ' + String(a.memo).replace(/\s*\n\s*/g, ' / ') : '');
  }
  function exportText() {
    var L = ['# 今日やること（' + today() + '）', '', '## 判定（判定パネルのカード）'];
    ['NV', 'NA', 'NW', 'NF', 'NI', 'N0', 'NQ', 'L7'].forEach(function (id) {
      var c = labCard(id), j = judgeOf(id), J = JUDGE.filter(function (x) { return x[0] === j.judge; })[0];
      if (!c) return;
      L.push('- ' + c.id + ' ' + c.name + ': ' + (J ? J[1] : '未'));
      if (j.memo) L.push('  メモ: ' + String(j.memo).replace(/\s*\n\s*/g, ' / '));
    });
    L.push('', '## 決めること');
    DECIDE.forEach(function (d) { L.push(ansText(d)); });
    L.push('', '## 前からの分かれ道（10/13）');
    FORKS.forEach(function (d) { L.push(ansText(d)); });
    L.push('', '## 見たもの');
    FLAT.forEach(function (f) { L.push('- ' + (st.seen[f.key] ? '✓' : '　') + ' ' + f.sec + '-' + f.no + ' ' + f.s.title); });
    return L.join('\n');
  }
  function showOut() {
    var out = document.getElementById('tdOut');
    if (!out) return;
    out.innerHTML = '<textarea readonly rows="12" spellcheck="false">' + esc(exportText()) + '</textarea><div class="lab-run-buttons"><button type="button" class="primary" data-td="copy">コピー</button><span class="td-copied" hidden>コピーした</span></div>';
    out.hidden = false;
    out.querySelector('textarea').select();
  }

  function onClick(e) {
    var b = e.target.closest('[data-td]');
    if (!b) { if (e.target === box) close(); return; }
    var a = b.getAttribute('data-td');
    if (a === 'seen' || a === 'memo' || a === 'jmemo') return;   // change／input で受ける
    if (a === 'go') go(Number(b.getAttribute('data-i')), b.getAttribute('data-mode'));
    else if (a === 'next') { if (cur + 1 < FLAT.length) go(cur + 1); else { hideBar(); open(); var h = box.querySelectorAll('h3')[2]; if (h) h.scrollIntoView(); } }
    else if (a === 'again') go(cur, 'demo');
    else if (a === 'quest') { if (window.LabQuest) window.LabQuest.open(); }
    else if (a === 'growth') growth();
    else if (a === 'open') open();
    else if (a === 'hide') hideBar();
    else if (a === 'close') close();
    else if (a === 'export') showOut();
    else if (a === 'copy') { var ta = box.querySelector('#tdOut textarea'); if (ta) { ta.select(); try { document.execCommand('copy'); var m = box.querySelector('.td-copied'); if (m) m.hidden = false; } catch (err) { /* 手でコピー */ } } }
    else if (a === 'reset') { if (window.confirm('見た印と「決めること」の答えを全部消します（判定パネルの判定は消えない）。よいですか？')) { st = { seen: {}, ans: {} }; save(); open(); } }
    else if (a === 'try') { box.hidden = true; hideHowto(); app.loadScenario(b.getAttribute('data-scen')); }
    else if (a === 'judge') { var id = b.getAttribute('data-card'), v = b.getAttribute('data-v'); if (window.LabUI) window.LabUI.setJudge(id, { judge: judgeOf(id).judge === v ? '' : v }); keep(open); }
    else if (a === 'pick') {
      var x = ans(b.getAttribute('data-id')), k = b.getAttribute('data-v'), i = x.v.indexOf(k);
      if (b.getAttribute('data-multi') && k !== 'later') { x.v = x.v.filter(function (y) { return y !== 'later'; }); if (i >= 0) x.v.splice(i, 1); else x.v.push(k); }
      else x.v = i >= 0 ? [] : [k];
      save(); keep(open);
    }
  }
  // 描き直しても、見ていた場所のまま
  function keep(fn) { var c = box.querySelector('.td-card'), y = c ? c.scrollTop : 0; fn(); var c2 = box.querySelector('.td-card'); if (c2) c2.scrollTop = y; }
  function onInput(e) {
    var t = e.target, a = t.getAttribute && t.getAttribute('data-td');
    if (a === 'seen') { var k = t.getAttribute('data-key'); if (t.checked) st.seen[k] = true; else delete st.seen[k]; save(); }
    else if (a === 'memo') { ans(t.getAttribute('data-id')).memo = t.value; save(); }
    else if (a === 'jmemo' && window.LabUI) window.LabUI.setJudge(t.getAttribute('data-card'), { memo: t.value });   // 判定パネルのメモへ（この画面は描き直さない）
  }
  box.addEventListener('click', onClick);
  bar.addEventListener('click', onClick);
  box.addEventListener('change', onInput);
  box.addEventListener('input', onInput);
  openBtn.addEventListener('click', open);

  if (/^#today$/i.test(location.hash)) setTimeout(function () { hideHowto(); open(); }, 300);

  window.TodayGuide = { open: open, exportText: exportText, STEPS: FLAT, DECIDE: DECIDE, FORKS: FORKS };
})();
