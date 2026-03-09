import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { TamaguiProvider } from 'tamagui';
import tamaguiConfig from '../tamagui.config';

import { useColorScheme } from '@/components/useColorScheme';
import { usePushNotifications } from '../lib/notifications';
import * as Linking from 'expo-linking';
import { useRouter, useSegments } from 'expo-router';
import * as Location from 'expo-location';
import { LOCATION_TASK_NAME } from '../lib/locationTasks';
import { supabase } from '../lib/supabase';
import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV();

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

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { expoPushToken } = usePushNotifications();
  const router = useRouter();
  const segments = useSegments();
  const [session, setSession] = useState<any>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  // Initialize Supabase Auth Session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthInitialized(true);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
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

  // Request Location Permissions & Start Background Task for Geofencing
  useEffect(() => {
    if (!session?.user?.id) return;

    (async () => {
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
              distanceInterval: 100, // Process location every 100 meters
              showsBackgroundLocationIndicator: true, // Visible indicator on iOS
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
    })();
  }, [session?.user?.id]);

  // Master Routing Logic: Auth Guard & First-Time User Check
  useEffect(() => {
    if (!authInitialized) return;
    const topSegment = segments[0] as string | undefined;

    if (!session) {
      // Not logged in -> Auth Screen
      if (topSegment !== 'auth') {
        router.replace('/auth' as any);
      }
    } else {
      // Logged in -> Ensure they've seen onboarding
      try {
        const hasOnboarded = storage.getBoolean('has_seen_onboarding');
        if (!hasOnboarded) {
          if (topSegment !== 'onboarding') {
            router.replace('/onboarding' as any);
          }
        } else {
          if (topSegment !== '(tabs)') {
            router.replace('/(tabs)');
          }
        }
      } catch (e) {
        console.error('Error reading onboarding status', e);
        if (topSegment !== '(tabs)') {
          router.replace('/(tabs)');
        }
      }
    }
  }, [session, authInitialized, segments, router]);

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

  const handleIncomingUrl = (url: string | null) => {
    if (!url) return;
    try {
      // Decode the shared URL/Text. We assume standard Android send intent text/plain
      const parsed = Linking.parse(url);

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
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="auth" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </TamaguiProvider>
  );
}
