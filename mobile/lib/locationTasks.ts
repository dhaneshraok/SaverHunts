import { Platform } from 'react-native';

export const LOCATION_TASK_NAME = 'background-location-task';

// Only define the background task on native platforms
if (Platform.OS !== 'web') {
    const TaskManager = require('expo-task-manager');
    const Notifications = require('expo-notifications');
    const { supabase } = require('./supabase');

    // Geofences loaded from Supabase at task runtime
    async function loadGeofences(): Promise<{ store: string; latitude: number; longitude: number; radius: number }[]> {
        try {
            const { data } = await supabase
                .from('store_geofences')
                .select('store, latitude, longitude, radius')
                .eq('active', true);
            return data || [];
        } catch (e) {
            console.error('Failed to load geofences:', e);
            return [];
        }
    }

    function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
        const R = 6371e3;
        const p1 = lat1 * Math.PI / 180;
        const p2 = lat2 * Math.PI / 180;
        const dp = (lat2 - lat1) * Math.PI / 180;
        const dl = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
        if (error) {
            console.error("Background Location Error", error);
            return;
        }
        if (data) {
            const { locations } = data as { locations: any[] };
            const latestLocation = locations[0];

            const geofences = await loadGeofences();
            let nearStore = null;
            for (const fence of geofences) {
                const dist = getDistance(latestLocation.coords.latitude, latestLocation.coords.longitude, fence.latitude, fence.longitude);
                if (dist <= fence.radius) {
                    nearStore = fence.store;
                    break;
                }
            }

            if (nearStore) {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session?.user) {
                        const { data: watchItems } = await supabase
                            .from('grocery_watch_items')
                            .select('*')
                            .eq('user_id', session.user.id)
                            .eq('active', true)
                            .limit(1);

                        if (watchItems && watchItems.length > 0) {
                            const item = watchItems[0];
                            await Notifications.scheduleNotificationAsync({
                                content: {
                                    title: `You're near a ${nearStore}!`,
                                    body: `Hold up! The ${item.item_name} on your watchlist is cheaper online. Check SaverHunt before buying in-store!`,
                                    sound: true,
                                },
                                trigger: null,
                            });
                        }
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        }
    });
}
