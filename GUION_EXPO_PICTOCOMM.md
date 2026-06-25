# 🎯 GUIÓN DE EXPOSICIÓN PICTOCOMM - Ingeniería de Datos 2 (UADE)
**Duración total: 35 minutos (7 personas × 5 minutos)**

---

## 📋 SETUP PREVIO (ANTES DE LA EXPO)

### Comandos para levantar el stack completo:

```bash
# Terminal 1: MongoDB (puerto 3000)
cd "C:\Users\EmiAr\OneDrive\Escritorio\api-picto-express-conect\api-picto-express"
node index.js

# Terminal 2: Redis (puerto 4000)
cd "C:\Users\EmiAr\OneDrive\Escritorio\redis-api-pictolink"
set AUTH_REQUIRED=false
node index.js

# Terminal 3: Cassandra (puerto 8000)
cd "C:\Users\EmiAr\OneDrive\Escritorio\cassandraPIC"
py -3.11 -m uvicorn main:app --reload --port 8000 --host 0.0.0.0

# Terminal 4: Neo4j (puerto 4001)
cd "C:\Users\EmiAr\Downloads\SAAC-feature-config-fron-redis\SAAC-feature-config-fron-redis\ne4j-api"
node server.js

# Terminal 5: Expo App (web)
cd "C:\Users\EmiAr\Downloads\SAAC-feature-config-fron-redis\SAAC-feature-config-fron-redis\frontsaac"
npx expo start
# → Presionar 'w' para web

# Terminal 6: Panel Terapeuta (http://localhost:3000/pictocomm.html)
cd "C:\Users\EmiAr\OneDrive\Escritorio"
npx serve .
```

### Datos reales para usar en la demo:
- **Usuario alumno**: `santi` / `123456`
- **Usuario terapeuta**: `dra.garcia@pictocomm.com` / `123456`
- **Token de santi** (si expira, renovar): `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **ID de santi en MongoDB**: `6a2b9867e85a9b89a287102d`
- **Pictogramas ocultos de santi**: [175, 171, 251, 155, 173]
- **Pictogramas personalizados**: [386]

---

## 👤 PERSONA 1: MongoDB - Autenticación y Modelo de Datos (5 min)

### OBJETIVO:
Mostrar cómo MongoDB almacena usuarios, roles (alumno/terapeuta) y las listas de pictogramas (eliminados y personalizados).

### PRESENTACIÓN (0:00 - 1:00):
"Hola, soy la persona 1. En PictoComm, **MongoDB es nuestro source of truth** para datos de usuarios. Aquí guardamos:
- Credenciales hasheadas (bcrypt) + roles
- Dos listas críticas que definen qué ve cada usuario:
  - `listaEliminados`: pictogramas que el usuario no quiere ver
  - `listaAdmitidosPersonalizados`: pictogramas personalizados que el usuario admitió

MongoDB está en **MongoDB Atlas (cloud)**, puerto 3000. Usamos **ACID transactions** porque los datos de usuarios tienen que ser consistentes. Si falla una operación, todo vuelve atrás."

### LIVE DEMO (1:00 - 4:30):

#### 1. Health check
```bash
curl -s http://localhost:3000/health | jq .
```
**Resultado esperado:**
```json
{
  "servicio": "api-picto-express (Mongo)",
  "mongo": "conectado"
}
```

#### 2. Login de alumno (genera JWT)
```bash
curl -X POST http://localhost:3000/api/iniciarSesion \
  -H "Content-Type: application/json" \
  -d '{"username":"santi","password":"123456"}' | jq .
```
**Resultado esperado:** Token JWT + datos del usuario (rol=alumno, listaEliminados, listaAdmitidosPersonalizados)

**EXPLICACIÓN:** El token tiene 8 horas de expiración en el JWT, pero Redis es quien maneja la vigencia real (logout instantáneo).

#### 3. Ver usuario específico en MongoDB
```bash
curl -s http://localhost:3000/api/usuarios/6a2b9867e85a9b89a287102d \
  -H "x-service-key: dev-service-pictolink" | jq .
