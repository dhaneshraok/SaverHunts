import React, { useState, useEffect } from 'react';
import { StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { YStack, XStack, Text, Button } from 'tamagui';
import { LineChart } from 'react-native-chart-kit';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const COLORS = {
    bgCard: '#161B22',
    borderSubtle: '#30363D',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
    accentBlue: '#3B82F6',
    accentPurple: '#A855F7',
    priceGreen: '#3FB950',
};

const FASTAPI_URL = process.env.EXPO_PUBLIC_FASTAPI_URL || 'http://127.0.0.1:8000';
const screenWidth = Dimensions.get('window').width;

interface PriceStatsBannerProps {
    productTitle: string;
    currentPrice: number;
}

export function PriceStatsBanner({ productTitle, currentPrice }: PriceStatsBannerProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [chartData, setChartData] = useState<any>(null);
    const [reasoning, setReasoning] = useState<string>('');
    const [showForecast, setShowForecast] = useState(false);

    useEffect(() => {
        fetchForecast();
    }, [productTitle]);

    const fetchForecast = async () => {
        setLoading(true);
        setError(null);
        try {
            // In production, uri encode query.
            const query = encodeURIComponent(productTitle.substring(0, 30));
            const res = await fetch(`${FASTAPI_URL}/api/v1/price-history/forecast?query=${query}&current_price=${currentPrice}`);
            const data = await res.json();

            if (data.status === 'success') {
                // Format for react-native-chart-kit
                const historyDates = data.history.map((h: any) => h.date);
                const historyPrices = data.history.map((h: any) => h.price);

                const forecastDates = data.forecast.map((f: any) => f.date);
                const forecastPrices = data.forecast.map((f: any) => f.price);

                setChartData({
                    history: { labels: historyDates, data: historyPrices },
                    forecast: { labels: forecastDates, data: forecastPrices }
                });
                setReasoning(data.reasoning);
            } else {
                setError('Could not load price trends.');
            }
        } catch (e) {
            setError('Network error loading trends.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <YStack backgroundColor={COLORS.bgCard} p="$4" borderRadius={16} borderColor={COLORS.borderSubtle} borderWidth={1} mt="$4" ai="center" jc="center" height={250}>
                <ActivityIndicator color={COLORS.accentPurple} />
                <Text color={COLORS.textSecondary} mt="$2" fontSize={12}>Analyzing price trends with AI...</Text>
            </YStack>
        );
    }

    if (error || !chartData) {
        return null; // Fail gracefully
    }

    // Build the dataset for the chart depending on state
    const labels = showForecast
        ? [...chartData.history.labels, ...chartData.forecast.labels]
        : chartData.history.labels;

    // We need to pad the arrays to align them on the same X-axis if we want distinct lines, 
    // or just use one dataset that changes color. 
    // For simplicity with chart-kit, sticking them in one array is easiest.
    // The 'forecast' line should technically be dashed, but chart-kit has limited dashed line support.
    // We will pass the full array and just use the UI button to toggle the extra data points.
    const dataPoints = showForecast
        ? [...chartData.history.data, ...chartData.forecast.data]
        : chartData.history.data;

    // Calculate if the forecast predicts a drop
    const lastHistoryPrice = chartData.history.data[chartData.history.data.length - 1];
    const lastForecastPrice = chartData.forecast.data[chartData.forecast.data.length - 1];
    const isDropping = lastForecastPrice < lastHistoryPrice;

    return (
        <YStack backgroundColor={COLORS.bgCard} p="$4" borderRadius={16} borderColor={COLORS.borderSubtle} borderWidth={1} mt="$4">
            <XStack jc="space-between" ai="center" mb="$4">
                <YStack>
                    <Text color={COLORS.textPrimary} fontSize={18} fontWeight="800">
                        Price Trends <MaterialCommunityIcons name="chart-line-variant" size={18} color={COLORS.accentBlue} />
                    </Text>
                    <Text color={COLORS.textSecondary} fontSize={12} mt="$1">Historical & Predicted</Text>
                </YStack>

                <Button
                    size="$3"
                    backgroundColor={showForecast ? COLORS.accentPurple : 'transparent'}
                    borderWidth={1}
                    borderColor={COLORS.accentPurple}
                    borderRadius={8}
                    onPress={() => setShowForecast(!showForecast)}
                >
                    <Text color={showForecast ? '#000' : COLORS.accentPurple} fontWeight="700" fontSize={12}>
                        {showForecast ? 'Hide AI Forecast' : '✨ AI Forecast'}
                    </Text>
                </Button>
            </XStack>

            <LineChart
                data={{
                    labels: labels,
                    datasets: [
                        {
                            data: dataPoints,
                            color: (opacity = 1) => showForecast ? `rgba(168, 85, 247, ${opacity})` : `rgba(59, 130, 246, ${opacity})`, // Purple if forecast, Blue if just history
                            strokeWidth: 3
                        }
                    ],
                }}
                width={screenWidth - 64} // padding adjustment
                height={180}
                yAxisLabel="₹"
                yAxisSuffix=""
                chartConfig={{
                    backgroundColor: COLORS.bgCard,
                    backgroundGradientFrom: COLORS.bgCard,
                    backgroundGradientTo: COLORS.bgCard,
                    decimalPlaces: 0,
                    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.5})`,
                    labelColor: (opacity = 1) => `rgba(139, 148, 158, ${opacity})`,
                    style: {
                        borderRadius: 16,
                    },
                    propsForDots: {
                        r: "4",
                        strokeWidth: "2",
                        stroke: COLORS.bgCard
                    }
                }}
                bezier
                style={{
                    marginVertical: 8,
                    borderRadius: 16,
                    marginLeft: -10 // shift left slightly to fix chart-kit default padding
                }}
            />

            {showForecast && (
                <YStack mt="$3" p="$3" backgroundColor="rgba(168, 85, 247, 0.1)" borderRadius={12} borderWidth={1} borderColor="rgba(168, 85, 247, 0.3)">
                    <XStack ai="center" mb="$1" gap="$2">
                        <MaterialCommunityIcons
                            name={isDropping ? "trending-down" : "trending-neutral"}
                            size={20}
                            color={isDropping ? COLORS.priceGreen : COLORS.textPrimary}
                        />
                        <Text color={COLORS.textPrimary} fontWeight="800" fontSize={14}>
                            Gemini Prediction: {isDropping ? "Wait to Buy" : "Buy Now"}
                        </Text>
                    </XStack>
                    <Text color={COLORS.textSecondary} fontSize={13} lh={18}>
                        {reasoning}
                    </Text>
                </YStack>
            )}
        </YStack>
    );
}
