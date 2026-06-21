import React, { useState } from 'react'
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import CustomPicker from "../components/CustomPicker";
import { router } from "expo-router";
import ParticleBackground from './ParticleBackground';

const register = () => {
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [colorFondo, setColorFondo] = useState("")
    const [tamanoIconos, setTamanoIconos] = useState("mediano");
    const [loading, setIsLoading] = useState(false);
    const [mensaje, setMensaje] = useState("");
    const [error, setError] = useState(false);
    const [usuarioCargado, setUsuarioCargado] = useState({})

    const handleRegistrarse = async () => {
        try {
            const informacion = {
                username,
                password,
                rol: 'usuario',
                colorFondo,
                tamañoIconos: tamanoIconos
            }
            setIsLoading(true)
            const datos = JSON.stringify(informacion)
            const response = await fetch(
                "http://localhost:3000/api/registrar",
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


  return (
  <View style={styles.container}>
    <ParticleBackground />
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

      <LinearGradient colors={["#4fc3f7","#29b6f6"]} style={styles.button}>
        <TouchableOpacity
          style={{flex:1,justifyContent:'center',alignItems:'center'}}
          disabled={loading}
          onPress={handleRegistrarse}
        >
          <Text style={styles.buttonText}>{loading ? "Cargando..." : "Registrarse"}</Text>
        </TouchableOpacity>
      </LinearGradient>

      <TouchableOpacity onPress={() => router.replace("/")}>
        <Text style={styles.link}>
          ¿Ya tenés cuenta? Ingresar
        </Text>
      </TouchableOpacity>
    </View>
  </View>
);
}
const colores = [
  "#1F2937", // gris oscuro
  "#374151", // gris medio
  "#6B7280", // gris claro
  "#FFFFFF", // blanco
  "#000000", // negro
];
const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'transparent',
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
    fontSize: 32,
    fontWeight: '800',
    color: '#4fc3f7',
    textAlign: 'center',
  },

  subtitle: {
    textAlign: 'center',
    color: 'rgba(240,244,248,0.5)',
    marginTop: 8,
    marginBottom: 30,
  },

  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f0f4f8',
    marginBottom: 6,
    marginTop: 12,
  },

  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    height: 56,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#f0f4f8',
  },

  colorsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 12,
  },

  colorCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  selectedColor: {
    borderColor: '#4fc3f7',
    borderWidth: 2,
  },

  button: {
    marginTop: 24,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%'
  },

  buttonText: {
    color: '#050a0e',
    fontWeight: '700',
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
    color: 'rgba(240,244,248,0.5)',
    marginBottom: 12,
  },
});
export default register