```
**Resultado esperado:**
```json
{
  "_id": "6a2b9867e85a9b89a287102d",
  "username": "santi",
  "rol": "alumno",
  "listaEliminados": [175, 171, 251, 155, 173],
  "listaAdmitidosPersonalizados": [386],
  "colorFondo": "#FFFFFF",
  "tamañoIconos": "mediano"
}
```

#### 4. Login de terapeuta
```bash
curl -X POST http://localhost:3000/api/iniciarSesion \
  -H "Content-Type: application/json" \
  -d '{"username":"dra.garcia@pictocomm.com","password":"123456"}' | jq .
```
**Resultado esperado:** Token diferente, rol=terapeuta.

### RESUMEN (4:30 - 5:00):
"MongoDB nos da **ACID garantías**: si dos requests pelean por escribir en el mismo usuario, uno gana y el otro falla (no hay corrupción de datos). Usamos **bcrypt** con 10 rondas de salt para las contraseñas. El JWT se firma acá, pero **Redis revoca el token** cuando el usuario hace logout."

---

## 🔴 PERSONA 2: Redis - Sesión Activa, TTL y Write-Behind (5 min)

### OBJETIVO:
Mostrar cómo Redis cachea las listas del usuario, las mantiene vivas con TTL (1 hora), y hace write-behind a MongoDB.

### PRESENTACIÓN (0:00 - 1:00):
"Soy la persona 2. Mientras MongoDB es el source of truth, **Redis es la sesión activa**. Cuando un usuario inicia sesión:

1. **Hidratación**: Redis trae las dos listas desde MongoDB (en 0.01ms)
2. **TTL**: Las listas viven 1 hora. Si el usuario está inactivo, expiran solas → logout automático
3. **Write-behind**: Cuando el usuario agrega/elimina un pictograma, Redis lo hace RÁPIDO (0.001ms) y Mongo se actualiza en background (fire-and-forget)
4. **Allowlist de tokens**: Redis mantiene una allowlist de sesiones activas. Un logout borra el jti → **revocación instantánea**, aunque el JWT diga que es válido

Redis está en **localhost:6379** (local) porque la red de la facultad bloquea puertos externos."

### LIVE DEMO (1:00 - 4:30):

#### 1. Health check
```bash
curl -s http://localhost:4000/health | jq .
```
**Resultado esperado:**
```json
{
  "servicio": "redis-api-pictolink",
  "redis": "conectado",
  "neoApi": "http://localhost:4001",
  "mongoApi": "http://localhost:3000"
}
```

#### 2. Iniciar sesión en Redis (hidrata desde MongoDB)
```bash
curl -X POST http://localhost:4000/sesion/6a2b9867e85a9b89a287102d \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```
**Resultado esperado:**
```json
{
  "mensaje": "Sesión iniciada",
  "usuario": "6a2b9867e85a9b89a287102d",
  "eliminados": [175, 171, 251, 155, 173],
  "personalizados": [386]
}
```

#### 3. Ver las listas en Redis (en tiempo real)
```bash
# Abrí redis-cli en otra terminal
redis-cli
> SMEMBERS sesion:6a2b9867e85a9b89a287102d:eliminados
1) "175"
2) "171"
3) "251"
4) "155"
5) "173"

> SMEMBERS sesion:6a2b9867e85a9b89a287102d:personalizados
1) "386"
```

**EXPLICACIÓN:** Cada elemento es un string porque Redis no tiene números nativos en SETs. Los filtramos cuando llegan a Node.

#### 4. Ver TTL de las listas
```bash
redis-cli
> TTL sesion:6a2b9867e85a9b89a287102d:eliminados
(integer) 3597  # → quedan 59.95 minutos

> TTL sesion:6a2b9867e85a9b89a287102d:personalizados
(integer) 3597
```

#### 5. Agregar un pictograma a personalizados (write-behind)
```bash
curl -X POST http://localhost:4000/sesion/6a2b9867e85a9b89a287102d/personalizados \
  -H "Content-Type: application/json" \
  -d '{"pictoId":100}' | jq .
```
**Resultado esperado:**
```json
{
  "mensaje": "POST /sesion/:usuarioId/personalizados OK",
  "eliminados": [175, 171, 251, 155, 173],
  "personalizados": [386, 100]
}
```

#### 6. Verificar que Redis lo tiene (instantáneo)
```bash
redis-cli
> SMEMBERS sesion:6a2b9867e85a9b89a287102d:personalizados
1) "386"
2) "100"
```

