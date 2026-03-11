import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set in your .env file.');
}

// Web uses localStorage directly; native uses AsyncStorage
const webStorage = {
    getItem: (key: string) => {
        try { return Promise.resolve(localStorage.getItem(key)); }
        catch { return Promise.resolve(null); }
    },
    setItem: (key: string, value: string) => {
        try { localStorage.setItem(key, value); return Promise.resolve(); }
        catch { return Promise.resolve(); }
    },
    removeItem: (key: string) => {
        try { localStorage.removeItem(key); return Promise.resolve(); }
        catch { return Promise.resolve(); }
    },
};

function getStorage() {
    if (Platform.OS === 'web') {
        return webStorage;
    }
    // Dynamic require so Metro doesn't try to resolve the native module on web
    return require('@react-native-async-storage/async-storage').default;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: getStorage(),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: Platform.OS === 'web',
    },
});
