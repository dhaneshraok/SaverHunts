import React from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import { YStack, XStack, Button, Text, ScrollView, View } from 'tamagui';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useCartStore } from '../../store/cartStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Design Tokens ─────────────────────────────────────
const COLORS = {
    bgDeep: '#0F1117',
    bgCard: '#161B22',
    bgCardHover: '#1C2129',
    borderSubtle: '#21262D',
    gradientStart: '#2D1B69',
    gradientMid: '#1A1A3E',
    priceGreen: '#3FB950',
    badgeBg: '#0D3B2E',
    badgeText: '#3FB950',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    textMuted: '#484F58',
    accentBlue: '#58A6FF',
    badgeRed: '#DC2626',
    badgeRedBg: '#450A0A',
};

// ─── Cart Item Component ───────────────────────────────
function CartItemRow({ item, index }: { item: any; index: number }) {
    const removeItem = useCartStore((state) => state.removeItem);

    const wasPrice = item.original_price_inr || (item.price_inr * 1.2);
    const savings = wasPrice - item.price_inr;

    return (
        <Animated.View
            entering={FadeInUp.delay(index * 100).duration(400).springify()}
            style={styles.card}
        >
            <XStack gap="$3" p="$3" ai="center">
                {/* Thumbnail */}
                <YStack
                    width={64}
                    height={64}
                    borderRadius={12}
                    overflow="hidden"
                    backgroundColor={COLORS.bgCardHover}
                >
                    {item.image_url ? (
                        <ExpoImage
                            source={{ uri: item.image_url }}
                            style={{ width: 64, height: 64 }}
                            contentFit="cover"
                            transition={300}
                        />
                    ) : (
                        <YStack f={1} ai="center" jc="center">
                            <Text color={COLORS.textMuted} fontSize={10}>No img</Text>
                        </YStack>
                    )}
                </YStack>

                {/* Details */}
                <YStack f={1} gap="$1">
                    <Text color={COLORS.textPrimary} fontSize={14} fontWeight="600" numberOfLines={2}>
                        {item.title}
                    </Text>

                    <XStack ai="center" gap="$2" mt="$1">
                        <Text color={COLORS.priceGreen} fontSize={16} fontWeight="800">
                            ₹{item.price_inr?.toLocaleString('en-IN')}
                        </Text>
                        {savings > 0 && (
                            <Text color={COLORS.textSecondary} fontSize={12} textDecorationLine="line-through">
                                ₹{Math.round(wasPrice).toLocaleString('en-IN')}
                            </Text>
                        )}
                    </XStack>

                    <XStack mt="$1" ai="center">
                        <YStack backgroundColor={COLORS.bgDeep} px="$2" py="$1" borderRadius={4} borderWidth={1} borderColor={COLORS.borderSubtle}>
                            <Text color={COLORS.textSecondary} fontSize={10} fontWeight="700" textTransform="capitalize">
                                Platform: {item.platform}
                            </Text>
                        </YStack>
                    </XStack>
                </YStack>

                {/* Actions */}
                <Button
                    size="$3"
                    width={40}
                    height={40}
                    backgroundColor={COLORS.bgCardHover}
                    borderWidth={1}
                    borderColor={COLORS.borderSubtle}
                    onPress={() => removeItem(item.cart_id)}
                    icon={<Text fontSize={16}>🗑️</Text>}
                />
            </XStack>
        </Animated.View>
    );
}