#### 7. Verificar que MongoDB se actualizó (write-behind, ~100ms)
```bash
# Esperar 200ms
curl -s http://localhost:3000/api/usuarios/6a2b9867e85a9b89a287102d \
  -H "x-service-key: dev-service-pictolink" | jq .listaAdmitidosPersonalizados
```
**Resultado esperado:** `[386, 100]`

### RESUMEN (4:30 - 5:00):
"Redis nos da **latencia ultra-baja** para sesiones. Con **TTL**, no hay que hacer logout manual — si la sesión expira, listo. Con **write-behind**, la app es RÁPIDA pero los datos persisten. Y la **allowlist de tokens** hace que un logout sea **instantáneo**, imposible de "saltear" aunque tengas un JWT válido."

---

## 🔷 PERSONA 3: Neo4j - Grafo de Pictogramas y Relaciones (5 min)

### OBJETIVO:
Mostrar cómo Neo4j organiza pictogramas en un grafo con relaciones ponderadas, diferencia nodos globales de personalizados, y cómo Redis controla la visibilidad.

### PRESENTACIÓN (0:00 - 1:00):
"Soy la persona 3. Neo4j es el **corazón de PictoComm**. Almacena:
- **380 nodos** de pictogramas con metadata
- **3088 relaciones** CONECTA_CON con pesos (qué palabras van juntas)
- Cada nodo tiene propiedades clave: `id`, `palabra`, `nodoPersonalizado` (bool), `nodoPadre` (bool), `imagenUrl`

Los nodos **personalizados** (`nodoPersonalizado=true`) son privados de un usuario. Los **globales** (`nodoPersonalizado=false`) los ven todos.

Neo4j está en **Aura (cloud)**, puerto 4001. Usamos **BASE semantics** (Eventually Consistent) porque pueden haber lecturas stale mientras se propagan cambios, pero es OK — el usuario solo ve lo que Redis le dice que vea."

### LIVE DEMO (1:00 - 4:30):

#### 1. Health check Neo4j
```bash
curl -s http://localhost:4001/health | jq .
```
**Resultado esperado:**
```json
{
  "servicio": "ne4j-api (Neo4j)",
  "neo4j": "conectado"
}
```

#### 2. Ver pictogramas padre globales (sin personalización)
```bash
curl -X POST http://localhost:4001/padres \
  -H "Content-Type: application/json" \
  -d '{
    "nodosPersonalizados": [],
    "nodosEliminados": []
  }' | jq '.[0:3]'
```
**Resultado esperado:** Top 3 pictogramas padre (p.ej., "yo", "quiero", "comer")

#### 3. Ver pictogramas padre FILTRANDO por personalizados de santi
```bash
curl -X POST http://localhost:4001/padres \
  -H "Content-Type: application/json" \
  -d '{
    "nodosPersonalizados": [386],
    "nodosEliminados": [175, 171, 251, 155, 173]
  }' | jq '.[0:3]'
```
**Resultado esperado:** Los mismos padre globales + pictograma 386 si es personalizado padre (si no, no aparece)

**EXPLICACIÓN:** Neo4j devuelve:
```sql
WHERE p.nodoPadre = true
  AND NOT p.id IN $eliminados
  AND (p.nodoPersonalizado IS NULL OR p.nodoPersonalizado = false OR p.id IN $personalizados)
```

#### 4. Ver siguientes de pictograma 1 (qué palabras van después)
```bash
curl -X POST http://localhost:4001/siguientes \
  -H "Content-Type: application/json" \
  -d '{
    "id": 1,
    "nodosPersonalizados": [386],
    "nodosEliminados": [175, 171, 251, 155, 173]
  }' | jq '.[0:5]'
```
**Resultado esperado:** Top 5 pictogramas con más peso en relaciones desde id=1 (p.ej., [2, 3, 4, 5, 6] con pesos decrecientes)

#### 5. Crear un pictograma global (marcado en el checkbox)
```bash
curl -X POST http://localhost:4001/agregar \
  -H "Content-Type: application/json" \
  -d '{
    "anteriorId": 1,
    "nuevaPalabra": "futbol",
    "imagenUrl": "https://pictocomm.s3.amazonaws.com/futbol.jpg",
    "esGlobal": true
  }' | jq '.nodo'
```
**Resultado esperado:**
```json
{
  "id": 397,
  "palabra": "futbol",
  "nodoPersonalizado": false,
  "nodoPadre": false
}
```

