const express = require("express");
const neo4j = require("neo4j-driver");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// 🔗 conexión a Neo4j
const driver = neo4j.driver(
  "bolt://localhost:7687",
  neo4j.auth.basic("neo4j", "pictolink"), {
  disableLosslessIntegers: true
}
);

app.post("/padres", async (req, res) => {
  const { nodosPersonalizados = [], nodosEliminados = [] } = req.body;
  const session = driver.session();

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
});//FALTA LLAMADA PARA OBTENER LA LISTA DE ADMITIDOS

app.post("/siguientes", async (req, res) => {
  const { id, nodosPersonalizados = [], nodosEliminados = [] } = req.body;
  const session = driver.session();

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
        id,
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
}); //ESTO SE VA A TENNER QUE CONECTAR CON MONGO PARA DEFINIR QUE ES UNA OPCIONAL
//FALTA HACER LA LLAMADA PARA OBTENER LA LISTA DE ADMITIDOS

app.post("/agregar", async (req, res) => {
  const { anteriorId, nuevaPalabra, pictos = [] } = req.body;
  const session = driver.session();

  try {
    const result = await session.run(
      `
      // obtener nuevo ID
      MATCH (n:Palabra)
      WITH coalesce(max(n.id), 0) + 1 AS nuevoId

      // crear nodo
      CREATE (nuevo:Palabra {
        id: nuevoId,
        palabra: $palabra,
        nodoPersonalizado: true,
        pictograma_1: $pic1,
        pictograma_2: $pic2,
        pictograma_3: $pic3
      })

      WITH nuevo
      MATCH (anterior:Palabra {id: $anteriorId})

      MERGE (anterior)-[r:CONECTA_CON]->(nuevo)
      ON CREATE SET r.peso = 1

      RETURN nuevo
      `,
      {
        palabra: nuevaPalabra,
        anteriorId,
        pic1: pictos[0] || null,
        pic2: pictos[1] || null,
        pic3: pictos[2] || null
      }
    );

    const nuevo = result.records[0].get("nuevo").properties;

    res.json({
      mensaje: "Nodo creado con ID incremental",
      nodo: nuevo
    });

  } catch (e) {
    console.error(e);
    res.status(500).send("Error");
  } finally {
    await session.close();
  }
});
//FALTA HACER LA LLAMADA PARA BUSCAR EN LA LISTA DE ADMINTIDOS



// Neo4j escucha en 3001 para no chocar con la API de Mongo (api-picto-express),
// que usa el 3000. La API de Redis apunta acá vía NEO_API_URL (default 3001).
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});