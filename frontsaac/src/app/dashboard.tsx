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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';

// ── RUTAS DIRECTAS A TUS APIs (Ajustá el localhost por tu IP si usás celular físico)
const REDIS_API = 'http://localhost:4000';
const NEO4J_API = 'http://localhost:3001';

type Picto = {
  id: number;
  palabra: string;
  peso?: number;
  pictos: string[];
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
    case 'chico': return { cardW: 400, cardH: 380, innerDim: 330, fontSize: 23, fallbackSize: 100 };
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

// ── Componentes Visuales ──────────────────────────────────────────────────────

function PictoCard({ picto, onPress, medidas }: { picto: Picto, onPress: () => void, medidas: ReturnType<typeof OBTENER_MEDIDAS> }) {
  
  const { fondo, inner, icono } = colorDe(picto.id);
  const imgUrl =
  picto.pictos[0]
    ? `${NEO4J_API}/${picto.pictos[0].replace(/^\/+/, "")}`
    : null;
  console.log(imgUrl)
  const { cardW, cardH, innerDim, fontSize, fallbackSize } = medidas;

  return (
    <TouchableOpacity onPress={onPress} style={[s.card, { backgroundColor: fondo, width: cardW, height: cardH }]} activeOpacity={0.82}>
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
  const [cargando, setCargando] = useState(true);
  const [personalizados, setPersonalizados] = useState<number[]>([]);
  const [eliminados, setEliminados] = useState<number[]>([]);

  // Estados visuales (defaults por si falla la DB)
  const [colorFondo, setColorFondo] = useState('#EEF0F8');
  const [tamanoIconos, setTamanoIconos] = useState('mediano');
  const medidas = OBTENER_MEDIDAS(tamanoIconos);

  // 1. Forzar Landscape
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => { ScreenOrientation.unlockAsync(); };
  }, []);

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
      const r = await fetch(`${NEO4J_API}/siguientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: picto.id, nodosPersonalizados: personalizados,
  nodosEliminados: eliminados, }),
      });
      const data = await r.json();
      setPictos(Array.isArray(data) && data.length > 0 ? data : MOCK);
    } catch { 
      setPictos(MOCK); 
    } finally { 
      setCargando(false); 
    }
  }

  // ── Interacciones ───────────────────────────────────────────────────────────

  const handleTap = useCallback(async (picto: Picto) => {
    setFrase(prev => [...prev, picto]);
    await cargarSiguientes(picto);
  }, []);

  const handleBorrar = useCallback(async () => {
    if (frase.length === 0) return;
    const nuevaFrase = frase.slice(0, -1);
    setFrase(nuevaFrase);
    if (nuevaFrase.length === 0) await cargarPadres();
    else await cargarSiguientes(nuevaFrase[nuevaFrase.length - 1]);
  }, [frase]);

  const handleLimpiar = useCallback(async () => {
    setFrase([]);
    await cargarPadres();
  }, []);

  const handleLogout = useCallback(async () => {
    await AsyncStorage.removeItem('tokenUsuario');
    router.replace('/');
  }, []);

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: colorFondo }]}>
      <View style={s.topContainer}>
        <View style={s.profileSection}>
          <View style={s.avatar}><Text style={s.avatarLetra}>{nombre.charAt(0).toUpperCase()}</Text></View>
          <View style={s.textWrapper}>
            <Text style={s.holaText}>Hola,</Text>
            <Text style={s.nombreText} numberOfLines={1}>{nombre}</Text>
          </View>
        </View>
        <PhraseBar frase={frase} onBorrar={handleBorrar} onLimpiar={handleLimpiar} />
        <TouchableOpacity onPress={handleLogout} style={s.logoutBtn} hitSlop={10}><Text style={s.logoutIcon}>↪</Text></TouchableOpacity>
      </View>

      <View style={s.gridContainer}>
        {cargando ? (
          <View style={s.loading}><ActivityIndicator size="large" color="#7C3AED" /></View>
        ) : (
          <FlatList
            data={pictos}
            keyExtractor={item => String(item.id)}
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.scrollHorizontalContainer}
            renderItem={({ item }) => <PictoCard picto={item} onPress={() => handleTap(item)} medidas={medidas} />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Estilos (Mantenidos igual para el layout Landscape) ───────────────────────
const s = StyleSheet.create({
  screen: { flex: 1 },
  topContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  profileSection: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 160 },
  textWrapper: { flexShrink: 1 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
  avatarLetra: { color: '#fff', fontSize: 16, fontWeight: '700' },
  holaText: { fontSize: 11, color: '#6B7280' },
  nombreText: { fontSize: 14, fontWeight: '700', color: '#111827' },
  logoutBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  logoutIcon: { fontSize: 18, color: '#374151', fontWeight: 'bold' },
  phraseBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, gap: 6, height: 52, elevation: 2 },
  phraseScroll: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phrasePlaceholder: { color: '#9CA3AF', fontSize: 13 },
  phraseChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1.5, gap: 5 },
  phraseChipImg: { width: 24, height: 24 },
  phraseChipLabel: { fontSize: 11, fontWeight: '700' },
  phraseBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  phraseBtnText: { fontSize: 15 },
  gridContainer: { flex: 1, justifyContent: 'center' },
  scrollHorizontalContainer: { paddingHorizontal: 16, alignItems: 'center', gap: 14 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { borderRadius: 18, paddingTop: 10, paddingHorizontal: 8, paddingBottom: 8, alignItems: 'center', justifyContent: 'space-between', elevation: 4 },
  cardLabel: { color: '#FFFFFF', fontWeight: '800', textAlign: 'center', width: '100%' },
  cardInner: { borderRadius: 12, justifyContent: 'center', alignItems: 'center', width: '100%' },
  cardFallback: { fontWeight: '800', textTransform: 'uppercase' },
});