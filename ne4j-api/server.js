require("dotenv").config();
const express = require("express");
const neo4j = require("neo4j-driver");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use("/pictogramas", express.static(path.join(__dirname, "pictogramas")));

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: { folder: "pictocomm", allowed_formats: ["jpg", "png", "gif", "webp"] },
});
const upload = multer({ storage });

// Neo4j connection
const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD),
  { disableLosslessIntegers: true }
);

// Health check
app.get("/health", async (req, res) => {
  try {
    await driver.verifyConnectivity();
    res.json({ servicio: "ne4j-api (Neo4j)", neo4j: "conectado" });
  } catch (e) {
    res.status(503).json({ servicio: "ne4j-api (Neo4j)", neo4j: "desconectado", error: e.message });
  }
});

// Subir imagen a Cloudinary
app.post("/upload", upload.single("imagen"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ mensaje: "No se recibió imagen" });
    res.json({ url: req.file.path });
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: "Error al subir imagen" });
  }
});

// Pictogramas padre
app.post("/padres", async (req, res) => {
  const { nodosPersonalizados = [], nodosEliminados = [] } = req.body;
  const session = driver.session({ database: process.env.NEO4J_DATABASE });
  try {
    const result = await session.run(
      `MATCH (p:Palabra)
       WHERE p.nodoPadre = true
         AND NOT p.id IN $eliminados
         AND (p.nodoPersonalizado IS NULL OR p.nodoPersonalizado = false OR p.id IN $personalizados)
       RETURN p`,
      { personalizados: nodosPersonalizados, eliminados: nodosEliminados }
    );
    const data = result.records.map(r => {
      const p = r.get("p").properties;
      return {
        id: p.id,
        palabra: p.palabra,
        imagenUrl: p.imagenUrl || null,
        pictos: [p.pictograma_1, p.pictograma_2, p.pictograma_3].filter(Boolean)
      };
    });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).send("Error");
  } finally {
    await session.close();
  }
});

// Pictogramas siguientes
app.post("/siguientes", async (req, res) => {
  const { id, nodosPersonalizados = [], nodosEliminados = [] } = req.body;
  const session = driver.session({ database: process.env.NEO4J_DATABASE });
  try {
    const result = await session.run(
      `MATCH (p:Palabra {id: $id})-[r:CONECTA_CON]->(siguiente)
       WHERE NOT siguiente.id IN $eliminados
         AND (siguiente.nodoPersonalizado IS NULL OR siguiente.nodoPersonalizado = false OR siguiente.id IN $personalizados)
       RETURN siguiente, r.peso AS peso
       ORDER BY peso DESC`,
      { id, personalizados: nodosPersonalizados, eliminados: nodosEliminados }
    );
    const data = result.records.map(r => {
      const p = r.get("siguiente").properties;
      return {
        id: p.id,
        palabra: p.palabra,
        peso: r.get("peso"),
        imagenUrl: p.imagenUrl || null,
        pictos: [p.pictograma_1, p.pictograma_2, p.pictograma_3].filter(Boolean)
      };
    });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).send("Error");
  } finally {
    await session.close();
  }
});

// Buscar palabras por IDs
app.post("/palabras", async (req, res) => {
  const { ids = [] } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ mensaje: 'ids debe ser un arreglo' });
  const numericIds = ids.map(id => Number(id)).filter(id => !Number.isNaN(id));
  if (!numericIds.length) return res.json({});
  const session = driver.session({ database: process.env.NEO4J_DATABASE });
  try {
    const result = await session.run(
      `MATCH (p:Palabra)
       WHERE p.id IN $ids
       RETURN p`,
      { ids: numericIds }
    );
    const map = {};
    result.records.forEach(r => {
      const p = r.get("p").properties;
      if (p.id !== undefined && p.palabra !== undefined) {
        map[p.id] = p.palabra;
      }
    });
    res.json(map);
  } catch (e) {
    console.error(e);
    res.status(500).send("Error");
  } finally {
    await session.close();
  }
});

// Buscar palabras por IDs (endpoint usado por pictocomm.html)
app.post('/palabrasPorIds', async (req, res) => {
  const { ids = [] } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ mensaje: 'ids debe ser un arreglo' });
  const numericIds = ids.map(id => Number(id)).filter(id => !Number.isNaN(id));
  if (!numericIds.length) return res.json({});
  const session = driver.session({ database: process.env.NEO4J_DATABASE });
  try {
    const result = await session.run(
      `MATCH (p:Palabra)
       WHERE p.id IN $ids
       RETURN p.id AS id, p.palabra AS palabra`,
      { ids: numericIds }
    );
    const mapa = {};
    result.records.forEach(r => {
      mapa[String(r.get('id'))] = r.get('palabra');
    });
    res.json(mapa);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    await session.close();
  }
});

// Debug: listar rutas registradas (temporal)
app.get('/_debug_routes', (req, res) => {
  try {
    const routes = [];
    app._router.stack.forEach((middleware) => {
      if (middleware.route) {
        const methods = Object.keys(middleware.route.methods).join(',');
        routes.push({ path: middleware.route.path, methods });
      } else if (middleware.name === 'router' && middleware.handle && middleware.handle.stack) {
        middleware.handle.stack.forEach((handler) => {
          if (handler.route) {
            const methods = Object.keys(handler.route.methods).join(',');
            routes.push({ path: handler.route.path, methods });
          }
        });
      }
    });
    res.json(routes);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Agregar pictograma con imagen desde Cloudinary
app.post("/agregar", async (req, res) => {
  const { anteriorId, nuevaPalabra, imagenUrl } = req.body;
  const session = driver.session({ database: process.env.NEO4J_DATABASE });
  try {
    const result = await session.run(
      `MATCH (n:Palabra)
       WITH coalesce(max(n.id), 0) + 1 AS nuevoId
       CREATE (nuevo:Palabra {
         id: nuevoId,
         palabra: $palabra,
         imagenUrl: $imagenUrl,
         nodoPersonalizado: true,
         nodoPadre: true
       })
       RETURN nuevo`,
      { palabra: nuevaPalabra, imagenUrl: imagenUrl || null }
    );
    const nuevo = result.records[0].get("nuevo").properties;
    res.json({ mensaje: "Nodo creado", nodo: nuevo });
  } catch (e) {
    console.error(e);
    res.status(500).send("Error");
  } finally {
    await session.close();
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor Neo4j en http://localhost:${PORT}`));