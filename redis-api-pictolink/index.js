/**
 * PictoLink · API de Redis (sesión activa)
 * ---------------------------------------------------------------------------
 * Rol de Redis en PictoLink: SESIÓN ACTIVA del usuario. Al iniciar sesión, las
 * dos listas del usuario se cargan en Redis DESDE MONGO (con TTL) y la app las
 * lee/escribe rápido desde ahí, sin golpear las otras bases en cada interacción.
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
const express = require("express");
const cors = require("cors");
const { createClient } = require("redis");

const PORT = process.env.PORT || 4000;
const NEO_API = process.env.NEO_API_URL || "http://localhost:3001";
const MONGO_API = process.env.MONGO_API_URL || "http://localhost:3000";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const TTL = 3600; // 1 hora de sesión

const app = express();
app.use(cors());
app.use(express.json());

const redis = createClient({
  url: REDIS_URL,
  // Reintenta la conexión: clave para Redis en la nube (cortes de red transitorios).
  socket: { reconnectStrategy: (intentos) => Math.min(intentos * 200, 5000) },
});
redis.on("error", (e) => console.error("Redis error:", e.message));

// Claves de Redis por usuario (un SET por lista)
const kElim = (u) => `sesion:${u}:eliminados`;
const kPers = (u) => `sesion:${u}:personalizados`;

// Lee las dos listas y las devuelve como arrays de números (lo que espera Neo).
async function leerListas(u) {
  const [elim, pers] = await Promise.all([
    redis.sMembers(kElim(u)),
    redis.sMembers(kPers(u)),
  ]);
  return { eliminados: elim.map(Number), personalizados: pers.map(Number) };
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
async function listasDeMongo(usuarioId) {
  const r = await fetch(`${MONGO_API}/api/usuarios/${usuarioId}`);
  if (!r.ok) throw new Error(`API de Mongo /api/usuarios respondió ${r.status}`);
  const u = await r.json();
  return {
    eliminados: u.listaEliminados || [],
    personalizados: u.listaAdmitidosPersonalizados || [],
  };
}

// ===========================================================================
//  SESIÓN — iniciar / ver / cerrar
// ===========================================================================

// POST /sesion/:usuarioId  -> inicia sesión cargando las listas (con TTL).
//  Por defecto las trae de Mongo (hidratación Mongo -> Redis). Se pueden pasar
//  por body { eliminados:[ids], personalizados:[ids] } para testear sin Mongo.
app.post("/sesion/:usuarioId", async (req, res) => {
  const u = req.params.usuarioId;
  try {
    let { eliminados, personalizados } = req.body;
    // Si el body no trae las listas, las buscamos en Mongo.
    if (eliminados === undefined && personalizados === undefined) {
      ({ eliminados, personalizados } = await listasDeMongo(u));
    }
    eliminados = eliminados || [];
    personalizados = personalizados || [];

    const multi = redis.multi();
    multi.del(kElim(u));
    multi.del(kPers(u));
    if (eliminados.length) multi.sAdd(kElim(u), eliminados.map(String));
    if (personalizados.length) multi.sAdd(kPers(u), personalizados.map(String));
    multi.expire(kElim(u), TTL);
    multi.expire(kPers(u), TTL);
    await multi.exec();

    res.json({ mensaje: "Sesión iniciada", usuario: u, ...(await leerListas(u)) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /sesion/:usuarioId/listas  -> devuelve las dos listas.
app.get("/sesion/:usuarioId/listas", async (req, res) => {
  res.json(await leerListas(req.params.usuarioId));
});

// DELETE /sesion/:usuarioId  -> cierra sesión (borra las listas).
app.delete("/sesion/:usuarioId", async (req, res) => {
  const u = req.params.usuarioId;
  // node-redis v4: del toma una key o un ARRAY de keys (no varargs posicionales).
  await redis.del([kElim(u), kPers(u)]);
  res.json({ mensaje: "Sesión cerrada", usuario: u });
});

// ===========================================================================
//  LISTAS — agregar / quitar de cada lista
// ===========================================================================

// POST /sesion/:usuarioId/eliminados  Body: { pictoId }
//  Al eliminar un picto, lo sacamos de personalizados (no puede estar en ambas).
app.post("/sesion/:usuarioId/eliminados", async (req, res) => {
  const u = req.params.usuarioId;
  const id = String(req.body.pictoId);
  await redis.sAdd(kElim(u), id);
  await redis.sRem(kPers(u), id);
  await redis.expire(kElim(u), TTL);
  res.json(await leerListas(u));
});

// DELETE /sesion/:usuarioId/eliminados/:pictoId  -> restaura un picto.
app.delete("/sesion/:usuarioId/eliminados/:pictoId", async (req, res) => {
  await redis.sRem(kElim(req.params.usuarioId), String(req.params.pictoId));
  res.json(await leerListas(req.params.usuarioId));
});

// POST /sesion/:usuarioId/personalizados  Body: { pictoId }  -> admite un custom.
app.post("/sesion/:usuarioId/personalizados", async (req, res) => {
  const u = req.params.usuarioId;
  const id = String(req.body.pictoId);
  await redis.sAdd(kPers(u), id);
  await redis.sRem(kElim(u), id);
  await redis.expire(kPers(u), TTL);
  res.json(await leerListas(u));
});

// DELETE /sesion/:usuarioId/personalizados/:pictoId
app.delete("/sesion/:usuarioId/personalizados/:pictoId", async (req, res) => {
  await redis.sRem(kPers(req.params.usuarioId), String(req.params.pictoId));
  res.json(await leerListas(req.params.usuarioId));
});

// ===========================================================================
//  PROXY A NEO4J — pictos ya filtrados por las listas de la sesión
// ===========================================================================

// GET /sesion/:usuarioId/padres  -> palabras de inicio filtradas.
app.get("/sesion/:usuarioId/padres", async (req, res) => {
  try {
    const { eliminados, personalizados } = await leerListas(req.params.usuarioId);
    const data = await neo("/padres", {
      nodosEliminados: eliminados,
      nodosPersonalizados: personalizados,
    });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// POST /sesion/:usuarioId/siguientes  Body: { id }  -> siguientes filtrados.
app.post("/sesion/:usuarioId/siguientes", async (req, res) => {
  try {
    const { eliminados, personalizados } = await leerListas(req.params.usuarioId);
    const data = await neo("/siguientes", {
      id: Number(req.body.id),
      nodosEliminados: eliminados,
      nodosPersonalizados: personalizados,
    });
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
    }
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
