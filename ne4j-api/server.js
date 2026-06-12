const express = require("express");
const neo4j = require("neo4j-driver");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : "*" }));
app.use(express.json());

// 📁 Configuración de la carpeta estática
// 1. Nos aseguramos de que la carpeta exista AL ARRANCAR el servidor (mucho más seguro)
const pictoFolder = path.join(__dirname, "pictogramas");
if (!fs.existsSync(pictoFolder)) {
  fs.mkdirSync(pictoFolder, { recursive: true });
}

// 2. Servimos la carpeta como estática para que el frontend pueda ver las fotos
app.use("/pictogramas", express.static(pictoFolder));

// 3. Configuración de Multer limpia (sin async/await)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Como ya creamos la carpeta arriba, simplemente le decimos a multer que la use
    cb(null, pictoFolder);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// 🔗 Conexión a Neo4j
const driver = neo4j.driver(
  process.env.NEO4J_URI || "bolt://localhost:7687",
  neo4j.auth.basic(process.env.NEO4J_USER || "neo4j", process.env.NEO4J_PASSWORD || "pictolink"), {
  disableLosslessIntegers: true
});

// GET /health -> verifica la conexión a Neo4j.
app.get("/health", async (req, res) => {
  try {
    await driver.verifyConnectivity();
    res.json({ servicio: "ne4j-api (Neo4j)", neo4j: "conectado" });
  } catch (e) {
    res.status(503).json({ servicio: "ne4j-api (Neo4j)", neo4j: "desconectado", error: e.message });
  }
});

// POST /padres -> Obtener nodos raíz
app.post("/padres", async (req, res) => {
  const { nodosPersonalizados = [], nodosEliminados = [] } = req.body;
  const session = driver.session();
  console.log("PADRES");
console.log("eliminados:", nodosEliminados);
console.log("personalizados:", nodosPersonalizados);

  try {
    const result = await session.run(
      `
      MATCH (p:Palabra)
      WHERE p.nodoPadre = true
        AND NOT p.id IN $eliminados
        AND (
          p.nodoPersonalizado IS NULL OR
          p.nodoPersonalizado = false OR
          p.id IN $personalizados
        )
      RETURN p
      `,
      {
        personalizados: nodosPersonalizados,
        eliminados: nodosEliminados
      }
    );

    const data = result.records.map(r => {
      const p = r.get("p").properties;
      return {
        id: p.id,
        palabra: p.palabra,
        pictos: [p.pictograma_1].filter(Boolean)
      };
    });

    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).send("Error al obtener los padres");
  } finally {
    await session.close();
  }
}); // FALTA LLAMADA PARA OBTENER LA LISTA DE ADMITIDOS

// POST /siguientes -> Obtener hijos de un nodo
app.post("/siguientes", async (req, res) => {
  const { id, nodosPersonalizados = [], nodosEliminados = [] } = req.body;
  const session = driver.session();
  console.log("SIGUIENTES");
console.log("id:", id);
console.log("eliminados:", nodosEliminados);
console.log("personalizados:", nodosPersonalizados);

  try {
    const result = await session.run(
      `
      MATCH (p:Palabra {id: $id})-[r:CONECTA_CON]->(siguiente)
      WHERE NOT siguiente.id IN $eliminados
        AND (
          siguiente.nodoPersonalizado IS NULL OR
          siguiente.nodoPersonalizado = false OR
          siguiente.id IN $personalizados
        )
      RETURN siguiente, r.peso AS peso
      ORDER BY peso DESC
      `,
      {
        id: Number(id),
        personalizados: nodosPersonalizados,
        eliminados: nodosEliminados
      }
    );

    const data = result.records.map(r => {
      const p = r.get("siguiente").properties;
      return {
        id: p.id,
        palabra: p.palabra,
        peso: r.get("peso"),
        pictos: [p.pictograma_1].filter(Boolean)
      };
    });

    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).send("Error al obtener los siguientes");
  } finally {
    await session.close();
  }
}); // ESTO SE VA A TENER QUE CONECTAR CON MONGO

