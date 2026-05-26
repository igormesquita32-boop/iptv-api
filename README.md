# IPTV API

API local em Node.js para ler uma lista M3U de IPTV e organizar os itens em canais, filmes, series e categorias.

## Instalar

```bash
npm install
```

## Configurar

Copie o arquivo `.env.example` para `.env` e coloque a sua URL M3U:

```env
M3U_URL=http://seuservidor.com/get.php?username=SEU_USER&password=SUA_SENHA&type=m3u_plus&output=mpegts
PORT=3000
```

## Rodar

```bash
npm start
```

A API vai ficar disponivel em:

```text
http://localhost:3000
```

## Endpoints

| Rota | O que faz |
| --- | --- |
| `GET /` | Mostra status basico e rotas disponiveis |
| `GET /status` | Retorna resumo da lista: total, canais, filmes, series e categorias |
| `GET /canais` | Lista canais ao vivo |
| `GET /filmes` | Lista filmes/VOD |
| `GET /series` | Lista series e episodios |
| `GET /categorias` | Lista todos os grupos/categorias encontrados na M3U |
| `GET /categoria/:nome` | Busca itens por nome de categoria |
| `GET /buscar?q=termo` | Busca itens pelo nome |

## Exemplos

```text
http://localhost:3000/status
http://localhost:3000/canais?limit=50
http://localhost:3000/filmes?group=netflix
http://localhost:3000/categoria/esportes
http://localhost:3000/buscar?q=globo
```

## Observacoes

- A lista M3U fica em cache por 5 minutos para evitar baixar tudo a cada requisicao.
- O arquivo `.env` nao deve ser enviado para repositorios publicos porque pode conter usuario, senha ou token da sua lista IPTV.
- Se `M3U_URL` nao estiver configurado, as rotas que dependem da lista retornam erro pedindo configuracao.