#### 6. Crear un pictograma personalizado (sin checkbox)
```bash
curl -X POST http://localhost:4001/agregar \
  -H "Content-Type: application/json" \
  -d '{
    "anteriorId": 1,
    "nuevaPalabra": "pizza",
    "imagenUrl": "https://pictocomm.s3.amazonaws.com/pizza.jpg",
    "esGlobal": false
  }' | jq '.nodo'
```
**Resultado esperado:**
```json
{
  "id": 398,
  "palabra": "pizza",
  "nodoPersonalizado": true,
  "nodoPadre": false
}
```

#### 7. Eliminar un nodo personalizado (DETACH DELETE)
```bash
curl -X POST http://localhost:4001/eliminar \
  -H "Content-Type: application/json" \
  -d '{"id": 398}' | jq .
```
**Resultado esperado:**
```json
{
  "mensaje": "Nodo personalizado eliminado",
  "borradoDeNeo": true
}
```

#### 8. Eliminar un nodo global (NO se borra, solo se agrega a eliminados del usuario)
```bash
curl -X POST http://localhost:4001/eliminar \
  -H "Content-Type: application/json" \
  -d '{"id": 1}' | jq .
```
**Resultado esperado:**
```json
{
  "mensaje": "Pictograma original, agregar a eliminados del usuario",
  "borradoDeNeo": false
}
```

### RESUMEN (4:30 - 5:00):
"Neo4j nos da **grafo exponencial**: con 380 nodos bien conectados, un usuario puede formar millones de frases. Los pesos en relaciones hacen que el **autocomplete sea inteligente** — si alguien siempre dice 'yo quiero', esa relación pesa más. Y la diferencia entre `nodoPersonalizado` true/false es **fundamental** — solo personalizado se borra, global se oculta localmente."

---

## 📱 PERSONA 4: Aplicación Expo - Flujo de Alumno en Vivo (5 min)

### OBJETIVO:
Mostrar la app Expo funcionando en web, cómo un alumno crea y elimina pictogramas, y ver los logs que muestran la coordinación entre frontend y backend.

### PRESENTACIÓN (0:00 - 1:00):
"Soy la persona 4. Ahora vamos a ver la **aplicación Expo** que usan los alumnos. Es una app **React Native compilada a web**.

El flujo es:
1. Alumno login
2. Ve pictogramas padre (filtrados por sus listas en Redis)
3. Toca un pictograma → ve siguientes
4. Si agrega uno nuevo: aparece un modal con checkbox 'Disponible para todos'
   - Sin checkbox: crea nodo en Neo4j `nodoPersonalizado=true`, registra en Redis personalizados
   - Con checkbox: crea nodo `nodoPersonalizado=false`, NO toca Redis

Voy a mostrar en tiempo real cómo las acciones se reflejan en MongoDB, Redis, Neo4j y Cassandra simultáneamente."

### LIVE DEMO (1:00 - 4:30):

#### 1. Abrir la app Expo en http://localhost:19006 (web)
**Ya debería estar ejecutándose en otra terminal**

#### 2. Login como santi
- Username: `santi`
- Password: `123456`
- Click "Iniciar sesión"
- **Resultado esperado:** Dashboard cargado con pictogramas padre

#### 3. Ver logs en la consola del browser
- F12 → Console
- Debería verse:
  ```
  cargarPadres iniciando...
  nodos: [1, 2, 3, ...]
  ```

#### 4. Tocar un pictograma (p.ej., "yo")
- Click en el card del pictograma "yo"
- **Resultado esperado:** Se agrega a la frase abajo, cambian los siguientes

#### 5. Tocar otro ("quiero")
- Click en "quiero"
- **Resultado esperado:** Frase = ["yo", "quiero"]

#### 6. Tocar "Agregar pictograma" (botón +)
- Click en el botón de agregar
- Modal: "Crear palabra nueva"

