/*
 * texts.js — 画面に出る文章（IMPROVE_simul）
 *   チュートリアルとステージの名前・目標・シナリオの文・ヒント・クリアと負けの文、決め手の表示名、
 *   「合体！」などの表示、展示で遊ぶ人が読む操作の案内をここにまとめる。
 *   画面の「文章」パネルで書き換えて「保存」すると、このファイルがまるごと書き直される（手で書き換えてもよい）。
 *
 *   stages.<ステージ>.scenes: きっかけごとの文の並び。キーは
 *     start（ステージの始め）／turn:N（Nターン目の始め）／stance・stance:<魔法>（構えたとき。1人ずつでは撃ったとき）／
 *     beforeFire（発動の前）／finisher・finisher:<決め手の名前>（決め手が起きたとき）／enemyIntent（敵が予告したとき）／
 *     win（クリア）／lose（負け）／retry（やり直し）
 *   1行は { who: 話す人（空でもよい）, text: 文, mode: "both" 両方 | "simul" 一斉だけ | "single" 1人ずつだけ }
 *   決め手の内部の名前（ルールが使うキー）は変えない。finishers に持つのは表示名だけ。
 *   savedAt: 保存した日時（画面に残っている書き換えより新しいかを見る）。手で書き換えたら、ここも今の日時にする
 */
