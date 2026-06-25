import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  Modal,
  TextInput,
  Button,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import ParticleBackground from './ParticleBackground';

// ── RUTAS DIRECTAS A TUS APIs (Ajustá el localhost por tu IP si usás celular físico)
const REDIS_API = 'http://localhost:4000';
const NEO4J_API = 'http://localhost:4001';
const CASSANDRA_API = 'http://localhost:8000';

type Picto = {
  id: number;
  palabra: string;
  peso?: number;
  pictos: string[];
  imagenUrl?: string | null; // URL de Cloudinary
};

// ── Paleta automática y Medidas ───────────────────────────────────────────────
const PALETA = [
  { fondo: '#7C3AED', inner: '#EDE9FE', icono: '#7C3AED' },
  { fondo: '#D97706', inner: '#FEF3C7', icono: '#D97706' },
  { fondo: '#2563EB', inner: '#DBEAFE', icono: '#2563EB' },
  { fondo: '#059669', inner: '#D1FAE5', icono: '#059669' },
  { fondo: '#DC2626', inner: '#FEE2E2', icono: '#DC2626' },
] as const;

const colorDe = (id: number) => PALETA[id % PALETA.length];

const OBTENER_MEDIDAS = (tamaño: string) => {
  switch (tamaño) {
    case 'pequeño':
    case 'chico':
      return { cardW: 160, cardH: 160, innerDim: 120, fontSize: 14, fallbackSize: 60 };
    case 'grande':
      return { cardW: 320, cardH: 320, innerDim: 260, fontSize: 22, fallbackSize: 120 };
    case 'mediano':
    default:
      return { cardW: 220, cardH: 220, innerDim: 170, fontSize: 17, fallbackSize: 80 };
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

// ── Componentes Visuales ──────────────────────────────────────────────────────

function obtenerUrlPictograma(picto?: Picto | null) {
  if (!picto) return null;
  // Priorizar imagenUrl si está presente (Cloudinary u otra URL completa)
  if (picto.imagenUrl) return picto.imagenUrl;

  const ruta = picto.pictos && picto.pictos.length > 0 ? picto.pictos[0] : null;
  if (!ruta) return null;
  const cleaned = ruta.trim();
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) return cleaned;
  if (cleaned.startsWith('/')) return `${NEO4J_API}${cleaned}`;
  return `${NEO4J_API}/pictogramas/${cleaned}`;
}

function emojiParaPalabra(palabra: string) {
  const clave = palabra.trim().toLowerCase();
  const emojis: Record<string, string> = {
    yo: '🙋',
    quiero: '🤲',
    comer: '🍽️',
    agua: '💧',
    jugar: '🎮',
    dormir: '😴',
    hola: '👋',
    gracias: '🙏',
    'por favor': '🙏',
    más: '➕',
    no: '❌',
    sí: '✅',
    feliz: '😊',
    casa: '🏠',
  };
  return emojis[clave] ?? '💬';
}

function PictoCard({ picto, onPress, onDelete, showDelete, medidas, layoutWidth, numCols }: { picto: Picto, onPress: () => void, onDelete: () => void, showDelete: boolean, medidas: ReturnType<typeof OBTENER_MEDIDAS>, layoutWidth: number, numCols: number }) {
  const { fondo, inner, icono } = colorDe(picto.id);
  const imgUrl = obtenerUrlPictograma(picto);
  const { cardW, cardH, innerDim, fallbackSize, fontSize } = medidas;
  const cardInnerHeight = cardH * 0.75;
  const innerSize = innerDim;
  const imageSize = Math.min(innerSize * 0.9, cardW - 20);
  const hasImage = Boolean(imgUrl);
  const emoji = emojiParaPalabra(picto.palabra);

  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: fondo,
          width: cardW,
          height: cardH,
          shadowColor: fondo,
          borderColor: 'rgba(255,255,255,0.1)',
        },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.82}
        style={[s.cardInner, { width: innerSize, height: cardInnerHeight }]}
      >
        {hasImage ? (
          <Image
            source={{ uri: imgUrl! }}
            style={[s.cardImage, { width: imageSize, height: imageSize }]}
            contentFit="contain"
          />
        ) : (
          <Text style={[s.cardEmoji, { color: icono }]}>{emoji}</Text>
        )}
      </TouchableOpacity>
      {showDelete && (
        <TouchableOpacity style={s.cardDeleteBtn} onPress={onDelete} activeOpacity={0.8}>
          <Text style={s.cardDeleteBtnText}>✖</Text>
        </TouchableOpacity>
      )}
      <View style={s.cardLabelArea}>
        <Text style={s.cardLabel}>{picto.palabra}</Text>
      </View>
    </View>
  );
}

