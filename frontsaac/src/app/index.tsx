import { View, StyleSheet } from "react-native";
import LoginForm from "../components/LoginForm";
import ParticleBackground from './ParticleBackground';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <ParticleBackground />
      <LoginForm />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    justifyContent: "center",
    padding: 20,
    backgroundColor: 'transparent',
  },
});