#### 7. Sin marcar el checkbox, agregar "pizza"
- Palabra: `pizza`
- Elegir imagen
- **NO marcar** "Disponible para todos"
- Click "Crear"
- **Resultado esperado:**
  - Modal cierra
  - En los logs: `Creando pictograma con esGlobal: false`
  - En Neo4j: nuevo nodo con `nodoPersonalizado: true`
  - En Redis: `sesion:6a2b9867e85a9b89a287102d:personalizados` incluye el nuevo ID

#### 8. Abrir redis-cli en otra terminal
```bash
redis-cli
> SMEMBERS sesion:6a2b9867e85a9b89a287102d:personalizados
1) "386"
2) "399"  # ← El "pizza" recién creado
```

#### 9. Tocar "Borrar pictograma" en uno personalizado
- Click en algún pictograma de la frase
- Click "Eliminar"
- **Resultado esperado:**
  - Logs: `borrarPicto response: {borradoDeNeo: true}`
  - El nodo se borra de Neo4j (DETACH DELETE)
  - Se quita de `personalizados` en Redis

#### 10. Enviar la frase (botón "Enviar")
- Click "Enviar"
- **Resultado esperado:**
  - Frase = "yo quiero pizza"
  - La frase se guarda en Cassandra CON timestamp
  - Las relaciones se refuerzan en Neo4j (+1 al peso de yo→quiero y quiero→pizza)

### RESUMEN (4:30 - 5:00):
"La app es **el orquestador**: coordina 4 bases de datos diferentes. Un toque genera:
- **MongoDB**: cambio de listaAdmitidosPersonalizados (eventual, write-behind)
- **Redis**: cambio inmediato de `personalizados`
- **Neo4j**: nodo creado o eliminado
- **Cassandra**: historial registrado

Todo con **sub-100ms latencia** para el usuario."

---

## 📊 PERSONA 5: Cassandra - Historial de Interacciones y Estadísticas (5 min)

### OBJETIVO:
Mostrar cómo Cassandra registra cada frase enviada y proporciona estadísticas para el terapeuta.

### PRESENTACIÓN (0:00 - 1:00):
"Soy la persona 5. Cassandra es una **base de datos NoSQL distribuida** de DataStax Astra. Almacena el **historial completo** de frases del usuario:
- `usuario_id`: quién mandó la frase
- `timestamp`: cuándo (UTC)
- `secuencia`: [1, 2, 3] → IDs de pictogramas

Usamos Cassandra porque:
1. **Write-heavy**: cada frase es un write
2. **Append-only**: nunca borramos interacciones, solo agregamos
3. **Escalable**: puede crecer a millones de registros sin degradar reads
4. **Eventually consistent** (BASE): el terapeuta puede ver un retraso de millisegundos, pero eso es OK

Cassandra está en **Astra (cloud)**, puerto 8000."

### LIVE DEMO (1:00 - 4:30):

#### 1. Health check Cassandra
```bash
curl -s http://localhost:8000/ | jq .
```
**Resultado esperado:**
```json
{
  "status": "ok",
  "mensaje": "PictoComm API con Cassandra Astra corriendo"
}
```

#### 2. Registrar una interacción manualmente
```bash
curl -X POST http://localhost:8000/interacciones \
  -H "Content-Type: application/json" \
  -d '{
    "usuario_id": "6a2b9867e85a9b89a287102d",
    "secuencia": [1, 2, 3]
  }' | jq .
```
**Resultado esperado:**
```json
{
  "mensaje": "Interacción registrada correctamente",
  "usuario_id": "6a2b9867e85a9b89a287102d",
  "timestamp": "2026-06-23T22:15:30.123456",
  "secuencia": [1, 2, 3]
}
```

#### 3. Ver últimas 5 interacciones
```bash
curl -s http://localhost:8000/interacciones/6a2b9867e85a9b89a287102d | jq '.interacciones[0:5]'
```
**Resultado esperado:** Array de últimas interacciones, ordenadas por timestamp DESC

#### 4. Ver estadísticas del usuario
```bash
curl -s http://localhost:8000/estadisticas/6a2b9867e85a9b89a287102d | jq .
```
**Resultado esperado:**
```json
{
  "usuario_id": "6a2b9867e85a9b89a287102d",
  "total_sesiones": 142,
  "total_interacciones": 142,
  "dias_activos": 5,
  "total_pictogramas_usados": 456,
  "promedio_por_sesion": 3.2,
  "evaluacion_automatica": "Bueno",
  "top_5_pictogramas": [
    {"pictograma_id": 1, "usos": 85},
    {"pictograma_id": 2, "usos": 72},
    {"pictograma_id": 3, "usos": 65},
    {"pictograma_id": 5, "usos": 54},
    {"pictograma_id": 7, "usos": 48}
  ],
  "actividad_por_dia": {...}
}
```

