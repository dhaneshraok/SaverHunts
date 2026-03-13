import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useRef } from 'react';
import 'react-native-reanimated';

import { TamaguiProvider } from 'tamagui';
import tamaguiConfig from '../tamagui.config';

import { useColorScheme } from '@/components/useColorScheme';
import { usePushNotifications } from '../lib/notifications';
import * as Linking from 'expo-linking';
import { useRouter, useSegments } from 'expo-router';
import { Platform, View, StyleSheet, Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { storage, initStorage, setCurrentUser, clearCurrentUser } from '../lib/storage';
import Animated, { FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

// ─── Auth Transition Screen ───────────────────────────
function AuthTransitionScreen() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ), -1, true
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.6 + pulse.value * 0.4,
    transform: [{ scale: 1 + pulse.value * 0.05 }],
  }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + pulse.value * 0.7,
  }));

  return (
    <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(400)} style={transStyles.container}>
      <LinearGradient colors={['#0C0618', '#050510', '#000']} style={StyleSheet.absoluteFill} />
      {/* Decorative glow */}
      <View style={transStyles.glow} />
      <Animated.View style={pulseStyle}>
        <View style={transStyles.logoCircle}>
          <LinearGradient colors={['rgba(139,92,246,0.25)', 'rgba(59,130,246,0.12)']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        </View>
      </Animated.View>
      <Animated.Text style={[transStyles.title, pulseStyle]}>SaverHunt</Animated.Text>
      <Animated.Text style={[transStyles.subtitle, dotStyle]}>Setting up your experience...</Animated.Text>
      {/* Animated dots */}
      <View style={transStyles.dotsRow}>
        {[0, 1, 2].map(i => (
          <Animated.View key={i} style={[transStyles.dot, {
            opacity: pulse.value,
            transform: [{ scale: 0.8 + pulse.value * 0.4 }],
          }]} />
        ))}
      </View>
    </Animated.View>
  );
}

