/*
 * lab_paths.js — 試作ラボ LAB_L の魔法の道。データだけ。
 * ブラウザでは グローバル変数 LAB_PATHS、node では module.exports で読める。
 *
 * LAB_L2 で方向を「作る・決める・止める・動かす」に組み直した。
 *   作る（make）は全魔法に共通の道。1マス進むごとに形が1マス増える（上限3マス）。
 *     伸びる向きは属性で決まる（extend: forward 奥へ／side 横へ／diag 斜め前へ）。水・風は届く長さが1マスずつ伸びる。
 *     作るが得意な属性（makeGood: 草・土・水。10/15 追記）は、作るの3マス目で覚醒する（草「森」・土「山」・水「川」）。
 *       一段目を飛ばして、一発で育った姿を作る魔法になる（G1 一気に二段を強化先に使う。育つ X1 が切なら名前と駒が変わるだけ）。
 *       覚醒の決まりは得意な方向と同じ（ほかの得意な方向は閉じる。戻れない）。先にほかの方向に覚醒したら、作るの3マス目は形が1マス増えるだけ。
 *     作るが得意でない属性（火・風・雷・氷・闇）は、3マス目も形が1マス増えるだけで止まり、覚醒しない。
 *   得意な方向（dirs）は、決める・止める・動かすのうち属性ごとに1〜2つ。1つの方向には道が1本だけ。
 *     3マスで覚醒し、ほかの得意な方向は閉じる（作るは閉じない）。元の動詞は含んだまま。戻れない。
 *
 *   dirs     得意な方向（lab_targets.js の DIRS のキー。make は含まない）
 *   steps    方向ごとの3マス [{ fx, text }]。fx は効果の番号（処理は lab_rules.js の「L 魔法の道」の節）
 *   awaken   得意な方向ごとの覚醒先 { name, mark }（mark は駒に出す1文字）。makeGood なら make の覚醒先も
 *   makeGood 作るが得意（作るの3マス目で覚醒する）
 *   extend   作るの形の伸びる向き
 *   real     中身を本物で作った方向（草の止める）
 *
 * 道の進み具合はユニットの labPath = { make: 0〜3, 得意な方向: 0〜3, awake: 方向 or null }。
 * 1マス進むと、そのマスの効果がすぐ魔法に付く。数値・形・名前はすべて【仮】。
 */
