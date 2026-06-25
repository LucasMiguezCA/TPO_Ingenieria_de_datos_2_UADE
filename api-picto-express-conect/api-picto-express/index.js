const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();

const SALT_ROUNDS = 10;
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://ja646064_db_user:7Lh3NCTTApgDSzA7@cluster0.r6c7til.mongodb.net/picto_mongodb?appName=Cluster0';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-pictolink';
const AUTH_REQUIRED = process.env.AUTH_REQUIRED === 'true';
const SERVICE_KEY = process.env.SERVICE_KEY || 'dev-service-pictolink';

app.use(cors());
app.use(express.json());

function requireAuth(req, res, next) {
    if (!AUTH_REQUIRED) return next();
    if (req.headers['x-service-key'] === SERVICE_KEY) return next();
    const [esquema, token] = (req.headers.authorization || '').split(' ');
    if (esquema !== 'Bearer' || !token)
        return res.status(401).json({ mensaje: 'Token inválido o ausente' });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.userId;
        next();
    } catch {
        return res.status(401).json({ mensaje: 'Token inválido o ausente' });
    }
}

mongoose.connect(MONGO_URI)
    .then(() => console.log('Conectado exitosamente a MongoDB'))
    .catch(err => console.error('Error al conectar a MongoDB:', err));

// ESQUEMA
const usuarioSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    terapeutaId: { type: String, default: null },
    rol: { type: String, default: 'alumno', enum: ['alumno', 'terapeuta'] },
    colorFondo: { type: String, default: '#FFFFFF' },
    tamañoIconos: { type: String, default: 'mediano', enum: ['pequeño', 'mediano', 'grande'] },
    listaEliminados: { type: [Number], default: [] },
    listaAdmitidosPersonalizados: { type: [Number], default: [] }
}, { timestamps: true });

const Usuario = mongoose.model('Usuario', usuarioSchema);

// HEALTH
app.get('/health', (req, res) => {
    const rs = mongoose.connection.readyState;
    res.status(rs === 1 ? 200 : 503).json({
        servicio: 'api-picto-express (Mongo)',
        mongo: ['desconectado','conectado','conectando','desconectando'][rs] ?? rs
    });
});

// GET todos los usuarios (solo alumnos para el panel del terapeuta)
app.get('/api/usuarios', requireAuth, async (req, res) => {
    try {
        const { terapeutaId } = req.query;
        const filtro = { rol: 'alumno' };
        if (terapeutaId) filtro.terapeutaId = terapeutaId;
        const usuarios = await Usuario.find(filtro).select('-password');
        res.json(usuarios);
    } catch {
        res.status(500).json({ mensaje: 'Error al obtener usuarios' });
    }
});

// GET buscar por email
app.get('/api/usuarios/buscar', requireAuth, async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ mensaje: 'Email requerido' });
        const usuario = await Usuario.findOne({ username: email }).select('-password');
        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        res.json(usuario);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al buscar usuario', detalle: error.message });
    }
});

// GET por ID
app.get('/api/usuarios/:id', requireAuth, async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.params.id).select('-password');
        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        res.json(usuario);
    } catch {
        res.status(500).json({ mensaje: 'ID no válido o error de servidor' });
    }
});

// DELETE
app.delete('/api/usuarios/:id', requireAuth, async (req, res) => {
    try {
        const usuario = await Usuario.findByIdAndDelete(req.params.id);
        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        res.json({ mensaje: 'Usuario eliminado correctamente' });
    } catch {
        res.status(500).json({ mensaje: 'Error al eliminar' });
    }
});

// REGISTRAR alumno
app.post('/api/registrar', async (req, res) => {
    const { username, password, colorFondo, tamañoIconos } = req.body;
    if (!username || !password)
        return res.status(400).json({ mensaje: 'username y password son obligatorios' });
    try {
        const passwordHasheada = await bcrypt.hash(password, SALT_ROUNDS);
        const nuevoUsuario = new Usuario({
            username, password: passwordHasheada,
            rol: 'alumno',
            colorFondo: colorFondo || '#FFFFFF',
            tamañoIconos: tamañoIconos || 'mediano',
            listaEliminados: [], listaAdmitidosPersonalizados: []
        });
        await nuevoUsuario.save();
        const respuesta = nuevoUsuario.toObject();
        delete respuesta.password;
        res.status(201).json({ mensaje: 'Usuario registrado exitosamente', usuario: respuesta });
    } catch (error) {
        if (error.code === 11000)
            return res.status(400).json({ mensaje: 'El username ya está en uso' });
        res.status(400).json({ mensaje: 'Error al registrar usuario', detalle: error.message });
    }
});

