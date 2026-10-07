/*
 * checks.js — 新案プレイ（試し中の新案を、見て確かめるための再生）
 * ブラウザでは グローバル変数 CHECKS、node では module.exports で読める。
 *
 * スーパープレイ（demos.js）とは別。新案を試している間だけここに置き、採るか外すか決まったら消す。
 *   set:    再生中だけ balance.js に重ねる切り替え（{ 'grow.enabled': true } など）。ほかのシナリオを読むと元に戻る
 *   layout: 盤面（rules.js の PRESETS と同じ形。rows・allies・enemies）
 *   enemyActs: false で敵は何もしない（見たいところだけに集中するため）
 *   turns:  ターンごとの行動。{ id, to: [x,y], dir, shoot, say }。say は、その手を構えたときに盤面の上に出す説明
 *           { say } だけの項目は、説明を出して少し待つ
 *   expect: 最後の盤面で確かめること（tests/scenarios.js が見る）。tiles: { 'x,y': 自然 }、at: { ユニットid: [x,y] }、hp: { ユニットid: HP }
 */
(function (root) {
  var CHECKS = [
    {
      id: 'growHill',
      name: '【育つ】土を2回: 丘 → 山',
      set: { 'grow.enabled': true },
      enemyActs: false,
      desc: '育つ（IMPROVE_grow）の土。1回目は小さな丘、同じ所にもう1回土を当てると山に育つ。',
      layout: {
        rows: ['......', '......', '......', '......', '......', '......'],
        allies: [['earth', 2, 5]],
        enemies: [['fire', 5, 0]]
      },
      turns: [
        [{ say: '見るところ: 土は1回目で「丘」（人と同じ1マスの、低い盛り上がり）。2回目で「山」に育つ。' },
         { id: 'P1', to: [2, 5], dir: 'up', say: '土を1回: 空きに丘が3つできる（マスの下半分の低い盛り上がり）。' }],
        [{ id: 'P1', to: [2, 5], dir: 'up', say: '同じ丘にもう1回土: 丘が山に育つ。つながった山は1つの大きな山として描かれる。' }],
        [{ say: 'ここまで: 丘は小さく、山は大きい。育つ一手で盤面の高さが変わる。' }]
      ],
      expect: { tiles: { '1,3': 'mountain', '2,3': 'mountain', '1,2': 'mountain' } }
    },
    {
      id: 'hillNature',
      name: '【育つ】丘の性質: 止まる・高台・源流・風を通す',
      set: { 'grow.enabled': true },
      enemyActs: false,
      desc: '丘（土の一段目）の性質を1つずつ見る。丘には3か所に最初から置いてある。',
      layout: {
        rows: ['......', '......', '......', '....h.', '.h.h..', '......'],
        allies: [['fire', 1, 5], ['wind', 3, 5], ['water', 4, 5]],
        enemies: [['fire', 1, 2], ['fire', 3, 3]]
      },
      turns: [
        [{ say: '見るところ: 丘は「入ると止まる」「上から撃つと1マス先へ届く」「水が当たると川が流れ出す」「低いので風を通す」。' },
         { id: 'P1', to: [1, 4], dir: 'up', say: '火の味方が丘に乗る（丘に入ると、そこで移動が終わる）。丘の上から撃つと形が1マス先にずれて、すぐ前ではなく2つ先の敵Aに届く（高台）。' },
         { id: 'P3', to: [4, 5], dir: 'up', say: '水が丘に当たると、丘から盤の端まで川が流れ出す（源流）。丘は丘のまま。' },
         { id: 'P2', to: [3, 5], dir: 'up', say: '丘は低いので、風は丘の上を吹き抜けて、その先の敵Bを運ぶ（山なら山の陰で止まる）。' }],
        [{ say: 'ここまで: 丘は通れて、高台になり、水の源にもなる。でも風はさえぎらない（さえぎるのは山だけ）。' }]
      ],
      expect: {
        tiles: { '1,4': 'hill', '3,4': 'hill', '4,3': 'hill', '4,4': 'river', '4,2': 'river', '4,0': 'river' },
        at: { P1: [1, 4], E5: [3, 2] },
        hp: { E4: 19 }
      }
    }
  ];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CHECKS;
  } else {
    root.CHECKS = CHECKS;
  }
})(this);