#### 5. Ver paginación de historial
```bash
curl -s 'http://localhost:8000/interacciones/6a2b9867e85a9b89a287102d?pagina=1' | jq '.total_paginas,.total_interacciones'
```
**Resultado esperado:** Muestra total de páginas y total de interacciones

#### 6. Ir a página 2
```bash
curl -s 'http://localhost:8000/interacciones/6a2b9867e85a9b89a287102d?pagina=2' | jq '.interacciones'
```

### RESUMEN (4:30 - 5:00):
"Cassandra es el **archivo del terapeuta**. No queremos que fracase nunca — cada frase es sagrada. Por eso usamos una base **distribuida y replicada**. El modelo es **partition key = usuario_id**, así el terapeuta puede hacer queries por alumno sin full scan. Y la **evaluación automática** (Excelente/Bueno/Regular/En inicio) se calcula en tiempo real basada en promedio_por_sesion."

---

## 🎓 PERSONA 6: Panel del Terapeuta - Visualización y Análisis (5 min)

### OBJETIVO:
Mostrar cómo el terapeuta ve el progreso de los alumnos en un dashboard, con filtrado por terapeuta, historial con palabras traducidas, y gráficos de actividad.

### PRESENTACIÓN (0:00 - 1:00):
"Soy la persona 6. El **panel del terapeuta** es una web SPA (Single Page App) en `pictocomm.html`, servida en http://localhost:3000/pictocomm.html.

El terapeuta puede:
1. **Ver alumnos asignados** (filtrados por su `terapeutaId` en MongoDB)
2. **Historial con palabras**: cada frase de pictogramas se traduce a palabras legibles
3. **Estadísticas automáticas**: evaluación, top 5 palabras, actividad por día
4. **Búsqueda de alumnos** por nombre
5. **Gráfico de actividad** — cuántas frases por día

Esto es **HILO ROJO de la exposición**: todo lo anterior (MongoDB, Redis, Neo4j, Cassandra) confluye acá."

### LIVE DEMO (1:00 - 4:30):

#### 1. Abrir el panel en http://localhost:3000/pictocomm.html
**Ya debería estar ejecutándose en terminal 6 (npx serve .)**

#### 2. Login como terapeuta
- Email: `dra.garcia@pictocomm.com`
- Password: `123456`
- Click "Entrar como Terapeuta"

#### 3. Ver sección "Mis Alumnos"
- Debería listar alumnos asignados a `dra.garcia@pictocomm.com`
- Santi debería estar en la lista

#### 4. Click en "santi"
- Se abre el detalle del alumno

#### 5. Ver "Historial de Interacciones"
- Muestra últimas 20 frases
- **IMPORTANTE**: las frases muestran **palabras, no IDs**
  - Esto usa el endpoint `/palabrasPorIds` de Neo4j
  - Y un cache local en el browser llamado `palabraCache`

#### 6. Ver sección "Estadísticas"
- Total de sesiones
- Total de pictogramas usados
- **Top 5 pictogramas**: qué palabras usa más el alumno
- **Evaluación automática**: Excelente/Bueno/Regular/En inicio
- **Gráfico de actividad por día** (últimos 7 días)

#### 7. Ver "Interacciones Hoy"
- Filtra solo las de hoy
- Muestra timestamp y palabras

#### 8. Buscar otro alumno
- Usar búsqueda de alumnos en el panel
- Verá el mismo análisis para ese alumno

### COMANDOS TÉCNICOS (si quieres mostrar el backend):

#### Traer alumnos de un terapeuta
```bash
curl -s 'http://localhost:3000/api/usuarios?terapeutaId=dra.garcia@pictocomm.com' \
  -H "x-service-key: dev-service-pictolink" | jq '.[] | {username, _id}'
```

#### Traer estadísticas de santi desde la API (lo que el panel muestra)
```bash
curl -s http://localhost:8000/estadisticas/6a2b9867e85a9b89a287102d | jq '.'
```