// POST /agregar -> Agregar nodo (padre o hijo) con imagen
app.post("/agregar", upload.single('imagen'), async (req, res) => {
  const session = driver.session();
  try {
    // Al venir de un FormData, los valores son strings, los parseamos.
    const anteriorId = req.body.anteriorId ? Number(req.body.anteriorId) : null;
    const nuevaPalabra = req.body.nuevaPalabra;
    const nombreImagen = req.file ? req.file.filename : null;
    console.log("Archivo recibido por multer:", req.file);

    if (!nuevaPalabra) {
      return res.status(400).json({ error: "La palabra es requerida" });
    }

    let result;

    if (anteriorId) {
      // Tiene un ID anterior, se agrega como HIJO
      result = await session.run(
        `
        MATCH (n:Palabra)
        WITH coalesce(max(n.id), 0) + 1 AS nuevoId
        MATCH (anterior:Palabra {id: $anteriorId})
        CREATE (nuevo:Palabra {
          id: nuevoId,
          palabra: $palabra,
          nodoPersonalizado: true,
          nodoPadre: false,
          pictograma_1: $pic
        })
        MERGE (anterior)-[r:CONECTA_CON]->(nuevo)
        ON CREATE SET r.peso = 1
        RETURN nuevo
        `,
        { palabra: nuevaPalabra, anteriorId, pic: nombreImagen }
      );
    } else {
      // No hay anteriorId, se agrega como NODO PADRE
      result = await session.run(
        `
        MATCH (n:Palabra)
        WITH coalesce(max(n.id), 0) + 1 AS nuevoId
        CREATE (nuevo:Palabra {
          id: nuevoId,
          palabra: $palabra,
          nodoPersonalizado: true,
          nodoPadre: true,
          pictograma_1: $pic
        })
        RETURN nuevo
        `,
        { palabra: nuevaPalabra, pic: nombreImagen }
      );
    }

    const nuevo = result.records[0].get("nuevo").properties;
    res.json({ mensaje: "Nodo creado con éxito", nodo: nuevo });

  } catch (e) {
    console.error(e);
    res.status(500).send("Error al agregar nodo");
  } finally {
    await session.close();
  }
}); // FALTA HACER LA LLAMADA PARA BUSCAR EN LA LISTA DE ADMINTIDOS

// PUT /editar/:id -> Editar palabra o imagen
/*app.put("/editar/:id", upload.single("imagen"), async (req, res) => {
  const session = driver.session();
  const idNodo = Number(req.params.id);
  const nuevaPalabra = req.body.nuevaPalabra;
  const nuevaImagen = req.file ? req.file.filename : null;

  try {
    // Primero, traemos el nodo actual por si tenemos que borrar su imagen vieja
    const currentResult = await session.run(
      `MATCH (n:Palabra {id: $id}) RETURN n`,
      { id: idNodo }
    );

    if (currentResult.records.length === 0) {
      return res.status(404).json({ error: "Nodo no encontrado" });
    }

    const nodoAntiguo = currentResult.records[0].get("n").properties;

    // Actualizamos en Neo4j
    let query = `
      MATCH (n:Palabra {id: $id})
      SET n.palabra = $palabra
    `;
    
    // Si subieron una nueva imagen, actualizamos la propiedad
    if (nuevaImagen) {
      query += `, n.pictograma_1 = $pic`;
    }
    query += ` RETURN n`;

    const updateResult = await session.run(query, {
      id: idNodo,
      palabra: nuevaPalabra || nodoAntiguo.palabra,
      pic: nuevaImagen
    });

    const nodoActualizado = updateResult.records[0].get("n").properties;

    // Si se subió una nueva imagen y existía una vieja, borramos la vieja del FileSystem
    if (nuevaImagen && nodoAntiguo.pictograma_1) {
      try {
        await fs.unlink(path.join(pictoFolder, nodoAntiguo.pictograma_1));
      } catch (err) {
        console.error("Error al borrar imagen antigua:", err.message);
      }
    }

    res.json({ mensaje: "Nodo actualizado", nodo: nodoActualizado });

  } catch (e) {
    console.error(e);
    res.status(500).send("Error al editar nodo");
  } finally {
    await session.close();
  }
});*/

// DELETE /eliminar/:id -> Elimina un nodo y su imagen del FileSystem
/*app.delete("/eliminar/:id", async (req, res) => {
  const session = driver.session();
  const idNodo = Number(req.params.id);

  try {
    // Usamos DETACH DELETE para destruir el nodo y todas las relaciones que tenga
    const result = await session.run(
      `
      MATCH (n:Palabra {id: $id})
      WITH n, n.pictograma_1 AS pic
      DETACH DELETE n
      RETURN pic
      `,
      { id: idNodo }
    );

    if (result.records.length === 0) {
      return res.status(404).json({ error: "Nodo no encontrado" });
    }

    const imagenABorrar = result.records[0].get("pic");

    // Borramos la imagen del sistema de archivos de forma asíncrona
    if (imagenABorrar) {
      try {
        await fs.unlink(path.join(pictoFolder, imagenABorrar));
      } catch (err) {
        console.error("No se pudo borrar la imagen o no existía:", err.message);
      }
    }

    res.json({ mensaje: "Nodo eliminado con éxito" });

  } catch (e) {
    console.error(e);
    res.status(500).send("Error al eliminar nodo");
  } finally {
    await session.close();
  }
});*/

// Levantar servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});