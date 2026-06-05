import React from 'react'
import { View, TextInput, Button, TouchableOpacity, Text, StyleSheet } from "react-native";
import { useState } from "react";
import CustomPicker from "../components/CustomPicker";
import { router } from "expo-router";

const register = () => {
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [colorFondo, setColorFondo] = useState("")
    const [tamanoIconos, setTamanoIconos] = useState<string>("1");
    const [loading, setIsLoading] = useState(false);
    const [mensaje, setMensaje] = useState("");
    const [error, setError] = useState(false);
    const [usuarioCargado, setUsuarioCargado] = useState({})

    const handleRegistrarse = async () => {
        try {
            const informacion = {
                username,
                password,
                colorFondo,
                tamanoIconos: tamanoIconos
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
            }

            setError(false)
            setMensaje("registrado correctamente")
            setUsuarioCargado(data.usuario)
            console.log(usuarioCargado)
            router.replace("/");

            
        }
        catch (e){
            setError(true);
            setMensaje("No se pudo conectar con el servidor");
            console.log(e)

        }
    }


  return (
  <View style={styles.container}>
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
          { label: "Chico", value: "1" },
          { label: "Mediano", value: "2" },
          { label: "Grande", value: "3" },
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
});
export default register