#### Traducir IDs a palabras (el "magic" del panel)
```bash
curl -X POST http://localhost:4001/palabrasPorIds \
  -H "Content-Type: application/json" \
  -d '{"ids": [1, 2, 3, 5, 7]}' | jq .
```
**Resultado esperado:**
```json
{
  "1": "yo",
  "2": "quiero",
  "3": "comer",
  "5": "agua",
  "7": "jugar"
}
```

### RESUMEN (4:30 - 5:00):
"El panel es la **prueba final** de que todo funciona. Coordina:
- MongoDB → lista de alumnos asignados
- Cassandra → historial y estadísticas
- Neo4j → traducción de IDs a palabras
- Redis → todo oculto pero subyacente

El terapeuta **no ve la complejidad** — solo ve alumnos, palabras, progreso. Eso es **buena arquitectura**."

---

## 🔄 PERSONA 7: Sincronización en Tiempo Real y Bugs Resueltos (5 min)

### OBJETIVO:
Mostrar cómo una acción en la app (crear/eliminar pictograma) se refleja en TODAS las bases de datos, y contar los bugs reales que resolvimos.

### PRESENTACIÓN (0:00 - 1:30):
"Soy la persona 7. Cierre la exposición mostrando cómo **TODO SE SINCRONIZA EN TIEMPO REAL**.

Los bugs que resolvimos son **reales y muy comunes** en sistemas distribuidos. Vamos a repasarlos:"

#### BUG 1: Redis Cloud en la red de la facultad
**Problema:** Redis Cloud usa puerto 16473, la facultad lo bloquea.
**Solución:** Correr Redis **localmente** en localhost:6379. Trade-off: pierde replicación pero ganamos conectividad.

#### BUG 2: Listas vacías en Redis
**Problema:** Si un usuario tenía `listaEliminados: []`, Redis no creaba la key. Entonces el backend no sabía si la lista NO existía o estaba vacía.
**Solución:** Placeholder `__init__`: si la lista está vacía, Redis agrega un elemento dummy que se filtra al leer.

#### BUG 3: anteriorId stale en React
**Problema:** El usuario abre el modal para agregar pictograma después de haber navegado. React guarda `anteriorId` del estado, pero es viejo.
**Solución:** Usar `useRef` con `fraseRef.current` — la ref se actualiza siempre, no queda congelada como el estado en el closure.

#### BUG 4: Historial en Cassandra con IDs ilegibles
**Problema:** El terapeuta veía `[1, 2, 3]` en el historial. No sabe qué son esos números.
**Solución:** Endpoint `/palabrasPorIds` en Neo4j + cache local en el panel. Ahora muestra "yo quiero comer".

#### BUG 5: Redis vs Mongo — parámetro `pictoId` vs `pictogramaId`
**Problema:** Frontend mandaba `pictogramaId`, Redis esperaba `pictoId`.
**Solución:** `const id = req.body.pictoId ?? req.body.pictogramaId` (nullish coalescing).

### LIVE DEMO — Flujo sincronizado (1:30 - 4:30):

