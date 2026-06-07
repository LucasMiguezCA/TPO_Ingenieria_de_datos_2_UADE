import { useRouter } from "expo-router";
import { View, TextInput, Pressable, Text, StyleSheet } from "react-native";
import { useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MONGO_API, REDIS_API } from "@/config";

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
        `${MONGO_API}/api/iniciarSesion`,
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
        `${REDIS_API}/sesion/${data.usuario._id}`,
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
      setMensaje("Sesión iniciada");

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
        <Text style={styles.title}>PictoLink</Text>

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

          <Pressable
            style={[
              styles.loginButton,
              loading && { opacity: 0.7 },
            ]}
            onPress={iniciarSesion}
            disabled={loading}
          >
            <Text style={styles.loginButtonText}>
              {loading ? "Ingresando..." : "Ingresar"}
            </Text>
          </Pressable>

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
    backgroundColor: "#EEF3FA",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  card: {
    backgroundColor: "#F5F8FD",
    borderRadius: 28,
    padding: 28,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 15,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 6,
  },

  title: {
    fontSize: 34,
    fontWeight: "800",
    color: "#1F2937",
    textAlign: "center",
    marginTop: 10,
  },

  subtitle: {
    textAlign: "center",
    color: "#6B7280",
    marginTop: 8,
    marginBottom: 35,
    fontSize: 15,
  },

  form: {
    gap: 10,
  },

  label: {
    color: "#4B5563",
    fontWeight: "600",
    fontSize: 14,
    marginTop: 6,
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    fontSize: 15,
  },

  loginButton: {
    marginTop: 20,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#3366E8",
    justifyContent: "center",
    alignItems: "center",

    shadowColor: "#3366E8",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 8,
  },

  loginButtonText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
  },

  registerContainer: {
    marginTop: 22,
    flexDirection: "row",
    justifyContent: "center",
  },

  registerText: {
    color: "#6B7280",
  },

  registerLink: {
    color: "#3366E8",
    fontWeight: "700",
  },

  message: {
    textAlign: "center",
    marginTop: 10,
  },

  error: {
    color: "#DC2626",
  },

  success: {
    color: "#16A34A",
  },
});