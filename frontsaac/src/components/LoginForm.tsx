import { router } from "expo-router";
import { View, TextInput, Button,  } from "react-native";
import { useState } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setIsLoading] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState(false);
  const [usuarioCargado, setUsuarioCargado] = useState({})




  const iniciarSesion = async () => {
    const informacion = {
      username,
      password
    }
    try {
      const datos = JSON.stringify(informacion)
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
      const data = await response.json()
      if (response.status == 400 || response.status == 404 || response.status == 401) {
        setError(true)
        setMensaje(data?.mensaje)
        return
      }
      if (!response.ok) {
        setError(true)
        setMensaje("Error inesperado")
      }


    const redisResponse = await fetch(
        `http://192.168.1.100:4000/sesion/${data.usuario._id}`,
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
        setMensaje(redisData?.mensaje);
        return;
      }
      if (!redisResponse.ok) {
        setError(true);
        setMensaje("Error inesperado en Redis");
        return;
      }

      setError(false)
      setMensaje("registrado correctamente")
      setUsuarioCargado({token: data.token, usuario: data.usuario})
      console.log(usuarioCargado)
      router.replace("/dashboard");

      await AsyncStorage.setItem(
        "tokenUsuario",
        data.token
      );



    
    }
    catch (e) {}
    
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
      />
    </View>
  );
}