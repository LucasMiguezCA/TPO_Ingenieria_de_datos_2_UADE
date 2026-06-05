<<<<<<< HEAD
import { Stack } from "expo-router";

export default function Layout() {
  return <Stack />;
=======
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Login' }} />
        <Stack.Screen name="register" options={{ title: 'Register' }} />
        <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      </Stack>
    </ThemeProvider>
  );
>>>>>>> bdcb785cfab57a51155f915b98c397998e2a3c3d
}

