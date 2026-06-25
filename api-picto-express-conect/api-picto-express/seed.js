/**
 * SCRIPT DE "SEED" — Crear en MongoDB con usuarios ficticios
 * -------------------------------------------------------------------------------------
 * Uso:  node seed.js  (se crean 20 usuarios por default)
 *       node seed.js --cantidad 50       (cargar 50 usuarios)
 *       node seed.js --limpiar           (borra todos antes de insertar)
 *       node seed.js --cantidad 30 --limpiar (limpia toda la colección y cargar 30 usuarios nuevos)
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;
const DB_URI = 'mongodb+srv://ja646064_db_user:7Lh3NCTTApgDSzA7@cluster0.r6c7til.mongodb.net/picto_mongodb?appName=Cluster0';

// ----- Parsear argumentos de línea de comandos ------------------------------------------------------
const args = process.argv.slice(2);
const CANTIDAD = parseInt(args[args.indexOf('--cantidad') + 1]) || 20;
const LIMPIAR  = args.includes('--limpiar');

// ----- Esquema ------------------------------------------------------------------------------------------------
const usuarioSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    colorFondo: { type: String, default: '#FFFFFF' },
    tamañoIconos: { type: String, default: 'mediano', enum: ['pequeño', 'mediano', 'grande'] },
    listaEliminados: { type: [Number], default: [] },
    listaAdmitidosPersonalizados: { type: [Number], default: [] }
}, { timestamps: true });

const Usuario = mongoose.model('Usuario', usuarioSchema);

// ----- Datos ficticios -------------------------------------------------------------------------------------------
const COLORES = ['#FFFFFF', '#FFF9C4', '#E3F2FD', '#F3E5F5', '#E8F5E9', '#FFE0B2', '#FCE4EC'];
const TAMAÑOS = ['pequeño', 'mediano', 'grande'];
// IDs enteros simulando pictogramas de Neo4j
const PICTOGRAMAS_EJEMPLO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

function elemento_aleatorio(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function subarray_aleatorio(arr, max = 4) {
    const cantidad = Math.floor(Math.random() * (max + 1));
    const copia = [...arr].sort(() => 0.5 - Math.random());
    return copia.slice(0, cantidad);
}

async function generarUsuario(indice) {
    const username = `usuario_${String(indice).padStart(3, '0')}`;
    const password = `pass_${username}`;
    const passwordHasheada = await bcrypt.hash(password, SALT_ROUNDS);

    return {
        username,
        password: passwordHasheada,
        colorFondo: elemento_aleatorio(COLORES),
        tamañoIconos: elemento_aleatorio(TAMAÑOS),
        listaEliminados: subarray_aleatorio(PICTOGRAMAS_EJEMPLO, 3),
        listaAdmitidosPersonalizados: subarray_aleatorio(PICTOGRAMAS_EJEMPLO, 5)
    };
}

// ----- Main --------------------------------------------------------------------------------------------
async function main() {
    await mongoose.connect(DB_URI);
    console.log('✅ Conectado a MongoDB\n');

    if (LIMPIAR) {
        await Usuario.deleteMany({});
        console.log('🗑️  Colección limpiada\n');
    }

    console.log(`⏳ Generando ${CANTIDAD} usuarios (esto puede tardar por el hash bcrypt)...`);

    const usuarios = [];
    for (let i = 1; i <= CANTIDAD; i++) {
        usuarios.push(await generarUsuario(i));
        process.stdout.write(`\r   Hasheando contraseñas... ${i}/${CANTIDAD}`);
    }
    console.log('\n');

    try {
        const resultado = await Usuario.insertMany(usuarios, { ordered: false });
        console.log(`✅ ${resultado.length} usuarios insertados correctamente.`);
    } catch (error) {
        if (error.code === 11000) {
            const insertados = error.result?.nInserted ?? '?';
            console.warn(`⚠️  Algunos usernames ya existían. Se insertaron ${insertados} usuarios nuevos.`);
        } else {
            console.error('❌ Error al insertar:', error.message);
        }
    }

    console.log('\n📋 Credenciales de prueba generadas:');
    console.log('   username: usuario_001 → usuario_' + String(CANTIDAD).padStart(3, '0'));
    console.log('   password: pass_usuario_NNN  (donde NNN es el número del usuario)\n');

    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
}

main().catch(err => {
    console.error('Error fatal:', err);
    mongoose.disconnect();
    process.exit(1);
});