/**
 * PictoLink · API de Redis (sesión activa)
 * ---------------------------------------------------------------------------
 * Rol de Redis en PictoLink: SESIÓN ACTIVA del usuario. Al iniciar sesión, las
 * dos listas del usuario se cargan en Redis DESDE MONGO (con TTL) y la app las
 * lee/escribe rápido desde ahí. Cada cambio se persiste de vuelta en Mongo
 * (write-behind). Las respuestas de Neo (/padres y /siguientes) se CACHEAN en
 * Redis con TTL corto y se invalidan cuando cambian las listas o el grafo.
 *
 * DUEÑO DEL TOKEN: la API de Mongo FIRMA el JWT (login), pero Redis gobierna su
 * VIGENCIA. Cada login trae un jti único; al abrir sesión, Redis lo guarda en una
 * "allowlist" de sesiones activas con TTL. Un token vale solo si su jti sigue en
 * Redis: el logout lo borra (revocación instantánea) y la inactividad lo expira
 * (TTL sliding, renovado en cada request). Así la expiración la maneja Redis, no
 * el exp del JWT (que queda como techo duro de seguridad).
 *
 * Las DOS listas (modelo PictoLink):
 *   - eliminados:      pictos que el usuario NO quiere ver (se ocultan).
 *   - personalizados:  pictos custom (nodoPersonalizado) ADMITIDOS para ese
 *                      usuario (solo se muestran si su id está en esta lista).
 *
 * Esta API NO consulta el grafo directamente: PROXEA a la API de Neo4j
 * (server.js, /padres /siguientes /agregar) pasándole las dos listas, así
 * Neo devuelve los pictos ya filtrados para ese usuario.
 *
 * Puerto: 4000 · API de Neo: http://localhost:3001 · API de Mongo: http://localhost:3000
 */
require('dotenv').config({ path: __dirname + '/.env' });
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { createClient } = require("redis");

const PORT = process.env.PORT || 4000;
const NEO_API = process.env.NEO_API_URL || "http://localhost:3001";
const MONGO_API = process.env.MONGO_API_URL || "http://localhost:3000";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
// Secreto para verificar el JWT. Debe ser el MISMO valor que en la API de Mongo (api-picto-express).
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-pictolink";
// Por defecto la auth está APAGADA: así no se rompe nada de lo que ya andaba.
const AUTH_REQUIRED = process.env.AUTH_REQUIRED === "true";
// Clave de servicio para las llamadas internas a la API de Mongo (hidratar + writeback).
// Debe ser el MISMO valor que SERVICE_KEY en api-picto-express.
const SERVICE_KEY = process.env.SERVICE_KEY || "dev-service-pictolink";
const TTL = 3600; // 1 h de inactividad (sliding window: cada request renueva el TTL)
const CACHE_TTL = 60; // segundos que vive una respuesta de Neo cacheada

const app = express();
app.use(cors());
app.use(express.json());