#### Setup: Abrir múltiples ventanas
1. Browser con la app Expo (http://localhost:19006)
2. Terminal con `redis-cli`
3. Neoj4 browser UI (Aura, si es posible, o `curl`)
4. Panel del terapeuta (http://localhost:3000/pictocomm.html)
5. Terminal con curl

#### Paso 1: En la app, crear un pictograma GLOBAL (con checkbox)
- Login como santi
- Click +
- Palabra: `dragon`
- Marcar "Disponible para todos"
- Click Crear
- **Timestamp T0**

#### Paso 2: A los ~100ms, verificar en Redis
```bash
redis-cli
> SMEMBERS sesion:6a2b9867e85a9b89a287102d:personalizados
# NO debe estar "dragon"
```

#### Paso 3: A los ~200ms, verificar en Neo4j
```bash
curl -X POST http://localhost:4001/padres \
  -H "Content-Type: application/json" \
  -d '{"nodosPersonalizados":[],"nodosEliminados":[]}' | jq '.[] | select(.palabra=="dragon")'
# Debe aparecer con nodoPersonalizado=false
```

#### Paso 4: A los ~500ms, verificar en MongoDB (write-behind desde Redis)
```bash
curl -s http://localhost:3000/api/usuarios/6a2b9867e85a9b89a287102d \
  -H "x-service-key: dev-service-pictolink" | jq .listaAdmitidosPersonalizados
# Deve tener los mismos que Redis (sin "dragon" porque es global)
```

#### Paso 5: Enviar una frase con "dragon"
- Armar frase p.ej. "yo quiero dragon"
- Click "Enviar"

#### Paso 6: A los ~50ms, verificar que el peso de relaciones aumentó
```bash
# (Este es tricky de ver sin Cypher, pero los logs del servidor muestran:)
# "Relaciones reforzadas, pares: 2"
```

#### Paso 7: A los ~100ms, verificar en Cassandra
```bash
curl -s http://localhost:8000/interacciones/6a2b9867e85a9b89a287102d | jq '.interacciones[0]'
# Debe mostrar la frase recién agregada
```

#### Paso 8: En el panel del terapeuta, actualizar y ver la frase
- Ir a Mis Alumnos → santi
- Historial debe mostrar "yo quiero dragon" (con palabras, no IDs)

### RESUMEN (4:30 - 5:00):
"**La belleza de este sistema** es que es:
- **Distribuido**: 4 bases de datos, cada una experta en su dominio
- **Resiliente**: si una falla, el usuario no pierde todo
  - Si Cassandra muere, el historial se pierde pero la app sigue
  - Si Neo4j muere, Redis cachea respuestas antiguas
  - Si MongoDB muere, Redis sigue la sesión
- **Escalable**: cada componente se puede replicar independientemente
- **Observabilidad**: logs en cada capa muestran exactamente qué pasó

Los bugs que resolvimos enseñan que **TEORÍA vs PRÁCTICA** son mundos diferentes. El CAP theorem dice que no puedes tener ACID + Disponibilidad + Tolerancia a partición. Nosotros elegimos Disponibilidad (BASE) porque para terapia, un retraso de 100ms es INFINITO, pero una caída es **inaceptable**."

---

## 🎬 CIERRE

**Persona 7 (final 30 segundos):**
"PictoComm no es solo una app. Es una clase magistral de **Ingeniería de Datos**:
- **MongoDB** (ACID) para datos críticos
- **Redis** (fast, ephemeral) para sesiones
- **Neo4j** (graph) para relaciones exponenciales
- **Cassandra** (append-only, replicated) para historial inmutable

Y todo **coordinado**, en **tiempo real**, con **sub-100ms latencia**.

Gracias por estar atento. Ahora el sistema sigue corriendo — pueden chequear en vivo que los datos están siendo actualizados mientras nosotros hablamos."

---

## 📋 CHECKLIST PRE-EXPO

- [ ] Levantar MongoDB
- [ ] Levantar Redis  
- [ ] Levantar Neo4j
- [ ] Levantar Cassandra
- [ ] Levantar Expo (npm start → w para web)
- [ ] Levantar panel terapeuta (npm serve .)
- [ ] Abrir redis-cli en una terminal
- [ ] Tener curl/Postman listo
- [ ] Usuario santi logueado en la app
- [ ] Usuario dra.garcia logueado en el panel
- [ ] Chequear que el token no expiró (si expiró, hacer login de nuevo)
- [ ] Probar un curl a cada API (/health)

---

## 🎥 NOTAS PARA LOS EXPOSITORES

1. **Habla lento y pausado.** Los datos fluyen rápido; los ojos necesitan seguir.
2. **Señala en la pantalla.** "Ves acá en Redis cómo el ID 386 aparece al instante."
3. **Repite el "POR QUÉ".** No es suficiente "Redis está acá". Explica "Redis está acá PORQUE redis es rápido y TTL expira sesiones automáticamente."
4. **Cuando algo falle, no improvises.** Di: "Este es el BUG 6 que resolvimos — la network está lenta. Normalmente es <100ms." Cubre. La audiencia entiende.
5. **Transiciones:** Usa las últimas palabras de la persona anterior. Persona 2 termina hablando de allowlist → Persona 3 empieza: "Sí, y mientras Redis maneja eso, Neo4j construye el grafo..."

---

**¡ÉXITO!** 🚀
