import { useRouter } from "expo-router";
import { View, TextInput, Pressable, Text, StyleSheet } from "react-native";
import { useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from 'expo-linear-gradient';

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setIsLoading] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState(false);
  const [usuarioCargado, setUsuarioCargado] = useState({});

  const registrarse = () => {
    router.replace("/register");
  };

  const iniciarSesion = async () => {
    setIsLoading(true);
    const informacion = {
      username,
      password,
    };

    try {
      const datos = JSON.stringify(informacion);

      const response = await fetch(
        "http://localhost:3000/api/iniciarSesion",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: datos,
        }
      );

      const data = await response.json();

      if (
        response.status === 400 ||
        response.status === 404 ||
        response.status === 401
      ) {
        setError(true);
        setMensaje(data?.mensaje ?? "Credenciales inválidas");
        return;
      }

      if (!response.ok) {
        setError(true);
        setMensaje("Error inesperado");
        return;
      }

      const redisResponse = await fetch(
        `http://localhost:4000/sesion/${data.usuario._id}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const redisData = await redisResponse.json();

      if (redisResponse.status === 403) {
        setError(true);
        setMensaje(redisData?.mensaje ?? "Acceso denegado");
        return;
      }

      if (!redisResponse.ok) {
        setError(true);
        setMensaje(redisData?.mensaje ?? "Error inesperado en Redis");
        return;
      }

      await AsyncStorage.setItem("tokenUsuario", data.token);

      setError(false);
      setMensaje("Registrado correctamente");

      setUsuarioCargado({
        token: data.token,
        usuario: data.usuario,
      });

      router.replace("/dashboard");
    } catch (e) {
      console.error("Login error:", e);
      setError(true);
      setMensaje("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>PictoComm</Text>

        <Text style={styles.subtitle}>
          Comunicación con pictogramas
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>Usuario</Text>

          <TextInput
            placeholder="Tu nombre de usuario"
            placeholderTextColor="#9CA3AF"
            value={username}
            onChangeText={setUsername}
            style={styles.input}
          />

          <Text style={styles.label}>Contraseña</Text>

          <TextInput
            placeholder="••••••••"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />

          {mensaje ? (
            <Text
              style={[
                styles.message,
                error ? styles.error : styles.success,
              ]}
            >
              {mensaje}
            </Text>
          ) : null}

          <LinearGradient
            colors={["#4fc3f7", "#29b6f6"]}
            style={[styles.loginButton, loading && { opacity: 0.7 }]}
          >
            <Pressable onPress={iniciarSesion} disabled={loading} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={styles.loginButtonText}>{loading ? "Ingresando..." : "Ingresar"}</Text>
            </Pressable>
          </LinearGradient>

          <View style={styles.registerContainer}>
            <Text style={styles.registerText}>
              ¿No tenés cuenta?
            </Text>

            <Pressable onPress={registrarse}>
              <Text style={styles.registerLink}>
                {" "}Registrarse
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },

  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#4fc3f7',
    textAlign: 'center',
    marginTop: 6,
  },

  subtitle: {
    textAlign: 'center',
    color: 'rgba(240,244,248,0.5)',
    marginTop: 8,
    marginBottom: 30,
    fontSize: 15,
  },

  form: {
    gap: 10,
  },

  label: {
    color: '#f0f4f8',
    fontWeight: '600',
    fontSize: 14,
    marginTop: 6,
  },

  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    fontSize: 15,
    color: '#f0f4f8',
  },

  loginButton: {
    marginTop: 20,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4fc3f7',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    width: '100%'
  },

  loginButtonText: {
    color: '#050a0e',
    fontWeight: '700',
    fontSize: 16,
  },

  registerContainer: {
    marginTop: 22,
    flexDirection: "row",
    justifyContent: "center",
  },

  registerText: {
    color: 'rgba(240,244,248,0.5)',
  },

  registerLink: {
    color: '#4fc3f7',
    fontWeight: '700',
  },

  message: {
    textAlign: "center",
    marginTop: 10,
  },

  error: {
    color: '#ff4438',
  },

  success: {
    color: '#00ed64',
  },
});