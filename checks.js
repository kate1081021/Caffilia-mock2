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
      name: '【育つ】土を2回: 丘 → 山（十字に盛り上がる）',
      set: { 'grow.enabled': true, 'grow.mountainSize': 5 },
      enemyActs: false,
      desc: '育つ（IMPROVE_grow）の土。1回目は小さな丘、同じ所にもう1回土を当てると、丘を元にまわりへ盛り上がって大きな山に育つ。',
      layout: {
        rows: ['......', '......', '......', '......', '......', '......'],
        allies: [['earth', 2, 5]],
        enemies: [['fire', 5, 0]]
      },
      turns: [
        [{ say: '見るところ: 土は1回目で「丘」（人と同じ1マスの、低い盛り上がり）。2回目で、丘のまわりへ盛り上がって「山」に育つ。' },
         { id: 'P1', to: [2, 5], dir: 'up', say: '土を1回: 空きに丘が3つできる（マスの下半分の低い盛り上がり）。' }],
        [{ id: 'P1', to: [2, 5], dir: 'up', say: '同じ丘にもう1回土: 撃つ前に、育ったあとの形が茶色く重なる。丘3つがそれぞれ十字に盛り上がって、11マスの大きな山になる。' }],
        [{ say: 'ここまで: 丘は人と同じ1マス、山は人より大きい。育てる一手で盤面が一気に変わる。山の大きさは調整パネルの「育つ: 山の大きさ」で 1・4・5・9 を選べる。' }]
      ],
      expect: { tiles: { '1,3': 'mountain', '2,3': 'mountain', '1,2': 'mountain', '0,3': 'mountain', '3,3': 'mountain', '2,4': 'mountain', '1,1': 'mountain' } }
    },
    {
      id: 'growHill9',
      name: '【育つ】山の大きさ9（3×3）で丘 → 山',
      set: { 'grow.enabled': true, 'grow.mountainSize': 9 },
      enemyActs: false,
      desc: '上と同じ手順で、山の大きさだけ 9（丘を中心に3×3）にしたもの。大きさのくらべ用。',
      layout: {
        rows: ['......', '......', '......', '......', '......', '......'],
        allies: [['earth', 2, 5]],
        enemies: [['fire', 5, 0]]
      },
      turns: [
        [{ id: 'P1', to: [2, 5], dir: 'up', say: '土を1回: 丘が3つ（ここは大きさ5と同じ）。' }],
        [{ id: 'P1', to: [2, 5], dir: 'up', say: '同じ丘にもう1回土: 丘3つがそれぞれ3×3に盛り上がる。6×6の盤面の左半分が山になる。' }],
        [{ say: 'ここまで: 9だと山は「地形」と呼べる大きさ。6×6では盤面が窮屈になる（縮尺のくらべは後のステップで）。' }]
      ],
      expect: { tiles: { '0,1': 'mountain', '3,4': 'mountain', '0,4': 'mountain' } }
    },
    {
      id: 'growBlocked',
      name: '【育つ】育たないマス: ユニット・ほかの自然',
      set: { 'grow.enabled': true, 'grow.mountainSize': 5 },
      enemyActs: false,
      desc: '山が育つ範囲に、ユニットやほかの自然があると、そのマスは山にならない（押し出しは次の新案）。',
      layout: {
        rows: ['.......', '.......', '.......', '...hF..', '.......', '.......', '.......'],
        allies: [['earth', 3, 5]],
        enemies: [['fire', 3, 2]]
      },
      turns: [
        [{ say: '見るところ: 丘 (3,3) を十字に育てる。上には敵A、右には森がある。' },
         { id: 'P1', to: [3, 5], dir: 'up', say: '構えると、育つマスが茶色く重なり、育たないマスに赤い × が出る（敵Aのマスと森のマス）。' }],
        [{ say: 'ここまで: 敵のいたマスは空いたまま、森は森のまま。十字の5マスのうち、山になったのは残りの3マスだけ。' }]
      ],
      expect: { tiles: { '3,3': 'mountain', '2,3': 'mountain', '3,4': 'mountain', '3,2': 'empty', '4,3': 'forest' }, at: { E2: [3, 2] } }
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
