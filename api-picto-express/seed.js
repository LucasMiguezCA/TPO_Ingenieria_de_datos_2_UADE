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
const DB_URI = 'mongodb://127.0.0.1:27017/picto_mongodb';

// ----- Parsear argumentos de línea de comandos ------------------------------------------------------
const args = process.argv.slice(2);
const CANTIDAD = parseInt(args[args.indexOf('--cantidad') + 1]) || 20;
const LIMPIAR  = args.includes('--limpiar');

// ----- Esquema ------------------------------------------------------------------------------------------------
const usuarioSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    rol: { type: String, required: true, enum: ['usuario', 'terapeuta'] },
    terapeuta: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: function () {
            return this.rol === 'usuario';
        }
    },
    usuarios: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario'
    }],
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

async function generarUsuario(indice, rol, terapeutaId = null) {
    const username = `usuario_${String(indice).padStart(3, '0')}`;
    const password = `pass_${username}`;
    const passwordHasheada = await bcrypt.hash(password, SALT_ROUNDS);

    const usuario = {
        username,
        password: passwordHasheada,
        rol,
        colorFondo: elemento_aleatorio(COLORES),
        tamañoIconos: elemento_aleatorio(TAMAÑOS),
        listaEliminados: subarray_aleatorio(PICTOGRAMAS_EJEMPLO, 3),
        listaAdmitidosPersonalizados: subarray_aleatorio(PICTOGRAMAS_EJEMPLO, 5)
    };

    if (rol === 'usuario') {
        usuario.terapeuta = terapeutaId;
    } else {
        usuario.usuarios = [];
    }

    return usuario;
}

// ----- Main --------------------------------------------------------------------------------------------
async function main() {
    await mongoose.connect(DB_URI);
    console.log('✅ Conectado a MongoDB\n');

    if (LIMPIAR) {
        await Usuario.deleteMany({});
        console.log('🗑️  Colección limpiada\n');
    }

    console.log(`⏳ Generando ${CANTIDAD} registros de usuarios y terapeutas (esto puede tardar por el hash bcrypt)...`);

    const terapeutasCount = Math.max(1, Math.min(2, Math.floor(CANTIDAD / 5) || 1));
    const usuariosCount = Math.max(0, CANTIDAD - terapeutasCount);

    const terapeutas = [];
    for (let i = 1; i <= terapeutasCount; i++) {
        terapeutas.push(await generarUsuario(i, 'terapeuta'));
        process.stdout.write(`\r   Hasheando terapeutas... ${i}/${terapeutasCount}`);
    }

    const terapeutasInsertados = await Usuario.insertMany(terapeutas, { ordered: false });
    const terapeutasIds = terapeutasInsertados.map(t => t._id);

    const usuarios = [];
    for (let i = terapeutasCount + 1; i <= terapeutasCount + usuariosCount; i++) {
        const terapeutaAsignado = elemento_aleatorio(terapeutasIds);
        usuarios.push(await generarUsuario(i, 'usuario', terapeutaAsignado));
        process.stdout.write(`\r   Hasheando usuarios... ${i - terapeutasCount}/${usuariosCount}`);
    }
    console.log('\n');

    let insertados = 0;
    try {
        const resultadoUsuarios = await Usuario.insertMany(usuarios, { ordered: false });
        insertados = terapeutasInsertados.length + resultadoUsuarios.length;

        const gruposPorTerapeuta = resultadoUsuarios.reduce((acc, usuarioDoc) => {
            const id = usuarioDoc.terapeuta.toString();
            acc[id] = acc[id] || [];
            acc[id].push(usuarioDoc._id);
            return acc;
        }, {});

        for (const [terapeutaId, usuariosIds] of Object.entries(gruposPorTerapeuta)) {
            await Usuario.findByIdAndUpdate(terapeutaId, { usuarios: usuariosIds });
        }

        console.log(`✅ ${insertados} usuarios insertados correctamente.`);
    } catch (error) {
        if (error.code === 11000) {
            const insertadosParciales = error.result?.nInserted ?? '?';
            console.warn(`⚠️  Algunos usernames ya existían. Se insertaron ${insertadosParciales} documentos nuevos.`);
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