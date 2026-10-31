/*
 * demos.js — 再生して見せる手順（スーパープレイ）
 * ブラウザでは グローバル変数 DEMOS、node では module.exports で読める。
 * turns: ターンごとの味方の行動。{ id, to: [x,y], dir, shoot }（shoot 省略で撃つ）
 */
(function (root) {
  var DEMOS = [
    {
      id: 'mDefense',
      name: '【お題】防衛: 村の前に壁を立てて5ターンしのぐ',
      preset: 'mDefense',
      alliesLeft: 2,
      desc: '探索で見つけた手順。土で村のまわりに山を盛って、敵の立ち位置をなくす。草の森を火で燃やすと、敵は自分が焼ける炎の上には立たないので、燃える森が壁になる。燃えた所に土をかぶせると、火が消えて山（壁）になる。敵は1体も倒さずに勝つ。',
      turns: [
        [{ id: 'P2', to: [3, 4], dir: 'left' }, { id: 'P1', to: [2, 4], dir: 'right' }, { id: 'P3', to: [4, 6], dir: 'up' }],
        [{ id: 'P1', to: [2, 6], dir: 'up' }, { id: 'P2', to: [2, 5], dir: 'right' }, { id: 'P3', to: [4, 6], dir: 'up' }],
        [{ id: 'P2', to: [2, 4], dir: 'right' }, { id: 'P1', to: [2, 6], dir: 'down' }, { id: 'P3', to: [4, 6], dir: 'up' }],
        [{ id: 'P2', to: [3, 5], dir: 'right' }, { id: 'P1', to: [2, 6], dir: 'up' }, { id: 'P3', to: [4, 6], dir: 'up' }],
        [{ id: 'P1', to: [2, 6], dir: 'up' }, { id: 'P2', to: [3, 5], dir: 'up' }, { id: 'P3', to: [4, 6], dir: 'up' }]
      ]
    },
    {
      id: 'mEscort',
      name: '【お題】護衛: 風で川を運んで、トロッコの道を作る',
      preset: 'mEscort',
      desc: '探索で見つけた手順（10/17「水だけなら水たまり」に合わせて探し直した。幅10）。風で川を吹くと、川の水が運ばれて水たまり（通れる）になり、トロッコの新しい渡り口ができる。水たまりに水をかけて川に戻して壁にし、土で山を盛ってトロッコの道を守る。',
      turns: [
        [{ id: 'P3', to: [3, 4], dir: 'down' }, { id: 'P2', to: [2, 5], dir: 'right' }, { id: 'P1', to: [0, 6], dir: 'up' }],
        [{ id: 'P2', to: [2, 5], dir: 'right' }, { id: 'P1', to: [1, 5], dir: 'up' }, { id: 'P3', to: [3, 4], dir: 'up' }],
        [{ id: 'P3', to: [2, 4], dir: 'up' }, { id: 'P1', to: [1, 4], dir: 'right' }, { id: 'P2', to: [2, 5], dir: 'up' }],
        [{ id: 'P1', to: [1, 5], dir: 'up' }, { id: 'P3', to: [1, 4], dir: 'right' }, { id: 'P2', to: [2, 5], dir: 'up' }],
        [{ id: 'P1', to: [1, 5], dir: 'up' }, { id: 'P2', to: [2, 5], dir: 'up' }, { id: 'P3', to: [1, 4], dir: 'up' }],
        [{ id: 'P1', to: [1, 5], dir: 'up' }, { id: 'P2', to: [2, 5], dir: 'up' }, { id: 'P3', to: [1, 4], dir: 'up' }]
      ]
    },
    {
      id: 'mRetrieve',
      name: '【お題】奪取: 燃え広がりの跡で追っ手を足止めして持ち帰る',
      preset: 'mRetrieve',
      desc: '探索で見つけた手順。火と風の燃え広がりで森ごと敵Bを倒す。燃え広がりの跡の炎が残っている間、敵Aは炎の上に立たないので近づけない。火の味方が宝を持ち（撃てなくなる）、炎の向こうを回って帰り口へ。',
      turns: [
        [{ id: 'P2', to: [3, 4], dir: 'right' }, { id: 'P3', to: [4, 6], dir: 'up' }, { id: 'P1', to: [1, 5], dir: 'up' }],
        [{ id: 'P2', to: [3, 3], dir: 'right' }, { id: 'P3', to: [4, 5], dir: 'up' }, { id: 'P1', to: [3, 5], dir: 'up' }],
        [{ id: 'P2', to: [3, 1], dir: 'right' }, { id: 'P3', to: [4, 3], dir: 'up' }, { id: 'P1', to: [3, 5], dir: 'up' }],
        [{ id: 'P2', to: [2, 0], dir: 'up' }, { id: 'P3', to: [4, 1], dir: 'left' }, { id: 'P1', to: [2, 4], dir: 'up' }],
        [{ id: 'P3', to: [4, 1], dir: 'left' }, { id: 'P2', to: [3, 0], dir: 'up', shoot: false }, { id: 'P1', to: [2, 4], dir: 'up' }],
        [{ id: 'P3', to: [3, 1], dir: 'left' }, { id: 'P2', to: [4, 1], dir: 'up', shoot: false }, { id: 'P1', to: [1, 4], dir: 'up' }],
        [{ id: 'P2', to: [5, 2], dir: 'up', shoot: false }, { id: 'P3', to: [5, 1], dir: 'down' }, { id: 'P1', to: [0, 3], dir: 'up' }],
        [{ id: 'P2', to: [5, 5], dir: 'up', shoot: false }, { id: 'P1', to: [1, 4], dir: 'up' }, { id: 'P3', to: [5, 1], dir: 'up' }],
        [{ id: 'P2', to: [5, 6], dir: 'up', shoot: false }]
      ]
    },
    {
      id: 'spread2',
      name: '1ターンで勝つ（敵の足元にも森を植えて、森ごと燃やす）',
      preset: 'spread',
      desc: '草を敵に当てると、直撃に加えて敵の足元にも森ができる（人の足元にも自然ができる）。火で手前に小さな炎、風を当てると燃え広がりが森を走り、燃えた森の上の敵に強い炎（20）。森がないと弱い炎（5＋火傷）しか入らない。（10/13 まで: 足元には森ができなかったので、2ターンかけて敵を森へ誘っていた）',
      turns: [
        [
          { id: 'P1', to: [2, 5], dir: 'up' },
          { id: 'P2', to: [2, 4], dir: 'right' },
          { id: 'P3', to: [3, 5], dir: 'up' }
        ]
      ]
    },
    {
      id: 'showForest',
      name: '見せ場: 森を育てて、一気に燃やす（敵は何もしない）',
      preset: 'spread',
      enemyActs: false,
      goal: 'show',
      desc: '倒すのが目的ではなく「大きくなる → 一気に変わる」を見るデモ。3ターンかけて草で森を広げ、4ターン目に火で森に火を点け、横から風を当てる。つながった森が一気に燃える。',
      turns: [
        [
          { id: 'P1', to: [1, 3], dir: 'right' },
          { id: 'P2', to: [3, 5], dir: 'up', shoot: false },
          { id: 'P3', to: [4, 5], dir: 'up', shoot: false }
        ],
        [
          { id: 'P1', to: [1, 2], dir: 'down' },
          { id: 'P2', to: [3, 5], dir: 'up', shoot: false },
          { id: 'P3', to: [4, 5], dir: 'up', shoot: false }
        ],
        [
          { id: 'P1', to: [1, 0], dir: 'down' },
          { id: 'P2', to: [3, 5], dir: 'up', shoot: false },
          { id: 'P3', to: [4, 5], dir: 'up', shoot: false }
        ],
        [
          { id: 'P1', to: [0, 1], dir: 'right' },
          { id: 'P2', to: [3, 5], dir: 'up' },
          { id: 'P3', to: [5, 4], dir: 'left' }
        ]
      ]
    },
    {
      id: 'showWater',
      name: '【新案】見せ場: 山から川を3本流して、雷を一気に走らせる（敵は何もしない）',
      preset: 'source',
      enemyActs: false,
      goal: 'show',
      desc: '【新案】倒すのが目的ではなく「大きくなる → 一気に変わる」を見るデモ。土で山を盛り、水を当てて川を何本も流し、最後に雷を落とす。つながった川9マスに雷が走る（ただし地形は変わらない）。',
      turns: [
        [
          { id: 'P1', to: [1, 5], dir: 'right' },
          { id: 'P2', to: [3, 5], dir: 'up' },
          { id: 'P3', to: [4, 5], dir: 'up' }
        ],
        [
          { id: 'P1', to: [1, 5], dir: 'up' },
          { id: 'P3', to: [5, 5], dir: 'up' },
          { id: 'P2', to: [4, 5], dir: 'up' }
        ],
        [
          { id: 'P1', to: [1, 5], dir: 'up' },
          { id: 'P2', to: [2, 5], dir: 'up' },
          { id: 'P3', to: [4, 5], dir: 'up' }
        ],
        [
          { id: 'P1', to: [0, 5], dir: 'right' },
          { id: 'P2', to: [1, 5], dir: 'up' },
          { id: 'P3', to: [2, 5], dir: 'up' }
        ]
      ]
    },
    {
      id: 'showIce',
      name: '【新案】見せ場: 山から川を流して、一気に凍らせる（敵は何もしない）',
      preset: 'ice',
      enemyActs: false,
      goal: 'show',
      desc: '【新案】倒すのが目的ではなく「大きくなる → 一気に変わる」を見るデモ。3ターンかけて山を盛って川を2本流し、池でつなぐ。4ターン目に氷の冷気が触れると、つながった川12マスが一気に凍り、川の壁が歩ける道に変わる。',
      turns: [
        [
          { id: 'P1', to: [1, 5], dir: 'right' },
          { id: 'P2', to: [3, 5], dir: 'up' },
          { id: 'P3', to: [4, 5], dir: 'up' }
        ],
        [
          { id: 'P1', to: [1, 5], dir: 'up' },
          { id: 'P3', to: [5, 5], dir: 'up' },
          { id: 'P2', to: [4, 5], dir: 'up' }
        ],
        [
          { id: 'P1', to: [1, 5], dir: 'up' },
          { id: 'P2', to: [2, 5], dir: 'up' },
          { id: 'P3', to: [5, 5], dir: 'up' }
        ],
        [
          { id: 'P2', to: [4, 5], dir: 'left' },
          { id: 'P3', to: [5, 3], dir: 'left' },
          { id: 'P1', to: [2, 4], dir: 'up' }
        ]
      ]
    },
    {
      id: 'showFunka',
      name: '【新案】見せ場: 山脈を盛って、火で火山に → 風で桜吹雪（8×8・敵は何もしない）',
      preset: 'funka',
      enemyActs: false,
      goal: 'show',
      desc: '【新案】1ターン目に土で山を3つ盛る。2ターン目、土は離れ、火がすぐ隣の山に火を点ける。山脈ごと火山になる。最後に風が火山に当たり、桜吹雪。',
      turns: [
        [
          { id: 'P1', to: [2, 7], dir: 'up' },
          { id: 'P2', to: [5, 5], dir: 'left', shoot: false },
          { id: 'P3', to: [1, 0], dir: 'down', shoot: false }
        ],
        [
          { id: 'P1', to: [3, 6], dir: 'up', shoot: false },
          { id: 'P2', to: [3, 5], dir: 'left' },
          { id: 'P3', to: [1, 2], dir: 'down' }
        ]
      ]
    },
    {
      id: 'showFireTornado',
      name: '【新案・元の作り方】見せ場: 風を2回でつむじ風から竜巻に → 火を入れて火炎竜巻（敵は何もしない）',
      preset: 'storm',
      alliesLeft: 2,
      windMode: 'line',
      recipe: 'windWind',
      enemyActs: false,
      goal: 'show',
      desc: '【新案】1ターン目、風を撃つと吹き抜けた先につむじ風が残る。2ターン目にもう一度風を当てると2×2の竜巻に育ち、火を入れると竜巻とまわりが一気に燃え上がる。',
      turns: [
        [
          { id: 'P1', to: [2, 5], dir: 'up' },
          { id: 'P2', to: [4, 3], dir: 'up', shoot: false },
          { id: 'P3', to: [1, 4], dir: 'up', shoot: false }
        ],
        [
          { id: 'P1', to: [2, 5], dir: 'up' },
          { id: 'P2', to: [4, 1], dir: 'left' },
          { id: 'P3', to: [1, 4], dir: 'up', shoot: false }
        ]
      ]
    },
    {
      id: 'showSentakuki',
      name: '【新案・元の作り方】見せ場: つむじ風から竜巻に → 水を入れてセンタクキ（敵は何もしない）',
      preset: 'storm',
      windMode: 'line',
      recipe: 'windWind',
      enemyActs: false,
      goal: 'show',
      desc: '【新案】風を2回当てて2×2の竜巻を立て、水を入れる。竜巻のまわりがぐるっと回って敵が運ばれ、竜巻は跡形もなく消える。',
      turns: [
        [
          { id: 'P1', to: [2, 5], dir: 'up' },
          { id: 'P2', to: [4, 5], dir: 'up', shoot: false },
          { id: 'P3', to: [1, 4], dir: 'up', shoot: false }
        ],
        [
          { id: 'P1', to: [2, 5], dir: 'up' },
          { id: 'P3', to: [2, 3], dir: 'up' },
          { id: 'P2', to: [4, 5], dir: 'up', shoot: false }
        ]
      ]
    }
    ,
    {
      id: 'showSentakukiWindWater',
      name: '【新案】見せ場: 風でつむじ風 → 水で竜巻 → 火でセンタクキ（1ターン・敵は何もしない）',
      preset: 'storm',
      windMode: 'line',
      recipe: 'windWater',
      enemyActs: false,
      goal: 'show',
      desc: '【新案】風が吹き抜けた先につむじ風。そこへ水を流すと、水を巻き上げて2×2の竜巻になる。最後に火を入れると、まわりがぐるっと回るセンタクキ。3人で1ターン。',
      turns: [
        [
          { id: 'P1', to: [0, 5], dir: 'right' },
          { id: 'P3', to: [2, 5], dir: 'right' },
          { id: 'P2', to: [5, 5], dir: 'up' }
        ]
      ]
    }
    ,
    {
      id: 'showSenpu',
      name: '【新案・試し】見せ場: 旋風でつむじ風を巻く → 水で竜巻 → 火でセンタクキ（1ターン・敵は何もしない）',
      preset: 'senpu',
      recipe: 'senpu',
      enemyActs: false,
      goal: 'show',
      desc: '【新案・試し】旋風が正面の2×2につむじ風を巻く。横から水を流しこむと、つむじ風がまるごと竜巻になる。最後に火を入れると、まわりがぐるっと回るセンタクキ。竜巻は跡形もなく消える。',
      turns: [
        [
          { id: 'P1', to: [3, 4], dir: 'up' },
          { id: 'P3', to: [1, 2], dir: 'right' },
          { id: 'P2', to: [4, 3], dir: 'up' }
        ]
      ]
    }
    ,
    {
      id: 'showFireWhirl',
      name: '【新案・試し】見せ場: 風を吹かせて敵を風の中へ → 横から火で火の渦（敵は何もしない）',
      preset: 'breeze',
      windMode: 'breeze',
      enemyActs: false,
      goal: 'show',
      desc: '【新案・試し】風（2マス）で敵を1マス運ぶ。運んだ先も風の中。そこへ横から火を入れると、吹いている風がまるごと火の渦になって燃え上がる。',
      turns: [
        [
          { id: 'P1', to: [3, 4], dir: 'up' },
          { id: 'P2', to: [4, 3], dir: 'left' },
          { id: 'P3', to: [1, 4], dir: 'up', shoot: false }
        ]
      ]
    }
    ,
    {
      id: 'showFireWhirlSentakuki',
      name: '【新案・試し】見せ場: 風 → 火で火の渦 → 水でセンタクキ（1ターン・味方2人が巻き込まれる）',
      preset: 'breeze',
      windMode: 'breeze',
      enemyActs: false,
      goal: 'show',
      alliesLeft: 1,
      desc: '【新案・試し】風で2マスの風を吹かせ、火で2×2の火の渦。最後に水を入れるとセンタクキで、まわりがぐるっと回り、渦は跡形もなく消える。風は2マス・火は1マスなので、風と火の味方は渦のすぐ隣に立っていて、センタクキの輪に巻き込まれる。',
      turns: [
        [
          { id: 'P1', to: [2, 4], dir: 'right' },
          { id: 'P2', to: [4, 5], dir: 'up' },
          { id: 'P3', to: [1, 3], dir: 'right' }
        ]
      ]
    }
    ,
    {
      id: 'showSakura',
      name: '【新案】見せ場: 山を2回盛って火山に → 風で桜吹雪（6×6・2ターン・敵は何もしない）',
      preset: 'sakura',
      enemyActs: false,
      desc: '【新案】土で山を2回盛って、6つつながった山脈にする。火で山脈ごと火山にして、最後に風を火山に当てると、火の粉が扇形（1・3・5マス）に舞い散る桜吹雪。',
      turns: [
        [
          { id: 'P1', to: [1, 3], dir: 'right' },
          { id: 'P2', to: [3, 5], dir: 'up', shoot: false },
          { id: 'P3', to: [4, 5], dir: 'up', shoot: false }
        ],
        [
          { id: 'P1', to: [1, 3], dir: 'right', shoot: false },
          { id: 'P2', to: [3, 4], dir: 'up' },
          { id: 'P3', to: [3, 5], dir: 'up' }
        ]
      ]
    }
    ,
    {
      id: 'showSakuraGrass',
      name: '【新案・試し】見せ場: 山を盛って草で桜を咲かせ → 風で桜吹雪（6×6・2ターン・敵は何もしない）',
      preset: 'sakuraGrass',
      enemyActs: false,
      goal: 'show',
      desc: '【新案・試し】土で山を2回盛って山脈にする。草を山に植えると桜が咲く。最後に風を桜に当てると、花びらが扇形（1・3・5マス）に舞い散る桜吹雪。花びらはターン終了で散る。',
      turns: [
        [
          { id: 'P1', to: [1, 3], dir: 'right' },
          { id: 'P2', to: [3, 5], dir: 'up', shoot: false },
          { id: 'P3', to: [4, 5], dir: 'up', shoot: false }
        ],
        [
          { id: 'P1', to: [0, 3], dir: 'right' },
          { id: 'P2', to: [3, 5], dir: 'up' },
          { id: 'P3', to: [3, 4], dir: 'up' }
        ]
      ]
    }
    ,
    {
      id: 'showHaunted',
      name: '【新案・試し】見せ場: 草で森 → 闇で死の森 → 火でオバケヤシキ（2ターン・火の味方が巻き込まれる）',
      preset: 'dark',
      alliesLeft: 2,
      enemyActs: false,
      goal: 'show',
      desc: '【新案・試し】草で森を4マス植え、闇が森の命を吸って死の森にする（闇はまわりの者を引き寄せる）。次のターン、草と闇は離れ、火を点けると、火が当たった死の森の1マスがオバケヤシキ。まわり2マス以内の者を引き寄せて、中と隣の全員に20。火は1マスなので、火を点けた味方も隣にいて巻き込まれる。',
      turns: [
        [
          { id: 'P1', to: [1, 5], dir: 'up' },
          { id: 'P2', to: [2, 3], dir: 'left' },
          { id: 'P3', to: [3, 4], dir: 'up', shoot: false }
        ],
        [
          { id: 'P1', to: [1, 4], dir: 'up', shoot: false },
          { id: 'P2', to: [2, 4], dir: 'left', shoot: false },
          { id: 'P3', to: [2, 3], dir: 'up' }
        ]
      ]
    }
  ];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DEMOS;
  } else {
    root.DEMOS = DEMOS;
  }
})(this);
