import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Speech from 'expo-speech';
import * as ImagePicker from 'expo-image-picker';
import { REDIS_API, NEO4J_API, MONGO_API } from '@/config'; // <-- Agregado MONGO_API

type Picto = {
  id: number | string;
  palabra: string;
  pictos: string[];
  isAddButton?: boolean;
  isContinue?: boolean;
  isHome?: boolean; // <-- Agregado al tipo para tipado correcto
};

// ── Paleta automática y Medidas ───────────────────────────────────────────────
const PALETA = [
  { fondo: '#7C3AED', inner: '#EDE9FE', icono: '#7C3AED' },
  { fondo: '#D97706', inner: '#FEF3C7', icono: '#D97706' },
  { fondo: '#2563EB', inner: '#DBEAFE', icono: '#2563EB' },
  { fondo: '#059669', inner: '#D1FAE5', icono: '#059669' },
  { fondo: '#DC2626', inner: '#FEE2E2', icono: '#DC2626' },
] as const;

const COLORES_PERFIL = [
  "#FFFFFF", // blanco
  "#FFF9C4", // amarillo
  "#E3F2FD", // azul
  "#E8F5E9", // verde
  "#FCE4EC", // rosa
];

const colorDe = (id: number | string) => {
  const numId = typeof id === 'number' ? id : parseInt(String(id), 10) || 0;
  return PALETA[numId % PALETA.length];
};

const OBTENER_MEDIDAS = (tamaño: string) => {
  // Ajustado a 'pequeño' para hacer match exacto con el enum de Mongoose
  switch (tamaño) {
    case 'pequeño': return { cardW: 400, cardH: 380, innerDim: 330, fontSize: 23, fallbackSize: 100 };
    case 'grande': return { cardW: 650, cardH: 580, innerDim: 530, fontSize: 27, fallbackSize: 140 };
    case 'mediano':
    default: return { cardW: 550, cardH: 480, innerDim: 430, fontSize: 25, fallbackSize: 100 };
  }
};

function parseJwt(token: string): Record<string, string> {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch { return {}; }
}

const MOCK: Picto[] = [
  { id: 1, palabra: 'yo', pictos: [] },
  { id: 2, palabra: 'quiero', pictos: [] },
  { id: 3, palabra: 'comer', pictos: [] },
];

const VOLVER_INICIO: Picto = {
  id: 'home',
  palabra: 'Volver al inicio',
  pictos: [],
  isHome: true, // <-- Corregido: agregado flag para handleTap
};

const CONTINUAR_FRASE: Picto = {
  id: 'continue',
  palabra: 'Continuar frase',
  pictos: [],
  isContinue: true, // <-- Corregido: agregado flag para handleTap
};

// ── Helper para URL de Imágenes ───────────────────────────────────────────────
const obtenerUrlImagen = (ruta?: string) => {
  if (!ruta) return null;
  if (ruta.startsWith('file://') || ruta.startsWith('http')) return ruta;
  
  let limpia = ruta.replace(/^\/+/, "");
  if (!limpia.startsWith("pictogramas/")) {
    limpia = `pictogramas/${limpia}`;
  }
  return `${NEO4J_API}/${limpia}`;
};

// ── Componentes Visuales ──────────────────────────────────────────────────────

