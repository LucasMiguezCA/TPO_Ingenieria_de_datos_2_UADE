require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const neo4j = require("neo4j-driver");

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD),
  { disableLosslessIntegers: true }
);

const palabras = [
  "yo","tú","él","ella","nosotros","vosotros","ellos",
  "mi","tu","su","nuestro","vuestro",
  "me","te","se","nos","os",
  "este","ese","aquel",
  "aquí","ahí","allí",
  "el","la","los","las",
  "un","una","unos","unas",
  "de","del","a","ante","bajo","con","contra","desde",
  "durante","en","entre","hacia","hasta","para","por",
  "según","sin","sobre","tras",
  "y","e","o","u","pero","aunque","si","porque","como",
  "cuando","mientras","donde","que","quien","cual",
  "ser","estar","tener","hacer","decir","ir","venir",
  "ver","dar","saber","querer","poder","deber","poner",
  "parecer","quedar","creer","hablar","llevar","dejar",
  "seguir","encontrar","llamar","pensar","salir","volver",
  "tomar","conocer","vivir","sentir","tratar","mirar",
  "contar","empezar","esperar","buscar","existir","entrar",
  "trabajar","escribir","perder","producir","ocurrir",
  "entender","pedir","recibir","recordar","terminar",
  "permitir","aparecer","conseguir","comenzar","servir",
  "sacar","necesitar","mantener","resultar","leer","caer",
  "cambiar","presentar","crear","abrir","considerar","oír",
  "acabar","convertir","ganar","formar","traer","partir",
  "morir","aceptar","realizar","suponer","comprender",
  "lograr","explicar","preguntar","tocar","reconocer",
  "estudiar","alcanzar","nacer","dirigir","correr",
  "utilizar","pagar","ayudar","gustar","jugar","escuchar",
  "cumplir","ofrecer","descubrir","levantar","intentar",
  "usar","decidir","repetir","comer","beber","caminar",
  "amar","odiar","cerrar","dormir","despertar","comprar",
  "vender","viajar","cantar","bailar",
  "persona","gente","hombre","mujer","niño","niña",
  "familia","amigo","amiga","pareja","padre","madre",
  "hijo","hija","abuelo","abuela",
  "casa","habitación","puerta","ventana","mesa","silla",
  "cama","cocina","baño","escuela","universidad","trabajo",
  "oficina","empresa","tienda","mercado","hospital",
  "ciudad","pueblo","barrio","calle","camino","parque",
  "plaza","país","mundo","mar","río","montaña","bosque",
  "cielo","sol","luna","estrella","aire","tierra","fuego","agua",
  "día","noche","mañana","tarde","hora","minuto","tiempo",
  "año","mes","semana","momento",
  "comida","pan","café","té","vino","cerveza",
  "fruta","verdura","carne","pescado","arroz","pasta",
  "dinero","precio","compra","venta","problema","solución",
  "idea","verdad","mentira","pregunta","respuesta",
  "historia","razón","cambio","forma","nivel","grupo",
  "libro","película","música","juego","foto","imagen",
  "palabra","nombre","número","color","voz","sonido",
  "perro","gato","caballo","pájaro","pez",
  "amor","miedo","alegría","tristeza","enojo","esperanza",
  "felicidad","dolor","paz","guerra","fuerza","energía",
  "bueno","malo","grande","pequeño","alto","bajo",
  "nuevo","viejo","joven","importante","posible","difícil",
  "fácil","rápido","lento","fuerte","débil","feliz","triste",
  "claro","oscuro","simple","complejo","igual","diferente",
  "libre","seguro","correcto","incorrecto","lleno","vacío",
  "blanco","negro","gris","rojo","azul","verde","amarillo",
  "naranja","violeta","rosa","marrón",
  "mucho","poco","todo","nada","algo","alguien","nadie",
  "siempre","nunca","a veces","también","tampoco","ya",
  "todavía","quizás","tal vez","solo","casi","muy","más",
  "menos","bien","mal","mejor","peor","antes","después",
  "arriba","abajo","dentro","fuera","cerca","lejos",
  "hola","gracias","adios","lo siento"
];