// Middleware de autenticación. Si AUTH_REQUIRED !== 'true', deja pasar todo (no exige token).
// Si está activo: exige header "Authorization: Bearer <token>", lo verifica y setea req.userId.
function requireAuth(req, res, next) {
  if (!AUTH_REQUIRED) return next();
  const [esquema, token] = (req.headers.authorization || "").split(" ");
  if (esquema !== "Bearer" || !token) {
    return res.status(401).json({ mensaje: "Token inválido o ausente" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    req.jti = payload.jti; // FIX: jti para la allowlist de sesiones activas (Redis, dueño del token)
    next();
  } catch (error) {
    return res.status(401).json({ mensaje: "Token inválido o ausente" });
  }
}

// Con la auth activa, el usuario solo puede operar SU propia sesión (req.userId === :usuarioId).
function requireOwnSession(req, res, next) {
  if (!AUTH_REQUIRED) return next();
  const dueño = req.params.usuarioId;
  if (!dueño) {
    return res.status(500).json({ mensaje: "Parámetro usuarioId no disponible" });
  }
  if (String(req.userId) !== String(dueño)) {
    return res.status(403).json({ mensaje: "No autorizado para esta sesión" });
  }
  next();
}

// FIX: Redis = dueño de la vigencia del token. Verifica que el jti del JWT siga en la
// allowlist de sesiones activas. Si no está (logout) o expiró (TTL), el token NO vale,
// aunque su firma sea válida. Cada request renueva el TTL (sliding window): la sesión
// vive mientras haya actividad y se expira sola por inactividad.
async function requireSesionActiva(req, res, next) {
  if (!AUTH_REQUIRED) return next();
  try {
    const u = req.params.usuarioId;
    const activa = await redis.get(kSesionActiva(req.jti));
    if (!activa) {
      return res.status(401).json({ mensaje: "Sesión expirada o cerrada" });
    }
    await redis
      .multi()
      .expire(kSesionActiva(req.jti), TTL)
      .expire(kElim(u), TTL)
      .expire(kPers(u), TTL)
      .exec();
    next();
  } catch (e) {
    return res.status(503).json({ mensaje: "Error verificando sesión", detalle: e.message });
  }
}

// Todas las rutas /sesion/:usuarioId* exigen auth + dueño de la sesión.
// (La verificación de SESIÓN ACTIVA se monta más abajo, después de abrir sesión.)
app.use("/sesion/:usuarioId", requireAuth, requireOwnSession);

const redis = createClient({
  url: REDIS_URL,
  // Reintenta la conexión: clave para Redis en la nube (cortes de red transitorios).
  socket: { reconnectStrategy: (intentos) => Math.min(intentos * 200, 5000) },
});
redis.on("error", (e) => console.error("Redis error:", e.message));

// Claves de Redis por usuario (un SET por lista)
const kElim = (u) => `sesion:${u}:eliminados`;
const kPers = (u) => `sesion:${u}:personalizados`;
// FIX: allowlist de sesiones activas, una clave por token (jti). Su existencia = token
// vigente; su TTL = expiración de la sesión; borrarla = logout.
const kSesionActiva = (jti) => `sesion:activa:${jti}`;

// Claves de caché de respuestas de Neo (por usuario)
const kCachePadres = (u) => `cache:${u}:padres`;
const kCacheSig = (u, id) => `cache:${u}:siguientes:${id}`;
const kCacheSigIdx = (u) => `cache:${u}:sigkeys`; // índice de las keys de /siguientes cacheadas

// Lee las dos listas y las devuelve como arrays de números (lo que espera Neo).
async function leerListas(u) {
  const [elim, pers] = await Promise.all([
    redis.sMembers(kElim(u)),
    redis.sMembers(kPers(u)),
  ]);
  return {
    eliminados: elim.filter(x => x !== "__init__").map(Number),
    personalizados: pers.filter(x => x !== "__init__").map(Number),
  };
}

// Llama a la API de Neo4j por HTTP.
async function neo(path, body) {
  const r = await fetch(`${NEO_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`API de Neo ${path} respondió ${r.status}`);
  return r.json();
}

// Trae las dos listas del usuario desde la API de Mongo (hidratación Mongo -> Redis).
// Mongo expone GET /api/usuarios/:id con listaEliminados y listaAdmitidosPersonalizados.
// ANTES:
// return { eliminados: u.listaEliminados || [], personalizados: u.listaAdmitidosPersonalizados || [] };

// DESPUÉS:
async function listasDeMongo(usuarioId) {
  const r = await fetch(`${MONGO_API}/api/usuarios/${usuarioId}`, {
    headers: { "X-Service-Key": SERVICE_KEY },
  });
  if (!r.ok) throw new Error(`API de Mongo /api/usuarios respondió ${r.status}`);
  const u = await r.json();
  return {
    eliminados: u.listaEliminados || [],
    personalizados: u.listaAdmitidosPersonalizados || [],
    colorFondo: u.colorFondo,
    tamañoIconos: u.tamañoIconos
  };
}

// Write-behind: persiste un cambio de lista en Mongo SIN frenar la respuesta de
// la sesión (fire-and-forget). Si Mongo falla, se loguea y la sesión sigue.
function mongoPersist(path, pictoId) {
  fetch(`${MONGO_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Service-Key": SERVICE_KEY },
    body: JSON.stringify({ pictogramaId: Number(pictoId) }),
  }).catch((e) => console.error(`Writeback a Mongo ${path} falló:`, e.message));
}

// Invalida TODO lo cacheado del usuario (cuando cambian sus listas o el grafo).
async function invalidarCache(u) {
  const sigKeys = await redis.sMembers(kCacheSigIdx(u));
  await redis.del([kCachePadres(u), kCacheSigIdx(u), ...sigKeys]);
}

// GET /health -> ping a Redis + targets de Neo y Mongo (para diagnóstico).
app.get("/health", async (req, res) => {
  try {
    const pong = await redis.ping();
    res.json({
      servicio: "redis-api-pictolink",
      redis: pong === "PONG" ? "conectado" : pong,
      neoApi: NEO_API,
      mongoApi: MONGO_API,
    });
  } catch (e) {
    res
      .status(503)
      .json({ servicio: "redis-api-pictolink", redis: "desconectado", error: e.message });
  }
});

// ===========================================================================
//  SESIÓN — iniciar / ver / cerrar
// ===========================================================================

// POST /sesion/:usuarioId  -> inicia sesión cargando las listas (con TTL).
//  Por defecto las trae de Mongo (hidratación Mongo -> Redis). Se pueden pasar
//  por body { eliminados:[ids], personalizados:[ids] } para testear sin Mongo.
app.post("/sesion/:usuarioId", async (req, res) => {
  const u = req.params.usuarioId;
  try {
    let { eliminados, personalizados, colorFondo, tamañoIconos } = req.body;
    
    // Si el body no trae las listas, las buscamos en Mongo.
    if (eliminados === undefined && personalizados === undefined) {
      const mongoData = await listasDeMongo(u);
      eliminados = mongoData.eliminados;
      personalizados = mongoData.personalizados;
      colorFondo = mongoData.colorFondo;       // Capturamos el color
      tamañoIconos = mongoData.tamañoIconos;   // Capturamos el tamaño
    }
    eliminados = eliminados || [];
    personalizados = personalizados || [];

    const multi = redis.multi();
    multi.del(kElim(u));
    multi.del(kPers(u));
    multi.sAdd(kElim(u), eliminados.length ? eliminados.map(String) : ["__init__"]);
    multi.sAdd(kPers(u), personalizados.length ? personalizados.map(String) : ["__init__"]);
    multi.expire(kElim(u), TTL);
    multi.expire(kPers(u), TTL);
    
    if (AUTH_REQUIRED && req.jti) {
      multi.set(kSesionActiva(req.jti), String(u), { EX: TTL });
    }
    await multi.exec();
    await invalidarCache(u);

    // Agregamos el colorFondo y tamañoIconos a la respuesta que va al frontend
    res.json({ 
      mensaje: "Sesión iniciada", 
      usuario: u, 
      colorFondo, 
      tamañoIconos, 
      ...(await leerListas(u)) 
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// FIX: desde acá, toda ruta /sesion/:usuarioId* exige SESIÓN ACTIVA (jti en allowlist).
// Va DESPUÉS de "abrir sesión" (que es quien registra el jti) y ANTES del resto, así
// abrir no se exige a sí mismo. El orden de registro en Express hace de "excepción".
app.use("/sesion/:usuarioId", requireSesionActiva);

// GET /sesion/:usuarioId/listas  -> devuelve las dos listas.
app.get("/sesion/:usuarioId/listas", async (req, res) => {
  res.json(await leerListas(req.params.usuarioId));
});

// DELETE /sesion/:usuarioId  -> cierra sesión (borra listas, caché y revoca el token).
app.delete("/sesion/:usuarioId", async (req, res) => {
  const u = req.params.usuarioId;
  // node-redis v4: del toma una key o un ARRAY de keys (no varargs posicionales).
  await redis.del([kElim(u), kPers(u)]);
  await invalidarCache(u);
  // FIX: revocar el token. Al borrar su jti de la allowlist, queda inválido AL INSTANTE,
  // aunque el exp del JWT siga siendo dentro de 8 h.
  if (AUTH_REQUIRED && req.jti) {
    await redis.del(kSesionActiva(req.jti));
  }
  res.json({ mensaje: "Sesión cerrada", usuario: u });
});

// ===========================================================================
//  LISTAS — agregar / quitar de cada lista  (write-behind a Mongo + invalida caché)
// ===========================================================================

// POST /sesion/:usuarioId/eliminados  Body: { pictoId }
//  Al eliminar un picto, lo sacamos de personalizados (no puede estar en ambas).
app.post("/sesion/:usuarioId/eliminados", async (req, res) => {
  const u = req.params.usuarioId;
  const id = String(req.body.pictoId);
  await redis.sAdd(kElim(u), id);
  await redis.sRem(kPers(u), id);
  await redis.expire(kElim(u), TTL);
  await invalidarCache(u);
  // Mongo: addToSet eliminados + pull personalizados (ya lo hace este endpoint).
  mongoPersist(`/api/eliminarElemento/${u}`, id);
  res.json(await leerListas(u));
});

// DELETE /sesion/:usuarioId/eliminados/:pictoId  -> restaura un picto.
app.delete("/sesion/:usuarioId/eliminados/:pictoId", async (req, res) => {
  const u = req.params.usuarioId;
  const pictoId = req.params.pictoId;
  await redis.sRem(kElim(u), String(pictoId));
  await invalidarCache(u);
  mongoPersist(`/api/restaurarElemento/${u}`, pictoId);
  res.json(await leerListas(u));
});

// POST /sesion/:usuarioId/personalizados  Body: { pictoId }  -> admite un custom.
app.post("/sesion/:usuarioId/personalizados", async (req, res) => {
  const u = req.params.usuarioId;
  const id = String(req.body.pictoId);
  await redis.sAdd(kPers(u), id);
  await redis.sRem(kElim(u), id);
  await redis.expire(kPers(u), TTL);
  await invalidarCache(u);
  // Mongo: addToSet personalizados + sacarlo de eliminados (espeja el SET de Redis).
  mongoPersist(`/api/agregarElementoPersonalizado/${u}`, id);
  mongoPersist(`/api/restaurarElemento/${u}`, id);
  res.json(await leerListas(u));
});

// DELETE /sesion/:usuarioId/personalizados/:pictoId
app.delete("/sesion/:usuarioId/personalizados/:pictoId", async (req, res) => {
  const u = req.params.usuarioId;
  const pictoId = req.params.pictoId;
  await redis.sRem(kPers(u), String(pictoId));
  await invalidarCache(u);
  mongoPersist(`/api/quitarElementoPersonalizado/${u}`, pictoId);
  res.json(await leerListas(u));
});

// ===========================================================================
//  PROXY A NEO4J — pictos ya filtrados por las listas (con caché)
// ===========================================================================

// GET /sesion/:usuarioId/padres  -> palabras de inicio filtradas (cacheado).
app.get("/sesion/:usuarioId/padres", async (req, res) => {
  const u = req.params.usuarioId;
  try {
    const cacheado = await redis.get(kCachePadres(u));
    if (cacheado) return res.json(JSON.parse(cacheado));
    const { eliminados, personalizados } = await leerListas(u);
    const data = await neo("/padres", {
      nodosEliminados: eliminados,
      nodosPersonalizados: personalizados,
    });
    await redis.set(kCachePadres(u), JSON.stringify(data), { EX: CACHE_TTL });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// POST /sesion/:usuarioId/siguientes  Body: { id }  -> siguientes filtrados (cacheado).
app.post("/sesion/:usuarioId/siguientes", async (req, res) => {
  const u = req.params.usuarioId;
  const id = Number(req.body.id);
  try {
    const key = kCacheSig(u, id);
    const cacheado = await redis.get(key);
    if (cacheado) return res.json(JSON.parse(cacheado));
    const { eliminados, personalizados } = await leerListas(u);
    const data = await neo("/siguientes", {
      id,
      nodosEliminados: eliminados,
      nodosPersonalizados: personalizados,
    });
    await redis
      .multi()
      .set(key, JSON.stringify(data), { EX: CACHE_TTL })
      .sAdd(kCacheSigIdx(u), key)
      .expire(kCacheSigIdx(u), CACHE_TTL)
      .exec();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// POST /sesion/:usuarioId/agregar  Body: { anteriorId, nuevaPalabra, pictos }
//  Crea un picto personalizado en Neo y lo ADMITE en la lista del usuario.
app.post("/sesion/:usuarioId/agregar", async (req, res) => {
  try {
    const u = req.params.usuarioId;
    const data = await neo("/agregar", {
      anteriorId: Number(req.body.anteriorId),
      nuevaPalabra: req.body.nuevaPalabra,
      pictos: req.body.pictos || [],
    });
    const nuevoId = data && data.nodo && data.nodo.id;
    if (nuevoId != null) {
      await redis.sAdd(kPers(u), String(nuevoId));
      await redis.expire(kPers(u), TTL);
      // Persistir el nuevo picto admitido en Mongo.
      mongoPersist(`/api/agregarElementoPersonalizado/${u}`, nuevoId);
    }
    await invalidarCache(u); // el grafo cambió: el caché viejo ya no sirve
    res.json({ ...data, ...(await leerListas(u)) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ===========================================================================
(async () => {
  try {
    await redis.connect();
    // Enmascara la password de la URL al loguear (no filtrar credenciales).
    console.log("Conectado a Redis:", REDIS_URL.replace(/:[^:@/]+@/, ":****@"));
  } catch (e) {
    console.error("No se pudo conectar a Redis al iniciar:", e.message);
    // reconnectStrategy seguirá reintentando en segundo plano; el server igual arranca.
  }
  app.listen(PORT, () =>
    console.log(`API de Redis en http://localhost:${PORT}  (Neo: ${NEO_API})`)
  );
})();
