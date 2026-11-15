/*
 * 草からはじめる（20ステージの案のうち、今のルールで作れるもの）: ステージの中身と、ファイルへの書き出し。
 *   node tools/stages20.js  … stages/草からはじめる.json を書き出す。開発モードの「ファイルから読む」で、そのブラウザの自分のステージに入る
 *
 *   オーナー 11/10: 「みんなのステージへの共有は俺がやる。俺のPCに追加の形で」「答えの手が１通りになるような難易度じゃないはず
 *   だから、いろいろ勝てる方法が欲しい」「レイアウトはその後で調整する」。勝てる手を数える道具は「いらない」。
 *   ⑮（山と水で守る）と ⑳（桜吹雪）は、今のチュートリアル②③をそのまま展示の並びに入れる（ここには作らない）。
 *   ② ③ ⑭（ここを作ったら勝ち）はまだ決めていない。⑤ は ④ に、⑩ は ⑮ にまとめた。⑫（森）は、森にする得が今のルールにないので作らない。
 *
 * 盤面の字: . 空き  g 草むら  F 森  M 山  R 川
 * 味方: [魔法, x, y, { facing, npc（構える味方） }]   敵: [魔法, x, y, { stand, hp, aim }, 向き]   村: [x, y]
 * 味方の並び順が、1ターン目の発動の順番になる
 */
var R = require('../game/rules.js');
var S = require('../game/stages_io.js');
var fs = require('fs');
var path = require('path');

var SET_NAME = '草からはじめる';
var OUT = path.join(__dirname, '..', 'stages', SET_NAME + '.json');
var STILL = { stand: 'still' };

