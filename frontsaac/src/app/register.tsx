import React, { useEffect, useState } from 'react'
import { View, TextInput, TouchableOpacity, Text, StyleSheet, ScrollView } from "react-native";
import CustomPicker from "../components/CustomPicker";
import { router } from "expo-router";
import { MONGO_API } from "@/config";

const register = () => {
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [colorFondo, setColorFondo] = useState("#FFFFFF")
    const [tamanoIconos, setTamanoIconos] = useState("mediano");
    const [terapeutaId, setTerapeutaId] = useState("");
    const [terapeutas, setTerapeutas] = useState<{ label: string; value: string }[]>([]);
    const [loading, setIsLoading] = useState(false);
    const [loadingTerapeutas, setLoadingTerapeutas] = useState(false);
    const [mensaje, setMensaje] = useState("");
    const [error, setError] = useState(false);
    const [usuarioCargado, setUsuarioCargado] = useState({})

    const handleRegistrarse = async () => {
        if (!terapeutaId) {
            setError(true);
            setMensaje("Debes seleccionar un terapeuta");
            return;
        }

        try {
            const informacion = {
                username,
                password,
                rol: 'usuario',
                terapeutaId,
                colorFondo,
                tamañoIconos: tamanoIconos
            }
            setIsLoading(true)
            const datos = JSON.stringify(informacion)
            const response = await fetch(
                `${MONGO_API}/api/registrar`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: datos,
                }
              );
              const data = await response.json();
              setIsLoading(false)
            if (response.status === 400) {
                console.log(data?.detalle)
                setError(true);
                setMensaje(data.mensaje);
                return;
            }
            if (!response.ok) {
                setError(true)
                setMensaje("Error inesperado")
                return;
            }

            setError(false)
            setMensaje("registrado correctamente")
            setUsuarioCargado(data.usuario)
            console.log(usuarioCargado)
            router.replace("/");

            
        }
        catch (e){
            setIsLoading(false);
            setError(true);
            setMensaje("No se pudo conectar con el servidor");
            console.log(e)

        }
    }

    useEffect(() => {
      const cargarTerapeutas = async () => {
        setLoadingTerapeutas(true);
        try {
          const response = await fetch(`${MONGO_API}/api/usuarios`);
          const data = await response.json();
          if (response.ok && Array.isArray(data)) {
            const opciones = data
              .filter((usuario: any) => usuario.rol === 'terapeuta')
              .map((terapeuta: any) => ({
                label: terapeuta.username,
                value: terapeuta._id,
              }));

            setTerapeutas(opciones);
            if (opciones.length > 0) {
              setTerapeutaId(opciones[0].value);
            } else {
              setMensaje('No hay terapeutas disponibles actualmente.');
              setError(true);
            }
          } else {
            setMensaje('No se pudieron cargar los terapeutas');
            setError(true);
          }
        } catch (e) {
          console.log(e);
          setMensaje('Error al cargar terapeutas');
          setError(true);
        } finally {
          setLoadingTerapeutas(false);
        }
      };

      cargarTerapeutas();
    }, []);

  return (
  <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
    <View style={styles.card}>
      <Text style={styles.title}>Crear cuenta</Text>

      <Text style={styles.subtitle}>
        Configurá tus preferencias
      </Text>

      <Text style={styles.label}>Usuario</Text>
      <TextInput
        placeholder="Tu nombre de usuario"
        value={username}
        onChangeText={setUsername}
        style={styles.input}
        placeholderTextColor="#9CA3AF"
      />

      <Text style={styles.label}>Contraseña</Text>
      <TextInput
        placeholder="••••••••"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        placeholderTextColor="#9CA3AF"
      />

      <Text style={styles.label}>Color de fondo</Text>

      <View style={styles.colorsContainer}>
        {colores.map((color) => (
          <TouchableOpacity
            key={color}
            onPress={() => setColorFondo(color)}
            style={[
              styles.colorCircle,
              { backgroundColor: color },
              colorFondo === color && styles.selectedColor,
            ]}
          />
        ))}
      </View>

      <Text style={styles.label}>Tamaño de iconos</Text>

      <CustomPicker
        value={tamanoIconos}
        onChange={setTamanoIconos}
        opciones={[
          { label: "Chico", value: "pequeño" },
          { label: "Mediano", value: "mediano" },
          { label: "Grande", value: "grande" },
        ]}
      />

      <Text style={styles.label}>Terapeuta</Text>
      {loadingTerapeutas ? (
        <Text style={styles.subtext}>Cargando terapeutas...</Text>
      ) : terapeutas.length > 0 ? (
        <CustomPicker
          value={terapeutaId}
          onChange={setTerapeutaId}
          opciones={terapeutas}
        />
      ) : (
        <Text style={[styles.subtext, { color: '#DC2626' }]}>No hay terapeutas disponibles</Text>
      )}

      {mensaje !== "" && (
        <Text
          style={[
            styles.message,
            { color: error ? "#DC2626" : "#16A34A" },
          ]}
        >
          {mensaje}
        </Text>
      )}

      <TouchableOpacity
        style={styles.button}
        disabled={loading}
        onPress={handleRegistrarse}
      >
        <Text style={styles.buttonText}>
          {loading ? "Cargando..." : "Registrarse"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace("/")}>
        <Text style={styles.link}>
          ¿Ya tenés cuenta? Ingresar
        </Text>
      </TouchableOpacity>
    </View>
  </ScrollView>
);
}
const colores = [
  "#FFFFFF", // blanco
  "#FFF9C4", // amarillo
  "#E3F2FD", // azul
  "#E8F5E9", // verde
  "#FCE4EC", // rosa
];
const styles = StyleSheet.create({
  container: {
  flex: 1,
  justifyContent: "center",
  paddingHorizontal: 24,
  backgroundColor: "#EEF3FA",
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
    fontSize: 32,
    fontWeight: "800",
    color: "#1F2937",
    textAlign: "center",
  },

  subtitle: {
    textAlign: "center",
    color: "#6B7280",
    marginTop: 8,
    marginBottom: 30,
  },

  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
    marginBottom: 6,
    marginTop: 12,
  },

  input: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    height: 56,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  colorsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginVertical: 12,
  },

  colorCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },

  selectedColor: {
    borderColor: "#2563EB",
    borderWidth: 3,
  },

  button: {
    marginTop: 24,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#3366E8",
    justifyContent: "center",
    alignItems: "center",
  },

  buttonText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
  },

  link: {
    marginTop: 20,
    textAlign: "center",
    color: "#3366E8",
    fontWeight: "700",
  },

  message: {
    textAlign: "center",
    marginTop: 12,
  },

  subtext: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 12,
  },
});
export default register

