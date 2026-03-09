import React, { useState } from 'react';
import { StyleSheet, Alert, ScrollView, Image } from 'react-native';
import { YStack, XStack, Button, Text, Spinner } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

const COLORS = {
    bgDeep: '#0F1117',
    bgCard: '#161B22',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    accentBlue: '#58A6FF',
    priceGreen: '#3FB950',
    accentPurple: '#8A2BE2'
};

const FASTAPI_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';

export default function ReceiptScannerScreen() {
    const router = useRouter();
    const [image, setImage] = useState<string | null>(null);
    const [base64Image, setBase64Image] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<any>(null);

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to make this work!');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            base64: true,
            quality: 0.5,
        });

        if (!result.canceled && result.assets[0].base64) {
            setImage(result.assets[0].uri);
            setBase64Image(result.assets[0].base64);
            setResults(null);
        }
    };

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Sorry, we need camera permissions to make this work!');
            return;
        }

        let result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            base64: true,
            quality: 0.5,
        });

        if (!result.canceled && result.assets[0].base64) {
            setImage(result.assets[0].uri);
            setBase64Image(result.assets[0].base64);
            setResults(null);
        }
    };

    const analyzeReceipt = async () => {
        if (!base64Image) return;
        setLoading(true);
        try {
            const res = await fetch(`${FASTAPI_URL}/api/v1/receipt-scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: 'local_user',
                    image_base64: base64Image
                })
            });

            const data = await res.json();
            if (res.ok) {
                setResults(data);
                // Optionally trigger a wallet/score increase if they found savings
                if (data.missed_savings > 0) {
                    Alert.alert('Savings Found!', `You could have saved ₹${data.missed_savings} by shopping on SaverHunt!`);
                }
            } else {
                Alert.alert('Error', data.error || 'Failed to analyze receipt.');
            }
        } catch (err) {
            console.error(err);
            Alert.alert('Network Error', 'Could not reach the AI server.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <YStack f={1} backgroundColor={COLORS.bgDeep} pt={60}>
            {/* Header */}
            <XStack px="$4" pb="$4" ai="center" jc="space-between" borderBottomWidth={1} borderColor="#21262D">
                <Button size="$3" circular backgroundColor="transparent" onPress={() => router.back()}>
                    <Text fontSize={20} color="white">←</Text>
                </Button>
                <Text color="white" fontSize={18} fontWeight="800">Missed Savings Scanner</Text>
                <YStack width={44} />
            </XStack>

            <ScrollView contentContainerStyle={{ padding: 16 }}>

                {!image ? (
                    <YStack ai="center" jc="center" h={300} backgroundColor={COLORS.bgCard} borderRadius={20} borderWidth={2} borderStyle="dashed" borderColor={COLORS.accentBlue} mb="$6">
                        <Text fontSize={48} mb="$4">🧾</Text>
                        <Text color={COLORS.textPrimary} fontSize={18} fontWeight="700" mb="$2">Snap your physical receipt</Text>
                        <Text color={COLORS.textSecondary} fontSize={14} ta="center" px="$4">
                            We'll use Gemini Vision to parse the items and instantly check what they cost online right now.
                        </Text>
                    </YStack>
                ) : (
                    <YStack ai="center" mb="$6">
                        <Image source={{ uri: image }} style={{ width: 250, height: 350, borderRadius: 16, borderWidth: 1, borderColor: '#30363D' }} />
                        <Button mt="$3" size="$3" backgroundColor="transparent" onPress={() => setImage(null)}>
                            <Text color={COLORS.textSecondary}>Retake Photo</Text>
                        </Button>
                    </YStack>
                )}

                {!results && !loading && (
                    <XStack gap="$4" jc="center" mb="$6">
                        <Button f={1} size="$5" backgroundColor={COLORS.bgCard} borderRadius={16} onPress={pickImage} borderWidth={1} borderColor="#30363D">
                            <Text color="white" fontWeight="600">📂 Gallery</Text>
                        </Button>
                        <Button f={1} size="$5" backgroundColor={COLORS.accentBlue} borderRadius={16} onPress={takePhoto}>
                            <Text color="white" fontWeight="800">📸 Camera</Text>
                        </Button>
                    </XStack>
                )}

                {image && !results && !loading && (
                    <Button size="$6" backgroundColor={COLORS.accentPurple} borderRadius={16} onPress={analyzeReceipt} icon={<Text fontSize={24}>✨</Text>}>
                        <Text color="white" fontWeight="900" fontSize={18}>Analyze with Gemini 2.5</Text>
                    </Button>
                )}

                {loading && (
                    <YStack ai="center" mt="$6" gap="$4">
                        <Spinner size="large" color={COLORS.accentPurple} />
                        <Text color={COLORS.textPrimary} fontWeight="600" fontSize={16}>Scanning line items...</Text>
                        <Text color={COLORS.textSecondary} fontSize={14}>Checking live prices across Amazon & Blinkit</Text>
                    </YStack>
                )}

                {results && (
                    <YStack mt="$4" gap="$4">
                        <LinearGradient colors={['rgba(138,43,226,0.15)', 'transparent']} style={styles.gradientCard}>
                            <YStack ai="center" mb="$4">
                                <Text color={COLORS.textSecondary} fontSize={14} fontWeight="600" mb="$1">MISSED ONLINE SAVINGS</Text>
                                <Text color={COLORS.priceGreen} fontSize={48} fontWeight="900">₹{results.missed_savings}</Text>
                                <Text color={COLORS.textPrimary} fontSize={16} mt="$2">Store: {results.store}</Text>
                            </YStack>

                            <XStack jc="space-between" mb="$4" p="$3" backgroundColor="rgba(0,0,0,0.5)" borderRadius={12}>
                                <YStack ai="center" f={1}>
                                    <Text color={COLORS.textSecondary} fontSize={12}>You Paid Offline</Text>
                                    <Text color="#ef4444" fontSize={18} fontWeight="800">₹{results.total_in_store}</Text>
                                </YStack>
                                <YStack ai="center" f={1} borderLeftWidth={1} borderColor="#30363D">
                                    <Text color={COLORS.textSecondary} fontSize={12}>Online Cost</Text>
                                    <Text color={COLORS.priceGreen} fontSize={18} fontWeight="800">₹{results.total_online_estimate}</Text>
                                </YStack>
                            </XStack>

                            <Text color={COLORS.textPrimary} fontSize={18} fontWeight="700" mb="$3">Item Breakdown</Text>
                            {results.items.map((item: any, idx: number) => {
                                const difference = item.in_store_price - item.online_price;
                                return (
                                    <XStack key={idx} jc="space-between" ai="center" py="$2" borderBottomWidth={idx === results.items.length - 1 ? 0 : 1} borderColor="#30363D">
                                        <YStack f={1} pr="$2">
                                            <Text color={COLORS.textPrimary} fontSize={14} fontWeight="600" numberOfLines={1}>{item.item_name}</Text>
                                        </YStack>
                                        <YStack ai="flex-end">
                                            <Text color="#ef4444" fontSize={12} textDecorationLine="line-through">₹{item.in_store_price}</Text>
                                            <Text color={COLORS.priceGreen} fontSize={16} fontWeight="800">₹{item.online_price}</Text>
                                            {difference > 0 && <Text color={COLORS.accentBlue} fontSize={10}>Lost ₹{difference.toFixed(0)}</Text>}
                                        </YStack>
                                    </XStack>
                                );
                            })}
                        </LinearGradient>

                        <Button size="$5" backgroundColor={COLORS.bgCard} borderRadius={16} onPress={() => { setResults(null); setImage(null); }} borderWidth={1} borderColor="#30363D" mt="$4">
                            <Text color="white" fontWeight="600">Scan Another Receipt</Text>
                        </Button>
                    </YStack>
                )}

            </ScrollView>
        </YStack>
    );
}

const styles = StyleSheet.create({
    gradientCard: {
        padding: 20,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#8A2BE2' + '40',
    }
});
