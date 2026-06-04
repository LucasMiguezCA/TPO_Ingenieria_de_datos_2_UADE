const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const app = express();

const SALT_ROUNDS = 10;
const PORT = 3000;

app.use(express.json());

// ----- Conectar a MongoDB ----------------------------------------------------------------------------
mongoose.connect('mongodb://127.0.0.1:27017/picto_mongodb')
    .then(() => console.log('Conectado exitosamente a MongoDB'))
    .catch(err => console.error('Error al conectar a MongoDB:', err));

// ----- ESQUEMA DE USUARIO ----------------------------------------------------------------------
const usuarioSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    colorFondo: { type: String, default: '#FFFFFF' },
    tamañoIconos: { type: String, default: 'mediano', enum: ['pequeño', 'mediano', 'grande'] },
    listaEliminados: { type: [Number], default: [] },
    listaAdmitidosPersonalizados: { type: [Number], default: [] }
}, { timestamps: true });

const Usuario = mongoose.model('Usuario', usuarioSchema);

// ----- RUTAS CRUD ------------------------------------------------------------------------------

// GET: Obtener todos los usuarios
app.get('/api/usuarios', async (req, res) => {
    try {
        const usuarios = await Usuario.find().select('-password');
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener usuarios' });
    }
});

// GET por ID: Obtener un usuario específico
app.get('/api/usuarios/:id', async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.params.id).select('-password');
        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        res.json(usuario);
    } catch (error) {
        res.status(500).json({ mensaje: 'ID no válido o error de servidor' });
    }
});

// DELETE: Eliminar un usuario
app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        const usuario = await Usuario.findByIdAndDelete(req.params.id);
        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        res.json({ mensaje: 'Usuario eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar' });
    }
});

// POST /api/registrar
// Body: { username, password, colorFondo?, tamañoIconos? }
app.post('/api/registrar', async (req, res) => {
    const { username, password, colorFondo, tamañoIconos } = req.body;

    if (!username || !password) {
        return res.status(400).json({ mensaje: 'username y password son obligatorios' });
    }

    try {
        const passwordHasheada = await bcrypt.hash(password, SALT_ROUNDS);

        const nuevoUsuario = new Usuario({
            username,
            password: passwordHasheada,
            colorFondo: colorFondo || '#FFFFFF',
            tamañoIconos: tamañoIconos || 'mediano',
            listaEliminados: [],
            listaAdmitidosPersonalizados: []
        });

        await nuevoUsuario.save();

        const respuesta = nuevoUsuario.toObject();
        delete respuesta.password;

        res.status(201).json({ mensaje: 'Usuario registrado exitosamente', usuario: respuesta });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ mensaje: 'El username ya está en uso' });
        }
        res.status(400).json({ mensaje: 'Error al registrar usuario', detalle: error.message });
    }
});

// POST /api/iniciarSesion
// Body: { username, password }
app.post('/api/iniciarSesion', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ mensaje: 'username y password son obligatorios' });
    }

    try {
        const usuario = await Usuario.findOne({ username });

        if (!usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }

        const passwordValida = await bcrypt.compare(password, usuario.password);
        if (!passwordValida) {
            return res.status(401).json({ mensaje: 'Contraseña incorrecta' });
        }

        res.json({
            mensaje: 'Sesión iniciada exitosamente',
            usuario: {
                _id: usuario._id,
                username: usuario.username,
                colorFondo: usuario.colorFondo,
                tamañoIconos: usuario.tamañoIconos,
                listaEliminados: usuario.listaEliminados,
                listaAdmitidosPersonalizados: usuario.listaAdmitidosPersonalizados
            }
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al iniciar sesión', detalle: error.message });
    }
});

// PUT /api/cambiarConfig/:id
// Body: { colorFondo?, tamañoIconos? }
app.put('/api/cambiarConfig/:id', async (req, res) => {
    const { colorFondo, tamañoIconos } = req.body;

    if (!colorFondo && !tamañoIconos) {
        return res.status(400).json({ mensaje: 'Debés enviar al menos colorFondo o tamañoIconos' });
    }

    const cambios = {};
    if (colorFondo) cambios.colorFondo = colorFondo;
    if (tamañoIconos) cambios.tamañoIconos = tamañoIconos;

    try {
        const usuario = await Usuario.findByIdAndUpdate(
            req.params.id,
            { $set: cambios },
            { new: true, runValidators: true }
        ).select('-password');

        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

        res.json({ mensaje: 'Configuración actualizada', usuario });
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar configuración', detalle: error.message });
    }
});

