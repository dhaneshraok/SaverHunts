import { Platform } from 'react-native';

interface Storage {
    set(key: string, value: boolean | string | number): void;
    getBoolean(key: string): boolean | undefined;
    getString(key: string): string | undefined;
    delete(key: string): void;
}

function createWebStorage(): Storage {
    return {
        set(key: string, value: boolean | string | number) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch {}
        },
        getBoolean(key: string): boolean | undefined {
            try {
                const val = localStorage.getItem(key);
                return val != null ? JSON.parse(val) : undefined;
            } catch {
                return undefined;
            }
        },
        getString(key: string): string | undefined {
            try {
                const val = localStorage.getItem(key);
                return val != null ? JSON.parse(val) : undefined;
            } catch {
                return undefined;
            }
        },
        delete(key: string) {
            try {
                localStorage.removeItem(key);
            } catch {}
        },
    };
}

function createNativeStorage(): Storage {
    const { createMMKV } = require('react-native-mmkv');
    return createMMKV();
}

export const storage: Storage =
    Platform.OS === 'web' ? createWebStorage() : createNativeStorage();