var STAGES = [
  // ① 一発だけ撃つ: 立ち位置と向きはもう合っている。発動を押すと、仲間の風が火を運んで森ごと燃える
  { no: 1, name: '火をつける', difficulty: 'tutorial',
    rows: ['FFF..',
           'FFF..',
           '.F...',
           '.F...',
           '.....',
           '.....'],
    allies: [['fire', 0, 3, { facing: 'right' }], ['wind', 1, 5, { facing: 'up', npc: true }]],
    enemies: [['fire', 1, 0, STILL, 'down']],
    goal: '仲間の風が吹く所に火をつけて、森ごと燃やそう',
    hint: '仲間の風が通るマスに、火があると…？' },

  // ④ 仲間の火に合わせる（⑤ 敵を撃つか草を撃つか もここに）: 仲間の火が狙う空きマスに草むらを置くと、燃えて敵の草むらへ燃え移る
  { no: 4, name: '仲間の火に合わせる', difficulty: 'tutorial',
    rows: ['......',
           '.gg...',
           '.gg...',
           '......',
           '......',
           '......'],
    allies: [['grass', 1, 4, { facing: 'up' }], ['fire', 4, 2, { facing: 'left', npc: true }]],
    enemies: [['fire', 2, 2, { stand: 'still', hp: 2 }, 'down']],
    goal: '仲間の火が狙うマスに草を植えて、敵のいる草むらまで燃やそう',
    hint: '仲間の火は、いつも同じマスを狙っている。そこが草むらなら…？' },

  // ⑥ 2人で組む: 何もない所に草むらを作り、火で燃やす。1ターン目の発動の順番は 火 → 草（一度は失敗して、▲▼ で順番を入れ替える）
  { no: 6, name: '2人で組む', difficulty: 'tutorial',
    rows: ['......',
           '......',
           '......',
           '......',
           '......',
           '......'],
    allies: [['fire', 4, 4, { facing: 'up' }], ['grass', 2, 5, { facing: 'up' }]],
    enemies: [['fire', 3, 1, { stand: 'still', hp: 3 }, 'down']],
    goal: '草むらを作って、火で燃やそう',
    hint: '発動の順番（右上の ▲▼）で、先に撃つ人を変えられる' },

  // ⑦ 導火線: 敵は川の向こう。草むらを橋づたいに敵の草むらまでつないで、手前の端に火をつけると、1ターンに1マスずつ燃え進む
  { no: 7, name: '導火線', difficulty: 'easy',
    rows: ['...R...',
           '...Rgg.',
           '...Rgg.',
           '...R...',
           '.......'],
    allies: [['grass', 1, 3, { facing: 'right' }], ['fire', 2, 2, { facing: 'down' }]],
    enemies: [['fire', 4, 2, { stand: 'still', hp: 2 }, 'down']],
    goal: '川の向こうの敵まで、草むらをつないで火を届けよう',
    hint: '炎は、ターンの終わりにとなりの草むらへ燃え移る' },

  // ⑧ 敵の行き先に置く: 突進の敵が村へ走る（次に止まるマスが見えている）。止まるマスに草むらを置いて、入ってきたら燃やす
  { no: 8, name: '行き先に置く', difficulty: 'easy',
    rows: ['.......',
           '.......',
           '.......',
           '.......',
           '.......',
           '.......',
           '.......'],
    allies: [['grass', 1, 5, { facing: 'up' }], ['fire', 4, 5, { facing: 'up' }]],
    enemies: [['fire', 3, 0, { stand: 'rush', hp: 3 }, 'down']],
    villages: [[3, 6]], mission: { type: 'defense' }, overrides: { 'mission.defense.turns': 3 },
    goal: '村へ走ってくる敵を、行き先の草むらで燃やそう',
    hint: '敵が次に止まるマスは、点線の丸で見えている' },

  // ⑨ 一撃でやられる: 敵の火の予告が草の仲間のマスにかかっている（当たると倒れる）。よけながら草むらを仕込む。敵の火も草むらを燃やす
  { no: 9, name: '一撃でやられる', difficulty: 'easy',
    rows: ['......',
           '......',
           '......',
           '......',
           '......',
           '......'],
    allies: [['grass', 2, 2, { facing: 'up' }], ['fire', 4, 3, { facing: 'up' }]],
    enemies: [['fire', 2, 1, { aim: 'near', hp: 3 }, 'down']],
    goal: '敵の火をよけて、敵を倒そう',
    hint: '敵の魔法が当たると、味方はひとたまりもない。紫の印のマスから動こう' },

  // ⑪ 消火: 敵が火で草むらに火をつける。炎は橋の草むらを渡って村へ近づく。水で炎を消して、燃え移る道を切る
  { no: 11, name: '消火', difficulty: 'easy',
    rows: ['..M.M..',
           'ggggggg',
           'RRRgRRR',
           '...g...',
           '..ggg..',
           '..g.g..',
           '.......'],
    allies: [['water', 1, 4, { facing: 'right' }], ['water', 5, 4, { facing: 'left' }]],
    enemies: [['fire', 3, 0, { aim: 'nature', hp: 3 }, 'down']],
    villages: [[3, 5]], mission: { type: 'defense' }, overrides: { 'mission.defense.turns': 4 },
    goal: '燃え広がる炎を水で消して、村を守ろう',
    hint: '水を炎に当てると消える。草むらに当てると森になる（森も燃える）' },

  // ⑬ 山: 十字の山は通れない。突進の敵が狭い道を抜ける前に、山でふさぐ（ふさぎきったら「クリアする」）。敵の足元に盛ると押し出す
  { no: 13, name: '山でふさぐ', difficulty: 'easy',
    rows: ['MMM.MMM',
           'MMM.MMM',
           'MMM.MMM',
           '.......',
           '.......',
           '.......',
           '.......'],
    allies: [['mount', 2, 5, { facing: 'up' }]],
    enemies: [['fire', 3, 0, { stand: 'rush' }, 'down']],
    villages: [[3, 6]], mission: { type: 'defense' }, overrides: { 'mission.defense.turns': 3 },
    goal: '山で道をふさいで、村を守ろう',
    hint: '山の魔法は十字の形。山は誰も通れない' },

  // ⑯ 泥沼: 水たまりに山を盛ると泥沼。入った敵は次の移動を1回休む。広い原っぱで、突進の敵を足止めして村を守る
  { no: 16, name: '泥沼', difficulty: 'normal',
    rows: ['.......',
           '.......',
           '.......',
           '.......',
           '.......',
           '.......',
           '.......'],
    allies: [['water', 2, 5, { facing: 'up' }], ['mount', 4, 5, { facing: 'up' }]],
    enemies: [['fire', 3, 0, { stand: 'rush' }, 'down']],
    villages: [[3, 6]], mission: { type: 'defense' }, overrides: { 'mission.defense.turns': 3 },
    goal: '敵の足を止めて、村を守ろう',
    hint: '水たまりに山の魔法を当てると、泥沼になる' },

  // ⑰ 風と順番: 炎に風で燃え広がり、風（残っている風）に火で火の渦。同じ2つの魔法でも、順番で起きることが変わる
  { no: 17, name: '風と順番', difficulty: 'normal',
    rows: ['.......',
           '..ggg..',
           '..ggg..',
           '.......',
           '.......',
           '.......',
           '.......'],
    allies: [['fire', 3, 4, { facing: 'up' }], ['wind', 5, 4, { facing: 'up' }]],
    enemies: [['fire', 3, 1, STILL, 'down']],
    goal: '火と風で、草むらごと敵を燃やそう',
    hint: '火が先か、風が先かで、起きることが変わる' },

  // ⑱ 敵の魔法を使う: 火の敵は一番近い味方を狙う。よけたマスが草むらなら、敵の火で敵の群れの草むらが燃える。そこへ風
  { no: 18, name: '敵の火を使う', difficulty: 'normal',
    rows: ['.......',
           '.gggg..',
           '.gggg..',
           '..g....',
           '.......',
           '.......',
           '.......'],
    allies: [['grass', 2, 4, { facing: 'up' }], ['wind', 4, 5, { facing: 'up' }]],
    enemies: [['fire', 2, 3, { aim: 'near', hp: 3 }, 'down'], ['fire', 1, 1, STILL, 'down'], ['fire', 4, 2, STILL, 'down']],
    goal: '敵の火を、敵の草むらに落とさせよう',
    hint: '敵も同じ魔法を使う。敵の火も草むらを燃やす' },

  // ⑲ 火山: 山に火を撃つと、つながった山ごと火山。火山の隣と上にいる者は、ターンの終わりに熱で削られる。進んでくる敵を火山の脇で受け止める
  { no: 19, name: '火山', difficulty: 'normal',
    rows: ['.......',
           '.......',
           '.......',
           '.......',
           '.......',
           '.......',
           '.......'],
    allies: [['mount', 3, 6, { facing: 'up' }], ['fire', 5, 6, { facing: 'up' }]],
    enemies: [['fire', 2, 0, { stand: 'march', hp: 4 }, 'down'], ['fire', 4, 0, { stand: 'march', hp: 4 }, 'down']],
    goal: '火山の熱で、進んでくる敵を倒そう',
    hint: '山に火を撃つと火山になる。火山の隣は熱い（味方も）' }
];