// Nodos padre (los que aparecen primero en el dashboard)
const nodosPadre = [
  "yo","tú","él","ella","nosotros","hola","querer","poder",
  "hacer","ir","estar","ser","tener","necesitar","gustar"
];

// Relaciones: [desde, hacia, peso]
const relaciones = [
  ["yo","querer",10], ["yo","poder",9], ["yo","tener",8],
  ["yo","estar",7], ["yo","hacer",6], ["yo","ir",5],
  ["yo","necesitar",8], ["yo","gustar",7],
  ["tú","querer",10], ["tú","poder",9], ["tú","tener",8],
  ["él","querer",8], ["él","estar",7], ["él","hacer",6],
  ["ella","querer",8], ["ella","estar",7],
  ["nosotros","querer",8], ["nosotros","hacer",7],
  ["querer","comer",10], ["querer","beber",9],
  ["querer","jugar",8], ["querer","dormir",7],
  ["querer","ir",9], ["querer","hacer",8],
  ["poder","comer",8], ["poder","beber",7],
  ["poder","ir",9], ["poder","hacer",8],
  ["hacer","comida",8], ["hacer","juego",7],
  ["ir","casa",10], ["ir","escuela",9],
  ["ir","parque",8], ["ir","hospital",6],
  ["tener","hambre",10], ["tener","sed",9],
  ["tener","miedo",7], ["tener","dolor",6],
  ["estar","bien",10], ["estar","mal",9],
  ["estar","feliz",8], ["estar","triste",7],
  ["comer","pan",9], ["comer","fruta",8],
  ["comer","arroz",7], ["comer","pasta",7],
  ["comer","carne",6], ["comer","verdura",6],
  ["beber","agua",10], ["beber","café",7],
  ["beber","té",6], ["beber","jugo",8],
  ["hola","tú",8], ["hola","yo",7],
  ["gracias","tú",9], ["gracias","mucho",8],
  ["necesitar","agua",10], ["necesitar","ayuda",9],
  ["necesitar","ir",8], ["necesitar","comer",7],
];

async function main() {
  const session = driver.session({ database: process.env.NEO4J_DATABASE });
  try {
    console.log("Actualizando palabras en nodos existentes...");
    
    // 1. Actualizar cada nodo con su palabra buscando por ARASAAC
    for (let i = 0; i < palabras.length; i++) {
      const palabra = palabras[i];
      const idx = i + 1;
      const esPadre = nodosPadre.includes(palabra);

      // Buscar pictograma en ARASAAC
      let imagenUrl = null;
      try {
        const res = await fetch(`https://api.arasaac.org/api/pictograms/es/search/${encodeURIComponent(palabra)}`);
        const data = await res.json();
        if (data && data.length > 0) {
          const id = data[0]._id;
          imagenUrl = `https://static.arasaac.org/pictograms/${id}/${id}_500.png`;
        }
      } catch(e) {}

      await session.run(
        `MERGE (p:Palabra {id: $id})
         SET p.palabra = $palabra, p.nodoPadre = $esPadre, p.nodoPersonalizado = false
         ${imagenUrl ? ', p.imagenUrl = $imagenUrl' : ''}`,
        { id: idx, palabra, esPadre, imagenUrl }
      );

      console.log(`[${idx}/${palabras.length}] ✓ ${palabra}`);
    }

    // 2. Crear relaciones
    console.log("\nCreando relaciones...");
    for (const [desde, hacia, peso] of relaciones) {
      await session.run(
        `MATCH (a:Palabra {palabra: $desde}), (b:Palabra {palabra: $hacia})
         MERGE (a)-[r:CONECTA_CON]->(b)
         SET r.peso = $peso`,
        { desde, hacia, peso }
      );
      console.log(`  ✓ ${desde} → ${hacia}`);
    }

    console.log("\n✅ Base de datos lista!");
  } catch(e) {
    console.error("Error:", e);
  } finally {
    await session.close();
    await driver.close();
  }
}

main();