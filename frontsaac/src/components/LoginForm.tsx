import { useRouter } from "expo-router";
import { View, TextInput, Button } from "react-native";
import { useState } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  }

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

      if (response.status === 400 || response.status === 404 || response.status === 401) {
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
      setMensaje("Registrado correctamente");
      setUsuarioCargado({ token: data.token, usuario: data.usuario });
      console.log({ usuarioCargado, data });
      
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
    <View style={{ padding: 20 }}>
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

      <Button
        title="Ingresar"
        onPress={iniciarSesion}
        disabled={loading}
      />

      <Button
        title="¿Desea registrarse?"
        onPress={registrarse}
      />
    </View>
  );
}