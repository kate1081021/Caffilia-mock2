/*
 * tools/stage_worker.mjs — 共有の置き場所（IMPROVE_v3 段4。オーナー 10/30）
 *   Cloudflare（今の公開先。Workers の静的サイト）で動く小さなプログラム。/api/ だけを受け持ち、ほかは今までどおり公開したファイルを返す。
 *   置くもの（Workers KV。バインディングの名前は CAFILIA）:
 *     stages … みんなのステージ { 名前: { def, texts, at } }（盤面の定義と会話の文。at は共有した時刻）
 *     lineup … 展示の並び { start: [...], pick: [...], at }（中身は 'tut:tut1' か 'all:名前'）
 *   API（ファイルから開いたページ（file://）からも使えるように、CORS は * にする。URL が合言葉の代わり）:
 *     GET    /api/all             … { stages, lineup }
 *     PUT    /api/stages/<名前>    … 共有する（同じ名前は上書き）。本文 { def, texts }
 *     DELETE /api/stages/<名前>    … 消す（展示の並びに入っているものは消せない）
 *     PUT    /api/lineup          … 展示の並びを変える。本文 { start, pick }
 *   KV は書いてから、ほかの場所で見えるまで1分ほどかかることがある（Cloudflare の決まり）。
 *   tools/publish.js が publish/worker.mjs に写す。手元の確かめでは tests/serve.js がこのファイルを読み、同じように答える。
 *   Cloudflare で動くので ES Modules で書く（モックの画面のファイルとは別。画面は今までどおり ES Modules を使わない）。
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const MAX_BODY = 200000;    // 1回に受け取る大きさ（文字）
const MAX_NAME = 40;        // ステージの名前の長さ（エディットの名前の欄と同じ）
const MAX_STAGES = 500;     // みんなのステージの数
const MAX_LIST = 50;        // 展示の並びの1段に入る数

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
function okRef(r) { return typeof r === 'string' && /^(tut|all):./.test(r) && r.length <= MAX_NAME + 4; }
function inLineup(lineup, name) { const r = 'all:' + name; return !!lineup && ['start', 'pick'].some(function (k) { return (lineup[k] || []).indexOf(r) >= 0; }); }

// /api/ の1件に答える。kv は Workers KV（get(key, 'json')・put(key, text)）
export async function handleApi(req, kv) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!kv) return fail('共有の置き場所がまだありません（Cloudflare の KV をつないでください）', 503);
  const path = new URL(req.url).pathname.replace(/^\/api\//, '');
  try {
    if (req.method === 'GET' && path === 'all') {
      return json({ ok: true, stages: (await kv.get('stages', 'json')) || {}, lineup: (await kv.get('lineup', 'json')) || null });
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
        stages[name] = { def: b.def, texts: b.texts && typeof b.texts === 'object' ? b.texts : null, at: at };
        await kv.put('stages', JSON.stringify(stages));
        return json({ ok: true, at: at });
      }
      if (req.method === 'DELETE') {
        if (!stages[name]) return json({ ok: true });
        if (inLineup(await kv.get('lineup', 'json'), name)) return fail('展示の並びに入っているので消せない', 409);
        delete stages[name];
        await kv.put('stages', JSON.stringify(stages));
        return json({ ok: true });
      }
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
