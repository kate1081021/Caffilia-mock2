/*
 * lab_change.js — 試作ラボ LAB_N「強化と変化」のデータ。データだけ（処理は lab_rules.js の「N」の節）。
 * ブラウザでは グローバル変数 LAB_CHANGE、node では module.exports で読める。
 * 元: オーナーの「強化と変化のまとめ（2026-10-16）」（.claude/強化と変化のまとめ_20261016.md）。名前・数・仕分けはすべて【仮】。
 *
 * 属性のやりたいこと（WANTS）: defeat 倒す／spread 広げる／move 動かす／stop 止める
 *   火 倒す・草 広げる・水 止める・風 動かす・土 倒す（N3 で止めるに切り替え）
 * ミッションにも、どのやりたいことに当たるかの仕分けがある（SORT。free はどの属性にも合う）。
 *   取った魔法のやりたいことと合う → 覚醒方面の印、合わない → 融合方面の印（N2 で数え方を切り替え）
 * 印1つで、属性のやりたいことの並び（STEPS）から順に間の強化が1つ付く（覚醒方面の印でも融合方面の印でも同じ並び）。
 *   並びを使い切ったあとは、形が1マス増える（MORE。上限 MORE_MAX）
 * 変化: 覚醒方面か融合方面の印が先に change（N1 初期2）に届いた方面へ。もう片方は閉じる（戻れない）。
 *   N6「1本の道」がオンなら: 印でマスを埋め、len（初期3）マスそろったときに多い方の方面へ変化（閉じない）。.claude/IMPROVE_road.md
 *   覚醒方面だけ、変化のあと覚醒方面の印がさらに awake（N1 初期3）たまると覚醒
 *
 * 変化先（FORMS）: 属性 → { awake: 覚醒方面の変化（lv2 が覚醒）, fuse: 融合方面の変化 }
 *   id     処理の番号（lab_rules.js の N の節）
 *   shape  形（術者の足元が (0,0)、正面が +y、右が +x）。省略は1段目（覚醒は変化の形）、null は元の魔法の形。{ weak, same } は N4 の融合の控えめで変わる
 *   extra  形が増えるときの順（省略は1段目、null は lab_paths.js の EXTRA_CELLS）
 *   combo  覚醒先だけが持つ、新しい組み合わせ（1つだけ）
 *   with   融合の相手の属性（その相手とのシナジーで作るものを、1人で出せる）
 */
