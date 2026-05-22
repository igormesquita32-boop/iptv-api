const cors = require('cors');
const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.options("*", cors());
app.use(express.json());

const M3U_URL = process.env.M3U_URL || 'COLOQUE_SUA_URL_AQUI';

let cache = null;
let cacheTime = null;
const CACHE_TTL = 5 * 60 * 1000;

function parseM3U(text) {
  const lines = text.split('\n');
  const items = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      const tvgId    = line.match(/tvg-id="([^"]*)"/)?.[1] || '';
      const tvgName  = line.match(/tvg-name="([^"]*)"/)?.[1] || '';
      const tvgLogo  = line.match(/tvg-logo="([^"]*)"/)?.[1] || '';
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

async function fetchList() {
  if (cache && cacheTime && Date.now() - cacheTime < CACHE_TTL) return cache;
  console.log('[IPTV] Buscando lista M3U...');
  const { data } = await axios.get(M3U_URL, { timeout: 30000 });
  cache = parseM3U(data);
  cacheTime = Date.now();
  console.log(`[IPTV] ${cache.length} itens carregados.`);
  return cache;
}

// ── CLASSIFICADORES CORRIGIDOS ──────────────────────────────────────────────
const GRUPOS_FILMES = [
  'filmes | ficcao','netflix','cinema','lançamentos','prime video','max',
  'disney+','apple tv+','star+','paramount+','globoplay','telecine',
  'cine sky','animacao','aventura','ação','comedia','crime','drama',
  'documentário','docu','familia','fantasia','faroeste','ficcao cientifica',
  'guerra','horror','terror','romance','suspense','nacionais','legendad',
  'marvel','lionsgate','outras produtoras','oscar','amc plus','claro video',
  'funimation','crunchyroll','play plus','pluto','sbt+','univer',
  'dublagem nao oficial','especial de natal','especial infantil','shows',
  'stand up','religiosos','brasil paralelo','dramas shorts','reels',
  'adultos','[hot]'
];

const GRUPOS_SERIES = [
  'series | novelas','novelas','doramas','programas de tv',
  'canais 24h | series','canais 24h | desenhos','canais 24h | lives',
  'canais 24h | premium'
];

const GRUPOS_CANAIS = [
  'abertos','globo','sbt','record','band','bandeirantes','cnn','noticias',
  'esportes','sportv','espn','premiere','discovery','hbo','infantil',
  'religiosos','variedades','ppv','canais | fhd','canais | uhd',
  'fhd h265','uhd 4k','casa do patrao','central da copa','sportynet',
  'directv','canais fhd','canais uhd'
];

function classifyItem(item) {
  const g = (item.group || '').toLowerCase();

  // Verifica séries primeiro
  for (const s of GRUPOS_SERIES) {
    if (g.includes(s)) return 'serie';
  }

  // Verifica filmes
  for (const f of GRUPOS_FILMES) {
    if (g.includes(f)) return 'filme';
  }

  // Verifica canais
  for (const c of GRUPOS_CANAIS) {
    if (g.includes(c)) return 'canal';
  }

  // Fallback: se tem ♦️ e não identificou, é canal
  if (g.includes('♦')) return 'canal';

  return 'canal';
}

const isMovie   = (i) => classifyItem(i) === 'filme';
const isSeries  = (i) => classifyItem(i) === 'serie';
const isChannel = (i) => classifyItem(i) === 'canal';

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
};

// ── ROTAS ───────────────────────────────────────────────────────────────────
app.get('/status', wrap(async (_, res) => {
  const all = await fetchList();
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

app.get('/canais', wrap(async (req, res) => {
  const limit = parseInt(req.query.limit) || 200;
  const group = req.query.group || '';
  const all = await fetchList();
  let r = all.filter(isChannel);
  if (group) r = r.filter(i => i.group.toLowerCase().includes(group.toLowerCase()));
  res.json({ total: r.length, items: r.slice(0, limit) });
}));

app.get('/filmes', wrap(async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const group = req.query.group || '';
  const all = await fetchList();
  let r = all.filter(isMovie);
  if (group) r = r.filter(i => i.group.toLowerCase().includes(group.toLowerCase()));
  res.json({ total: r.length, items: r.slice(0, limit) });
}));

app.get('/series', wrap(async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const group = req.query.group || '';
  const all = await fetchList();
  let r = all.filter(isSeries);
  if (group) r = r.filter(i => i.group.toLowerCase().includes(group.toLowerCase()));
  res.json({ total: r.length, items: r.slice(0, limit) });
}));

app.get('/categorias', wrap(async (_, res) => {
  const all = await fetchList();
  const grupos = [...new Set(all.map(i => i.group).filter(Boolean))].sort();
  res.json({ total: grupos.length, categorias: grupos });
}));

app.get('/categoria/:nome', wrap(async (req, res) => {
  const all = await fetchList();
  const nome = req.params.nome.toLowerCase();
  const items = all.filter(i => i.group.toLowerCase().includes(nome));
  res.json({ categoria: req.params.nome, total: items.length, items });
}));

app.get('/buscar', wrap(async (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.status(400).json({ error: 'Parâmetro ?q= obrigatório' });
  const limit = parseInt(req.query.limit) || 50;
  const all = await fetchList();
  const items = all.filter(i => i.name.toLowerCase().includes(q)).slice(0, limit);
  res.json({ query: q, total: items.length, items });
}));

app.listen(PORT, () => {
  console.log(`\n🟢 IPTV API rodando em http://localhost:${PORT}`);
  console.log('GET /status /canais /filmes /series /categorias /buscar?q=');
});