function PictoCard({ picto, onPress, onDelete, medidas, modoEdicion }: any) {
  const { fondo, inner, icono } = colorDe(picto.id);
  const imgUrl = obtenerUrlImagen(picto.pictos[0]);
  const { cardW, cardH, innerDim, fontSize, fallbackSize } = medidas;

  if (picto.isAddButton) {
    return (
      <TouchableOpacity onPress={onPress} style={[s.card, s.cardAdd, { width: cardW, height: cardH }]} activeOpacity={0.82}>
        <View style={[s.cardInner, s.cardInnerAdd, { width: innerDim, height: innerDim }]}>
          <Text style={[s.cardFallback, { color: '#9CA3AF', fontSize: fallbackSize }]}>+</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} style={[s.card, { backgroundColor: fondo, width: cardW, height: cardH }]} activeOpacity={0.82}>
      {modoEdicion && (
        <TouchableOpacity style={s.btnEliminarFlotante} onPress={onDelete} hitSlop={10}>
          <Text style={s.iconoEliminar}>🗑️</Text>
        </TouchableOpacity>
      )}
      
      <Text style={[s.cardLabel, { fontSize }]} numberOfLines={1}>{picto.palabra}</Text>
      <View style={[s.cardInner, { backgroundColor: inner, width: innerDim, height: innerDim }]}>
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={{ width: innerDim * 0.75, height: innerDim * 0.75 }} contentFit="contain" />
        ) : (
          <Text style={[s.cardFallback, { color: icono, fontSize: fallbackSize }]}>{picto.palabra.slice(0, 3)}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function PhraseBar({ frase, onBorrar, onLimpiar, onHablar }: any) {
  return (
    <View style={s.phraseBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={s.phraseScroll}>
        {frase.length === 0 ? (
          <Text style={s.phrasePlaceholder}>Armá tu frase tocando abajo...</Text>
        ) : (
          frase.map((p: any, i: number) => {
            const { fondo, inner } = colorDe(p.id);
            const imgUrl = obtenerUrlImagen(p.pictos[0]);

            return (
              <View key={i} style={[s.phraseChip, { backgroundColor: inner, borderColor: fondo }]}>
                {imgUrl && <Image source={{ uri: imgUrl }} style={s.phraseChipImg} contentFit="contain" />}
                <Text style={[s.phraseChipLabel, { color: fondo }]}>{p.palabra}</Text>
              </View>
            );
          })
        )}
      </ScrollView>
      <TouchableOpacity onPress={onBorrar} onLongPress={onLimpiar} style={s.btnIconoBarra} hitSlop={10}><Text style={s.btnTextoBarra}>⌫</Text></TouchableOpacity>
      <TouchableOpacity onPress={onHablar} style={[s.btnIconoBarra, { backgroundColor: '#EDE9FE' }]} hitSlop={10}><Text style={s.btnTextoBarra}>🔊</Text></TouchableOpacity>
    </View>
  );
}

// ── Lógica Principal ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const auth = useRef({ uid: '', token: '' });
  const [nombre, setNombre] = useState('Usuario');
  const [pictos, setPictos] = useState<Picto[]>([]);
  const [frase, setFrase] = useState<Picto[]>([]);
  const [cargando, setCargando] = useState(true);
  
  // Estados de configuración de la app
  const [colorFondo, setColorFondo] = useState('#EEF3FA');
  const [tamanoIconos, setTamanoIconos] = useState('mediano');
  const medidas = OBTENER_MEDIDAS(tamanoIconos);

  // Estados del Modal de Nodos (Agregar/Editar Pictogramas)
  const [modoEdicion, setModoEdicion] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const [formPalabra, setFormPalabra] = useState('');
  const [formImagenUri, setFormImagenUri] = useState<string | null>(null);
  const [guardandoForm, setGuardandoForm] = useState(false);

  // Estados del Modal de Perfil
  const [modalPerfilVisible, setModalPerfilVisible] = useState(false);
  const [perfilColorFondo, setPerfilColorFondo] = useState('#EEF3FA');
  const [perfilTamanoIconos, setPerfilTamanoIconos] = useState('mediano');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [mensajePerfil, setMensajePerfil] = useState({ texto: '', error: false });

  const [modoContinuarFrase, setModoContinuarFrase] = useState(true);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => { ScreenOrientation.unlockAsync(); };
  }, []);

  useEffect(() => {
    (async () => {
      const tok = await AsyncStorage.getItem('tokenUsuario');
      if (!tok) { router.replace('/'); return; }

      const payload = parseJwt(tok);
      const uid = String(payload.userId ?? '');
      auth.current = { uid, token: tok };
      setNombre(String(payload.username ?? 'Usuario'));

      // Carga inicial desde Redis
      try {
        const resRedis = await fetch(`${REDIS_API}/sesion/${uid}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        });
        const dataRedis = await resRedis.json();
        if (dataRedis.colorFondo) setColorFondo(dataRedis.colorFondo);
        if (dataRedis.tamañoIconos) setTamanoIconos(dataRedis.tamañoIconos);
      } catch (err) {
        console.warn('No se pudo abrir la sesión en Redis:', err);
      }

      await cargarPadres();
    })();
  }, []);

  async function cargarPadres() {
    setCargando(true);
    try {
      const { uid, token } = auth.current;
      const r = await fetch(`${REDIS_API}/sesion/${uid}/padres`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      setPictos(Array.isArray(data) && data.length > 0 ? data : MOCK);
    } catch {
      setPictos(MOCK);
    } finally {
      setCargando(false);
    }
  }

  async function cargarSiguientes(picto: Picto) {
    setCargando(true);
    try {
      const { uid, token } = auth.current;
      const r = await fetch(
        `${REDIS_API}/sesion/${uid}/siguientes`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: picto.id }),
        }
      );

      const data = await r.json();

      if (Array.isArray(data) && data.length > 0) {
        setPictos(data);
      } else {
        setPictos([
          VOLVER_INICIO,
          CONTINUAR_FRASE
        ]);
      }
    } catch (error) {
      console.error(error);
      setPictos([VOLVER_INICIO]);
    } finally {
      setCargando(false);
    }
  }

  async function refrescarVistaActual() {
    if (frase.length === 0) await cargarPadres();
    else await cargarSiguientes(frase[frase.length - 1]);
  }

  // ── Lógica Nodos (Crear / Eliminar) ──
  const handleSeleccionarImagen = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) setFormImagenUri(result.assets[0].uri);
  };

  const abrirModalCrear = () => {
     setFormPalabra(''); setFormImagenUri(null); setModalVisible(true);
  };

  const handleGuardarNodo = async () => {
    if (!formPalabra.trim()) return Alert.alert('Error', 'La palabra no puede estar vacía');
    setGuardandoForm(true);
    
    try {
      // 1. Preparamos los datos incluyendo la imagen
      const formData = new FormData();
      formData.append('nuevaPalabra', formPalabra.trim());
      
      if (formImagenUri) {
        if (Platform.OS === 'web') {
          // LÓGICA PARA LA WEB (PC)
          const responseFile = await fetch(formImagenUri);
          const blob = await responseFile.blob();
          formData.append('imagen', blob, 'pictograma.png');
        } else {
          // LÓGICA PARA CELULARES (Android / iOS)
          const filename = formImagenUri.split('/').pop() || 'pictograma.png';
          formData.append('imagen', {
            uri: formImagenUri,
            name: filename,
            type: 'image/png'
          } as any);
        }
      }

      if (frase.length > 0) {
        formData.append('anteriorId', String(frase[frase.length - 1].id));
      }

      // 2. Enviamos a la API de Neo4j
      const responseNeo = await fetch(
       `${NEO4J_API}/agregar`,
       {
         method: "POST",
         body: formData
       }
      );

      if (!responseNeo.ok) throw new Error('Error al guardar el pictograma en la base de datos central');
      
      const dataNeo = await responseNeo.json();
      const nuevoId = dataNeo.nodo.id; // Extraemos el ID que nos devolvió Neo4j

      // 3. Si es un nodo NUEVO (no una edición), le avisamos a MongoDB
      const responseRedis = await fetch(
        `${REDIS_API}/sesion/${auth.current.uid}/personalizados`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.current.token}`
          },
          body: JSON.stringify({
            pictoId: nuevoId
          })
        }
      );

      if (!responseRedis.ok) {
        throw new Error('El pictograma se guardó, pero no se pudo vincular a tu perfil');
      }

      // 4. Todo salió bien, cerramos el modal y refrescamos
      setModalVisible(false);
      await refrescarVistaActual();
      
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', error.message || 'Ocurrió un problema al guardar.');
    } finally {
      setGuardandoForm(false);
    }
  };

  const handleEliminarNodo = async (idNodo: string | number) => {
    try {
      const { uid, token } = auth.current;
      console.log("ELIMINANDO", idNodo);
      setCargando(true);

      const response = await fetch(
        `${REDIS_API}/sesion/${uid}/eliminados`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            pictoId: Number(idNodo),
          }),
        }
      );

      const data = await response.json();
      console.log("status:", response.status);
      console.log("respuesta:", data);

      await refrescarVistaActual();
    } catch (err) {
      console.error("ERROR ELIMINANDO:", err);
    } finally {
      setCargando(false);
    }
  };

  // ── Lógica de Interacción ──
  const handleTap = useCallback(async (picto: Picto) => {
    // Corregido: "Continuar frase" recarga el nivel raíz de categorías sin borrar la frase superior
    if (picto.isContinue || picto.id === 'continue') {
      await cargarPadres();
      return;
    }

    // "Volver al inicio" borra todo el progreso acumulado y recarga el nivel raíz
    if (picto.isHome || picto.id === 'home') {
      setFrase([]);
      await cargarPadres();
      return;
    }

    setFrase(prev => [...prev, picto]);
    await cargarSiguientes(picto);
  }, [frase]);

  const handleBorrar = useCallback(async () => {
    if (frase.length === 0) return;
    const nuevaFrase = frase.slice(0, -1);
    setFrase(nuevaFrase);
    if (nuevaFrase.length === 0) await cargarPadres();
    else await cargarSiguientes(nuevaFrase[nuevaFrase.length - 1]);
  }, [frase]);

  const handleLimpiar = useCallback(async () => { setFrase([]); await cargarPadres(); }, []);
  
  const handleHablar = useCallback(() => {
    const texto = frase.map(p => p.palabra).join(' ');
    if (!texto) return;
    Speech.stop(); Speech.speak(texto, { language: 'es-AR' });
  }, [frase]);

  const handleLogout = useCallback(async () => {
    await AsyncStorage.removeItem('tokenUsuario'); router.replace('/');
  }, []);

  // ── Lógica de Perfil (Nuevo Modal) ──
  const abrirModalPerfil = () => {
    setPerfilColorFondo(colorFondo);
    setPerfilTamanoIconos(tamanoIconos);
    setMensajePerfil({ texto: '', error: false });
    setModalPerfilVisible(true);
  };

  const handleGuardarPerfil = async () => {
    setGuardandoPerfil(true);
    setMensajePerfil({ texto: '', error: false });
    try {
      const { uid, token } = auth.current;
      const response = await fetch(`${MONGO_API}/api/cambiarConfig/${uid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ colorFondo: perfilColorFondo, tamañoIconos: perfilTamanoIconos })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || "Error al actualizar");

      // Actualizamos estado local del Dashboard para verlo al instante
      setColorFondo(perfilColorFondo);
      setTamanoIconos(perfilTamanoIconos);
      
      setMensajePerfil({ texto: 'Configuración guardada!', error: false });
      setTimeout(() => setModalPerfilVisible(false), 1500); // Cierra automático después de avisar
    } catch (err: any) {
      setMensajePerfil({ texto: err.message || "No se pudo conectar", error: true });
    } finally {
      setGuardandoPerfil(false);
    }
  };

  const datosFlatList = modoEdicion
  ? [...pictos, { id: 'add', palabra: 'Agregar', pictos: [], isAddButton: true }]
  : [...pictos, CONTINUAR_FRASE];

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: colorFondo }]}>
      
      {/* ── Header ── */}
      <View style={s.topContainer}>
        {/* Transformamos la sección de perfil en un botón para abrir el modal */}
        <TouchableOpacity style={s.profileSection} onPress={abrirModalPerfil} activeOpacity={0.7}>
          <View style={s.avatar}><Text style={s.avatarLetra}>{nombre.charAt(0).toUpperCase()}</Text></View>
          <View style={s.textWrapper}>
            <Text style={s.holaText}>Hola,</Text>
            <Text style={s.nombreText} numberOfLines={1}>{nombre}</Text>
          </View>
        </TouchableOpacity>

        <PhraseBar frase={frase} onBorrar={handleBorrar} onLimpiar={handleLimpiar} onHablar={handleHablar} />

        <TouchableOpacity onPress={() => setModoEdicion(!modoEdicion)} style={[s.btnHeader, modoEdicion && { backgroundColor: '#DBEAFE' }]} hitSlop={10}>
          <Text style={s.iconoHeader}>⚙️</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleLogout} style={s.btnHeader} hitSlop={10}>
          <Text style={s.iconoHeader}>↪</Text>
        </TouchableOpacity>
      </View>

      {/* ── Grilla Principal ── */}
      <View style={s.gridContainer}>
        {cargando ? (
          <View style={s.loading}><ActivityIndicator size="large" color="#7C3AED" /></View>
        ) : (
          <FlatList
            data={datosFlatList}
            keyExtractor={item => String(item.id)}
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.scrollHorizontalContainer}
            renderItem={({ item }) => (
              <PictoCard 
                picto={item as Picto} 
                onPress={() => item.isAddButton ? abrirModalCrear() : handleTap(item as Picto)} 
                onDelete={() => handleEliminarNodo(item.id)}
                medidas={medidas}
                modoEdicion={modoEdicion && !item.isAddButton}
              />
            )}
          />
        )}
      </View>

      {/* ── Modal de Nodos (Crear/Editar) ── */}
      <Modal visible={modalVisible} animationType="fade" transparent={true}>
        <View style={s.modalOverlay}>
          <View style={s.modalContenido}>
            <Text style={s.modalTitulo}>{'Nuevo Pictograma'}</Text>
            <Text style={s.label}>Palabra asignada:</Text>
            <TextInput style={s.input} value={formPalabra} onChangeText={setFormPalabra} placeholder="Ej: Comer, Yo, Manzana..." />
            <Text style={s.label}>Imagen:</Text>
            <TouchableOpacity style={s.btnImagenSelector} onPress={handleSeleccionarImagen}>
              {formImagenUri ? <Image source={{ uri: formImagenUri }} style={{ width: '100%', height: '100%' }} contentFit="contain" /> : <Text style={{ color: '#9CA3AF' }}>Tocar para elegir imagen</Text>}
            </TouchableOpacity>
            <View style={s.modalBotonesContainer}>
              <TouchableOpacity style={[s.btnAccion, { backgroundColor: '#E5E7EB' }]} onPress={() => setModalVisible(false)} disabled={guardandoForm}>
                <Text style={[s.textoBtnAccion, { color: '#374151' }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btnAccion, { backgroundColor: '#7C3AED' }]} onPress={handleGuardarNodo} disabled={guardandoForm}>
                {guardandoForm ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[s.textoBtnAccion, { color: '#fff' }]}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal de Perfil (NUEVO) ── */}
      <Modal visible={modalPerfilVisible} animationType="fade" transparent={true}>
        <View style={s.modalOverlay}>
          <View style={s.modalCardPerfil}>
            <Text style={s.modalTitulo}>Editar Perfil</Text>
            <Text style={s.modalSubtitulo}>Configurá tus preferencias visuales</Text>

            <Text style={s.label}>Color de fondo</Text>
            <View style={s.colorsContainer}>
              {COLORES_PERFIL.map((color) => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setPerfilColorFondo(color)}
                  style={[
                    s.colorCircle,
                    { backgroundColor: color },
                    perfilColorFondo === color && s.selectedColor,
                  ]}
                />
              ))}
            </View>

            <Text style={s.label}>Tamaño de iconos</Text>
            <View style={s.selectorContainer}>
              {['pequeño', 'mediano', 'grande'].map((tam) => (
                <TouchableOpacity
                  key={tam}
                  onPress={() => setPerfilTamanoIconos(tam)}
                  style={[
                    s.selectorButton,
                    perfilTamanoIconos === tam && s.selectorButtonActive
                  ]}
                >
                  <Text style={[
                    s.selectorText,
                    perfilTamanoIconos === tam && s.selectorTextActive
                  ]}>
                    {tam.charAt(0).toUpperCase() + tam.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {mensajePerfil.texto !== "" && (
              <Text style={[s.message, { color: mensajePerfil.error ? "#DC2626" : "#16A34A" }]}>
                {mensajePerfil.texto}
              </Text>
            )}

            <View style={[s.modalBotonesContainer, { marginTop: 30 }]}>
              <TouchableOpacity style={[s.btnAccion, { backgroundColor: '#E5E7EB', flex: 1 }]} onPress={() => setModalPerfilVisible(false)} disabled={guardandoPerfil}>
                <Text style={[s.textoBtnAccion, { color: '#374151' }]}>Cerrar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btnAccion, { backgroundColor: '#3366E8', flex: 1 }]} onPress={handleGuardarPerfil} disabled={guardandoPerfil}>
                {guardandoPerfil ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[s.textoBtnAccion, { color: '#fff' }]}>Guardar Cambios</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1 },
  topContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  profileSection: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 160, paddingRight: 10 },
  textWrapper: { flexShrink: 1 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
  avatarLetra: { color: '#fff', fontSize: 16, fontWeight: '700' },
  holaText: { fontSize: 11, color: '#6B7280' },
  nombreText: { fontSize: 14, fontWeight: '700', color: '#111827' },
  
  btnHeader: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  iconoHeader: { fontSize: 18, color: '#374151', fontWeight: 'bold' },

  phraseBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, gap: 6, height: 52, elevation: 2 },
  phraseScroll: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phrasePlaceholder: { color: '#9CA3AF', fontSize: 13 },
  phraseChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1.5, gap: 5 },
  phraseChipImg: { width: 24, height: 24 },
  phraseChipLabel: { fontSize: 11, fontWeight: '700' },
  
  btnIconoBarra: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  btnTextoBarra: { fontSize: 15 },
  
  gridContainer: { flex: 1, justifyContent: 'center' },
  scrollHorizontalContainer: { paddingHorizontal: 16, alignItems: 'center', gap: 14 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  card: { borderRadius: 18, paddingTop: 10, paddingHorizontal: 8, paddingBottom: 8, alignItems: 'center', justifyContent: 'space-between', elevation: 4 },
  cardAdd: { backgroundColor: '#F3F4F6', borderWidth: 3, borderColor: '#D1D5DB', borderStyle: 'dashed', elevation: 0, justifyContent: 'center' },
  cardInnerAdd: { backgroundColor: 'transparent' },
  cardLabel: { color: '#FFFFFF', fontWeight: '800', textAlign: 'center', width: '100%' },
  cardInner: { borderRadius: 12, justifyContent: 'center', alignItems: 'center', width: '100%' },
  cardFallback: { fontWeight: '800', textTransform: 'uppercase' },
  btnEliminarFlotante: { position: 'absolute', top: -10, right: -10, backgroundColor: '#DC2626', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', elevation: 5, zIndex: 10 },
  iconoEliminar: { color: 'white', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContenido: { width: 450, backgroundColor: 'white', borderRadius: 20, padding: 24, elevation: 10 },
  
  modalCardPerfil: { width: 400, backgroundColor: '#F5F8FD', borderRadius: 28, padding: 28, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  modalSubtitulo: { textAlign: 'center', color: '#6B7280', marginTop: 4, marginBottom: 20 },
  colorsContainer: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginVertical: 8 },
  colorCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#D1D5DB' },
  selectedColor: { borderColor: '#2563EB', borderWidth: 3 },
  selectorContainer: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 12, padding: 4, marginTop: 8 },
  selectorButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  selectorButtonActive: { backgroundColor: '#FFFFFF', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  selectorText: { color: '#4B5563', fontWeight: '600', fontSize: 14 },
  selectorTextActive: { color: '#111827', fontWeight: 'bold' },
  message: { textAlign: "center", marginTop: 12, fontWeight: '600' },

  modalTitulo: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: '#111827', textAlign: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: '#4B5563', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#111827' },
  btnImagenSelector: { width: '100%', height: 120, backgroundColor: '#F3F4F6', borderRadius: 10, borderStyle: 'dashed', borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  modalBotonesContainer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 24 },
  btnAccion: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, minWidth: 100, alignItems: 'center', justifyContent: 'center' },
  textoBtnAccion: { fontWeight: 'bold', fontSize: 16 }
});