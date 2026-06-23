require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const neo4j = require("neo4j-driver");

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD),
  { disableLosslessIntegers: true }
);

// ── Categorías semánticas ──────────────────────────────────────────────────
const categorias = {
  pronombres: ["yo","tú","él","ella","nosotros","vosotros","ellos"],
  verbosModales: ["querer","poder","necesitar","gustar","deber"],
  verbosAccion: [
    "comer","beber","jugar","dormir","ir","hacer","ver","decir","dar","tomar",
    "comprar","vender","viajar","cantar","bailar","trabajar","estudiar","leer",
    "escribir","hablar","escuchar","ayudar","llamar","buscar","encontrar",
    "abrir","cerrar","llevar","traer","usar","caminar","mirar","despertar"
  ],
  estados: ["ser","estar","tener"],
  comida: ["pan","fruta","verdura","carne","pescado","arroz","pasta","comida"],
  bebida: ["agua","café","té","vino","cerveza"],
  lugares: [
    "casa","habitación","escuela","universidad","trabajo","oficina","tienda",
    "mercado","hospital","ciudad","pueblo","parque","plaza","cocina","baño"
  ],
  personas: [
    "persona","gente","hombre","mujer","niño","niña","familia","amigo","amiga",
    "padre","madre","hijo","hija","abuelo","abuela"
  ],
  objetos: ["libro","película","música","juego","foto","imagen","palabra"],
  animales: ["perro","gato","caballo","pájaro","pez"],
  sentimientos: [
    "feliz","triste","alegría","tristeza","enojo","miedo","amor","esperanza",
    "felicidad","dolor"
  ],
  adjetivos: ["bien","mal","bueno","malo","grande","pequeño","rápido","lento","fuerte","débil"],
  colores: ["blanco","negro","gris","rojo","azul","verde","amarillo","naranja","violeta","rosa","marrón"],
  sociales: ["gracias","hola","adios","lo siento","más","no"],
};

// ── Reglas de transición entre categorías [origen, destino, peso] ──────────
const reglas = [
  ["pronombres","verbosModales",10],
  ["pronombres","estados",8],
  ["pronombres","verbosAccion",6],

  ["verbosModales","verbosAccion",10],
  ["verbosModales","estados",6],
  ["verbosModales","comida",8],
  ["verbosModales","bebida",7],
  ["verbosModales","lugares",6],
  ["verbosModales","sentimientos",5],

  ["verbosAccion","comida",6],
  ["verbosAccion","bebida",5],
  ["verbosAccion","lugares",7],
  ["verbosAccion","objetos",6],
  ["verbosAccion","personas",5],
  ["verbosAccion","animales",4],

  ["estados","adjetivos",9],
  ["estados","sentimientos",8],
  ["estados","lugares",5],
  ["estados","personas",5],

  ["comida","sociales",5],
  ["bebida","sociales",5],
  ["lugares","sociales",5],
  ["objetos","sociales",5],
  ["personas","sociales",5],
  ["animales","sociales",5],
  ["adjetivos","sociales",5],
  ["sentimientos","sociales",5],
  ["colores","sociales",5],

  ["sociales","pronombres",4],
];

async function main() {
  const session = driver.session({ database: process.env.NEO4J_DATABASE });
  try {
    console.log("Creando relaciones por categorías...\n");
    let total = 0;

    for (const [catA, catB, peso] of reglas) {
      const palabrasA = categorias[catA];
      const palabrasB = categorias[catB];

      for (const desde of palabrasA) {
        for (const hacia of palabrasB) {
          if (desde === hacia) continue;
          await session.run(
            `MATCH (a:Palabra {palabra: $desde}), (b:Palabra {palabra: $hacia})
             MERGE (a)-[r:CONECTA_CON]->(b)
             ON CREATE SET r.peso = $peso
             ON MATCH SET r.peso = CASE WHEN r.peso < $peso THEN $peso ELSE r.peso END`,
            { desde, hacia, peso }
          );
          total++;
        }
      }
      console.log(`✓ ${catA} → ${catB} (peso ${peso}) — ${palabrasA.length * palabrasB.length} relaciones`);
    }

    console.log(`\n✅ Total relaciones procesadas: ${total}`);
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await session.close();
    await driver.close();
  }
}

main();