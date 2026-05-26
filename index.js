const cors = require('cors');
const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

const PORT = process.env.PORT || 3000;
const M3U_URL = process.env.M3U_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

app.use(cors());
app.use(express.json());

let cache = null;
let cacheTime = null;
const CACHE_TTL = 5 * 60 * 1000;

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const items = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith('#EXTINF:')) {
      const tvgId = line.match(/tvg-id="([^"]*)"/)?.[1] || '';
      const tvgName = line.match(/tvg-name="([^"]*)"/)?.[1] || '';
      const tvgLogo = line.match(/tvg-logo="([^"]*)"/)?.[1] || '';
      const groupTitle = line.match(/group-title="([^"]*)"/)?.[1] || '';
      const displayName = line.split(',').pop()?.trim() || tvgName;

      current = {
        id: tvgId,
        name: displayName,
        tvgName,
        logo: tvgLogo,
        group: groupTitle,
        url: '',
      };
    } else if (line && !line.startsWith('#') && current) {
      current.url = line;
      items.push(current);
      current = null;
    }
  }

  return items;
}

async function fetchList() {
  if (cache && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
    return cache;
  }

  if (!M3U_URL) {
    throw new Error('Variavel M3U_URL nao configurada.');
  }

  console.log('Baixando lista M3U...');

  const { data } = await axios.get(M3U_URL, {
    timeout: 30000,
    responseType: 'text',
  });

  if (typeof data !== 'string') {
    throw new Error('A URL M3U nao retornou texto valido.');
  }

  cache = parseM3U(data);
  cacheTime = Date.now();

  console.log(`${cache.length} itens carregados.`);

  return cache;
}

function classifyItem(item) {
  const group = normalizeText(item.group);
  const name = normalizeText(item.name);
  const text = `${group} ${name}`;

  if (
    text.includes('series') ||
    text.includes('serie') ||
    text.includes('novela') ||
    text.includes('dorama') ||
    text.includes('temporada') ||
    text.includes('episodio')
  ) {
    return 'serie';
  }

  if (
    text.includes('filmes') ||
    text.includes('filme') ||
    text.includes('vod') ||
    text.includes('cinema') ||
    text.includes('lancamento') ||
    text.includes('netflix') ||
    text.includes('prime video') ||
    text.includes('disney') ||
    text.includes('telecine') ||
    text.includes('max')
  ) {
    return 'filme';
  }

  return 'canal';
}

const isChannel = (item) => classifyItem(item) === 'canal';
const isMovie = (item) => classifyItem(item) === 'filme';
const isSeries = (item) => classifyItem(item) === 'serie';

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error(err.message);

    res.status(500).json({
      error: err.message,
    });
  }
};

function requireAuth(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(500).json({
      error: 'JWT_SECRET nao configurado no servidor.',
    });
  }

  const authHeader = req.headers.authorization || '';
  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer' || !token) {
    return res.status(401).json({
      error: 'Token nao informado. Faca login em /auth/login.',
    });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({
      error: 'Token invalido ou expirado.',
    });
  }
}

app.get('/', (req, res) => {
  res.json({
    api: 'IPTV API',
    status: 'online',
    protegida: true,
    rotas: {
      login: '/auth/login',
      health: '/health',
      status: '/status',
      canais: '/canais',
      filmes: '/filmes',
      series: '/series',
      categorias: '/categorias',
      categoria: '/categoria/esportes',
      buscar: '/buscar?q=globo',
    },
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    auth: Boolean(JWT_SECRET && ADMIN_EMAIL && ADMIN_PASSWORD),
    m3u: Boolean(M3U_URL),
  });
});

app.post('/auth/login', wrap(async (req, res) => {
  if (!JWT_SECRET || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    return res.status(500).json({
      error: 'Configure JWT_SECRET, ADMIN_EMAIL e ADMIN_PASSWORD no Render.',
    });
  }

  const { email, password } = req.body;

  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      error: 'Email ou senha invalidos.',
    });
  }

  const token = jwt.sign(
    {
      email,
      role: 'admin',
    },
    JWT_SECRET,
    {
      expiresIn: '7d',
    }
  );

  return res.json({
    token,
    user: {
      email,
      role: 'admin',
    },
  });
}));

app.get('/status', requireAuth, wrap(async (req, res) => {
  const all = await fetchList();

  const categorias = [
    ...new Set(all.map((item) => item.group).filter(Boolean)),
  ];

  res.json({
    status: 'online',
    total: all.length,
    canais: all.filter(isChannel).length,
    filmes: all.filter(isMovie).length,
    series: all.filter(isSeries).length,
    categorias: categorias.length,
    cache_atualizado: cacheTime ? new Date(cacheTime).toISOString() : null,
  });
}));

app.get('/canais', requireAuth, wrap(async (req, res) => {
  const limit = Number.parseInt(req.query.limit, 10) || 200;
  const all = await fetchList();

  const items = all.filter(isChannel).slice(0, limit);

  res.json({
    total: items.length,
    items,
  });
}));

app.get('/filmes', requireAuth, wrap(async (req, res) => {
  const limit = Number.parseInt(req.query.limit, 10) || 200;
  const all = await fetchList();

  const items = all.filter(isMovie).slice(0, limit);

  res.json({
    total: items.length,
    items,
  });
}));

app.get('/series', requireAuth, wrap(async (req, res) => {
  const limit = Number.parseInt(req.query.limit, 10) || 200;
  const all = await fetchList();

  const items = all.filter(isSeries).slice(0, limit);

  res.json({
    total: items.length,
    items,
  });
}));

app.get('/categorias', requireAuth, wrap(async (req, res) => {
  const all = await fetchList();

  const categorias = [
    ...new Set(all.map((item) => item.group).filter(Boolean)),
  ].sort();

  res.json({
    total: categorias.length,
    categorias,
  });
}));

app.get('/categoria/:nome', requireAuth, wrap(async (req, res) => {
  const all = await fetchList();
  const nome = normalizeText(req.params.nome);

  const items = all.filter((item) =>
    normalizeText(item.group).includes(nome)
  );

  res.json({
    categoria: req.params.nome,
    total: items.length,
    items,
  });
}));

app.get('/buscar', requireAuth, wrap(async (req, res) => {
  const q = normalizeText(req.query.q || '');

  if (!q) {
    return res.status(400).json({
      error: 'Use assim: /buscar?q=globo',
    });
  }

  const limit = Number.parseInt(req.query.limit, 10) || 100;
  const all = await fetchList();

  const items = all
    .filter((item) => normalizeText(item.name).includes(q))
    .slice(0, limit);

  return res.json({
    busca: req.query.q,
    total: items.length,
    items,
  });
}));

app.listen(PORT, () => {
  console.log(`IPTV API rodando na porta ${PORT}`);
});