(function (root) {
  var TEXTS = {
    "savedAt": "2026-10-16 18:00:00",
    "ui": {
      "turnMode": "ターンの形",
      "turnModeSimul": "一斉に発動",
      "turnModeSingle": "1人ずつ",
      "stance": "構える",
      "shoot": "撃つ",
      "stayStance": "その場で構える",
      "stayShoot": "その場で撃つ",
      "wait": "待機",
      "fire": "発動",
      "endTurn": "ターン終了",
      "combo": "合体！",
      "chain": " → ",
      "order": "発動の順番",
      "orderLast": "最後（動かせない）",
      "pickAlly": "味方をクリック（または 1〜3 キー）で選ぶ",
      "guideSingle": "緑のマスで移動先 → 矢印で向き → 「撃つ」（Enter）。◆ ＝ そこから決め手が起きる",
      "guideSimul": "緑のマスで移動先 → 矢印で向き → 「構える」（Enter）。◆ ＝ その構えで決め手が起きる",
      "guideRestance": "構え直し: 向きだけ変えられる（移動は戻らない）。「待機」で構えをやめる",
      "readyToFire": "全員構えた。順番を確かめて「発動」（T）",
      "notReady": "まだ構えていない味方がいます（構えるか「待機」）",
      "actIdleSimul": "味方を選ぶと、ここで向きを選んで構えられます",
      "actIdleSingle": "味方を選ぶと、ここで向きを選んで撃てます",
      "dialogNext": "クリックかスペースで次へ",
      "goal": "目標",
      "retry": "やり直す",
      "howtoTitle": "遊び方",
      "howto": [
        {
          "who": "",
          "text": "魔法を撃つとマスが自然になる。自然に別の魔法を重ねると変わり、最後は壊して敵ごと吹き飛ばす（決め手）。",
          "mode": "both"
        },
        {
          "who": "",
          "text": "味方を選ぶ → 緑のマスで移動先 → 矢印で向き → 「構える」。3人構えたら「発動」で、構えた順に一斉に起きる。",
          "mode": "simul"
        },
        {
          "who": "",
          "text": "味方を選ぶ → 緑のマスで移動先 → 矢印で向き → 「撃つ」。着弾点は立ち位置と向きで決まる。",
          "mode": "single"
        },
        {
          "who": "",
          "text": "青は味方の構え（数字が発動の順番）、紫は敵の予告。",
          "mode": "both"
        },
        {
          "who": "",
          "text": "勝ち方は画面の上（お題）。迷ったら「スーパープレイを見る」。",
          "mode": "both"
        },
        {
          "who": "",
          "text": "上の調整で数値をいじれる。変えたら「設定を書き出す」で送ってね。",
          "mode": "both"
        }
      ],
      "howtoStart": "はじめる",
      "exFire": "魔法の出し方",
      "exFireStep": "ターンの終わりに1段ずつ",
      "exFireChain": "ターンの終わりにつながる",
      "exFireInstant": "撃った瞬間に発動",
      "exFireNote": "切り替えると頭からやり直す",
      "exMission": "ミッション",
      "exMissionDone": "ミッション達成！",
      "exPreviewNote": "盤面の点線が、魔法の届く形。何が起きるかは、撃ってのお楽しみ"
    },
    "finishers": {
      "燃え広がり": "燃え広がり",
      "桜吹雪": "桜吹雪",
      "感電": "感電",
      "凍結": "凍結",
      "噴火": "噴火",
      "火の渦": "火の渦",
      "センタクキ": "センタクキ",
      "火炎竜巻": "火炎竜巻",
      "オバケヤシキ": "オバケヤシキ",
      "火山": "火山"
    },
    "stages": {
      "tut1": {
        "name": "① 重ねる",
        "goal": "仲間の風に火を重ねて、敵を倒す【仮】",
        "hint": {
          "simul": "",
          "single": ""
        },
        "win": "",
        "lose": "",
        "scenes": {
          "start": [
            {
              "who": "",
              "text": "（ここに文章）",
              "mode": "both"
            },
            {
              "who": "",
              "text": "仲間の風が来るマスに火を構えて、「発動」を押そう【仮】",
              "mode": "simul"
            },
            {
              "who": "",
              "text": "仲間の風が来るマスに、火を撃とう【仮】",
              "mode": "single"
            }
          ],
          "win": [
            {
              "who": "",
              "text": "（ここに文章）",
              "mode": "both"
            }
          ],
          "lose": [
            {
              "who": "",
              "text": "（ここに文章）",
              "mode": "both"
            }
          ],
          "retry": [
            {
              "who": "",
              "text": "（ここに文章）",
              "mode": "both"
            }
          ]
        }
      },
      "tut2": {
        "name": "② 2人で守る",
        "goal": "山と水で道をふさいで、村を守る【仮】",
        "hint": {
          "simul": "順番を入れ替えると…？【仮】",
          "single": "山に向かって水を撃つと…？"
        },
        "win": "",
        "lose": "",
        "scenes": {
          "start": [
            {
              "who": "",
              "text": "（ここに文章）",
              "mode": "both"
            },
            {
              "who": "",
              "text": "山と水を構えて、順番を決めてから「発動」を押そう【仮】",
              "mode": "simul"
            },
            {
              "who": "",
              "text": "山と水で、村への道をふさごう【仮】",
              "mode": "single"
            }
          ],
          "win": [
            {
              "who": "",
              "text": "（ここに文章）",
              "mode": "both"
            }
          ],
          "lose": [
            {
              "who": "",
              "text": "（ここに文章）",
              "mode": "both"
            }
          ],
          "retry": [
            {
              "who": "",
              "text": "（ここに文章）",
              "mode": "both"
            }
          ]
        }
      },
      "ex3": {
        "name": "③ 3人でつなぐ",
        "goal": "山 → 火山 → 桜吹雪。3人の魔法をつないで、ボスと取り巻きをまとめて吹き飛ばす【仮】",
        "hint": {
          "simul": "",
          "single": ""
        },
        "win": "",
        "lose": "",
        "missions": {
          "volcano": "火山を作る"
        },
        "scenes": {
          "start": [
            {
              "who": "",
              "text": "（ここに文章）",
              "mode": "both"
            },
            {
              "who": "",
              "text": "山でダイヤ型の山を作ろう。敵のいない所でいい【仮】",
              "mode": "both"
            }
          ],
          "hint:noMountain": [
            {
              "who": "",
              "text": "（ここに文章）",
              "mode": "both"
            },
            {
              "who": "",
              "text": "まずは山の魔法で、どこかに大きな山を作ってみよう【仮】",
              "mode": "both"
            }
          ],
          "mission": [
            {
              "who": "",
              "text": "（ここに文章）",
              "mode": "both"
            }
          ],
          "hint:noSakura": [
            {
              "who": "",
              "text": "（ここに文章）",
              "mode": "both"
            },
            {
              "who": "",
              "text": "火山に、風を当てたら…？【仮】",
              "mode": "both"
            }
          ],
          "finisher:桜吹雪": [
            {
              "who": "",
              "text": "（ここに文章）",
              "mode": "both"
            }
          ],
          "retry": [
            {
              "who": "",
              "text": "（ここに文章）",
              "mode": "both"
            },
            {
              "who": "",
              "text": "倒れても大丈夫。もう一度、頭から【仮】",
              "mode": "both"
            }
          ],
          "win": [
            {
              "who": "",
              "text": "（ここに文章）",
              "mode": "both"
            }
          ]
        }
      }
    },
    "run": {
      "again": "タイトルへ",
      "back": "戻る",
      "battlesLabel": "戦闘",
      "boss": "ボス",
      "brought": "連れていった",
      "challenge": "挑む",
      "choices": "択",
      "choose": "連れていく仲間を選ぶ",
      "clear": "1周クリア！",
      "close": "閉じる（いつもの画面へ）",
      "done": "クリア",
      "easy": "簡単な寄り道",
      "enemies": "敵",
      "fail": "1周が終わった",
      "failed": "失敗",
      "giveUp": "諦める",
      "giveUpConfirm": "この戦闘を諦めますか？（負けになる）",
      "go": "出発",
      "joined": "の仲間が加わる",
      "key": "キークエスト",
      "keyLast": "これを倒すと1周クリア",
      "keyNext": "クリアすると次の章へ",
      "level": "段",
      "locked": "寄り道の回数を使い切った",
      "mission": "お題",
      "newMagic": "新しい魔法",
      "noCandidate": "強化できる方向がもうない",
      "notOwned": "まだ持っていない",
      "notOwnedNote": "（色の薄い魔法は、まだ持っていない）",
      "party": "パーティ",
      "partyNote": "強化は「どの魔法の、どの方向の、何段目か」。効果は仮（直撃の威力など）。",
      "pickMode": "進行の形を選んで、1周を始める",
      "pickUpgrade": "強化を1つ選ぶ",
      "powerShort": "直撃",
      "quest": "クエスト制",
      "questNote": "拠点のボードから、次にやるクエストを自分で選ぶ。寄り道は章ごとに2回まで",
      "receive": "受け取る",
      "recommend": "おすすめ",
      "resLose": "負け",
      "resWin": "勝ち",
      "resume": "続きから",
      "reward": "報酬",
      "rich": "おいしい寄り道",
      "sidesLeft": "寄り道できる回数",
      "stage": "ステージ制",
      "stageLabel": "ステージ",
      "stageNote": "決まった順にステージを進む。分かれ道はない",
      "take": "受ける",
      "teamHint": "人。選んだ順に ①②③ の場所に立つ",
      "teamNote": "強化の候補は、連れていった仲間の魔法からしか出ない。",
      "title": "進行モック",
      "titleNote": "最初の仲間は草・火・風の3人。戦闘に勝つと、連れていった仲間の魔法から強化を1つ選ぶ。最後のボスを倒すとクリア。",
      "toBoard": "拠点へ戻る",
      "toResult": "1周の結果へ",
      "toReward": "報酬へ",
      "turnsTotal": "ターンの合計",
      "turnsUnit": "ターン",
      "upgradeLabel": "強化",
      "upgradePicks": "強化の候補",
      "win": "勝った！"
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TEXTS;
  else root.TEXTS = TEXTS;
})(this);
