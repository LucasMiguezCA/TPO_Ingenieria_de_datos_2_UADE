const express = require('express');
const app = express();

app.post("/reforzar", async (req, res) => {
  res.json({ mensaje: "reforzar" });
});

app.post("/delete", async (req, res) => {
  res.json({ mensaje: "delete" });
});

app.listen(4000, () => console.log('Test server on 4000'));
