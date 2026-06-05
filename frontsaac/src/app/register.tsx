import React from 'react'
import { View, TextInput, Button, TouchableOpacity, Text } from "react-native";
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
    <View>
        <TextInput
        placeholder="Email"
        value={username}
        onChangeText={setUsername}
      />

      <TextInput
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
        <View style={{ flexDirection: "row", gap: 12 }}>
            {colores.map((color) => (
              <TouchableOpacity
                key={color}
                onPress={() => setColorFondo(color)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: color,
                  borderWidth: 2,
                  borderColor: "#ccc",
                }}
              />
            ))}
            <CustomPicker
                value={tamanoIconos}
                onChange={setTamanoIconos}
                opciones={[
                  { label: "Chico", value: "1" },
                  { label: "Mediano", value: "2" },
                  { label: "Grande", value: "3" },
                ]}
              />
            <Button
                title={loading ? "Cargando..." : "Registrarse"}
                disabled={loading}
                onPress={handleRegistrarse}
              />
            {mensaje !== "" && (
              <Text
                style={{
                  marginTop: 10,
                  color: error ? "red" : "green",
                }}
              >
                {mensaje}
              </Text>
            )}

        </View>
    </View>
  )
}
const colores = [
  "#1F2937", // gris oscuro
  "#374151", // gris medio
  "#6B7280", // gris claro
  "#FFFFFF", // blanco
  "#000000", // negro
];
export default register
