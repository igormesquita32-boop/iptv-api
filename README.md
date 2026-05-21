# 📺 IPTV API

API local em Node.js para leitura e organização de lista M3U.

## Instalação

```bash
npm install
```

## Configuração

1. Copie o arquivo de exemplo:
   ```bash
   cp .env.example .env
   ```
2. Edite o `.env` e coloque sua URL M3U.

## Rodar

```bash
npm start
```

## Endpoints

| Rota                  | Descrição                        |
|-----------------------|----------------------------------|
| GET /status           | Resumo geral da lista            |
| GET /canais           | Canais ao vivo                   |
| GET /filmes           | Filmes / VOD                     |
| GET /series           | Séries e episódios               |
| GET /categorias       | Lista de grupos únicos           |
| GET /categoria/:nome  | Itens de uma categoria           |
| GET /buscar?q=termo   | Busca por nome                   |

## Exemplo

```
http://localhost:3000/status
http://localhost:3000/categoria/esportes
http://localhost:3000/buscar?q=globo
```
