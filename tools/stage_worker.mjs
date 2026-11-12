/*
 * tools/stage_worker.mjs — 共有の置き場所（IMPROVE_v3 段4。オーナー 10/30）
 *   Cloudflare（今の公開先。Workers の静的サイト）で動く小さなプログラム。/api/ だけを受け持ち、ほかは今までどおり公開したファイルを返す。
 *   置くもの（Workers KV。バインディングの名前は CAFILIA）:
 *     stages … みんなのステージ { 名前: { def, texts, at } }（盤面の定義と会話の文。at は共有した時刻）
 *     tutorials … チュートリアル { id: { def, texts, at } }（みんなのステージと同じ形。id は 'tut1' など。展示の並び・プレイ集の記録が指す名前で、変わらない。オーナー 11/12）
 *       はじめは置いていない（null）。開発モードの画面が、コードに入っている①②③を最初の中身として一度だけ置く（PUT /api/tutorials）。
 *       texts はそのステージの文の全部（名前・ヒント・scenes { 場面: 文の並び }…）。場面を足せば、シナリオも一緒に持てる
 *     order  … 一覧の順番 { tut: [id…], all: [名前…], at }（開発モードの一覧で、手で決めた順番。オーナー 11/12）。
 *       入っていないもの（新しいステージ）は画面が末尾に足す。もうないものが入っていても画面が飛ばす。まだ誰も並べていなければ null
 *     lineup … 展示の並び { start: [...], pick: [...], at }（中身は 'tut:tut1' か 'all:名前'）
 *     settings … 設定 { colors, tiles, magics, synergies, at }（画面の主な色と名前。game/settings.js。オーナー 11/03）
 *   ステージの背番号（def.uid。オーナー 11/10・11/12）: 見えない番号で、プレイ集の記録はこれでステージを指す（名前では指さない）。
 *     同じ名前で上書きしても・ゴミ箱から戻しても（「名前（2）」になっても）変わらない。
 *     背番号のない前からのステージには、最初に読んだとき（GET /api/all）に付ける（'n:' ＋ 名前）
 *     trash  … ゴミ箱 { 鍵: { name, def, texts, at, deletedAt } }（消したみんなのステージ。戻せる。オーナー 11/03。鍵はふつう名前、重なれば「名前（2）」）
 *     plays  … プレイ集の記録 { id: { id, name, stage: { kind, uid, name }, turns, at } }（チュートリアル・みんなのステージの分。game/plays.js。オーナー 11/10）
 *   API（ファイルから開いたページ（file://）からも使えるように、CORS は * にする。URL が合言葉の代わり）:
 *     GET    /api/all             … { stages, lineup, trash, settings, plays, tutorials, order }（tutorials・order はまだ置いていなければ null。trash・settings・plays があれば、ゴミ箱・設定・プレイ集のある置き場所。画面はそれで見分ける。settings はまだなければ null）
 *     PUT    /api/stages/<名前>    … 共有する（同じ名前は上書き。背番号は前のまま）。本文 { def, texts }。答えの uid が置いた背番号
 *     DELETE /api/stages/<名前>    … ゴミ箱へ移す（展示の並びに入っているものは移せない。ゴミ箱がいっぱいなら断る。11/03 から。前は完全に消した）
 *     POST   /api/trash/<鍵>/restore … ゴミ箱から戻す（同じ名前があれば「名前（2）」）。答えの name が戻した名前
 *     DELETE /api/trash/<鍵>       … ゴミ箱から完全に消す
 *     PUT    /api/tutorials       … チュートリアルの最初の中身を置く。本文 { tutorials: { id: { def, texts } } }。もう置いてあれば何も変えない（答えの seeded が false）。答えの tutorials が今の中身
 *     PUT    /api/tutorials/<id>  … チュートリアルを直す（上書き）・新しく足す（まだない id。オーナー 11/12）。本文 { def, texts }。最初の中身を置く前は足せない
 *     DELETE /api/tutorials/<id>  … チュートリアルを消す（元に戻せない。最後の1つは消せない。展示の並びに入っていても消せる。画面が先に確かめる）
 *     PUT    /api/order/<tut|all> … 一覧の順番を置く。本文 { order: [...] }（tut は id、all は名前）
 *     PUT    /api/lineup          … 展示の並びを変える。本文 { start, pick }
 *     PUT    /api/settings        … 設定を変える。本文 { colors, tiles, magics, synergies }（形を確かめてから置く）
 *     PUT    /api/plays/<id>      … プレイ集の記録を置く（同じ id は上書き。名前を変えるときも）。本文は記録（形を確かめてから置く）
 *     DELETE /api/plays/<id>      … プレイ集の記録を消す（元に戻せない）
 *   KV は書いてから、ほかの場所で見えるまで1分ほどかかることがある（Cloudflare の決まり）。
 *   tools/publish.js が publish/worker.mjs に写す。手元の確かめでは tests/serve.js がこのファイルを読み、同じように答える。
 *   Cloudflare で動くので ES Modules で書く（モックの画面のファイルとは別。画面は今までどおり ES Modules を使わない）。
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const MAX_BODY = 200000;    // 1回に受け取る大きさ（文字）
const MAX_NAME = 40;        // ステージの名前の長さ（エディットの名前の欄と同じ）
const MAX_STAGES = 500;     // みんなのステージの数
const MAX_LIST = 50;        // 展示の並びの1段に入る数
const MAX_TRASH = 500;      // ゴミ箱に入る数（いっぱいなら、勝手に古いものを消さずに断る）
const MAX_TUTS = 50;        // チュートリアルの数
const MAX_PLAYS = 500;      // プレイ集の記録の数

function json(v, status) {
  return new Response(JSON.stringify(v), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CORS) });
}
function fail(error, status) { return json({ ok: false, error: error }, status || 400); }
async function body(req) {
  const t = await req.text();
  if (t.length > MAX_BODY) throw new Error('大きすぎる');
  return JSON.parse(t);
}
function okName(n) { return typeof n === 'string' && n.trim() === n && n.length > 0 && n.length <= MAX_NAME; }
function okTutId(n) { return typeof n === 'string' && /^[a-z0-9]{1,20}$/.test(n); }
function okStage(b) { return !!b && typeof b.def === 'object' && !!b.def && Array.isArray(b.def.rows); }
function okRef(r) { return typeof r === 'string' && /^(tut|all):./.test(r) && r.length <= MAX_NAME + 4; }
// 重ならない名前（「名前（2）」）。名前の長さに収まるように、もとの名前を詰める
function freeName(name, taken) {
  if (!taken[name]) return name;
  for (let i = 2; ; i++) {
    const tail = '（' + i + '）', n = name.slice(0, MAX_NAME - tail.length) + tail;
    if (!taken[n]) return n;
  }
}
// 設定の形（game/settings.js の clean と同じ決まり。こちらは正しくなければ断る）
function okSettings(b) {
  const isObj = function (o) { return !!o && typeof o === 'object' && !Array.isArray(o); };
  const okStr = function (v, max) { return typeof v === 'string' && v.length <= max; };
  if (!isObj(b)) return false;
  const parts = ['colors', 'tiles', 'magics', 'synergies'];
  if (Object.keys(b).some(function (k) { return parts.indexOf(k) < 0; })) return false;
  const c = b.colors || {}, t = b.tiles || {}, m = b.magics || {}, s = b.synergies || {};
  if (![c, t, m, s].every(isObj)) return false;
  if (Object.keys(c).length + Object.keys(t).length + Object.keys(m).length + Object.keys(s).length > 300) return false;
  return Object.keys(c).every(function (k) { return /^--[a-z-]{1,30}$/.test(k) && /^#[0-9a-f]{6}$/i.test(c[k]); }) &&
    Object.keys(t).every(function (k) { return /^[a-z]{1,20}$/.test(k) && isObj(t[k]) && Object.keys(t[k]).every(function (f) { return (f === 'name' && okStr(t[k][f], 12)) || (f === 'label' && okStr(t[k][f], 3)); }); }) &&
    Object.keys(m).every(function (k) { return /^[a-z]{1,20}$/.test(k) && okStr(m[k], 12); }) &&
    Object.keys(s).every(function (k) { return k.length >= 1 && k.length <= 20 && okStr(s[k], 12); });
}
// プレイ集の記録の形（game/plays.js の valid と同じ決まり。正しくなければ断る）
const OPS = { move: 4, act: 4, order: 3, fire: 1, seal: 1 };
function okOp(op) {
  if (!Array.isArray(op) || OPS[op[0]] !== op.length) return false;
  const id = function (v) { return typeof v === 'string' && v.length > 0 && v.length <= 20; };
  if (op[0] === 'move') return id(op[1]) && Number.isInteger(op[2]) && Number.isInteger(op[3]);
  if (op[0] === 'act') return id(op[1]) && ['up', 'right', 'down', 'left'].indexOf(op[2]) >= 0 && (op[3] === 0 || op[3] === 1);
  if (op[0] === 'order') return id(op[1]) && (op[2] === -1 || op[2] === 1);
  return true;
}
function okPlay(b, id) {
  const st = b && b.stage;
  return !!b && typeof b === 'object' && b.id === id && typeof b.name === 'string' && b.name.length > 0 && b.name.length <= MAX_NAME &&
    !!st && typeof st === 'object' && (st.kind === 'tut' || st.kind === 'all') && typeof st.uid === 'string' && st.uid.length > 0 && st.uid.length <= 80 &&
    (st.name === undefined || (typeof st.name === 'string' && st.name.length <= MAX_NAME + 20)) &&
    Array.isArray(b.turns) && b.turns.length > 0 && b.turns.length <= 100 &&
    b.turns.every(function (t) { return Array.isArray(t) && t.length <= 200 && t.every(okOp); });
}
// ステージの背番号（def.uid）。okUid: 使える形か。stampUids: 背番号のないステージに付ける（付けたら true）
function okUid(u) { return typeof u === 'string' && u.length > 0 && u.length <= 80; }
function newUid() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function stampUids(map, nameOf) {
  let changed = false;
  Object.keys(map).forEach(function (k) {
    const d = map[k] && map[k].def;
    if (d && typeof d === 'object' && !okUid(d.uid)) { d.uid = 'n:' + nameOf(k, map[k]); changed = true; }
  });
  return changed;
}
function inLineup(lineup, name) { const r = 'all:' + name; return !!lineup && ['start', 'pick'].some(function (k) { return (lineup[k] || []).indexOf(r) >= 0; }); }

// /api/ の1件に答える。kv は Workers KV（get(key, 'json')・put(key, text)）
export async function handleApi(req, kv) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!kv) return fail('共有の置き場所がまだありません（Cloudflare の KV をつないでください）', 503);
  const path = new URL(req.url).pathname.replace(/^\/api\//, '');
  try {
    if (req.method === 'GET' && path === 'all') {
      // 背番号のない前からのステージ・ゴミ箱の中身には、ここで付けて置き直す（1回だけ。どのパソコンから読んでも同じ番号になる）
      const stages = (await kv.get('stages', 'json')) || {}, trash = (await kv.get('trash', 'json')) || {};
      if (stampUids(stages, function (k) { return k; })) await kv.put('stages', JSON.stringify(stages));
      if (stampUids(trash, function (k, it) { return okName(it.name) ? it.name : k; })) await kv.put('trash', JSON.stringify(trash));
      return json({ ok: true, stages: stages, lineup: (await kv.get('lineup', 'json')) || null, trash: trash,
        settings: (await kv.get('settings', 'json')) || null, plays: (await kv.get('plays', 'json')) || {},
        tutorials: (await kv.get('tutorials', 'json')) || null, order: (await kv.get('order', 'json')) || null });
    }
    // チュートリアル: 最初の中身を置く（一度だけ）・1つを直す
    const tu = /^tutorials(?:\/(.+))?$/.exec(path);
    if (tu && req.method === 'PUT') {
      const now = await kv.get('tutorials', 'json');
      const b = await body(req);
      const texts = function (t) { return t && typeof t === 'object' ? t : null; };
      if (tu[1] === undefined) {
        if (now) return json({ ok: true, seeded: false, tutorials: now });
        const src = b && b.tutorials, ids = src && typeof src === 'object' && !Array.isArray(src) ? Object.keys(src) : [];
        if (!ids.length || ids.length > MAX_TUTS || !ids.every(function (id) { return okTutId(id) && okStage(src[id]); })) return fail('チュートリアルの中身が正しくない');
        const at = Date.now(), tutorials = {};
        ids.forEach(function (id) { tutorials[id] = { def: src[id].def, texts: texts(src[id].texts), at: at }; });
        await kv.put('tutorials', JSON.stringify(tutorials));
        return json({ ok: true, seeded: true, tutorials: tutorials });
      }
      const id = decodeURIComponent(tu[1]);
      if (!okTutId(id)) return fail('チュートリアルの名前が正しくない');
      if (!now) return fail('チュートリアルがまだ置かれていない', 404);
      if (!okStage(b)) return fail('ステージの中身が正しくない');
      if (!now[id] && Object.keys(now).length >= MAX_TUTS) return fail('チュートリアルがいっぱい（' + MAX_TUTS + '）', 409);
      now[id] = { def: b.def, texts: texts(b.texts), at: Date.now() };
      await kv.put('tutorials', JSON.stringify(now));
      return json({ ok: true, at: now[id].at });
    }
    if (tu && tu[1] !== undefined && req.method === 'DELETE') {
      const id = decodeURIComponent(tu[1]);
      if (!okTutId(id)) return fail('チュートリアルの名前が正しくない');
      const now = await kv.get('tutorials', 'json');
      if (!now || !now[id]) return json({ ok: true });
      if (Object.keys(now).length <= 1) return fail('最後の1つは消せない', 409);
      delete now[id];
      await kv.put('tutorials', JSON.stringify(now));
      return json({ ok: true });
    }
    const m = /^stages\/(.+)$/.exec(path);
    if (m) {
      const name = decodeURIComponent(m[1]);
      if (!okName(name)) return fail('名前が正しくない');
      const stages = (await kv.get('stages', 'json')) || {};
      if (req.method === 'PUT') {
        const b = await body(req);
        if (!b || typeof b.def !== 'object' || !b.def || !Array.isArray(b.def.rows)) return fail('ステージの中身が正しくない');
        if (!stages[name] && Object.keys(stages).length >= MAX_STAGES) return fail('みんなのステージがいっぱい（' + MAX_STAGES + '）');
        const at = Date.now();
        // 背番号: 同じ名前の上書きは、前の背番号のまま（記録がついていく）。新しく置くときは送られてきた背番号。
        //   なければ・ほかのステージがもう使っていれば、新しい背番号
        const old = stages[name] && stages[name].def;
        const taken = function (u) { return Object.keys(stages).some(function (n) { return n !== name && stages[n].def && stages[n].def.uid === u; }); };
        b.def.uid = old ? (okUid(old.uid) ? old.uid : 'n:' + name) : okUid(b.def.uid) && !taken(b.def.uid) ? b.def.uid : newUid();
        stages[name] = { def: b.def, texts: b.texts && typeof b.texts === 'object' ? b.texts : null, at: at };
        await kv.put('stages', JSON.stringify(stages));
        return json({ ok: true, at: at, uid: b.def.uid });
      }
      if (req.method === 'DELETE') {
        if (!stages[name]) return json({ ok: true });
        if (inLineup(await kv.get('lineup', 'json'), name)) return fail('展示の並びに入っているので消せない', 409);
        const trash = (await kv.get('trash', 'json')) || {};
        if (Object.keys(trash).length >= MAX_TRASH) return fail('ゴミ箱がいっぱい（' + MAX_TRASH + '）。ゴミ箱から完全に消してから', 409);
        const key = freeName(name, trash);
        trash[key] = Object.assign({}, stages[name], { name: name, deletedAt: Date.now() });
        await kv.put('trash', JSON.stringify(trash));   // 先にゴミ箱へ書く（途中で止まっても、消えてなくなることはない）
        delete stages[name];
        await kv.put('stages', JSON.stringify(stages));
        return json({ ok: true, trashed: key });
      }
    }
    const t = /^trash\/(.+?)(\/restore)?$/.exec(path);
    if (t) {
      const key = decodeURIComponent(t[1]);
      const trash = (await kv.get('trash', 'json')) || {};
      const item = trash[key];
      if (req.method === 'POST' && t[2]) {
        if (!item) return fail('ゴミ箱に見つからない', 404);
        const stages = (await kv.get('stages', 'json')) || {};
        if (Object.keys(stages).length >= MAX_STAGES) return fail('みんなのステージがいっぱい（' + MAX_STAGES + '）', 409);
        const name = freeName(okName(item.name) ? item.name : key.slice(0, MAX_NAME), stages);
        stages[name] = { def: item.def, texts: item.texts || null, at: item.at || Date.now() };
        await kv.put('stages', JSON.stringify(stages));   // 先に戻す（途中で止まっても、消えてなくなることはない）
        delete trash[key];
        await kv.put('trash', JSON.stringify(trash));
        return json({ ok: true, name: name });
      }
      if (req.method === 'DELETE' && !t[2]) {
        if (!item) return json({ ok: true });
        delete trash[key];
        await kv.put('trash', JSON.stringify(trash));
        return json({ ok: true });
      }
    }
    const p = /^plays\/(.+)$/.exec(path);
    if (p) {
      const id = decodeURIComponent(p[1]);
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return fail('記録の id が正しくない');
      const plays = (await kv.get('plays', 'json')) || {};
      if (req.method === 'PUT') {
        const b = await body(req);
        if (!okPlay(b, id)) return fail('記録の形が正しくない');
        if (!plays[id] && Object.keys(plays).length >= MAX_PLAYS) return fail('プレイ集がいっぱい（' + MAX_PLAYS + '）', 409);
        const at = typeof b.at === 'number' ? b.at : Date.now();
        plays[id] = { id: id, name: b.name, stage: { kind: b.stage.kind, uid: b.stage.uid, name: b.stage.name || '' }, turns: b.turns, at: at };
        await kv.put('plays', JSON.stringify(plays));
        return json({ ok: true, at: at });
      }
      if (req.method === 'DELETE') {
        if (!plays[id]) return json({ ok: true });
        delete plays[id];
        await kv.put('plays', JSON.stringify(plays));
        return json({ ok: true });
      }
    }
    if (req.method === 'PUT' && path === 'settings') {
      const b = await body(req);
      if (!okSettings(b)) return fail('設定の形が正しくない');
      const settings = { colors: b.colors || {}, tiles: b.tiles || {}, magics: b.magics || {}, synergies: b.synergies || {}, at: Date.now() };
      await kv.put('settings', JSON.stringify(settings));
      return json({ ok: true, at: settings.at });
    }
    const od = /^order\/(tut|all)$/.exec(path);
    if (od && req.method === 'PUT') {
      const b = await body(req), list = b && b.order, tut = od[1] === 'tut';
      if (!Array.isArray(list) || list.length > (tut ? MAX_TUTS : MAX_STAGES) || !list.every(tut ? okTutId : okName)) return fail('順番が正しくない');
      const order = (await kv.get('order', 'json')) || {};
      order[od[1]] = list;
      order.at = Date.now();
      await kv.put('order', JSON.stringify(order));
      return json({ ok: true, at: order.at });
    }
    if (req.method === 'PUT' && path === 'lineup') {
      const b = await body(req);
      const lists = ['start', 'pick'];
      if (!b || !lists.every(function (k) { return Array.isArray(b[k]) && b[k].length <= MAX_LIST && b[k].every(okRef); })) return fail('並びが正しくない');
      const lineup = { start: b.start, pick: b.pick, at: Date.now() };
      await kv.put('lineup', JSON.stringify(lineup));
      return json({ ok: true, at: lineup.at });
    }
    return fail('ない', 404);
  } catch (e) {
    return fail('受け取れなかった: ' + (e && e.message || e));
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.indexOf('/api/') === 0) return handleApi(req, env.CAFILIA);
    return env.ASSETS.fetch(req);
  }
};
