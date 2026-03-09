import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

export const LOCATION_TASK_NAME = 'background-location-task';

// Mocked coordinates for demonstration
// In production, this would query a backend radius API
const MOCK_GEOFENCES = [
    {
        store: 'Croma',
        latitude: 19.0760, // e.g. Mumbai Croma
        longitude: 72.8777,
        radius: 200, // meters
    },
    {
        store: 'Reliance Digital',
        latitude: 28.6139, // e.g. Delhi Reliance Digital
        longitude: 77.2090,
        radius: 200,
    }
];

// Calculate Haversine distance in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3; // Earth radius in meters
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

// Ensure the task is defined
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
        console.error("Background Location Error", error);
        return;
    }
    if (data) {
        const { locations } = data as { locations: Location.LocationObject[] };
        const latestLocation = locations[0];

        // Check against mocked geofences
        let nearStore = null;
        for (const fence of MOCK_GEOFENCES) {
            const dist = getDistance(latestLocation.coords.latitude, latestLocation.coords.longitude, fence.latitude, fence.longitude);
            if (dist <= fence.radius) {
                nearStore = fence.store;
                break;
            }
        }

        if (nearStore) {
            // We are near a retail store. 
            // In a real app, query `grocery_watch_items` or carts for user to see if they have tech/grocery items.
            // For demonstration, we'll fetch one watched item to compare.
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
                        // Trigger Local Push Notification
                        await Notifications.scheduleNotificationAsync({
                            content: {
                                title: `You're near a ${nearStore}! 🛍️`,
                                body: `Hold up! The ${item.item_name} on your watchlist is cheaper online. Check SaverHunt before buying in-store!`,
                                sound: true,
                            },
                            trigger: null, // deliver immediately
                        });
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }
    }
});
