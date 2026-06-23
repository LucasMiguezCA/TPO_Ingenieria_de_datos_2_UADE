require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const neo4j = require("neo4j-driver");
const { v2: cloudinary } = require("cloudinary");
const fs = require("fs");
const path = require("path");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD),
  { disableLosslessIntegers: true }
);

const PICTOGRAMAS_DIR = path.join(__dirname, "pictogramas");

async function main() {
  const session = driver.session({ database: process.env.NEO4J_DATABASE });
  
  try {
    const archivos = fs.readdirSync(PICTOGRAMAS_DIR).filter(f => f.endsWith(".png"));
    console.log(`Encontradas ${archivos.length} imágenes`);

    for (let i = 0; i < archivos.length; i++) {
      const archivo = archivos[i];
      const id = parseInt(archivo.replace("_500.png", ""));
      const filePath = path.join(PICTOGRAMAS_DIR, archivo);

      console.log(`[${i+1}/${archivos.length}] Subiendo ${archivo}...`);

      // Subir a Cloudinary
      const result = await cloudinary.uploader.upload(filePath, {
        folder: "pictocomm",
        public_id: `picto_${id}`,
        overwrite: false
      });

      // Crear nodo en Neo4j si no existe
      await session.run(
        `MERGE (p:Palabra {id: $id})
         ON CREATE SET p.imagenUrl = $imagenUrl, p.nodoPersonalizado = false
         ON MATCH SET p.imagenUrl = $imagenUrl`,
        { id, imagenUrl: result.secure_url }
      );

      console.log(`  ✓ ${id} → ${result.secure_url}`);
    }

    console.log("\n✅ Todas las imágenes subidas y nodos actualizados en Neo4j");
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await session.close();
    await driver.close();
  }
}

main();