// REGISTRAR terapeuta
app.post('/api/registrarTerapeuta', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ mensaje: 'username y password son obligatorios' });
    try {
        const passwordHasheada = await bcrypt.hash(password, SALT_ROUNDS);
        const nuevoTerapeuta = new Usuario({
            username, password: passwordHasheada,
            rol: 'terapeuta',
            colorFondo: '#FFFFFF', tamañoIconos: 'mediano',
            listaEliminados: [], listaAdmitidosPersonalizados: []
        });
        await nuevoTerapeuta.save();
        const respuesta = nuevoTerapeuta.toObject();
        delete respuesta.password;
        res.status(201).json({ mensaje: 'Terapeuta registrado exitosamente', usuario: respuesta });
    } catch (error) {
        if (error.code === 11000)
            return res.status(400).json({ mensaje: 'El username ya está en uso' });
        res.status(400).json({ mensaje: 'Error al registrar terapeuta', detalle: error.message });
    }
});

// LOGIN (alumnos y terapeutas)
app.post('/api/iniciarSesion', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ mensaje: 'username y password son obligatorios' });
    try {
        const usuario = await Usuario.findOne({ username });
        if (!usuario)
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        const passwordValida = await bcrypt.compare(password, usuario.password);
        if (!passwordValida)
            return res.status(401).json({ mensaje: 'Contraseña incorrecta' });
        const jti = `${usuario._id}-${Date.now()}`;
        const token = jwt.sign(
            { userId: usuario._id, username: usuario.username, rol: usuario.rol },
            JWT_SECRET,
            { expiresIn: '8h', jwtid: jti }
        );
        res.json({
            mensaje: 'Sesión iniciada exitosamente',
            token,
            usuario: {
                _id: usuario._id,
                username: usuario.username,
                rol: usuario.rol,
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

// CAMBIAR CONFIG
app.put('/api/cambiarConfig/:id', requireAuth, async (req, res) => {
    const { colorFondo, tamañoIconos } = req.body;
    if (!colorFondo && !tamañoIconos)
        return res.status(400).json({ mensaje: 'Debés enviar al menos colorFondo o tamañoIconos' });
    const cambios = {};
    if (colorFondo) cambios.colorFondo = colorFondo;
    if (tamañoIconos) cambios.tamañoIconos = tamañoIconos;
    try {
        const usuario = await Usuario.findByIdAndUpdate(
            req.params.id, { $set: cambios }, { new: true, runValidators: true }
        ).select('-password');
        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        res.json({ mensaje: 'Configuración actualizada', usuario });
    } catch (error) {
        res.status(400).json({ mensaje: 'Error al actualizar configuración', detalle: error.message });
    }
});

// AGREGAR ELEMENTO PERSONALIZADO
app.post('/api/agregarElementoPersonalizado/:id', requireAuth, async (req, res) => {
    const pictogramaId = parseInt(req.body.pictogramaId);
    if (isNaN(pictogramaId))
        return res.status(400).json({ mensaje: 'pictogramaId debe ser un número entero' });
    try {
        const usuario = await Usuario.findByIdAndUpdate(
            req.params.id,
            { $addToSet: { listaAdmitidosPersonalizados: pictogramaId } },
            { new: true }
        ).select('-password');
        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        res.json({ mensaje: 'Elemento personalizado agregado', listaAdmitidosPersonalizados: usuario.listaAdmitidosPersonalizados });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al agregar elemento', detalle: error.message });
    }
});

// ELIMINAR ELEMENTO
app.post('/api/eliminarElemento/:id', requireAuth, async (req, res) => {
    const pictogramaId = parseInt(req.body.pictogramaId);
    if (isNaN(pictogramaId))
        return res.status(400).json({ mensaje: 'pictogramaId debe ser un número entero' });
    try {
        const usuario = await Usuario.findByIdAndUpdate(
            req.params.id,
            { $addToSet: { listaEliminados: pictogramaId }, $pull: { listaAdmitidosPersonalizados: pictogramaId } },
            { new: true }
        ).select('-password');
        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        res.json({ mensaje: 'Elemento eliminado', listaEliminados: usuario.listaEliminados, listaAdmitidosPersonalizados: usuario.listaAdmitidosPersonalizados });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al eliminar elemento', detalle: error.message });
    }
});

// RESTAURAR ELEMENTO
app.post('/api/restaurarElemento/:id', requireAuth, async (req, res) => {
    const pictogramaId = parseInt(req.body.pictogramaId);
    if (isNaN(pictogramaId))
        return res.status(400).json({ mensaje: 'pictogramaId debe ser un número entero' });
    try {
        const usuario = await Usuario.findByIdAndUpdate(
            req.params.id, { $pull: { listaEliminados: pictogramaId } }, { new: true }
        ).select('-password');
        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        res.json({ mensaje: 'Elemento restaurado', listaEliminados: usuario.listaEliminados });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al restaurar elemento', detalle: error.message });
    }
});

// SEED
const COLORES_SEED = ['#FFFFFF', '#FFF9C4', '#E3F2FD', '#F3E5F5', '#E8F5E9', '#FFE0B2', '#FCE4EC'];
const TAMAÑOS_SEED = ['pequeño', 'mediano', 'grande'];
const PICTOGRAMAS_SEED = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
const rnd = arr => arr[Math.floor(Math.random()*arr.length)];
const rndArr = (arr,max=4) => [...arr].sort(()=>0.5-Math.random()).slice(0,Math.floor(Math.random()*(max+1)));

app.post('/api/seed', async (req, res) => {
    const cantidad = parseInt(req.body.cantidad) || 20;
    const limpiar = req.body.limpiar === true;
    if (cantidad < 1 || cantidad > 200)
        return res.status(400).json({ mensaje: 'cantidad debe estar entre 1 y 200' });
    try {
        if (limpiar) await Usuario.deleteMany({ rol: 'alumno' });
        const usuarios = [];
        for (let i = 1; i <= cantidad; i++) {
            const username = `usuario_${String(i).padStart(3,'0')}`;
            usuarios.push({
                username, password: await bcrypt.hash(`pass_${username}`, SALT_ROUNDS),
                rol: 'alumno',
                colorFondo: rnd(COLORES_SEED), tamañoIconos: rnd(TAMAÑOS_SEED),
                listaEliminados: rndArr(PICTOGRAMAS_SEED,3),
                listaAdmitidosPersonalizados: rndArr(PICTOGRAMAS_SEED,5)
            });
        }
        let insertados = 0, duplicados = 0;
        try {
            insertados = (await Usuario.insertMany(usuarios, { ordered: false })).length;
        } catch (e) {
            if (e.code === 11000) { insertados = e.result?.nInserted ?? 0; duplicados = cantidad - insertados; }
            else throw e;
        }
        res.status(201).json({ mensaje: 'Seed completado', insertados, duplicados_omitidos: duplicados });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error durante el seed', detalle: error.message });
    }
});

// ASIGNAR terapeuta a alumno
app.put('/api/usuarios/:id/asignarTerapeuta', requireAuth, async (req, res) => {
    try {
        const { terapeutaId } = req.body;
        if (!terapeutaId) return res.status(400).json({ mensaje: 'terapeutaId requerido' });
        const usuario = await Usuario.findByIdAndUpdate(
            req.params.id,
            { $set: { terapeutaId } },
            { new: true }
        ).select('-password');
        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        res.json({ mensaje: 'Terapeuta asignado', usuario });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al asignar terapeuta', detalle: error.message });
    }
});

// DESASIGNAR terapeuta del alumno
async function desasignarTerapeutaHandler(req, res) {
    try {
        const usuario = await Usuario.findByIdAndUpdate(
            req.params.id,
            { $set: { terapeutaId: null } },
            { new: true }
        ).select('-password');
        if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
        res.json({ mensaje: 'Terapeuta desasignado', usuario });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al desasignar terapeuta', detalle: error.message });
    }
}

app.put('/api/usuarios/:id/desasignarTerapeuta', requireAuth, desasignarTerapeutaHandler);
app.post('/api/usuarios/:id/desasignarTerapeuta', requireAuth, desasignarTerapeutaHandler);
app.patch('/api/usuarios/:id/desasignarTerapeuta', requireAuth, desasignarTerapeutaHandler);
app.all('/api/usuarios/:id/desasignarTerapeuta', requireAuth, desasignarTerapeutaHandler);

// GET terapeutas (público, para el registro de alumnos)
app.get('/api/terapeutas', async (req, res) => {
    try {
        const terapeutas = await Usuario.find({ rol: 'terapeuta' }).select('_id username');
        res.json(terapeutas);
    } catch {
        res.status(500).json({ mensaje: 'Error al obtener terapeutas' });
    }
});


app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));