const { width: _SW } = Dimensions.get('window');
const transStyles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, zIndex: 999, justifyContent: 'center', alignItems: 'center' },
  glow: { position: 'absolute', width: _SW * 0.7, height: _SW * 0.7, borderRadius: _SW * 0.35, backgroundColor: 'rgba(139,92,246,0.06)', top: '25%' },
  logoCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: 'rgba(139,92,246,0.3)', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  title: { color: '#FFF', fontSize: 28, fontWeight: '900', letterSpacing: -1, marginTop: 20 },
  subtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '500', marginTop: 8 },
  dotsRow: { flexDirection: 'row', gap: 6, marginTop: 24 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#A78BFA' },
});

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { expoPushToken } = usePushNotifications();
  const router = useRouter();
  const segments = useSegments();
  const [session, setSession] = useState<any>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const prevSession = useRef<any>(null);

  // Initialize storage and Supabase Auth Session
  useEffect(() => {
    initStorage().then(() => {
      setStorageReady(true);
      return supabase.auth.getSession();
    }).then(({ data: { session } }) => {
      if (session?.user?.id) setCurrentUser(session.user.id);
      setSession(session);
      setAuthInitialized(true);
    }).catch(() => {
      // Even if something fails, mark as initialized so user isn't stuck
      setStorageReady(true);
      setAuthInitialized(true);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Show transition screen when user just signed in/up
      if (!prevSession.current && newSession) {
        setShowTransition(true);
        setTimeout(() => setShowTransition(false), 1800);
      }
      // Scope storage to the new user (or clear on sign-out)
      if (newSession?.user?.id) {
        setCurrentUser(newSession.user.id);
      } else {
        clearCurrentUser();
      }
      prevSession.current = newSession;
      setSession(newSession);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Log token for debugging (in a real app, send it to your backend here or on login)
  useEffect(() => {
    if (expoPushToken) {
      console.log('App registered with Push Token:', expoPushToken);
    }
  }, [expoPushToken]);

  // Request Location Permissions & Start Background Task for Geofencing (native only)
  useEffect(() => {
    if (!session?.user?.id || Platform.OS === 'web') return;

    (async () => {
      try {
      const Location = await import('expo-location');
      const { LOCATION_TASK_NAME } = await import('../lib/locationTasks');

      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus === 'granted') {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus === 'granted') {
          const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
          if (!started) {
            console.log("Background location permission granted. Starting geofence task.");
            await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 15000,
              distanceInterval: 100,
              showsBackgroundLocationIndicator: true,
              foregroundService: {
                notificationTitle: "SaverHunt is running",
                notificationBody: "Monitoring for nearby retail store price drops",
                notificationColor: "#A855F7",
              }
            });
          }
        } else {
          console.log("Background location permission denied.");
        }
      } else {
        console.log("Foreground location permission denied.");
      }
      } catch (e) {
        console.log("Location setup skipped:", e);
      }
    })();
  }, [session?.user?.id]);

  // Master Routing Logic: Auth Guard & First-Time User Check
  useEffect(() => {
    if (!authInitialized || !storageReady) return;
    const topSegment = segments[0] as string | undefined;

    if (!session) {
      // Not logged in -> Auth Screen
      if (topSegment !== 'auth') {
        router.replace('/auth' as any);
      }
    } else {
      // Logged in -> Ensure they've seen onboarding
      let hasOnboarded = false;
      try {
        hasOnboarded = storage.getBoolean('has_seen_onboarding') === true;
      } catch (e) {
        console.error('Error reading onboarding status', e);
        // Default to NOT onboarded so new users always see it
        hasOnboarded = false;
      }

      if (!hasOnboarded) {
        if (topSegment !== 'onboarding') {
          router.replace('/onboarding' as any);
        }
      } else {
        if (topSegment !== '(tabs)') {
          router.replace('/(tabs)');
        }
      }
    }
  }, [session, authInitialized, storageReady, segments, router]);

  // Handle incoming deep links (specifically for "Share to SaverHunt")
  useEffect(() => {
    // Check if app was opened from a link initially
    Linking.getInitialURL().then(url => handleIncomingUrl(url));

    // Listen for links while app is open
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleIncomingUrl = async (url: string | null) => {
    if (!url || typeof url !== 'string' || url.length > 2000) return;
    try {
      // Decode the shared URL/Text. We assume standard Android send intent text/plain
      const parsed = Linking.parse(url);

      // Handle saverhunt://share/{share_code} deep links
      if (parsed.path && parsed.path.startsWith('share/')) {
        const shareCode = parsed.path.replace('share/', '').trim();
        // Validate share code: alphanumeric only, max 20 chars
        if (shareCode && /^[a-zA-Z0-9]+$/.test(shareCode) && shareCode.length <= 20) {
          try {
            const { api } = await import('../lib/api');
            const res = await api.resolveShareLink(shareCode);
            if (res.status === 'success' && res.data?.title) {
              // Navigate to search with the shared deal's product title
              router.push(`/(tabs)?sharedQuery=${encodeURIComponent(res.data.title)}`);
              return;
            }
          } catch (e) {
            console.error('Error resolving share link', e);
          }
        }
      }

      // If someone shared a raw text block including a url to us:
      let queryParam = parsed.queryParams?.text || parsed.queryParams?.url || url;
      if (typeof queryParam === 'string') {
        // Extract just the URL if there's text surrounding it (common in Amazon share links)
        const urlMatch = queryParam.match(/(https?:\/\/[^\s]+)/g);
        if (urlMatch) {
          queryParam = urlMatch[0];
        }

        // Navigate to the main tab and pass the query
        // This relies on the index tab listening for this parameter or handling it globally
        // For MVP, if we navigate to index, we expect the user to paste it.
        // Let's pass it as a router param so index.tsx can auto-fill and auto-search.
        router.push(`/(tabs)?sharedQuery=${encodeURIComponent(queryParam)}`);
      }
    } catch (e) {
      console.error("Error parsing deep link", e);
    }
  };

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          animation: 'slide_from_right',
        }}>
          <Stack.Screen name="auth" options={{ gestureEnabled: false }} />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
          <Stack.Screen name="product/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="grocery" options={{
            headerShown: false,
          }} />
          <Stack.Screen name="feed" options={{
            headerShown: true,
            headerTitle: 'Feed',
            headerStyle: { backgroundColor: '#0A0E14' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
          }} />
          <Stack.Screen name="leaderboard" options={{
            headerShown: true,
            headerTitle: 'Leaderboard',
            headerStyle: { backgroundColor: '#0A0E14' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
          }} />
          <Stack.Screen name="wardrobe" options={{
            headerShown: true,
            headerTitle: 'Wardrobe',
            headerStyle: { backgroundColor: '#0A0E14' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
          }} />
          <Stack.Screen name="gift-concierge" options={{
            headerShown: true,
            headerTitle: 'Gift Concierge',
            headerStyle: { backgroundColor: '#0A0E14' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
          }} />
          <Stack.Screen name="settings" options={{
            headerShown: true,
            headerTitle: 'Settings',
            headerStyle: { backgroundColor: '#0A0E14' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
          }} />
          <Stack.Screen name="community" options={{
            headerShown: true,
            headerTitle: 'Community',
            headerStyle: { backgroundColor: '#0A0E14' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
          }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
        {/* Transition overlay after sign-in / sign-up */}
        {showTransition && <AuthTransitionScreen />}
      </ThemeProvider>
    </TamaguiProvider>
  );
}