// ─── Main Cart Screen ──────────────────────────────────
export default function CartScreen() {
    const { items, getTotalPrice, getTotalSavings, clearCart } = useCartStore();

    const isEmpty = items.length === 0;

    // Group items by platform to show the "Unified" aspect
    const groupedItems = items.reduce((acc: any, item: any) => {
        const platform = item.platform || 'Other';
        if (!acc[platform]) acc[platform] = [];
        acc[platform].push(item);
        return acc;
    }, {});

    return (
        <View style={{ flex: 1, backgroundColor: COLORS.bgDeep }}>
            <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}>

                {/* Header */}
                <LinearGradient
                    colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.bgDeep]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.headerGradient}
                >
                    <Animated.View entering={FadeInUp.duration(600)}>
                        <Text color={COLORS.textPrimary} fontSize={32} fontWeight="900" ta="center">
                            Smart Cart
                        </Text>
                        <Text color={COLORS.textSecondary} fontSize={15} ta="center" mt="$1">
                            Your multi-vendor shopping basket.
                        </Text>
                    </Animated.View>
                </LinearGradient>

                <YStack px="$4" mt={-20} flex={1}>
                    {isEmpty ? (
                        <Animated.View entering={FadeInUp.delay(200).duration(500)}>
                            <YStack ai="center" jc="center" mt={60} gap="$4">
                                <Text fontSize={64}>🛒</Text>
                                <Text color={COLORS.textPrimary} fontSize={20} fontWeight="700">
                                    Your cart is empty
                                </Text>
                                <Text color={COLORS.textSecondary} fontSize={15} ta="center" px="$4">
                                    Search for deals across the web and add them here to calculate your total savings!
                                </Text>
                            </YStack>
                        </Animated.View>
                    ) : (
                        <YStack gap="$6">
                            {Object.keys(groupedItems).map((platform, sectionIndex) => (
                                <View key={platform}>
                                    <Text color={COLORS.textSecondary} fontSize={13} fontWeight="800" textTransform="uppercase" letterSpacing={1.5} mb="$3" ml="$1">
                                        {platform} Items ({groupedItems[platform].length})
                                    </Text>
                                    <YStack gap="$3">
                                        {groupedItems[platform].map((item: any, index: number) => (
                                            <CartItemRow key={item.cart_id} item={item} index={index} />
                                        ))}
                                    </YStack>
                                </View>
                            ))}

                            <Button
                                mt="$4"
                                size="$4"
                                backgroundColor="transparent"
                                borderWidth={1}
                                borderColor={COLORS.borderSubtle}
                                pressStyle={{ backgroundColor: COLORS.bgCardHover }}
                                onPress={() => clearCart()}
                            >
                                <Text color={COLORS.textSecondary} fontWeight="600">Clear Cart</Text>
                            </Button>
                        </YStack>
                    )}
                </YStack>
            </ScrollView>

            {/* Sticky Savings Calculator Footer */}
            {!isEmpty && (
                <Animated.View entering={FadeInUp.delay(300).duration(500)} style={styles.footerContainer}>
                    <View style={styles.footerInner}>
                        <YStack f={1} gap="$1">
                            <Text color={COLORS.textSecondary} fontSize={12} fontWeight="600">
                                Cart Total ({items.length} items)
                            </Text>
                            <Text color={COLORS.textPrimary} fontSize={24} fontWeight="900">
                                ₹{getTotalPrice().toLocaleString('en-IN')}
                            </Text>
                        </YStack>
                        <YStack f={1} ai="flex-end" gap="$1">
                            <Text color={COLORS.badgeText} fontSize={12} fontWeight="800">
                                TOTAL SAVINGS
                            </Text>
                            <YStack backgroundColor={COLORS.badgeBg} px="$3" py="$1" borderRadius={8}>
                                <Text color={COLORS.priceGreen} fontSize={18} fontWeight="900">
                                    ₹{getTotalSavings().toLocaleString('en-IN')}
                                </Text>
                            </YStack>
                        </YStack>
                    </View>

                    {/* Checkout Bot Placeholder */}
                    <Button
                        size="$5"
                        backgroundColor={COLORS.accentBlue}
                        mt="$3"
                        borderRadius={12}
                        pressStyle={{ opacity: 0.8 }}
                        icon={<Text fontSize={16}>🤖</Text>}
                    >
                        <Text color="white" fontWeight="800" fontSize={16}>
                            Auto-Checkout (Coming Soon)
                        </Text>
                    </Button>
                </Animated.View>
            )}
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────
const styles = StyleSheet.create({
    headerGradient: {
        paddingTop: 70,
        paddingBottom: 40,
        paddingHorizontal: 24,
    },
    card: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.borderSubtle,
        overflow: 'hidden',
    },
    footerContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: COLORS.bgCardHover,
        borderTopWidth: 1,
        borderTopColor: COLORS.borderSubtle,
        paddingTop: 16,
        paddingBottom: 32, // safe area spacing
        paddingHorizontal: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10,
    },
    footerInner: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    }
});
