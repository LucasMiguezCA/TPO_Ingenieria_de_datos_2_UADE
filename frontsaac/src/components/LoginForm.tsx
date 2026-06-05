import React, { useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { MONGO_API, REDIS_API } from '@/config';

// ── Design tokens (de pictolink.css) ─────────────────────────────────────────

const C = {
  appBg:        '#EEF4FB',
  surface:      '#FFFFFF',
  primary:      '#2563EB',
  primaryPress: '#1D4FD0',
  ink:          '#1B2433',
  inkSoft:      '#5C6675',
  inkFaint:     '#97A0AE',
  line:         '#E6EBF2',
  danger:       '#D7263D',
  dangerTint:   '#FBE3E6',
} as const;

const R = { sm: 10, md: 16, lg: 22, xl: 28 } as const;

// ── Field ─────────────────────────────────────────────────────────────────────

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon: keyof typeof Feather.glyphMap;
  secureTextEntry?: boolean;
};

function Field({ label, value, onChange, placeholder, icon, secureTextEntry }: FieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={[
        s.fieldWrap,
        focused && s.fieldWrapFocus,
      ]}>
        <Feather name={icon} size={20} color={focused ? C.primary : C.inkFaint} style={{ marginRight: 10 }} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={C.inkFaint}
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
          style={s.fieldInput}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
    </View>
  );
}

// ── PrimaryButton ─────────────────────────────────────────────────────────────

type BtnProps = {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
};

function PrimaryButton({ onPress, disabled, children }: BtnProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn  = () => Animated.spring(scale, { toValue: 0.975, useNativeDriver: true, speed: 50 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,     useNativeDriver: true, speed: 50 }).start();

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
    >
      <Animated.View style={[
        s.btn,
        { backgroundColor: disabled ? C.primary : C.primary, transform: [{ scale }], opacity: disabled ? 0.5 : 1 },
      ]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ── LoginForm ─────────────────────────────────────────────────────────────────

export default function LoginForm() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const iniciarSesion = async () => {
    if (!username || !password) {
      setError('Completá usuario y contraseña');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${MONGO_API}/api/iniciarSesion`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (res.status === 400 || res.status === 404 || res.status === 401) {
        setError(data?.mensaje ?? 'Credenciales inválidas');
        return;
      }
      if (!res.ok) {
        setError('Error inesperado');
        return;
      }

      // Abrir sesión en Redis (no bloqueante si falla)
      try {
        const redisRes = await fetch(`${REDIS_API}/sesion/${data.usuario._id}`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' },
        });
        if (redisRes.status === 403) {
          const rd = await redisRes.json();
          setError(rd?.mensaje ?? 'Acceso denegado');
          return;
        }
      } catch { /* Redis no disponible, seguimos igual */ }

      await AsyncStorage.setItem('tokenUsuario', data.token);
      router.replace('/dashboard');
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Brand ──────────────────────────────────────────────── */}
        <View style={s.brand}>
          <View style={s.brandIcon}>
            <Feather name="message-square" size={46} color="#fff" />
          </View>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={s.brandTitle}>PictoLink</Text>
            <Text style={s.brandSub}>Comunicación con pictogramas</Text>
          </View>
        </View>

        {/* ── Form ───────────────────────────────────────────────── */}
        <View style={s.form}>
          <Field
            label="Usuario"
            value={username}
            onChange={setUsername}
            placeholder="Tu nombre de usuario"
            icon="user"
          />
          <Field
            label="Contraseña"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            icon="lock"
            secureTextEntry
          />
        </View>

        {/* ── Error ──────────────────────────────────────────────── */}
        {error !== '' && (
          <View style={s.errorBox}>
            <Feather name="alert-circle" size={16} color={C.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {/* ── Botón principal ────────────────────────────────────── */}
        <View style={s.btnWrap}>
          <PrimaryButton onPress={iniciarSesion} disabled={loading}>
            <Text style={s.btnLabel}>{loading ? 'Ingresando…' : 'Ingresar'}</Text>
            {!loading && <Feather name="arrow-right" size={20} color="#fff" />}
          </PrimaryButton>
        </View>

        {/* ── Link registro ──────────────────────────────────────── */}
        <Pressable onPress={() => router.replace('/register')} style={s.registerLink}>
          <Text style={s.registerLinkText}>
            ¿No tenés cuenta?{'  '}
            <Text style={s.registerLinkAccent}>Registrarse</Text>
          </Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.appBg,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 26,
    paddingTop: 72,
    paddingBottom: 40,
  },

  // brand
  brand: {
    alignItems: 'center',
    gap: 16,
    marginTop: 16,
  },
  brandIcon: {
    width: 92,
    height: 92,
    borderRadius: 26,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: C.primary,
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.38,
        shadowRadius: 20,
      },
      android: { elevation: 10 },
      web: { boxShadow: '0 14px 30px rgba(37,99,235,0.35)' } as any,
    }),
  },
  brandTitle: {
    fontSize: 38,
    fontWeight: '700',
    color: C.ink,
    letterSpacing: -0.5,
    ...Platform.select({ ios: { fontFamily: 'ui-rounded' } }),
  },
  brandSub: {
    fontSize: 16,
    color: C.inkSoft,
    textAlign: 'center',
  },

  // form
  form: {
    marginTop: 44,
    gap: 18,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: C.inkSoft,
    marginBottom: 8,
    marginLeft: 4,
  },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 2,
    borderColor: C.line,
    height: 56,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  fieldWrapFocus: {
    borderColor: C.primary,
    ...Platform.select({
      ios: {
        shadowColor: C.primary,
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      web: { boxShadow: '0 0 0 4px rgba(37,99,235,0.10)' } as any,
    }),
  },
  fieldInput: {
    flex: 1,
    fontSize: 17,
    color: C.ink,
    height: '100%',
  },

  // error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    backgroundColor: C.dangerTint,
    borderRadius: R.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: {
    fontSize: 14,
    color: C.danger,
    fontWeight: '500',
    flex: 1,
  },

  // button
  btnWrap: {
    marginTop: 28,
  },
  btn: {
    height: 56,
    borderRadius: R.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: C.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.34,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
      web: { boxShadow: '0 6px 18px rgba(37,99,235,0.32)' } as any,
    }),
  },
  btnLabel: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '600',
    letterSpacing: 0.2,
    ...Platform.select({ ios: { fontFamily: 'ui-rounded' } }),
  },

  // register link
  registerLink: {
    marginTop: 22,
    alignItems: 'center',
  },
  registerLinkText: {
    fontSize: 16,
    color: C.inkSoft,
  },
  registerLinkAccent: {
    color: C.primary,
    fontWeight: '600',
  },
});
