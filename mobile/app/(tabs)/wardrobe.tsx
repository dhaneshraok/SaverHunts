import React, { useState, useEffect } from 'react';
import { StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { YStack, XStack, Text, Button, ScrollView, Image, Sheet } from 'tamagui';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../../lib/supabase';
import ARTryOnModal, { OutfitItem } from '../../components/ARTryOnModal';

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import ProductViewer360 from '../../components/ProductViewer360';

const COLORS = {
    bgDeep: '#0D0F15',
    bgCard: '#1A1D24',
    borderSubtle: 'rgba(255,255,255,0.08)',
    textPrimary: '#FFFFFF',
    textSecondary: '#A1A1AA',
    accentBlue: '#38BDF8',
    accentGold: '#FDE047',
    glowBlue: 'rgba(56, 189, 248, 0.3)',
    glowGold: 'rgba(253, 224, 71, 0.4)'
};

const FASTAPI_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';

export default function WardrobeScreen() {
    const [session, setSession] = useState<any>(null);
    const [wardrobe, setWardrobe] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    // AI Stylist State
    const [stylistOpen, setStylistOpen] = useState(false);
    const [occasion, setOccasion] = useState('');
    const [generating, setGenerating] = useState(false);
    const [outfits, setOutfits] = useState<any[]>([]);

    // AR Try-On State
    const [arVisible, setArVisible] = useState(false);
    const [arItems, setArItems] = useState<OutfitItem[]>([]);
    const [arSingleImage, setArSingleImage] = useState<string | null>(null);
    const [arSingleTitle, setArSingleTitle] = useState<string>('');

    // 360 Viewer State
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerProduct, setViewerProduct] = useState<any>(null);

    const router = useRouter();

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session?.user) fetchWardrobe(session.user.id);
            else setLoading(false);
        });

        supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session?.user) fetchWardrobe(session.user.id);
        });
    }, []);

    const fetchWardrobe = async (userId: string) => {
        setLoading(true);
        const { data, error } = await supabase
            .from('wardrobe_items')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) console.error(error);
        if (data) setWardrobe(data);
        setLoading(false);
    };

    const pickImage = async () => {
        if (!session?.user) return;

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.5,
            base64: true
        });

        if (!result.canceled && result.assets && result.assets[0].base64) {
            handleUpload(result.assets[0].base64);
        }
    };

    const handleUpload = async (base64Data: string) => {
        if (!session?.user) return;
        setUploading(true);

        try {
            const res = await fetch(`${FASTAPI_URL}/api/v1/ai/wardrobe/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: session.user.id,
                    image_base64: base64Data
                })
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Upload failed');

            // Refresh wardrobe
            fetchWardrobe(session.user.id);
            Alert.alert('Added to Wardrobe!', `Auto-tagged as ${json.data.color} ${json.data.category}`);

        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setUploading(false);
        }
    };

    const generateOutfits = async (selectedOccasion: string) => {
        if (!session?.user) return;
        setOccasion(selectedOccasion);
        setGenerating(true);

        try {
            const res = await fetch(`${FASTAPI_URL}/api/v1/ai/stylist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: session.user.id,
                    occasion: selectedOccasion
                })
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Stylist failed');

            setOutfits(json.outfits || []);

        } catch (error: any) {
            Alert.alert('Stylist Error', error.message);
        } finally {
            setGenerating(false);
        }
    };

    if (!session) {
        return (
            <YStack f={1} backgroundColor={COLORS.bgDeep} jc="center" ai="center" px="$4">
                <Text color={COLORS.textPrimary} fontSize={24} fontWeight="800" ta="center" mb="$2">Digital Wardrobe</Text>
                <Text color={COLORS.textSecondary} fontSize={16} ta="center">Sign in on the Profile tab to organize your closet and get AI style advice.</Text>
            </YStack>
        );
    }

    return (
        <YStack f={1} backgroundColor={COLORS.bgDeep} pt={60}>
            {/* Header */}
            <XStack px="$4" py="$3" jc="space-between" ai="center">
                <YStack>
                    <Text color={COLORS.textPrimary} fontSize={32} fontWeight="900" letterSpacing={-1}>Wardrobe</Text>
                    <Text color={COLORS.textSecondary} fontSize={14}>{wardrobe.length} Items</Text>
                </YStack>
                <YStack
                    shadowColor={COLORS.glowGold}
                    shadowOffset={{ width: 0, height: 4 }}
                    shadowOpacity={0.8}
                    shadowRadius={12}
                >
                    <Button
                        size="$4"
                        backgroundColor={COLORS.accentGold}
                        borderRadius={100}
                        onPress={() => setStylistOpen(true)}
                        pressStyle={{ scale: 0.95 }}
                    >
                        <Text color="#000" fontWeight="900" fontSize={15}>✨ AI Stylist</Text>
                    </Button>
                </YStack>
            </XStack>

            {/* Grid */}
            <ScrollView contentContainerStyle={{ padding: 16 }}>
                {loading ? (
                    <YStack f={1} jc="center" ai="center" mt="$10">
                        <ActivityIndicator size="large" color={COLORS.accentBlue} />
                        <Text color={COLORS.textSecondary} mt="$4" fontWeight="600">Syncing Closet...</Text>
                    </YStack>
                ) : (
                    <XStack flexWrap="wrap" gap="$3" jc="space-between">
                        {/* Upload Card */}
                        <PressableCard onPress={pickImage} borderStyle="dashed">
                            <LinearGradient
                                colors={['rgba(255,255,255,0.05)', 'transparent']}
                                style={StyleSheet.absoluteFill}
                            />
                            {uploading ? (
                                <ActivityIndicator color={COLORS.textPrimary} />
                            ) : (
                                <YStack ai="center" gap="$2">
                                    <YStack backgroundColor="rgba(255,255,255,0.1)" p="$3" borderRadius={100}>
                                        <Text color={COLORS.textPrimary} fontSize={24}>📷</Text>
                                    </YStack>
                                    <Text color={COLORS.textSecondary} mt="$2" fontWeight="700" fontSize={14}>Add Item</Text>
                                </YStack>
                            )}
                        </PressableCard>

                        {/* Items */}
                        {wardrobe.map((item) => (
                            <YStack
                                key={item.id}
                                width="47%"
                                aspectRatio={0.8}
                                backgroundColor={COLORS.bgCard}
                                borderRadius={20}
                                overflow="hidden"
                                borderWidth={1}
                                borderColor={COLORS.borderSubtle}
                                shadowColor="#000"
                                shadowOffset={{ width: 0, height: 4 }}
                                shadowOpacity={0.3}
                                shadowRadius={8}
                            >
                                <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '70%' }} resizeMode="cover" />
                                <LinearGradient
                                    colors={['transparent', 'rgba(0,0,0,0.8)']}
                                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%' }}
                                />
                                <YStack position="absolute" bottom={0} left={0} right={0} p="$3" zIndex={10}>
                                    <Text color={COLORS.textPrimary} fontWeight="800" fontSize={14} numberOfLines={1}>
                                        {item.color} {item.category}
                                    </Text>
                                    <Text color={COLORS.textSecondary} fontSize={12} numberOfLines={1}>
                                        {item.style_notes || 'Casual worn look'}
                                    </Text>
                                </YStack>

                                {/* 360 View + AR Buttons */}
                                <XStack position="absolute" top={8} right={8} zIndex={20} gap="$2">
                                    <Button
                                        size="$3"
                                        circular
                                        backgroundColor="rgba(255, 255, 255, 0.15)"
                                        onPress={() => {
                                            setViewerProduct({
                                                title: `${item.color} ${item.category}`,
                                                images: [item.image_url],
                                            });
                                            setViewerVisible(true);
                                        }}
                                        pressStyle={{ scale: 0.9 }}
                                        borderWidth={1}
                                        borderColor="rgba(255,255,255,0.2)"
                                    >
                                        <Text fontSize={14}>🔍</Text>
                                    </Button>
                                    <Button
                                        size="$3"
                                        circular
                                        backgroundColor="rgba(167, 139, 250, 0.8)"
                                        onPress={() => {
                                            setArSingleImage(item.image_url);
                                            setArSingleTitle(`${item.color} ${item.category}`);
                                            setArVisible(true);
                                        }}
                                        pressStyle={{ scale: 0.9 }}
                                    >
                                        <Text fontSize={14}>👁️</Text>
                                    </Button>
                                </XStack>
                            </YStack>
                        ))}
                    </XStack>
                )}
            </ScrollView>

            {/* AI Stylist Lookbook Sheet */}
            <Sheet
                modal
                open={stylistOpen}
                onOpenChange={setStylistOpen}
                snapPoints={[90]}
                position={0}
                dismissOnSnapToBottom
            >
                <Sheet.Overlay />
                <Sheet.Frame backgroundColor={COLORS.bgDeep} padding="$4" borderRadius={24}>
                    <Sheet.Handle backgroundColor={COLORS.borderSubtle} />

                    {!outfits.length && !generating ? (
                        <YStack f={1} jc="center" ai="center" gap="$4" px="$2">
                            <YStack backgroundColor={COLORS.glowGold} p="$4" borderRadius={100} mb="$2">
                                <Text fontSize={64}>✨</Text>
                            </YStack>
                            <Text color={COLORS.textPrimary} fontSize={28} fontWeight="900" letterSpacing={-1}>Virtual Stylist</Text>
                            <Text color={COLORS.textSecondary} ta="center" mb="$6" fontSize={16} lineHeight={24}>Select an occasion and I'll curate stunning, personalized outfits from your closet.</Text>

                            <Button size="$5" width="100%" backgroundColor={COLORS.bgCard} borderColor={COLORS.borderSubtle} borderWidth={1} borderRadius={16} onPress={() => generateOutfits("Office/Work")} pressStyle={{ scale: 0.98 }}>
                                <Text color={COLORS.textPrimary} fontWeight="700" fontSize={16}>🏢 Formal Office Day</Text>
                            </Button>
                            <Button size="$5" width="100%" backgroundColor={COLORS.bgCard} borderColor={COLORS.borderSubtle} borderWidth={1} borderRadius={16} onPress={() => generateOutfits("Date Night")} pressStyle={{ scale: 0.98 }}>
                                <Text color={COLORS.textPrimary} fontWeight="700" fontSize={16}>🍷 Upscale Date Night</Text>
                            </Button>
                            <Button size="$5" width="100%" backgroundColor={COLORS.bgCard} borderColor={COLORS.borderSubtle} borderWidth={1} borderRadius={16} onPress={() => generateOutfits("Casual Weekend")} pressStyle={{ scale: 0.98 }}>
                                <Text color={COLORS.textPrimary} fontWeight="700" fontSize={16}>☕ Casual Weekend</Text>
                            </Button>
                        </YStack>
                    ) : generating ? (
                        <YStack f={1} jc="center" ai="center" gap="$5">
                            <ActivityIndicator size="large" color={COLORS.accentGold} />
                            <Text color={COLORS.textPrimary} fontWeight="800" fontSize={18}>Curating your Lookbook...</Text>
                            <Text color={COLORS.textSecondary} fontSize={14}>Analyzing colors and tags</Text>
                        </YStack>
                    ) : (
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <XStack jc="space-between" ai="flex-start" mb="$5" mt="$2">
                                <YStack>
                                    <Text color={COLORS.accentGold} fontSize={14} fontWeight="800" textTransform="uppercase" letterSpacing={1}>Curated Looks</Text>
                                    <Text color={COLORS.textPrimary} fontSize={32} fontWeight="900" letterSpacing={-1}>{occasion}</Text>
                                </YStack>
                                <Button size="$3" circular backgroundColor="rgba(255,255,255,0.1)" onPress={() => setOutfits([])}>
                                    <Text color={COLORS.textPrimary} fontWeight="900">✕</Text>
                                </Button>
                            </XStack>

                            {/* Horizontal Swipeable Cards */}
                            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} snapToInterval={356} decelerationRate="fast">
                                {outfits.map((outfit, index) => (
                                    <YStack
                                        key={index}
                                        width={340}
                                        mr={16}
                                        backgroundColor={COLORS.bgCard}
                                        borderRadius={28}
                                        p="$5"
                                        borderWidth={1}
                                        borderColor={COLORS.borderSubtle}
                                        shadowColor="#000"
                                        shadowOffset={{ width: 0, height: 10 }}
                                        shadowOpacity={0.5}
                                        shadowRadius={20}
                                    >
                                        <XStack ai="center" gap="$2" mb="$2">
                                            <YStack backgroundColor={COLORS.accentGold} px="$2" py="$1" borderRadius={6}>
                                                <Text color="#000" fontSize={12} fontWeight="900" letterSpacing={1}>LOOK 0{index + 1}</Text>
                                            </YStack>
                                            <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600">{outfit.style_category || 'Custom Fit'}</Text>
                                        </XStack>

                                        <Text color={COLORS.textPrimary} fontSize={26} fontWeight="900" mb="$3" lineHeight={30} letterSpacing={-0.5}>{outfit.title}</Text>
                                        <Text color={COLORS.textSecondary} mb="$5" fontSize={15} lineHeight={22}>{outfit.reasoning}</Text>

                                        {/* Outfit Visual Grid */}
                                        <XStack gap="$3" mb="$5" height={240}>
                                            <YStack f={1} gap="$3">
                                                <YStack f={1} borderRadius={16} backgroundColor="#21262D" overflow="hidden" borderWidth={1} borderColor={COLORS.borderSubtle}>
                                                    <Image source={{ uri: outfit.shirt_image || 'https://via.placeholder.com/150' }} style={{ flex: 1 }} resizeMode="cover" />
                                                </YStack>
                                                <YStack f={1} borderRadius={16} backgroundColor="#21262D" overflow="hidden" borderWidth={1} borderColor={COLORS.borderSubtle}>
                                                    <Image source={{ uri: outfit.pants_image || 'https://via.placeholder.com/150' }} style={{ flex: 1 }} resizeMode="cover" />
                                                </YStack>
                                            </YStack>
                                            <YStack f={1} borderRadius={16} backgroundColor="#21262D" overflow="hidden" borderWidth={1} borderColor={COLORS.borderSubtle}>
                                                <Image source={{ uri: outfit.shoes_image || 'https://via.placeholder.com/150' }} style={{ flex: 1 }} resizeMode="cover" />
                                            </YStack>
                                        </XStack>

                                        {/* AR Try It On Button */}
                                        <Button
                                            size="$4"
                                            width="100%"
                                            backgroundColor="rgba(167, 139, 250, 0.15)"
                                            borderWidth={1}
                                            borderColor="#A78BFA"
                                            borderRadius={14}
                                            mb="$4"
                                            onPress={() => {
                                                setArItems([
                                                    ...(outfit.shirt_image ? [{ imageUrl: outfit.shirt_image, category: 'shirt', label: 'Top' }] : []),
                                                    ...(outfit.pants_image ? [{ imageUrl: outfit.pants_image, category: 'pants', label: 'Bottom' }] : []),
                                                    ...(outfit.shoes_image ? [{ imageUrl: outfit.shoes_image, category: 'shoes', label: 'Shoes' }] : []),
                                                ]);
                                                setArVisible(true);
                                            }}
                                            pressStyle={{ scale: 0.96 }}
                                        >
                                            <XStack ai="center" gap="$2">
                                                <Text fontSize={18}>👁️</Text>
                                                <Text color="#A78BFA" fontWeight="900" fontSize={15}>Try It On — AR</Text>
                                            </XStack>
                                        </Button>

                                        {outfit.upsell_suggestion && (
                                            <YStack
                                                backgroundColor={COLORS.glowBlue}
                                                p="$4"
                                                borderRadius={16}
                                                borderWidth={1}
                                                borderColor={COLORS.accentBlue}
                                                mt="auto"
                                            >
                                                <XStack ai="center" gap="$2" mb="$2">
                                                    <Text fontSize={20}>💡</Text>
                                                    <Text color={COLORS.textPrimary} fontWeight="900" fontSize={16}>Stylist Upsell</Text>
                                                </XStack>
                                                <Text color={COLORS.textPrimary} fontSize={15} mb="$4" lineHeight={20}>"You need <Text color={COLORS.accentGold} fontWeight="bold">{outfit.upsell_suggestion}</Text> to complete this."</Text>
                                                <Button
                                                    size="$3"
                                                    backgroundColor={COLORS.accentBlue}
                                                    borderRadius={12}
                                                    pressStyle={{ scale: 0.95 }}
                                                    onPress={() => {
                                                        setStylistOpen(false);
                                                        router.push({
                                                            pathname: '/(tabs)',
                                                            params: { sharedQuery: outfit.upsell_suggestion }
                                                        });
                                                    }}
                                                >
                                                    <Text color="#000" fontWeight="900">Find on SaverHunt</Text>
                                                </Button>
                                            </YStack>
                                        )}
                                    </YStack>
                                ))}
                            </ScrollView>
                        </ScrollView>
                    )}
                </Sheet.Frame>
            </Sheet>

            {/* AR Try-On Modal */}
            <ARTryOnModal
                visible={arVisible}
                onClose={() => { setArVisible(false); setArItems([]); setArSingleImage(null); }}
                outfitItems={arItems.length > 0 ? arItems : undefined}
                imageUrl={arSingleImage}
                productTitle={arSingleTitle}
            />

            {/* 360 Viewer Modal */}
            {viewerProduct && (
                <ProductViewer360
                    visible={viewerVisible}
                    onClose={() => { setViewerVisible(false); setViewerProduct(null); }}
                    title={viewerProduct.title}
                    images={viewerProduct.images}
                    onARPress={() => {
                        setViewerVisible(false);
                        setArSingleImage(viewerProduct.images[0]);
                        setArSingleTitle(viewerProduct.title);
                        setArVisible(true);
                    }}
                />
            )}
        </YStack>
    );
}

// Helper Component
const PressableCard = ({ onPress, children, borderStyle = 'solid' }: any) => (
    <YStack
        width="47%"
        aspectRatio={0.8}
        backgroundColor={COLORS.bgCard}
        borderRadius={16}
        borderWidth={2}
        borderColor={COLORS.borderSubtle}
        borderStyle={borderStyle}
        jc="center"
        ai="center"
        onPress={onPress}
        pressStyle={{ opacity: 0.7 }}
    >
        {children}
    </YStack>
);