// POST /api/agregarElementoPersonalizado/:id
// Body: { pictogramaId: number }
app.post('/api/agregarElementoPersonalizado/:id', async (req, res) => {
    const pictogramaId = parseInt(req.body.pictogramaId);

    if (isNaN(pictogramaId)) {
        return res.status(400).json({ mensaje: 'pictogramaId debe ser un número entero' });
    }

    try {
        const usuario = await Usuario.findByIdAndUpdate(
            req.params.id,
            { $addToSet: { listaAdmitidosPersonalizados: pictogramaId } },
            { new: true }
        ).select('-password');

        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

        res.json({
            mensaje: 'Elemento personalizado agregado',
            listaAdmitidosPersonalizados: usuario.listaAdmitidosPersonalizados
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al agregar elemento', detalle: error.message });
    }
});

// POST /api/eliminarElemento/:id
// Body: { pictogramaId: number }
app.post('/api/eliminarElemento/:id', async (req, res) => {
    const pictogramaId = parseInt(req.body.pictogramaId);

    if (isNaN(pictogramaId)) {
        return res.status(400).json({ mensaje: 'pictogramaId debe ser un número entero' });
    }

    try {
        const usuario = await Usuario.findByIdAndUpdate(
            req.params.id,
            {
                $addToSet: { listaEliminados: pictogramaId },
                $pull: { listaAdmitidosPersonalizados: pictogramaId }
            },
            { new: true }
        ).select('-password');

        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

        res.json({
            mensaje: 'Elemento eliminado',
            listaEliminados: usuario.listaEliminados,
            listaAdmitidosPersonalizados: usuario.listaAdmitidosPersonalizados
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar elemento', detalle: error.message });
    }
});

// POST /api/restaurarElemento/:id  -> saca un picto de listaEliminados (lo vuelve a mostrar)
// Body: { pictogramaId: number }
app.post('/api/restaurarElemento/:id', async (req, res) => {
    const pictogramaId = parseInt(req.body.pictogramaId);

    if (isNaN(pictogramaId)) {
        return res.status(400).json({ mensaje: 'pictogramaId debe ser un número entero' });
    }

    try {
        const usuario = await Usuario.findByIdAndUpdate(
            req.params.id,
            { $pull: { listaEliminados: pictogramaId } },
            { new: true }
        ).select('-password');

        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

        res.json({ mensaje: 'Elemento restaurado', listaEliminados: usuario.listaEliminados });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al restaurar elemento', detalle: error.message });
    }
});

// POST /api/quitarElementoPersonalizado/:id  -> saca un picto de listaAdmitidosPersonalizados
// Body: { pictogramaId: number }
app.post('/api/quitarElementoPersonalizado/:id', async (req, res) => {
    const pictogramaId = parseInt(req.body.pictogramaId);

    if (isNaN(pictogramaId)) {
        return res.status(400).json({ mensaje: 'pictogramaId debe ser un número entero' });
    }

    try {
        const usuario = await Usuario.findByIdAndUpdate(
            req.params.id,
            { $pull: { listaAdmitidosPersonalizados: pictogramaId } },
            { new: true }
        ).select('-password');

        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

        res.json({ mensaje: 'Elemento personalizado quitado', listaAdmitidosPersonalizados: usuario.listaAdmitidosPersonalizados });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al quitar elemento', detalle: error.message });
    }
});

// ----- SEED — Poblar con usuarios ficticios -----------------------------------------------------------------------
// POST /api/seed
// Body: { cantidad?: number (default 20), limpiar?: boolean (default false) }

const COLORES_SEED = ['#FFFFFF', '#FFF9C4', '#E3F2FD', '#F3E5F5', '#E8F5E9', '#FFE0B2', '#FCE4EC'];
const TAMAÑOS_SEED = ['pequeño', 'mediano', 'grande'];
// IDs enteros simulando pictogramas de Neo4j
const PICTOGRAMAS_SEED = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

function elementoAleatorio(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function subarrayAleatorio(arr, max = 4) {
    const copia = [...arr].sort(() => 0.5 - Math.random());
    return copia.slice(0, Math.floor(Math.random() * (max + 1)));
}

app.post('/api/seed', async (req, res) => {
    const cantidad = parseInt(req.body.cantidad) || 20;
    const limpiar  = req.body.limpiar === true;

    if (cantidad < 1 || cantidad > 200) {
        return res.status(400).json({ mensaje: 'cantidad debe estar entre 1 y 200' });
    }

    try {
        if (limpiar) await Usuario.deleteMany({});

        const usuarios = [];
        for (let i = 1; i <= cantidad; i++) {
            const username = `usuario_${String(i).padStart(3, '0')}`;
            const password = `pass_${username}`;
            const passwordHasheada = await bcrypt.hash(password, SALT_ROUNDS);
            usuarios.push({
                username,
                password: passwordHasheada,
                colorFondo: elementoAleatorio(COLORES_SEED),
                tamañoIconos: elementoAleatorio(TAMAÑOS_SEED),
                listaEliminados: subarrayAleatorio(PICTOGRAMAS_SEED, 3),
                listaAdmitidosPersonalizados: subarrayAleatorio(PICTOGRAMAS_SEED, 5)
            });
        }

        let insertados = 0;
        let duplicados = 0;
        try {
            const resultado = await Usuario.insertMany(usuarios, { ordered: false });
            insertados = resultado.length;
        } catch (error) {
            if (error.code === 11000) {
                insertados = error.result?.nInserted ?? 0;
                duplicados = cantidad - insertados;
            } else {
                throw error;
            }
        }

        res.status(201).json({
            mensaje: 'Seed completado',
            insertados,
            duplicados_omitidos: duplicados,
            coleccionLimpiada: limpiar,
            credencialesDePrueba: {
                formato_username: 'usuario_001 ... usuario_' + String(cantidad).padStart(3, '0'),
                formato_password: 'pass_usuario_NNN'
            }
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error durante el seed', detalle: error.message });
    }
});

// ----- SERVIDOR -------------------------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});