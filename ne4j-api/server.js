require("dotenv").config();
const express = require("express");
const neo4j = require("neo4j-driver");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const streamifier = require("streamifier");

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

// Multer en memoria; subimos a Cloudinary usando upload_stream + streamifier
const upload = multer({ storage: multer.memoryStorage() });

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
    const resultado = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: "pictocomm" }, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
      streamifier.createReadStream(req.file.buffer).pipe(stream);
    });
    res.json({ url: resultado.secure_url });
  } catch (e) {
    console.error("Error upload Cloudinary:", e);
    res.status(500).json({ mensaje: "Error al subir imagen", error: e.message });
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

// Agregar pictograma con imagen desde Cloudinary
app.post("/agregar", async (req, res) => {
  const { anteriorId, nuevaPalabra, imagenUrl, nodoPadre, esGlobal } = req.body;
  const session = driver.session({ database: process.env.NEO4J_DATABASE });
  try {
    const maxResult = await session.run(
      `MATCH (n:Palabra) RETURN coalesce(max(n.id), 0) + 1 AS nuevoId`
    );
    const nuevoId = maxResult.records[0].get("nuevoId");

    // Si esGlobal es true, crear como nodo original visible para todos
    const nodoPersonalizadoFinal = esGlobal ? false : true;
    const nodoPadreFinal = esGlobal ? true : (anteriorId === null);

    if (anteriorId !== null && anteriorId !== undefined) {
      const result = await session.run(
        `MATCH (anterior:Palabra {id: $anteriorId})
         CREATE (nuevo:Palabra {
           id: $nuevoId,
           palabra: $palabra,
           imagenUrl: $imagenUrl,
           nodoPersonalizado: $nodoPersonalizado,
           nodoPadre: false
         })
         CREATE (anterior)-[:CONECTA_CON {peso: 1}]->(nuevo)
         RETURN nuevo`,
        { anteriorId, nuevoId, palabra: nuevaPalabra, imagenUrl: imagenUrl || null, nodoPersonalizado: nodoPersonalizadoFinal }
      );
      const nuevo = result.records[0].get("nuevo").properties;
      res.json({ mensaje: "Nodo creado y conectado", nodo: nuevo });
    } else {
      const result = await session.run(
        `CREATE (nuevo:Palabra {
           id: $nuevoId,
           palabra: $palabra,
           imagenUrl: $imagenUrl,
           nodoPersonalizado: $nodoPersonalizado,
           nodoPadre: $nodoPadre
         })
         RETURN nuevo`,
        { nuevoId, palabra: nuevaPalabra, imagenUrl: imagenUrl || null, nodoPersonalizado: nodoPersonalizadoFinal, nodoPadre: nodoPadreFinal }
      );
      const nuevo = result.records[0].get("nuevo").properties;
      res.json({ mensaje: "Nodo creado", nodo: nuevo });
    }
  } catch (e) {
    console.error("Error en /agregar:", e);
    res.status(500).json({ error: e.message });
  } finally {
    await session.close();
  }
});

// Mapear IDs a palabras (usado por el panel del terapeuta)
app.post("/palabrasPorIds", async (req, res) => {
  const { ids } = req.body;
  if (!ids || !ids.length) return res.json({});
  const session = driver.session({ database: process.env.NEO4J_DATABASE });
  try {
    const result = await session.run(
      `MATCH (p:Palabra) WHERE p.id IN $ids RETURN p.id AS id, p.palabra AS palabra`,
      { ids: ids.map(Number) }
    );
    const mapa = {};
    result.records.forEach(r => {
      mapa[String(r.get('id'))] = r.get('palabra');
    });
    res.json(mapa);
  } catch (e) {
    console.error('Error en /palabrasPorIds:', e);
    res.status(500).json({ error: e.message });
  } finally {
    await session.close();
  }
});

app.post("/reforzar", async (req, res) => {
  const { secuencia } = req.body;
  if (!secuencia || !Array.isArray(secuencia) || secuencia.length < 2) {
    return res.json({ mensaje: "Secuencia muy corta para reforzar" });
  }

  const session = driver.session({ database: process.env.NEO4J_DATABASE });
  try {
    for (let i = 0; i < secuencia.length - 1; i++) {
      const idActual = secuencia[i];
      const idSiguiente = secuencia[i + 1];
      await session.run(
        `MATCH (a:Palabra {id: $idActual}), (b:Palabra {id: $idSiguiente})
         MERGE (a)-[r:CONECTA_CON]->(b)
         ON CREATE SET r.peso = 1
         ON MATCH SET r.peso = coalesce(r.peso, 0) + 1`,
        { idActual, idSiguiente }
      );
    }
    res.json({ mensaje: "Relaciones reforzadas", pares: secuencia.length - 1 });
  } catch (e) {
    console.error("Error reforzando relaciones:", e);
    res.status(500).json({ error: e.message });
  } finally {
    await session.close();
  }
});

app.post("/eliminar", async (req, res) => {
  const id = Number(req.body.id);
  const session = driver.session({ database: process.env.NEO4J_DATABASE });
  try {
    const check = await session.run(
      `MATCH (p:Palabra {id: $id}) RETURN p.nodoPersonalizado AS esPersonalizado`,
      { id }
    );

    if (!check.records.length) {
      return res.status(404).json({ error: "Pictograma no encontrado" });
    }

    const esPersonalizado = check.records[0].get('esPersonalizado');

    if (esPersonalizado === true) {
      await session.run(
        `MATCH (p:Palabra {id: $id}) DETACH DELETE p`,
        { id }
      );
      return res.json({ mensaje: "Nodo personalizado eliminado", borradoDeNeo: true });
    }

    return res.json({ mensaje: "Pictograma original, agregar a eliminados del usuario", borradoDeNeo: false });
  } catch (e) {
    console.error("Error eliminando:", e);
    res.status(500).json({ error: e.message });
  } finally {
    await session.close();
  }
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`Servidor Neo4j en http://localhost:${PORT}`));