(function (root) {
  var WANTS = {
    defeat: { name: '倒す',   mark: '倒', shape: '◆', color: '#d24a3c', desc: '敵を倒す力' },
    spread: { name: '広げる', mark: '広', shape: '●', color: '#2f9e5b', desc: '自然を広げて、盤面を自分たちのものにする力' },
    move:   { name: '動かす', mark: '動', shape: '▲', color: '#8b5cf6', desc: '位置と向きを変える力' },
    stop:   { name: '止める', mark: '止', shape: '■', color: '#3d73c9', desc: '敵の手を止める・遅らせる力' },
    free:   { name: 'どれでも', mark: '自', shape: '★', color: '#8a8f86', desc: 'どの属性のやりたいことにも合う（序盤の目印のミッション）' }
  };
  // shape: N6「1本の道」で、ミッションと道のマスに付ける形（形と色の両方で見分ける。どれでもは、どの魔法でも自分の形として数える）

  // 魔法カードの「性質」の一言【仮】（遊び方・ルール早見から。grow は「育つ」が入のとき）
  var TRAITS = {
    grass: { text: '空きに森を置く。山に植えると桜', grow: '空きに草むら、草むらにもう一度で森。山・丘に植えると桜' },
    earth: { text: '空きに山を盛る。川・水たまりは泥沼に', grow: '空きに丘、丘にもう一度で山。川・水たまりは泥沼に' },
    fire:  { text: '正面1マス。空きに小さな炎、森は炎に。炎に風が来ると燃え広がり' },
    water: { text: '正面に池。炎を消す。山に当たると川になる', grow: '正面に水たまり、水たまりにもう一度で川。炎を消す' },
    wind:  { text: '正面2マス。者を1マス運ぶ。炎に当たると燃え広がり。残った風に火で火の渦' }
  };
  var WANT_ORDER = ['defeat', 'spread', 'move', 'stop'];
  var SORT_ORDER = ['defeat', 'spread', 'move', 'stop', 'free'];

  // 属性のやりたいこと（土は N3 で stop に切り替え）。ここにない属性（雷・氷・闇・光 …）は今回の育ちの対象にしない
  var ATTR = { fire: 'defeat', grass: 'spread', water: 'stop', wind: 'move', earth: 'defeat' };
  var ATTR_ORDER = ['grass', 'earth', 'fire', 'water', 'wind'];

  // 間の強化の並び（やりたいことごと）。id は lab_rules.js の N の節が見る
  var STEPS = {
    defeat: [
      { id: 'power', name: '直撃の威力', mark: '威', text: '直撃の威力が上がる（+2）' },
      { id: 'shape', name: '形が1マス', mark: '形', text: '形が1マス増える（流れる・吹く魔法は届く長さ）' },
      { id: 'effect', name: '効き目が1段', mark: '効', text: '当たった者への効き目が1段強く・長くなる（足止め・火傷が1回長い。火の直撃は火傷を負わせる）' }
    ],
    spread: [
      { id: 'shape', name: '形が1マス', mark: '形', text: '形が1マス増える' },
      { id: 'linger', name: 'もう1ターン残る', mark: '残', text: '作った自然のうち、1ターンで消えるもの（風・強風・小さな炎・花びら・砂嵐）が、もう1ターン残る' },
      { id: 'standOn', name: '足場で形が増える', mark: '足', text: '決まった自然（森・草むら・丘の桜）の上に立って撃つと、形が2マス増える' }
    ],
    move: [
      { id: 'pushMore', name: '押す・向きを1段', mark: '押', text: '押す・運ぶ効き目が1マス多く、向きを変える効き目は後ろを向かせる' },
      { id: 'moveAfter', name: '撃ったあと動ける', mark: '動', text: '撃ったあと、術者が1マス動ける（動いて「待機」）' },
      { id: 'leap', name: '撃った先へ移る', mark: '移', text: '撃ったあと、形の一番奥の立てるマスへ術者が移る' }
    ],
    stop: [
      { id: 'delay', name: '予告が遅れる', mark: '遅', text: '当たった敵の予告が1ターン遅れる（その場で構えたまま、次のターンに撃つ）' },
      { id: 'hold', name: '次の移動を止める', mark: '止', text: '当たった敵は、次の移動ができない' },
      { id: 'shrink', name: '形が小さくなる', mark: '小', text: '当たった敵の、次の魔法の形が小さくなる（1マスだけ）' }
    ]
  };
  var MORE = { id: 'shape', name: '形が1マス', mark: '形', text: '並びを使い切ったあとは、印1つで形が1マス増える' };
  var MORE_MAX = 3;   // 並びのあとの「形が1マス」の上限
  // 広げる3「足場で形が増える」の決まった自然
  var STAND_ON = { grass: ['forest', 'thicket', 'deepforest', 'hillsakura'], earth: ['hill', 'hillsakura'], water: ['puddle', 'reeds'],
    fire: ['smallfire', 'fire'], wind: ['breeze', 'gale'] };

  // 変化先【仮】（名前・中身はまとめの 7章。見え方の一言は lab_rules.js）
  var FORMS = {
    grass: {
      awake: { id: 'nforest', name: '森', mark: '森', verb: '植える',
        text: '空きに撃つと、いきなり森になる（草むらを飛ばす）。草むらに撃てば森が茂る。山・丘に当たれば桜（草と同じ）',
        lv2: { id: 'ntree', name: '大樹', mark: '樹', verb: '植える',
          text: '森の魔法と同じに植え、形のいちばん手前のマスは大樹になる。大樹は森として振る舞う（火で燃える・燃え移る・闇で死の森）',
          combo: '大樹に水が来ると、大樹のまわり2マスの空き・草むらが、一気に森になる' } },
      fuse: { id: 'nsakura', name: '桜', mark: '桜', verb: '咲かせる', with: 'earth',
        text: '空きに撃つと桜が咲く（山がなくても作れる。山に草でできるもの）。風が来れば桜吹雪',
        weak: '丘の桜が咲く（桜吹雪は2列。山の桜は3列）', same: '山の桜が咲く（桜吹雪は3列）' }
    },
    earth: {
      awake: { id: 'nrock', name: '岩', mark: '岩', verb: '転がす', shape: [[0, 1]], extra: [[0, 2], [-1, 1], [1, 1]],
        text: '空きに岩を置く。岩に撃つと、岩が向きの奥へ転がる（岩落とし: 通り道の者に20）。岩は風・水・土が当たっても転がる（ラボ I4 の岩）',
        lv2: { id: 'nrockmt', name: '岩山', mark: '岳', verb: '盛る', shape: null, extra: null,   // 形は土（盛る）に戻る
          text: '空き・丘に、一発で岩山を盛る（人のいるマスには盛れない）。岩山は山として振る舞う（火で火山・水で源流・草で桜）。岩に当たれば転がす',
          combo: '岩山に風が来ると、岩が風下の斜面を転がり落ちる（岩なだれ: 通り道の者に20。岩山はただの山に戻る）' } },
      fuse: { id: 'nmud', name: '泥', mark: '泥', verb: '盛る', with: 'water', shape: { weak: [[-1, 2], [0, 2]], same: null },
        text: '空きに撃つと泥沼（川・水たまりに土でできるもの）。はまった者は次の移動が1回休み',
        weak: '形が2マス', same: '形が3マス（土と同じ）' }
    },
    fire: {
      awake: { id: 'nblaze', name: '炎', mark: '炎', verb: '点ける', shape: [[0, 1], [-1, 1], [1, 1]], extra: [[0, 2], [-1, 2], [1, 2]],
        text: '正面と左右の3マスに、いきなり炎（二段）。小さな炎は炎に。面で燃え、燃え尽きるまで燃え続ける',
        lv2: { id: 'ninferno', name: '業火', mark: '業', verb: '点ける',
          text: '炎の魔法と同じに点け、できた炎は業火になる。業火は炎として振る舞う（風で燃え広がる・燃え移る・燃え尽きる）',
          combo: '業火に水が来ると、消えずに爆ぜる（水蒸気爆発: 業火とまわり1マスの者に20）' } },
      fuse: { id: 'nwhirl', name: '火の渦', mark: '渦', verb: '巻く', with: 'wind', shape: { weak: [[0, 1]], same: [[0, 1], [1, 1], [0, 2], [1, 2]] }, extra: [[0, 2], [1, 1], [1, 2], [-1, 1]],
        text: '空きに撃つと火の渦（風に火でできるもの）。1か所に巻いて立ち上がる（森の上は20、ほかは弱い5＋火傷）。水が来ればセンタクキ',
        weak: '正面1マスの火の渦', same: '正面の2×2の火の渦（仲間と組むのと同じ）' }
    },
    water: {
      awake: { id: 'nlake', name: '湖', mark: '湖', verb: '湛える', shape: [[0, 1], [1, 1], [0, 2], [1, 2]], extra: [[-1, 1], [-1, 2], [0, 3], [1, 3]],
        text: '正面の2×2に湖（面で留まる水）。湖は水たまりとして振る舞う（シナジーのつながりは水たまりと同じ）。炎は消える',
        lv2: { id: 'nice', name: '氷', mark: '氷', verb: '凍らせる',
          text: '正面の2×2に氷（湖が凍った姿）。中にいた者は足が凍る（次の移動が1回休み）。火が来れば湖に戻る',
          combo: '氷に風が来ると吹雪。風下の一直線が凍る（空き・水・炎は氷に、そこにいる者は足が凍る）' } },
      fuse: { id: 'nsource', name: '源流', mark: '源', verb: '流れる', with: 'earth', len: { weak: 3, same: 99 },
        text: '撃った所から正面へ川が走る（山に水でできるもの）。線で走る水。人・山・森の手前で止まり、炎は消して止まる',
        weak: '川は3マスまで', same: '川は盤の端まで' }
    },
    wind: {
      awake: { id: 'ngust', name: '旋風', mark: '旋', verb: '巻く', shape: [[0, 1], [1, 1], [0, 2], [1, 2]], extra: [[-1, 1], [-1, 2], [0, 3], [1, 3]],
        text: '正面の2×2に円く巻く。当たった者は向きが右回りに変わる（予告の向きも変わる）。空きには風が残る。炎・桜に当たれば燃え広がり・桜吹雪',
        lv2: { id: 'ntwister', name: '竜巻', mark: '竜', verb: '巻く',
          text: '旋風と同じに巻き、当たった者は竜巻にとらわれる（次の移動が1回休み）。残る風は竜巻（風として振る舞う: 火で火の渦。ターン終了でやむ）',
          combo: '竜巻に水が来ると、水を巻き上げて、まわり1マスに雨を降らせる（空きは水たまり、炎は消える）' } },
      fuse: { id: 'nsand', name: '砂嵐', mark: '砂', verb: '巻く', with: 'earth', shape: { weak: [[0, 1], [0, 2]], same: [[0, 1], [1, 1], [0, 2], [1, 2]] }, extra: [[1, 1], [1, 2], [-1, 1], [-1, 2]],
        text: '円く巻いて砂嵐（風に土でできるもの。中の者は見えない）。ターン終了でおさまると、丘が残る。火が来れば粉塵爆発',
        weak: '正面2マス', same: '正面の2×2（仲間と組むのと同じ）' }
    }
  };

  // ミッション 42〜44（材料まとめの 41 に足したもの）。1〜41 は lab_power.js の MISSIONS を使う
  //   43・44 は盤面ごとに中身を決める（シナリオの labTargetList に { id, cells } や { id, names } で置く）
  var MISSIONS_ADD = [
    { no: 42, id: 'shot1', name: '魔法を1発撃つ', text: '魔法を1発撃つ（どこへでも）', check: { kind: 'shot' } },
    { no: 43, id: 'hitCell', name: '決められたマスに撃つ', text: '光っているマスに魔法を当てる', check: { kind: 'hitTile', cells: [] } },
    { no: 44, id: 'synergy', name: '決められたシナジーを起こす', text: '決められた決め手を起こす', check: { kind: 'finName', names: ['燃え広がり'] } }
  ];

  // ミッションの仕分け【仮】（id → やりたいこと）。画面の「ミッションの仕分け」で変えられる
  //   まず言葉の意味で分け、tests/lab_nsort.js で「どの属性が取りやすいか」を数えて確かめる（LAB_REPORT の N）
  var SORT = {
    // 倒す（決め手・倒すこと）
    finKill: 'defeat', finTwo: 'defeat', finChain: 'defeat', finTurn2: 'defeat', fin3: 'defeat', kill: 'defeat', killBefore: 'defeat',
    lastFin: 'defeat', enemyNatFin: 'defeat', enemyFinKill: 'defeat', allThree: 'defeat', turnWin: 'defeat',
    // 広げる（自然を作る・つなげる・大きな自然を壊す）
    farFin: 'spread', bigFin: 'spread', enemyChange: 'spread', overwrite: 'spread', chain5: 'spread', twoStage: 'spread', kinds3: 'spread',
    waterDown: 'spread', half: 'spread', nextTo: 'spread',
    // 動かす（位置と向き）
    redirect: 'move', push2: 'move', pushInto: 'move', bump: 'move', gather: 'move', lower: 'move', edge: 'move', turnIntent: 'move',
    rescue: 'move', carry: 'move', noWalk: 'move',
    // 止める（足・道・予告・守る）
    held: 'stop', held2: 'stop', heldFin: 'stop', blocked: 'stop', foiled: 'stop', neverShot: 'stop', noLoss: 'stop', villagesSafe: 'stop',
    // どれでも（序盤の目印）
    shot1: 'free', hitCell: 'free', synergy: 'free'
  };

  // L6 クエスト（N のやりたいことで）。やりたいことごとのミッションの出しやすい順
  var QUEST_POOL = {
    defeat: ['finKill', 'kill', 'finTwo', 'lastFin', 'killBefore', 'finChain'],
    spread: ['nextTo', 'chain5', 'kinds3', 'twoStage', 'bigFin', 'half'],
    move: ['push2', 'pushInto', 'redirect', 'gather', 'edge', 'bump'],
    stop: ['held', 'foiled', 'noLoss', 'heldFin', 'villagesSafe', 'held2']
  };
  var QUEST_NAME = { defeat: '討伐', spread: '開拓', move: '誘導', stop: '守り' };
  var QUEST_ORDER = ['defeat', 'spread', 'move', 'stop'];
  var QUEST_LEAN = { annihilate: 'defeat', defense: 'stop', escort: 'move', retrieve: 'move' };

  var api = { WANTS: WANTS, WANT_ORDER: WANT_ORDER, SORT_ORDER: SORT_ORDER, ATTR: ATTR, ATTR_ORDER: ATTR_ORDER, STEPS: STEPS, MORE: MORE, MORE_MAX: MORE_MAX,
    STAND_ON: STAND_ON, FORMS: FORMS, MISSIONS_ADD: MISSIONS_ADD, SORT: SORT, TRAITS: TRAITS,
    QUEST_POOL: QUEST_POOL, QUEST_NAME: QUEST_NAME, QUEST_ORDER: QUEST_ORDER, QUEST_LEAN: QUEST_LEAN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LAB_CHANGE = api;
})(this);
