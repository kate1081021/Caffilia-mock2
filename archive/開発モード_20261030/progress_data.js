/*
 * progress_data.js — 進行モック（クエスト制とステージ制）の中身。数はどれも【仮】（.claude/進行モック_指示書.md）
 *   戦闘は既存の戦闘そのもの。ここに持つのは「どの盤面で戦うか・誰をどこに置くか・おすすめ・報酬」だけ。
 *   ブラウザでは グローバル変数 RUN_DATA、node では module.exports で読める。
 *
 *   battles.<id>: rows（盤面。rules.js のシナリオと同じ文字）・slots（連れていく3人を置く所 [x, y]。左から選んだ順）・
 *     enemies（[魔法, x, y, 個性]）・mission・villages・enemyOnly・overrides（その戦闘だけの数値）・
 *     enemyHp（敵ごとの HP の上書き { 番号: HP }。ボス用）・recommend（おすすめの魔法。手で決める。1〜2つ）
 *     from: 元にした初期シナリオ（rules.js の PRESETS の id）
 *   directions: 魔法ごとの強化の方向（2つ）。effect は仮の効果（後から差し替える）。
 *     { power: n } … その味方の直撃の威力 +n／段
 *     { override: 'balance.js の項目', per: n } … その戦闘の数値 +n／段（連れていったときだけ）
 */
