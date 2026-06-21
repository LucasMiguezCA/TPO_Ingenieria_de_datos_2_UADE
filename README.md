# SAAC · PictoLink / PictoComm

App de **comunicación aumentativa (AAC)**: el usuario arma frases con pictogramas y el terapeuta revisa el uso. Usa **persistencia políglota** — cada base detrás de su propia API.

## Arquitectura

| Componente | Carpeta | Puerto | Rol | Base de datos |
|---|---|---|---|---|
| API de Usuarios | `api-picto-express` | `3000` | Usuarios, login (bcrypt), config, las 2 listas | **MongoDB** (`:27017`) |
| API de Grafo | `ne4j-api` | `3001` | Grafo de pictogramas (`Palabra`-`CONECTA_CON`) | **Neo4j** (`bolt :7687`) |
| API de Sesión | `redis-api-pictolink` | `4000` | Sesión activa: 2 listas con TTL, proxy + caché a Neo, write-behind a Mongo | **Redis** (Upstash, nube) |
| API de Interacciones | `cassandraPIC` (Python) | `8000` | Historial de interacciones + estadísticas | **Cassandra** (DataStax Astra, nube) |
| Front | `pictocomm.html` | — | Dashboard | — |

Las **dos listas por usuario**: `eliminados` (pictos ocultos) y `personalizados`/admitidos (pictos custom que solo ve ese usuario). La API de Sesión las hidrata desde Mongo al iniciar, las persiste de vuelta en cada cambio, y le pide a Neo los pictos ya filtrados.

## Requisitos

- **Node.js 20+** (probado con 24)
- **Java 17** (para Neo4j)
- **MongoDB** corriendo en `:27017` — `winget install MongoDB.Server`
- **Neo4j 5.x** (usuario `neo4j`, pass `pictolink`) en `bolt://localhost:7687`
- **Redis**: se usa **Upstash** (nube). Copiá `redis-api-pictolink/.env.example` a `.env` y poné tu `REDIS_URL` (`rediss://...`)
- **Cassandra**: es **Astra** (nube), no requiere instalación local. Necesita Python + `cassandra-driver` + `fastapi`/`uvicorn`

## Puesta en marcha (APIs Node)

```bash
# 1. Instalar dependencias de todas las APIs Node
npm run install:all

# 2. Configurar Redis (nube): copiar el ejemplo y completar la URL
#    redis-api-pictolink/.env  ->  REDIS_URL=rediss://default:TU_PASSWORD@HOST:PUERTO

# 3. Levantar las 3 APIs Node de una (Mongo + Neo + Redis)
npm run dev
```

Scripts individuales: `npm run dev:mongo`, `npm run dev:neo`, `npm run dev:redis`.

> La API de Cassandra (Python) se levanta aparte desde `cassandraPIC/`:
> `uvicorn main:app --reload` (escucha en `:8000`).

## Health checks

Cada API Node expone `GET /health`:

```bash
curl http://localhost:3000/health   # Mongo
curl http://localhost:3001/health   # Neo4j
curl http://localhost:4000/health   # Redis (+ targets)
```

## Notas importantes (gotchas)

- **`node_modules` NO está versionado.** Después de clonar o de pullear `main`, corré `npm run install:all` (o `npm install` dentro de cada API). Si una API tira `Cannot find module 'express'`, es esto.
- **`neo4j.dump` está en formato Enterprise (block format)** y **no se puede cargar en Neo4j Community** (`Block format detected ... unavailable in this edition`). Para datos reales en local hace falta Neo4j Enterprise (Neo4j Desktop lo trae gratis para dev) o re-exportar el dump.
- **Redis vive en la nube (Upstash)** con TLS (`rediss://`). El `.env` con la URL real **no se commitea** (está en `.gitignore`).
- Variables de entorno útiles: `PORT`, `CORS_ORIGINS` (todas las APIs), `MONGO_URI` (Mongo), `NEO4J_URI`/`NEO4J_USER`/`NEO4J_PASSWORD` (Neo), `REDIS_URL`/`NEO_API_URL`/`MONGO_API_URL` (Redis).
