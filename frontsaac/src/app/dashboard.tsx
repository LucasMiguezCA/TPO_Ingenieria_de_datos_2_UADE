import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
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
import { REDIS_API } from '@/config';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Picto = {
  id: number;
  palabra: string;
  peso?: number;
  pictos: string[];
};

// ── Paleta de colores (asignada por id del picto, determinística) ─────────────

const PALETA = [
  { fondo: '#7C3AED', inner: '#EDE9FE', icono: '#7C3AED' }, // violeta
  { fondo: '#D97706', inner: '#FEF3C7', icono: '#D97706' }, // amber
  { fondo: '#2563EB', inner: '#DBEAFE', icono: '#2563EB' }, // azul
  { fondo: '#059669', inner: '#D1FAE5', icono: '#059669' }, // verde
  { fondo: '#DC2626', inner: '#FEE2E2', icono: '#DC2626' }, // rojo
] as const;

const colorDe = (id: number) => PALETA[id % PALETA.length];

// ── Decodifica el payload del JWT (sin verificar firma — solo lectura) ─────────

function parseJwt(token: string): Record<string, string> {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch {
    return {};
  }
}

// ── Datos de ejemplo cuando la API no está disponible ─────────────────────────

const MOCK: Picto[] = [
  { id: 1,  palabra: 'yo',      pictos: [] },
  { id: 2,  palabra: 'quiero',  pictos: [] },
  { id: 3,  palabra: 'comer',   pictos: [] },
  { id: 4,  palabra: 'agua',    pictos: [] },
  { id: 5,  palabra: 'jugar',   pictos: [] },
  { id: 26, palabra: 'más',     pictos: [] },
  { id: 7,  palabra: 'feliz',   pictos: [] },
  { id: 8,  palabra: 'casa',    pictos: [] },
];

// ── Tamaños de tarjeta (calculados según ancho de pantalla) ───────────────────

const SCREEN_W  = Dimensions.get('window').width;
const H_PAD     = 12;
const GAP       = 12;
const CARD_W    = Math.floor((SCREEN_W - H_PAD * 2 - GAP) / 2);
const INNER_W   = CARD_W - 20;
const RADIUS    = 20;

// ── PictoCard ─────────────────────────────────────────────────────────────────

type CardProps = { picto: Picto; onPress: () => void };

