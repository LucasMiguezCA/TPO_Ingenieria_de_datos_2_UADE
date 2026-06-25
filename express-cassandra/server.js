const express = require('express');
const cors = require('cors');
const cassandra = require('cassandra-driver');
require('dotenv').config();

const token = process.env.ASTRA_TOKEN;
const app = express();

app.use(cors());
app.use(express.json());

const client = new cassandra.Client({
  cloud: {
    secureConnectBundle: './secure-connect-pictocomm.zip'
  },
  credentials: {
    username: 'token',
    password: ASTRA_TOKEN
  },
  keyspace: 'pictocomm'
});

async function connect() {
  await client.connect();
  console.log('Conectado a Astra');
}

connect().catch(console.error);

app.post('/interacciones', async (req, res) => {
  try {
    const { usuario_id, secuencia } = req.body;

    const timestamp = new Date();

    await client.execute(
      `INSERT INTO interacciones
       (usuario_id, timestamp, secuencia)
       VALUES (?, ?, ?)`,
      [usuario_id, timestamp, secuencia],
      { prepare: true }
    );

    res.status(201).json({
      mensaje: 'Interacción registrada correctamente'
    });
    console.log({
      mensaje: 'Interacción registrada correctamente'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
    console.log(err.message);
  }
});

app.get('/interacciones/:usuario_id', async (req, res) => {
  try {
    const result = await client.execute(
      `SELECT usuario_id, timestamp, secuencia
       FROM interacciones
       WHERE usuario_id = ?`,
      [req.params.usuario_id],
      { prepare: true }
    );

    res.json(result.rows);
    console.log(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
    console.log(err.message);
  }
});

app.get('/estadisticas/:usuario_id', async (req, res) => {
  try {
    const result = await client.execute(
      `SELECT timestamp, secuencia
       FROM interacciones
       WHERE usuario_id = ?`,
      [req.params.usuario_id],
      { prepare: true }
    );

    const rows = result.rows;

    if (!rows.length) {
      return res.status(404).json({
        error: 'No hay datos'
      });
      console.log('No hay datos');
    }

    const conteo = {};
    let total = 0;

    rows.forEach(r => {
      (r.secuencia || []).forEach(id => {
        conteo[id] = (conteo[id] || 0) + 1;
        total++;
      });
    });

    const top5 = Object.entries(conteo)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, usos]) => ({
        pictograma_id: Number(id),
        usos
      }));

    res.json({
      usuario_id: req.params.usuario_id,
      total_sesiones: rows.length,
      total_pictogramas_usados: total,
      promedio_por_sesion: total / rows.length,
      top_5_pictogramas: top5
    });
    console.log({
        usuario_id: req.params.usuario_id,
      total_sesiones: rows.length,
      total_pictogramas_usados: total,
      promedio_por_sesion: total / rows.length,
      top_5_pictogramas: top5
    })

  } catch (err) {
    res.status(500).json({ error: err.message });
    console.log(err.message);
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    mensaje: 'PictoComm API con Astra'
  });
});

app.listen(8000, () => {
  console.log('Servidor escuchando en puerto 8000');
});