(function (root) {
  var EXTEND_NAME = { forward: '奥へ', side: '横へ', diag: '斜め前へ' };
  var DIR_NAME = { make: '作る', decide: '決める', stop: '止める', move: '動かす' };

  var LAB_PATHS = {
    // 草（植える）: 止めるは本物（LAB_L の足止めの道をそのまま）
    grass: { dirs: ['stop'], extend: 'side', real: { stop: true }, makeGood: true,
      steps: {
        stop: [
          { fx: 'vine', text: '森の隣にいる者に当たると、蔓が足に絡んで次の移動ができない' },
          { fx: 'vineFar', text: '蔓が届くのが、森から2マス以内の者まで' },
          { fx: 'thorn', text: '覚醒「茨の牢」: 森に上下左右のうち3方向以上を囲まれたマスにいる者は、移動も予告もできない（囲む森がなくなるまで）' }
        ]
      },
      awaken: { make: { name: '森', mark: '森' }, stop: { name: '茨の牢', mark: '茨' } } },
    // ここから下は、決める・止める・動かすの共通の処理（仮）。見え方だけ属性の動詞に合わせる
    earth: { dirs: ['stop', 'move'], extend: 'side', makeGood: true,
      awaken: { make: { name: '山', mark: '山' }, stop: { name: '城壁', mark: '壁' }, move: { name: '地鳴り', mark: '鳴' } } },
    water: { dirs: ['move'], extend: 'forward', makeGood: true,
      awaken: { make: { name: '川', mark: '川' }, move: { name: '激流', mark: '激' } } },
    fire: { dirs: ['decide', 'stop'], extend: 'diag',
      awaken: { decide: { name: '業火', mark: '業' }, stop: { name: '炎の壁', mark: '炎' } } },
    wind: { dirs: ['decide', 'move'], extend: 'forward',
      awaken: { decide: { name: 'かまいたち', mark: '鎌' }, move: { name: '疾風', mark: '疾' } } },
    // 雷・氷・闇の覚醒先は Claude Code が仮に付けた
    thunder: { dirs: ['decide'], extend: 'forward',
      awaken: { decide: { name: '落雷', mark: '落' } } },
    ice: { dirs: ['stop'], extend: 'forward',
      awaken: { stop: { name: '凍土', mark: '凍' } } },
    dark: { dirs: ['move'], extend: 'diag',
      awaken: { move: { name: '深淵', mark: '淵' } } }
  };

  // 作るの覚醒（作るが得意な属性）の中身の一言
  var MAKE_FORM = {
    grass: '空きに撃つと一発で森（草むらを飛ばす）。森に撃つと、そのかたまりの外側へ1マスずつ森が広がる',
    earth: '空きに撃つと一発で山（丘を飛ばす）',
    water: '空きに流すと一発で川（水たまりを飛ばす）'
  };

  // 見え方（属性の動詞に合わせた一言）
  var FLAVOR = {
    decide: { fire: '炎が1マス外まで燃え広がる', wind: '風が1マス外まで巻きこむ', thunder: '雷が1マス外まで走る' },
    stop: { earth: '足が土に埋まる', fire: '炎に巻かれて足が止まる', ice: '足が凍りつく' },
    move: { earth: '盛り上がる山が、向こうへ押し出す', water: '水が、正面へ押し流す', wind: '風で、もう1マス運ぶ', dark: '闇が、もう一度引き寄せる（1マス遠くからも）' }
  };

  // 作るで増えるマス（増える順。術者の足元が (0,0)、正面が +y、術者から見て右が +x）。
  //   流れる・吹く魔法（水・風）は形ではなく、届く長さが1マスずつ伸びる
  var LAB_EXTRA_CELLS = {
    grass: [[2, 3], [-2, 3], [1, 2]],                                     // 横へ（もとの形は [0,2] [-1,3] [0,3] [1,3]）
    earth: [[1, 2], [-2, 2], [0, 3], [1, 3], [-2, 3], [2, 2]],          // 横へ（もとの形は [-1,2] [0,2] [-1,3]）
    fire: [[1, 2], [-1, 2], [2, 3], [-2, 3], [0, 2], [0, 3]],           // 斜め前へ（もとの形は正面1マス）
    dark: [[1, 2], [-1, 2], [2, 3], [-2, 3], [0, 2], [0, 3]],
    thunder: [[0, 5], [1, 6], [0, 7], [1, 8], [0, 9], [1, 10]],         // 奥へ（ジグザグのまま）
    ice: [[0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8]]               // 奥へ
  };

  // 道の3マスの中身を作る（作るは全魔法で同じ。決める・止める・動かすは共通の処理）
  Object.keys(LAB_PATHS).forEach(function (m) {
    var p = LAB_PATHS[m];
    p.steps = p.steps || {};
    var grow = function (i) { return { fx: 'shape', text: '形が1マス増える（' + EXTEND_NAME[p.extend] + '）' + (i === 2 ? '。ここが上限（覚醒はない）' : '') }; };
    p.steps.make = [grow(0), grow(1), grow(2)];
    if (p.makeGood) p.steps.make[2] = { fx: 'makeForm', text: '覚醒「' + p.awaken.make.name + '」: ' + MAKE_FORM[m] + '。' +
      p.dirs.map(function (d) { return DIR_NAME[d]; }).join('・') + 'は閉じる（育つが切なら名前と駒が変わるだけ。先にほかの方向に覚醒したら、形が1マス増えるだけ）' };
    p.dirs.forEach(function (d) {
      if (p.real && p.real[d]) return;
      var aw = '覚醒「' + p.awaken[d].name + '」: ', fl = (FLAVOR[d] || {})[m] || '';
      if (d === 'decide') p.steps[d] = [
        { fx: 'finWide', text: '決め手の範囲が1マス広い（' + fl + '）' },
        { fx: 'finFar', text: '形が術者から1マス離れて届く（前1マスを飛ばす。決め手から離れて起こせる）' },
        { fx: 'finAwake', text: aw + '名前と駒の印が変わり、決め手の範囲がさらに1マス広い' }];
      if (d === 'stop') p.steps[d] = [
        { fx: 'hold', text: '当たった者は、次の移動ができない（' + fl + '）' },
        { fx: 'hold2', text: '止まる回数が2回になる' },
        { fx: 'bind', text: aw + '当たった者は、次のターン、移動も予告もできない' }];
      if (d === 'move') p.steps[d] = [
        { fx: 'push', text: '当たった者を1マス動かす（' + fl + '）' },
        { fx: 'pushThings', text: '馬車・落ちている宝のような物も動かせる' },
        { fx: 'slide', text: aw + '動かされた者は、何かに当たるまで止まらない' }];
    });
  });

  // LAB_L（10/14）の草の起点・育てるの道。LAB_L2 では使わない（データと処理は残してある。lab_rules.js は fx で効果を見る）
  var LEGACY = {
    grass: {
      origin: [
        { fx: 'reeds', text: '川・水たまりに撃つと葦原（渡れる。水としてつながったまま）' },
        { fx: 'windSeed', text: '風が残るマスに撃つと、風下の空き1マスにも森（種が風に乗る）' },
        { fx: 'sow', text: '覚醒「種まき」: 形のマスに加えて、正面の奥、最初に何かに当たる手前の空きマスにも森が1マス' }
      ],
      grow: [
        { fx: 'shape', text: '森の形が横に1マス広がる' },
        { fx: 'thicken', text: '森に撃つと、そのかたまりの外側へ1マスずつ森が広がる（形のマス数まで）' },
        { fx: 'bigtree', text: '覚醒「大樹」: 形の真ん中が大樹（森の一種。通れない・高い）。大樹とつながった森が燃えると、燃え広がりが2マス長く走る' }
      ],
      awaken: { origin: { name: '種まき', mark: '種' }, grow: { name: '大樹', mark: '樹' } }
    }
  };

  var api = { PATHS: LAB_PATHS, EXTRA_CELLS: LAB_EXTRA_CELLS, EXTEND_NAME: EXTEND_NAME, FLAVOR: FLAVOR, MAKE_FORM: MAKE_FORM, LEGACY: LEGACY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LAB_PATHS = api;
})(this);
