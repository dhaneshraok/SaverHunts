import React, { useState, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import { YStack, XStack, Button, Text, Spinner } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';

const COLORS = {
    bgDeep: '#0F1117',
    badgeRed: '#DC2626',
    priceGreen: '#3FB950',
    textPrimary: '#F0F6FC',
    textSecondary: '#8B949E',
};

interface ScannerModalProps {
    onScan: (barcodeData: string) => void;
    onClose: () => void;
}

export default function ScannerModal({ onScan, onClose }: ScannerModalProps) {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);

    if (!permission) {
        // Camera permissions are still loading.
        return (
            <YStack f={1} backgroundColor={COLORS.bgDeep} jc="center" ai="center">
                <Spinner size="large" color={COLORS.priceGreen} />
            </YStack>
        );
    }

    if (!permission.granted) {
        // Camera permissions are not granted yet.
        return (
            <YStack f={1} backgroundColor={COLORS.bgDeep} jc="center" ai="center" px="$6" gap="$4">
                <Text fontSize={64}>📸</Text>
                <Text color={COLORS.textPrimary} fontSize={24} fontWeight="800" ta="center">
                    We need your permission
                </Text>
                <Text color={COLORS.textSecondary} fontSize={16} ta="center" mb="$4">
                    Enable camera access to scan physical barcodes in store and find instant deals.
                </Text>
                <Button size="$5" backgroundColor={COLORS.priceGreen} onPress={requestPermission} borderRadius={12}>
                    <Text color="white" fontWeight="800" fontSize={16}>Grant Permission</Text>
                </Button>
                <Button size="$4" backgroundColor="transparent" onPress={onClose} mt="$2">
                    <Text color={COLORS.textSecondary} fontWeight="600">Cancel</Text>
                </Button>
            </YStack>
        );
    }

    const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
        if (scanned) return;
        setScanned(true);
        console.log(`Bar code with type ${type} and data ${data} has been scanned!`);
        onScan(data);
    };

    return (
        <View style={styles.container}>
            <CameraView
                style={styles.camera}
                facing="back"
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                barcodeScannerSettings={{
                    barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code39", "code128"],
                }}
            >
                <View style={styles.overlay}>
                    {/* Top safe area for close button */}
                    <XStack w="100%" pt={60} px="$4" jc="flex-end">
                        <Button size="$4" circular backgroundColor="rgba(0,0,0,0.5)" onPress={onClose}>
                            <Text fontSize={18} color="white">✕</Text>
                        </Button>
                    </XStack>

                    {/* Scanning Reticle */}
                    <YStack f={1} jc="center" ai="center">
                        <View style={styles.reticle}>
                            <View style={[styles.corner, styles.topLeft]} />
                            <View style={[styles.corner, styles.topRight]} />
                            <View style={[styles.corner, styles.bottomLeft]} />
                            <View style={[styles.corner, styles.bottomRight]} />
                            <AnimatedScanLine />
                        </View>
                        <YStack mt="$6" backgroundColor="rgba(0,0,0,0.6)" px="$4" py="$2" borderRadius={20}>
                            <Text color={COLORS.textPrimary} fontWeight="600">Scan Product Barcode</Text>
                        </YStack>
                    </YStack>
                </View>
            </CameraView>
        </View>
    );
}

// Simple CSS animation for the red laser line
function AnimatedScanLine() {
    const [position, setPosition] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setPosition(p => (p > 240 ? 0 : p + 5));
        }, 30);
        return () => clearInterval(interval);
    }, []);

    return (
        <View style={[styles.scanLine, { top: position }]} />
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    camera: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    reticle: {
        width: 250,
        height: 250,
        position: 'relative',
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    scanLine: {
        position: 'absolute',
        width: '100%',
        height: 2,
        backgroundColor: '#DC2626',
        shadowColor: '#DC2626',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 10,
        elevation: 5,
    },
    corner: {
        position: 'absolute',
        width: 40,
        height: 40,
        borderColor: '#3FB950',
        borderWidth: 4,
    },
    topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
    topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
    bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
    bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
});