function title(st) { return '草' + ('0' + st.no).slice(-2) + ' ' + st.name; }
function defOf(st) {
  var d = { name: title(st), rows: st.rows, allies: st.allies, enemies: st.enemies };
  if (st.villages) d.villages = st.villages;
  if (st.mission) d.mission = st.mission.type;
  if (st.overrides) d.overrides = st.overrides;
  if (st.difficulty) d.difficulty = st.difficulty;
  return d;
}
function textsOf(st) {
  var t = S.blankTexts(title(st));
  t.goal = st.goal || '';
  t.hint = { simul: st.hint || '', single: st.hint || '' };
  return t;
}
function writeFile() {
  var list = STAGES.map(function (st) {
    var def = defOf(st), b = S.build(R, def);
    if (!b.ok) throw new Error(title(st) + ': ' + b.error);
    return JSON.parse(S.toFile({ name: title(st), def: def, texts: textsOf(st) }));
  });
  if (!fs.existsSync(path.dirname(OUT))) fs.mkdirSync(path.dirname(OUT));
  fs.writeFileSync(OUT, JSON.stringify({ format: S.FORMAT_MANY, version: 1, name: SET_NAME, stages: list }, null, 1) + '\n');
  var back = S.fromFiles(R, fs.readFileSync(OUT, 'utf8'));
  if (back.errors.length || back.items.length !== STAGES.length) throw new Error('読み直せない: ' + JSON.stringify(back.errors));
  console.log('書き出した: ' + path.relative(path.join(__dirname, '..'), OUT) + '（' + list.length + 'ステージ）');
}

if (require.main === module) writeFile();
module.exports = { STAGES: STAGES, defOf: defOf, textsOf: textsOf, title: title };