(function (root) {
  var RUN_DATA = {
    startParty: ['grass', 'fire', 'wind'],   // 最初の仲間（1人1魔法）
    maxLevel: 3,                              // 1つの方向の段数
    sideLimit: 2,                             // 1章で寄り道できる回数
    candidates: { key: 3, rich: 4, easy: 2, stage: 3 },   // 強化の候補の数（通常3・おいしい寄り道4・簡単な寄り道2）

    // 強化の方向（草は蔓と森。ほかは仮の名前）
    directions: {
      grass: [
        { id: 'vine', name: '蔓', note: '直撃の威力 +1／段', effect: { power: 1 } },
        { id: 'forest', name: '森', note: '燃え広がりが走る長さ +1／段', effect: { override: 'spread.maxLength', per: 1 } }
      ],
      fire: [
        { id: 'blaze', name: '火力（仮）', note: '直撃の威力 +1／段', effect: { power: 1 } },
        { id: 'ember', name: '延焼（仮）', note: '弱い炎のダメージ +2／段', effect: { override: 'fire.weakDamage', per: 2 } }
      ],
      wind: [
        { id: 'gust', name: '突風（仮）', note: '直撃の威力 +1／段', effect: { power: 1 } },
        { id: 'tail', name: '追い風（仮）', note: '風の長さ +1マス／段', effect: { override: 'breezeLength', per: 1 } }
      ],
      earth: [
        { id: 'rock', name: '岩（仮）', note: '直撃の威力 +1／段', effect: { power: 1 } },
        { id: 'range', name: '山脈（仮）', note: '桜吹雪の扇 +1段／段', effect: { override: 'eruption.depth', per: 1 } }
      ],
      water: [
        { id: 'jet', name: '水圧（仮）', note: '直撃の威力 +1／段', effect: { power: 1 } },
        { id: 'flood', name: '奔流（仮）', note: '水の池の長さ +1マス／段', effect: { override: 'waterLength', per: 1 } }
      ]
    },

    battles: {
      // ---- 1章 ----
      c1easyA: {
        name: '森の見張り', from: 'spread', mission: 'annihilate',
        desc: '火の敵が1体。森を並べて、敵ごと燃やす。',
        rows: ['......', '.....M', '......', '......', '......', '......'],
        slots: [[1, 5], [3, 5], [4, 5]],
        enemies: [['fire', 2, 0]],
        recommend: ['grass', 'wind']
      },
      c1easyB: {
        name: '敵の火を借りる', from: 'useEnemyFire', mission: 'annihilate',
        desc: '火の敵が2体。1体は森の上で構える。敵の火の予告先に風を吹かせておくと…',
        rows: ['......', '......', '..F...', '..F...', '......', '......'],
        slots: [[0, 5], [3, 5], [5, 5]],
        enemies: [['fire', 3, 0], ['fire', 2, 1]],
        recommend: ['wind']
      },
      c1rich: {
        name: '二体の火の敵', from: 'fireEnemy', mission: 'annihilate',
        desc: '火の敵が2体。森が少しある。敵の火を利用するか、消すか。',
        rows: ['......', '......', '.F..F.', '.FF.F.', '......', '......'],
        slots: [[0, 5], [2, 5], [3, 5]],
        enemies: [['fire', 1, 0], ['fire', 4, 0]],
        recommend: ['fire', 'wind']
      },
      c1key: {
        name: '炎の列を越えて', from: 'trap', mission: 'annihilate',
        desc: '土の敵が2体。1体は炎の列を踏み越えて来る。もう1体は炎が燃え尽きると出てくる。',
        rows: ['......', '......', 'XXXXXX', '......', '.FFFF.', '......'],
        slots: [[0, 5], [2, 5], [5, 5]],
        enemies: [['earth', 1, 1, { avoid: 'wall' }], ['earth', 4, 1, { avoid: 'danger' }]],
        recommend: ['grass', 'wind']
      },
      // ---- 2章 ----
      c2easyA: {
        name: '雷の敵', from: 'enemyThunder', mission: 'annihilate', enemyOnly: ['thunder'],
        desc: '雷の敵が2体（雷は敵だけの魔法）。雷は高い所か水に落ちる。',
        rows: ['......', '......', '......', '......', '......', '......'],
        slots: [[1, 5], [3, 5], [5, 5]],
        enemies: [['thunder', 1, 0], ['thunder', 4, 0]],
        recommend: ['water', 'earth']
      },
      c2easyB: {
        name: '山に咲く', from: 'sakuraGrass', mission: 'annihilate',
        desc: '火の敵が1体。山に草を植えると桜が咲き、風で桜吹雪。',
        rows: ['......', '.F..F.', '......', '......', '......', '......'],
        slots: [[1, 5], [3, 5], [4, 5]],
        enemies: [['fire', 2, 0]],
        recommend: ['earth', 'grass']
      },
      c2rich: {
        name: '村を守る', from: 'mDefense', mission: 'defense',
        desc: '防衛。下の段の村2つを、5ターン目の終わりまで守る（敵の全滅でも勝ち）。村が1つでも壊れたら負け。',
        rows: ['.......', '.......', '..F.F..', '..F.F..', '.......', '.......', '.......'],
        slots: [[2, 6], [3, 6], [4, 6]],
        enemies: [['fire', 1, 0, { aim: 'target' }], ['fire', 5, 0, { aim: 'count' }]],
        villages: [[1, 6], [5, 6]],
        recommend: ['earth', 'fire']
      },
      c2key: {
        name: '山の主', from: null, mission: 'annihilate', boss: true,
        desc: 'ボス。HP40 の火の敵と、手下の火の敵が1体。決め手1発（20）では倒れない。',
        rows: ['.......', '.......', '..F.F..', '.......', '.......', '.......', '.......'],
        slots: [[1, 6], [3, 6], [5, 6]],
        enemies: [['fire', 3, 0, { aim: 'near' }], ['fire', 0, 1]],
        enemyHp: { 0: 40 },
        recommend: ['earth', 'wind']
      }
    },

    // クエスト制: 章ごとのボード（キー1・おいしい寄り道1・簡単な寄り道2）。報酬の新しい魔法は受ける前から見える
    quest: {
      chapters: [
        { name: '1章 森の村', key: 'c1key', sides: [
          { battle: 'c1rich', type: 'rich' },
          { battle: 'c1easyA', type: 'easy', magic: 'earth' },
          { battle: 'c1easyB', type: 'easy' }
        ] },
        { name: '2章 山の砦', key: 'c2key', sides: [
          { battle: 'c2rich', type: 'rich', magic: 'water' },
          { battle: 'c2easyA', type: 'easy' },
          { battle: 'c2easyB', type: 'easy' }
        ] }
      ]
    },

    // ステージ制: 決まった順の6つ（クエスト制で寄り道を上限までやったときの戦闘数と同じ）。新しい魔法が手に入るステージは道に出す
    stages: [
      { battle: 'c1easyA', magic: 'earth' },
      { battle: 'c1rich' },
      { battle: 'c1key' },
      { battle: 'c2easyA' },
      { battle: 'c2rich', magic: 'water' },
      { battle: 'c2key' }
    ]
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RUN_DATA;
  else root.RUN_DATA = RUN_DATA;
})(this);
