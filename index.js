const express = require('express');
const axios   = require('axios');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ── URL da lista (use .env para não expor credenciais) ──────────
const M3U_URL = process.env.M3U_URL || 'COLOQUE_SUA_URL_AQUI';

let cache     = null;
let cacheTime = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// ── Parser M3U ──────────────────────────────────────────────────
function parseM3U(text) {
  const lines = text.split('\n');
  const items = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      const tvgId      = line.match(/tvg-id="([^"]*)"/)?.[1]      || '';
      const tvgName    = line.match(/tvg-name="([^"]*)"/)?.[1]    || '';
      const tvgLogo    = line.match(/tvg-logo="([^"]*)"/)?.[1]    || '';
      const groupTitle = line.match(/group-title="([^"]*)"/)?.[1] || '';
      const displayName = line.split(',').pop()?.trim() || tvgName;
      current = { id: tvgId, name: displayName, tvgName, logo: tvgLogo, group: groupTitle, url: '' };
    } else if (line && !line.startsWith('#') && current) {
      current.url = line;
      items.push(current);
      current = null;
    }
  }
  return items;
}

// ── Cache ───────────────────────────────────────────────────────
async function fetchList() {
  if (cache && cacheTime && Date.now() - cacheTime < CACHE_TTL) return cache;
  console.log('[IPTV] Buscando lista M3U...');
  const { data } = await axios.get(M3U_URL, { timeout: 20000 });
  cache     = parseM3U(data);
  cacheTime = Date.now();
  console.log(`[IPTV] ${cache.length} itens carregados.`);
  return cache;
}

// ── Classificadores ─────────────────────────────────────────────
const isMovie  = i => /filme|movie|vod/i.test(i.group) || /\b(19|20)\d{2}\b/.test(i.name);
const isSeries = i => /serie|episodio|season/i.test(i.group) || /s\d{1,2}e\d{1,2}/i.test(i.name);
const isChannel= i => !isMovie(i) && !isSeries(i);

// ── Wrapper de erro ─────────────────────────────────────────────
const wrap = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (err) { res.status(500).json({ error: err.message }); }
};

// ── Rotas ───────────────────────────────────────────────────────
app.get('/status', wrap(async (_, res) => {
  const all   = await fetchList();
  const grupos = [...new Set(all.map(i => i.group).filter(Boolean))];
  res.json({
    total: all.length,
    canais: all.filter(isChannel).length,
    filmes: all.filter(isMovie).length,
    series: all.filter(isSeries).length,
    categorias: grupos.length,
    cache_atualizado: cacheTime ? new Date(cacheTime).toISOString() : null,
  });
}));

app.get('/canais',     wrap(async (_, res) => { const all = await fetchList(); const r = all.filter(isChannel); res.json({ total: r.length, items: r }); }));
app.get('/filmes',     wrap(async (_, res) => { const all = await fetchList(); const r = all.filter(isMovie);   res.json({ total: r.length, items: r }); }));
app.get('/series',     wrap(async (_, res) => { const all = await fetchList(); const r = all.filter(isSeries);  res.json({ total: r.length, items: r }); }));

app.get('/categorias', wrap(async (_, res) => {
  const all   = await fetchList();
  const grupos = [...new Set(all.map(i => i.group).filter(Boolean))].sort();
  res.json({ total: grupos.length, categorias: grupos });
}));

app.get('/categoria/:nome', wrap(async (req, res) => {
  const all   = await fetchList();
  const nome  = req.params.nome.toLowerCase();
  const items = all.filter(i => i.group.toLowerCase().includes(nome));
  res.json({ categoria: req.params.nome, total: items.length, items });
}));

app.get('/buscar', wrap(async (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.status(400).json({ error: 'Parâmetro ?q= obrigatório' });
  const all   = await fetchList();
  const items = all.filter(i => i.name.toLowerCase().includes(q));
  res.json({ query: q, total: items.length, items });
}));

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🟢 IPTV API rodando em http://localhost:${PORT}`);
  console.log('   GET /status  /canais  /filmes  /series');
  console.log('   GET /categorias  /categoria/:nome  /buscar?q=\n');
});