function PictoCard({ picto, onPress }: CardProps) {
  const { fondo, inner, icono } = colorDe(picto.id);
  const imgUrl = picto.pictos[0] ?? null;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.card, { backgroundColor: fondo, width: CARD_W }]}
      activeOpacity={0.82}
    >
      <Text style={s.cardLabel} numberOfLines={1}>
        {picto.palabra}
      </Text>
      <View style={[s.cardInner, { backgroundColor: inner, width: INNER_W, height: INNER_W }]}>
        {imgUrl ? (
          <Image
            source={{ uri: imgUrl }}
            style={{ width: INNER_W * 0.68, height: INNER_W * 0.68 }}
            contentFit="contain"
          />
        ) : (
          <Text style={[s.cardFallback, { color: icono }]}>
            {picto.palabra.slice(0, 3)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── PhraseBar ─────────────────────────────────────────────────────────────────

type PhraseBarProps = {
  frase: Picto[];
  onBorrar: () => void;
  onLimpiar: () => void;
};

function PhraseBar({ frase, onBorrar, onLimpiar }: PhraseBarProps) {
  return (
    <View style={s.phraseBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={s.phraseScroll}
      >
        {frase.length === 0 ? (
          <Text style={s.phrasePlaceholder}>Tu frase aparecerá acá...</Text>
        ) : (
          frase.map((p, i) => {
            const { fondo, inner } = colorDe(p.id);
            return (
              <View key={i} style={[s.phraseChip, { backgroundColor: inner, borderColor: fondo }]}>
                {p.pictos[0] ? (
                  <Image source={{ uri: p.pictos[0] }} style={s.phraseChipImg} contentFit="contain" />
                ) : null}
                <Text style={[s.phraseChipLabel, { color: fondo }]}>{p.palabra}</Text>
              </View>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity onPress={onBorrar} style={s.phraseBtn} hitSlop={10}>
        <Text style={s.phraseBtnText}>⌫</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onLimpiar} style={[s.phraseBtn, { backgroundColor: '#EDE9FE' }]} hitSlop={10}>
        <Text style={s.phraseBtnText}>🔊</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [userId, setUserId]   = useState<string | null>(null);
  const [token,  setToken]    = useState<string | null>(null);
  const [nombre, setNombre]   = useState('Usuario');
  const [pictos, setPictos]   = useState<Picto[]>([]);
  const [frase,  setFrase]    = useState<Picto[]>([]);
  const [cargando, setCargando] = useState(true);

  // ── 1. Leer userId y token de AsyncStorage ──────────────────────────────────
  useEffect(() => {
    (async () => {
      const tok = await AsyncStorage.getItem('tokenUsuario');
      if (!tok) { router.replace('/'); return; }
      const payload = parseJwt(tok);
      setToken(tok);
      setUserId(String(payload.userId ?? ''));
      setNombre(String(payload.username ?? 'Usuario'));
    })();
  }, []);

  // ── 2. Abrir sesión Redis y cargar padres cuando tenemos credenciales ────────
  useEffect(() => {
    if (!userId || !token) return;
    (async () => {
      try {
        await fetch(`${REDIS_API}/sesion/${userId}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
      } catch { /* Redis no disponible; seguimos con mock */ }
      await cargarPadres(userId, token);
    })();
  }, [userId, token]);

  // ── Helpers de API ───────────────────────────────────────────────────────────

  async function cargarPadres(uid = userId, tok = token) {
    setCargando(true);
    try {
      const r = await fetch(`${REDIS_API}/sesion/${uid}/padres`, {
        headers: { Authorization: `Bearer ${tok}` },
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
    if (!userId || !token) return;
    setCargando(true);
    try {
      const r = await fetch(`${REDIS_API}/sesion/${userId}/siguientes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: picto.id }),
      });
      const data = await r.json();
      setPictos(Array.isArray(data) && data.length > 0 ? data : MOCK);
    } catch {
      setPictos(MOCK);
    } finally {
      setCargando(false);
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleTap = useCallback(async (picto: Picto) => {
    setFrase(prev => [...prev, picto]);
    await cargarSiguientes(picto);
  }, [userId, token]);

  const handleBorrar = useCallback(async () => {
    if (frase.length === 0) return;
    const nuevaFrase = frase.slice(0, -1);
    setFrase(nuevaFrase);
    if (nuevaFrase.length === 0) {
      await cargarPadres();
    } else {
      await cargarSiguientes(nuevaFrase[nuevaFrase.length - 1]);
    }
  }, [frase, userId, token]);

  const handleLimpiar = useCallback(async () => {
    setFrase([]);
    await cargarPadres();
  }, [userId, token]);

  const handleLogout = useCallback(async () => {
    if (userId && token) {
      try {
        await fetch(`${REDIS_API}/sesion/${userId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch { /* no importa si falla */ }
    }
    await AsyncStorage.removeItem('tokenUsuario');
    router.replace('/');
  }, [userId, token]);

  // ── Render ───────────────────────────────────────────────────────────────────

  const inicial = nombre.slice(0, 1).toUpperCase();

  return (
    <SafeAreaView style={s.screen}>

      {/* Top bar */}
      <View style={s.topBar}>
        <View style={s.avatar}>
          <Text style={s.avatarLetra}>{inicial}</Text>
        </View>
        <View>
          <Text style={s.holaText}>Hola,</Text>
          <Text style={s.nombreText}>{nombre}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={handleLogout} style={s.logoutBtn} hitSlop={10}>
          <Text style={s.logoutIcon}>↪</Text>
        </TouchableOpacity>
      </View>

      {/* Phrase bar */}
      <PhraseBar frase={frase} onBorrar={handleBorrar} onLimpiar={handleLimpiar} />

      {/* Grid de pictogramas */}
      {cargando ? (
        <View style={s.loading}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : (
        <FlatList
          data={pictos}
          keyExtractor={item => String(item.id)}
          numColumns={2}
          contentContainerStyle={s.grid}
          columnWrapperStyle={s.gridRow}
          renderItem={({ item }) => (
            <PictoCard picto={item} onPress={() => handleTap(item)} />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}

    </SafeAreaView>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#EEF0F8',
  },

  // ── top bar ────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetra: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  holaText: {
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 15,
  },
  nombreText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 20,
  },
  logoutBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutIcon: {
    fontSize: 18,
    color: '#374151',
  },

  // ── phrase bar ─────────────────────────────────────────────
  phraseBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    minHeight: 58,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  phraseScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 4,
  },
  phrasePlaceholder: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  phraseChip: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 2,
  },
  phraseChipImg: {
    width: 28,
    height: 28,
  },
  phraseChipLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  phraseBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  phraseBtnText: {
    fontSize: 17,
  },

  // ── grid ───────────────────────────────────────────────────
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  grid: {
    paddingHorizontal: H_PAD,
    paddingBottom: 32,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: GAP,
  },

  // ── tarjeta ────────────────────────────────────────────────
  card: {
    borderRadius: RADIUS,
    paddingTop: 12,
    paddingHorizontal: 10,
    paddingBottom: 10,
    alignItems: 'center',
  },
  cardLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  cardInner: {
    borderRadius: RADIUS - 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardFallback: {
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -1,
  },
});