function PhraseBar({ frase, onBorrar, onLimpiar }: { frase: Picto[], onBorrar: () => void, onLimpiar: () => void }) {
  return (
    <View style={s.phraseBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={s.phraseScroll}>
        {frase.length === 0 ? (
          <Text style={s.phrasePlaceholder}>Armá tu frase tocando abajo...</Text>
        ) : (
          frase.map((p, i) => {
            const { fondo, inner } = colorDe(p.id);
            return (
              <View key={i} style={[s.phraseChip, { backgroundColor: inner, borderColor: fondo }]}>
                {p.pictos[0] && <Image source={{ uri: p.pictos[0] }} style={s.phraseChipImg} contentFit="contain" />}
                <Text style={[s.phraseChipLabel, { color: fondo }]}>{p.palabra}</Text>
              </View>
            );
          })
        )}
      </ScrollView>
      <TouchableOpacity onPress={onBorrar} style={s.phraseBtn} hitSlop={10}><Text style={s.phraseBtnText}>⌫</Text></TouchableOpacity>
      <TouchableOpacity onPress={onLimpiar} style={[s.phraseBtn, { backgroundColor: '#EDE9FE' }]} hitSlop={10}><Text style={s.phraseBtnText}>🔊</Text></TouchableOpacity>
    </View>
  );
}

// ── Lógica Principal ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const [nombre, setNombre] = useState('Usuario');
  const [pictos, setPictos] = useState<Picto[]>([]);
  const [frase, setFrase] = useState<Picto[]>([]);
  const fraseRef = React.useRef<Picto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [personalizados, setPersonalizados] = useState<number[]>([]);

  useEffect(() => {
    fraseRef.current = frase;
  }, [frase]);
  const [eliminados, setEliminados] = useState<number[]>([]);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [pictoToDelete, setPictoToDelete] = useState<Picto | null>(null);

  // Estados visuales (defaults por si falla la DB)
  const [colorFondo, setColorFondo] = useState('#050a0e');
  const [tamanoIconos, setTamanoIconos] = useState('mediano');
  const [numCols, setNumCols] = useState(3);
  const medidas = OBTENER_MEDIDAS(tamanoIconos);
  const layout = useWindowDimensions();

  useEffect(() => {
    const w = layout.width;
    if (w < 640) setNumCols(1);
    else if (w < 960) setNumCols(2);
    else if (w < 1280) setNumCols(3);
    else if (w < 1600) setNumCols(4);
    else setNumCols(5);
  }, [layout.width]);

  // 1. Forzar Landscape on tablets/desktops, allow portrait on phones
  useEffect(() => {
    if (layout.width > 700 && Platform.OS !== 'web') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      return () => { ScreenOrientation.unlockAsync().catch(() => {}); };
    }
  }, [layout.width]);

  // 2. Extraer Token, Consultar REDIS (Sesión) y Consultar NEO4J (Grafo)
  useEffect(() => {
    (async () => {
      const tok = await AsyncStorage.getItem('tokenUsuario');
      console.log(tok)
      if (!tok) { router.replace('/'); return; }
      
      const payload = parseJwt(tok);
      const uid = String(payload.userId ?? '');
      setNombre(String(payload.username ?? 'Usuario'));

      // --- SOLO REDIS: OBTENER COLOR Y TAMAÑO ---
      try {
        const resRedis = await fetch(`${REDIS_API}/sesion/${uid}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        });
        const dataRedis = await resRedis.json();

        console.log(dataRedis)
        
        if (dataRedis.colorFondo) setColorFondo(dataRedis.colorFondo);
if (dataRedis.tamañoIconos) setTamanoIconos(dataRedis.tamañoIconos);

const pers = dataRedis.personalizados || [];
const elim = dataRedis.eliminados || [];

setPersonalizados(pers);
setEliminados(elim);

await cargarPadres(pers, elim);
        console.log(dataRedis)
      } catch (err) {
        console.warn('No se pudo cargar la sesión de Redis:', err);
      }

      // --- SOLO NEO4J: CARGAR PADRES ---
      
    })();
  }, []);

  // ── Fetchers DIRECTOS a Neo4j ───────────────────────────────────────────────
  
  async function cargarPadres(pers = personalizados,
  elim = eliminados) {
    setCargando(true);
    try {
      const r = await fetch(`${NEO4J_API}/padres`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
  nodosPersonalizados: pers,
  nodosEliminados: elim,
})
      });
      const data = await r.json();
      setPictos(Array.isArray(data) ? data : []);
    } catch { 
      setPictos([]); 
    } finally { 
      setCargando(false); 
    }
  }

  async function cargarSiguientes(picto: Picto, pers: number[] = personalizados) {
    setCargando(true);
    try {
      const r = await fetch(`${NEO4J_API}/siguientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: picto.id, 
          nodosPersonalizados: pers,
          nodosEliminados: eliminados, 
        }),
      });
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        setPictos(data);
      } else {
        // Solo volver a padres si el usuario tocó un pictograma manualmente
        // no si venimos de crear uno nuevo
      }
    } catch { 
      await cargarPadres(); 
    } finally { 
      setCargando(false); 
    }
  }

  // ── Interacciones ───────────────────────────────────────────────────────────

  const [modalVisible, setModalVisible] = useState(false);
  const [nuevoPictoPalabra, setNuevoPictoPalabra] = useState('');
  const [imagenLocal, setImagenLocal] = useState<string | null>(null);
  const [esGlobal, setEsGlobal] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);

  const handleTap = useCallback(async (picto: Picto) => {
    setFrase(prev => {
      const siguienteFrase = [...prev, picto];
      fraseRef.current = siguienteFrase;
      return siguienteFrase;
    });
    await cargarSiguientes(picto);
  }, [personalizados, eliminados]);

  async function elegirImagen() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && perm.status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled) return;
    const uri = result.assets && result.assets[0] ? result.assets[0].uri : null;
    if (uri) setImagenLocal(uri);
    else console.warn('No se obtuvo URI de la imagen seleccionada', result);
  }

  async function crearPicto() {
    if (!nuevoPictoPalabra) return;
    try {
      let imagenUrl: string | null = null;

      if (imagenLocal) {
        const formData = new FormData();
        if (Platform.OS === 'web') {
          const response = await fetch(imagenLocal);
          const blob = await response.blob();
          const fileName = imagenLocal.split('/').pop() || 'picto.jpg';
          const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
          formData.append('imagen', file);
        } else {
          const uriParts = imagenLocal.split('/');
          const fileName = uriParts[uriParts.length - 1] || 'picto.jpg';
          const extension = fileName.split('.').pop()?.toLowerCase();
          const mimeType = extension === 'png' ? 'image/png' : extension === 'gif' ? 'image/gif' : 'image/jpeg';
          formData.append('imagen', {
            uri: imagenLocal,
            type: mimeType,
            name: fileName,
          } as any);
        }

        const uploadRes = await fetch(`${NEO4J_API}/upload`, {
          method: 'POST',
          body: formData,
        });
        if (!uploadRes.ok) {
          const text = await uploadRes.text();
          console.warn('Upload failed', uploadRes.status, text);
          throw new Error(`upload failed: ${uploadRes.status}`);
        }
        const uploadJson = await uploadRes.json();
        imagenUrl = uploadJson.url;
      }

      const fraseActual = fraseRef.current;
      const anteriorId = fraseActual.length > 0 ? fraseActual[fraseActual.length - 1].id : null;
      console.log('fraseRef al crear:', fraseActual);
      console.log('anteriorId:', anteriorId);
      console.log('Creando pictograma con esGlobal:', esGlobal);

      const res = await fetch(`${NEO4J_API}/agregar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nuevaPalabra: nuevoPictoPalabra,
          imagenUrl,
          anteriorId: esGlobal ? null : anteriorId,
          nodoPadre: esGlobal ? true : anteriorId === null,
          esGlobal,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error('no ok');

      // 1. Obtener ID del nodo recién creado
      const nuevoId = data.nodo?.id;

      console.log('esGlobal al crear:', esGlobal);

      if (nuevoId !== undefined && nuevoId !== null) {
        if (esGlobal === true) {
          // Es global — NO agregar a Redis, recargar padres directamente
          setModalVisible(false);
          setNuevoPictoPalabra('');
          setImagenLocal(null);
          setEsGlobal(false);
          await cargarPadres();
        } else {
          // Es personalizado — agregar a Redis
          const nuevaListaPersonalizados = [...personalizados, nuevoId];
          setPersonalizados(nuevaListaPersonalizados);

          try {
            const tok2 = await AsyncStorage.getItem('tokenUsuario');
            const payload2 = parseJwt(tok2 || '');
            const uid2 = String(payload2.userId ?? '');
            await fetch(`${REDIS_API}/sesion/${uid2}/personalizados`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok2}` },
              body: JSON.stringify({ pictogramaId: Number(nuevoId) }),
            });
          } catch (e) {
            console.warn('No se pudo registrar en Redis', e);
          }

          setModalVisible(false);
          setNuevoPictoPalabra('');
          setImagenLocal(null);
          setEsGlobal(false);
          await cargarPadres(nuevaListaPersonalizados, eliminados);
        }
      } else {
        // Si no hay ID, simplemente recargar
        setModalVisible(false);
        setNuevoPictoPalabra('');
        setImagenLocal(null);
        setEsGlobal(false);
        await cargarPadres();
      }
    } catch (e) {
      console.warn('Error creando picto', e);
    }
  }

  const handleBorrar = useCallback(async () => {
    if (frase.length === 0) return;
    const nuevaFrase = frase.slice(0, -1);
    setFrase(nuevaFrase);
    fraseRef.current = nuevaFrase;
    if (nuevaFrase.length === 0) await cargarPadres();
    else await cargarSiguientes(nuevaFrase[nuevaFrase.length - 1]);
  }, [frase]);

  const handleLimpiar = useCallback(async () => {
    setFrase([]);
    fraseRef.current = [];
    await cargarPadres();
  }, []);

  const confirmarBorrarPicto = useCallback((picto: Picto) => {
    setPictoToDelete(picto);
    setDeleteModalVisible(true);
  }, []);

  const borrarPicto = useCallback(async () => {
    if (!pictoToDelete) return;
    try {
      const tok = await AsyncStorage.getItem('tokenUsuario');
      const payload = parseJwt(tok || '');
      const uid = String(payload.userId ?? '');

      const res = await fetch(`${NEO4J_API}/eliminar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pictoToDelete.id }),
      });
      if (!res.ok) throw new Error('No se pudo eliminar el pictograma');
      const resData = await res.json();
      console.log('borrarPicto response:', resData);

      // Quitar del estado local inmediatamente
      setPictos(prev => prev.filter(p => p.id !== pictoToDelete.id));

      if (resData.borradoDeNeo === true) {
        // Era personalizado — quitar de personalizados en Redis
        const nuevosPersonalizados = personalizados.filter(id => id !== pictoToDelete.id);
        setPersonalizados(nuevosPersonalizados);
        await fetch(`${REDIS_API}/sesion/${uid}/personalizados/${pictoToDelete.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tok}` }
        }).catch(e => console.warn('Error quitando de personalizados en Redis:', e));

      } else {
        // Era original — agregar a eliminados en Redis (write-behind a MongoDB automático)
        const nuevosEliminados = [...eliminados, pictoToDelete.id];
        setEliminados(nuevosEliminados);
        await fetch(`${REDIS_API}/sesion/${uid}/eliminados`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
          body: JSON.stringify({ pictoId: String(pictoToDelete.id) }),
        }).catch(e => console.warn('Error agregando a eliminados en Redis:', e));
      }

      setDeleteModalVisible(false);
      setPictoToDelete(null);

      await cargarPadres();

    } catch (e) {
      console.warn('Error eliminando picto', e);
      setDeleteModalVisible(false);
      setPictoToDelete(null);
    }
  }, [pictoToDelete, personalizados, eliminados]);

  const handleLogout = useCallback(async () => {
    await AsyncStorage.removeItem('tokenUsuario');
    router.replace('/');
  }, []);

  const handleEnviarFrase = useCallback(async () => {
    if (frase.length === 0) return;
    try {
      const tok = await AsyncStorage.getItem('tokenUsuario');
      const payload = parseJwt(tok || '');
      const usuarioId = String(payload.username ?? '');
      const secuencia = frase.map(p => p.id);

      // Guardar en Cassandra
      await fetch(`${CASSANDRA_API}/interacciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: usuarioId, secuencia }),
      });

      // Reforzar relaciones en Neo4j si la frase tiene más de un pictograma
      if (secuencia.length >= 2) {
        await fetch(`${NEO4J_API}/reforzar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secuencia }),
        }).catch(e => console.warn('Error reforzando Neo4j:', e));
      }

    } catch (e) {
      console.warn('Error guardando interacción en Cassandra', e);
    } finally {
      setFrase([]);
      await cargarPadres();
    }
  }, [frase]);

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: colorFondo || '#050a0e' }]}>
      <View style={[s.topContainer, layout.width < 760 && s.topContainerSmall]}>
        <TouchableOpacity style={s.avatar} onPress={() => setLogoutModalVisible(true)} hitSlop={10}>
          <Text style={s.avatarLetra}>{nombre.charAt(0).toUpperCase()}</Text>
        </TouchableOpacity>
        <View style={s.textWrapper}>
          <Text style={s.holaText}>Hola,</Text>
          <Text style={s.nombreText} numberOfLines={1}>{nombre}</Text>
        </View>
        <PhraseBar frase={frase} onBorrar={handleBorrar} onLimpiar={handleLimpiar} />
        <TouchableOpacity onPress={handleEnviarFrase} style={s.logoutBtn} hitSlop={10}><Text style={s.logoutIcon}>↪</Text></TouchableOpacity>
      </View>

      <ParticleBackground />
      <View style={s.gridContainer}>
        <View style={s.toolbar}>
          <TouchableOpacity
            style={[s.addButton, s.deleteToggleButton, deleteMode && s.deleteToggleButtonActive]}
            onPress={() => setDeleteMode(prev => !prev)}
          >
            <Text style={s.addButtonText}>{deleteMode ? 'Cancelar' : 'Eliminar'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.addButton} onPress={() => setModalVisible(true)}>
            <Text style={s.addButtonText}>+ Agregar</Text>
          </TouchableOpacity>
        </View>
        {cargando ? (
          <View style={s.loading}><ActivityIndicator size="large" color="#7C3AED" /></View>
        ) : (
          <FlatList
            data={pictos}
            keyExtractor={item => String(item.id)}
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 20,
              alignItems: 'center',
              gap: 20,
            }}
            renderItem={({ item }) => (
              <PictoCard
                picto={item}
                onPress={() => handleTap(item)}
                onDelete={() => confirmarBorrarPicto(item)}
                showDelete={deleteMode}
                medidas={medidas}
                layoutWidth={layout.width}
                numCols={1}
              />
            )}
          />
        )}
      </View>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.dialogOverlay}>
          <View style={s.dialogCard}>
            <Text style={s.dialogTitle}>Agregar pictograma</Text>
            <Text style={s.dialogSubtitle}>
              Usa una imagen propia para crear una palabra nueva y que los pacientes la identifiquen rápidamente.
            </Text>
            {frase.length > 0 && (
              <Text style={{ color: '#4fc3f7', fontSize: 13, marginBottom: 12 }}>
                Se conectará después de:{' '}
                <Text style={{ fontWeight: '700' }}>
                  {frase[frase.length - 1].palabra}
                </Text>
              </Text>
            )}
            {frase.length === 0 && (
              <Text style={{ color: '#e47911', fontSize: 13, marginBottom: 12 }}>
                Se creará como nodo padre (inicio de frase)
              </Text>
            )}
            <TextInput
              placeholder="Palabra"
              placeholderTextColor="rgba(226,232,240,0.6)"
              value={nuevoPictoPalabra}
              onChangeText={setNuevoPictoPalabra}
              style={s.input}
            />

            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}
              onPress={() => setEsGlobal(prev => !prev)}
              activeOpacity={0.8}
            >
              <View style={{
                width: 22, height: 22, borderRadius: 6,
                backgroundColor: esGlobal ? '#7C3AED' : 'rgba(255,255,255,0.05)',
                borderWidth: 1.5,
                borderColor: esGlobal ? '#7C3AED' : 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center'
              }}>
                {esGlobal && <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>✓</Text>}
              </View>
              <Text style={{ color: 'rgba(226,232,240,0.8)', fontSize: 13 }}>
                Disponible para todos los alumnos
              </Text>
            </TouchableOpacity>

            <View style={{ marginTop: 8, marginBottom: 16 }}>
              <TouchableOpacity style={s.dialogActionButton} onPress={elegirImagen} activeOpacity={0.8}>
                <Text style={s.dialogActionButtonText}>Elegir imagen</Text>
              </TouchableOpacity>
              {imagenLocal && (
                <View style={{ alignItems: 'center', marginTop: 10 }}>
                  <Image source={{ uri: imagenLocal }} style={{ width: 120, height: 120, borderRadius: 14 }} contentFit="cover" />
                </View>
              )}
            </View>

            <View style={s.dialogActions}>
              <TouchableOpacity
                style={[s.dialogBtn, s.dialogBtnSecondary]}
                onPress={() => { setModalVisible(false); setImagenLocal(null); setNuevoPictoPalabra(''); setEsGlobal(false); }}
                activeOpacity={0.8}
              >
                <Text style={[s.dialogBtnText, s.dialogBtnSecondaryText]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  s.dialogBtn,
                  s.dialogBtnPrimary,
                  (!nuevoPictoPalabra || !imagenLocal) && s.dialogBtnDisabled,
                ]}
                onPress={crearPicto}
                disabled={!nuevoPictoPalabra || !imagenLocal}
                activeOpacity={0.8}
              >
                <Text style={s.dialogBtnText}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteModalVisible} animationType="fade" transparent>
        <View style={s.logoutModalOverlay}>
          <View style={s.logoutModalCard}>
            <Text style={s.logoutModalTitle}>Eliminar pictograma</Text>
            <Text style={s.logoutModalSubtitle}>
              Estás por borrar este pictograma de manera permanente.
              ¿Estás seguro de que quieres continuar?
            </Text>
            <View style={s.logoutModalActions}>
              <TouchableOpacity
                style={[s.logoutModalBtn, s.logoutModalBtnCancel]}
                onPress={() => { setDeleteModalVisible(false); setPictoToDelete(null); }}
                activeOpacity={0.8}
              >
                <Text style={[s.logoutModalBtnText, s.logoutModalBtnCancelText]}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.logoutModalBtn, s.logoutModalBtnConfirm]}
                onPress={borrarPicto}
                activeOpacity={0.8}
              >
                <Text style={s.logoutModalBtnText}>Sí, borrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={logoutModalVisible} animationType="fade" transparent>
        <View style={s.logoutModalOverlay}>
          <View style={s.logoutModalCard}>
            <Text style={s.logoutModalTitle}>Cerrar sesión</Text>
            <Text style={s.logoutModalSubtitle}>
              Estás a un paso de salir. Si cierras sesión, volverás a la pantalla de inicio.
            </Text>
            <View style={s.logoutModalActions}>
              <TouchableOpacity
                style={[s.logoutModalBtn, s.logoutModalBtnCancel]}
                onPress={() => setLogoutModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={[s.logoutModalBtnText, s.logoutModalBtnCancelText]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.logoutModalBtn, s.logoutModalBtnConfirm]}
                onPress={() => { setLogoutModalVisible(false); handleLogout(); }}
                activeOpacity={0.8}
              >
                <Text style={s.logoutModalBtnText}>Cerrar sesión</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Estilos (Mantenidos igual para el layout Landscape) ───────────────────────
const s = StyleSheet.create({
  screen: { flex: 1 },
  topContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  profileSection: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 160 },
  textWrapper: { flexShrink: 1 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#4fc3f7', justifyContent: 'center', alignItems: 'center' },
  avatarLetra: { color: '#050a0e', fontSize: 16, fontWeight: '700' },
  holaText: { fontSize: 11, color: 'rgba(240,244,248,0.5)' },
  nombreText: { fontSize: 14, fontWeight: '700', color: '#f0f4f8' },
  logoutBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  logoutIcon: { fontSize: 18, color: '#374151', fontWeight: 'bold' },
  topContainerSmall: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  phraseBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 8, minHeight: 56, borderWidth:1, borderColor:'rgba(255,255,255,0.08)' },
  phraseScroll: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phrasePlaceholder: { color: 'rgba(240,244,248,0.5)', fontSize: 13 },
  phraseChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1.5, gap: 5, borderColor: 'rgba(255,255,255,0.06)' },
  phraseChipImg: { width: 24, height: 24 },
  phraseChipLabel: { fontSize: 11, fontWeight: '700' },
  phraseBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  phraseBtnText: { fontSize: 15 },
  gridContainer: { flex: 1, justifyContent: 'center' },
  toolbar: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' },
  addButton: { backgroundColor: '#072b2f', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, marginRight: 10 },
  deleteToggleButton: { backgroundColor: '#1f2937' },
  deleteToggleButtonActive: { backgroundColor: '#991b1b' },
  addButtonText: { color: '#9EEBCF', fontWeight: '700' },
  scrollHorizontalContainer: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 8 },
  columnWrapper: { justifyContent: 'center', gap: 30 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginVertical: 12,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  cardLabelArea: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingVertical: 8,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 8,
  },
  cardInner: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardImage: { borderRadius: 18, backgroundColor: 'transparent' },
  cardEmoji: { fontSize: 64, textAlign: 'center' },
  cardFallback: { fontWeight: '900', textTransform: 'uppercase', color: '#f0f4f8' },
  logoutModalOverlay: { flex: 1, justifyContent:'center', alignItems:'center', backgroundColor:'rgba(0,0,0,0.55)' },
  logoutModalCard: { width: 520, padding: 24, borderRadius: 24, backgroundColor: 'rgba(15, 23, 42, 0.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.35, shadowRadius: 30, elevation: 18 },
  logoutModalTitle: { fontSize: 20, fontWeight: '800', color: '#F8FAFC', marginBottom: 10 },
  logoutModalSubtitle: { color: 'rgba(226,232,240,0.8)', fontSize: 14, lineHeight: 20, marginBottom: 20 },
  logoutModalActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  logoutModalBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  logoutModalBtnCancel: { backgroundColor: 'rgba(148,163,184,0.16)' },
  logoutModalBtnConfirm: { backgroundColor: '#7C3AED' },
  logoutModalBtnText: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  logoutModalBtnCancelText: { color: '#E2E8F0' },
  dialogOverlay: { flex: 1, justifyContent:'center', alignItems:'center', backgroundColor:'rgba(0,0,0,0.56)' },
  dialogCard: { width: 520, padding: 24, borderRadius: 24, backgroundColor: 'rgba(15, 23, 42, 0.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.3, shadowRadius: 28, elevation: 16 },
  dialogTitle: { fontSize: 20, fontWeight: '800', color: '#F8FAFC', marginBottom: 10 },
  dialogSubtitle: { color: 'rgba(226,232,240,0.7)', fontSize: 14, lineHeight: 20, marginBottom: 18 },
  dialogActionButton: { width: '100%', paddingVertical: 14, borderRadius: 16, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  dialogActionButtonText: { color: '#F8FAFC', fontWeight: '700', fontSize: 14 },
  dialogActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  dialogBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dialogBtnPrimary: { backgroundColor: '#7C3AED' },
  dialogBtnSecondary: { backgroundColor: 'rgba(148,163,184,0.16)' },
  dialogBtnDisabled: { opacity: 0.45 },
  dialogBtnText: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  dialogBtnSecondaryText: { color: '#E2E8F0' },
  cardDeleteBtn: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  cardDeleteBtnText: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  modalWrap: { flex:1, justifyContent:'center', alignItems:'center', backgroundColor:'rgba(0,0,0,0.5)' },
  modalCard: { width: 520, padding:20, borderRadius:12, backgroundColor:'rgba(255,255,255,0.04)', borderWidth:1, borderColor:'rgba(255,255,255,0.06)' },
  modalTitle: { fontSize:18, fontWeight:'700', color:'#E6F8FF', marginBottom:12 },
  input: { height:48, backgroundColor:'rgba(255,255,255,0.03)', borderRadius:8, paddingHorizontal:12, marginBottom:10, color:'#fff' },
});