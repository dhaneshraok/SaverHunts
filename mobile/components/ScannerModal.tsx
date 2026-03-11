import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Modal, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { YStack, XStack, Text, Spinner } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing, FadeIn,
} from 'react-native-reanimated';

interface ScannerModalProps {
    visible: boolean;
    onClose: () => void;
    onBarcodeScanned: (barcodeData: string) => void;
}

function AnimatedScanLine() {
    const translateY = useSharedValue(0);
    useEffect(() => {
        translateY.value = withRepeat(
            withSequence(
                withTiming(220, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.ease) })
            ), -1, false
        );
    }, []);
    const style = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
    return (
        <Animated.View style={[styles.scanLine, style]}>
            <LinearGradient colors={['transparent', 'rgba(139,92,246,0.8)', 'transparent']} style={{ width: '100%', height: 2 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
            <View style={styles.scanLineGlow} />
        </Animated.View>
    );
}

export default function ScannerModal({ visible, onClose, onBarcodeScanned }: ScannerModalProps) {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const insets = useSafeAreaInsets();

    // Reset scanned state when modal opens
    useEffect(() => {
        if (visible) setScanned(false);
    }, [visible]);

    const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
        if (scanned) return;
        setScanned(true);
        onBarcodeScanned(data);
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
            <View style={styles.container}>
                {!permission || !permission.granted ? (
                    // Permission screen
                    <View style={styles.permissionScreen}>
                        <LinearGradient colors={['#0F0A1E', '#070A0F']} style={StyleSheet.absoluteFill} />

                        <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { top: insets.top + 10 }]}>
                            <MaterialCommunityIcons name="close" size={22} color="rgba(255,255,255,0.7)" />
                        </TouchableOpacity>

                        <YStack ai="center" px="$6" gap="$4">
                            <View style={styles.permIcon}>
                                <LinearGradient colors={['rgba(139,92,246,0.2)', 'rgba(59,130,246,0.1)']} style={StyleSheet.absoluteFill} />
                                <MaterialCommunityIcons name="camera" size={40} color="#A78BFA" />
                            </View>
                            <Text color="#F0F6FC" fontSize={24} fontWeight="900" ta="center" letterSpacing={-0.5}>
                                Camera Access
                            </Text>
                            <Text color="rgba(255,255,255,0.4)" fontSize={15} ta="center" lineHeight={22}>
                                Scan barcodes in-store to instantly{'\n'}compare prices across platforms
                            </Text>
                            <TouchableOpacity onPress={requestPermission} style={styles.grantBtn} activeOpacity={0.85}>
                                <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={StyleSheet.absoluteFill} />
                                <Text color="#FFF" fontWeight="800" fontSize={16}>Enable Camera</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={onClose}>
                                <Text color="rgba(255,255,255,0.35)" fontWeight="600" fontSize={14}>Not now</Text>
                            </TouchableOpacity>
                        </YStack>
                    </View>
                ) : (
                    // Camera view
                    <CameraView
                        style={styles.camera}
                        facing="back"
                        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                        barcodeScannerSettings={{
                            barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code39", "code128"],
                        }}
                    >
                        {/* Dark overlay with transparent center cutout */}
                        <View style={styles.overlay}>
                            {/* Top bar */}
                            <View style={[styles.overlaySection, { paddingTop: insets.top + 10 }]}>
                                <XStack w="100%" px="$5" jc="space-between" ai="center">
                                    <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
                                        <MaterialCommunityIcons name="arrow-left" size={22} color="#FFF" />
                                    </TouchableOpacity>
                                    <Animated.View entering={FadeIn.delay(300)}>
                                        <XStack ai="center" gap="$2">
                                            <View style={styles.livePulse} />
                                            <Text color="#FFF" fontSize={14} fontWeight="700">Scanning</Text>
                                        </XStack>
                                    </Animated.View>
                                    <TouchableOpacity style={styles.headerBtn}>
                                        <MaterialCommunityIcons name="flashlight" size={20} color="#FFF" />
                                    </TouchableOpacity>
                                </XStack>
                            </View>

                            {/* Center with reticle */}
                            <View style={styles.centerRow}>
                                <View style={styles.overlayFill} />
                                <View style={styles.reticleWrap}>
                                    {/* Corner accents */}
                                    <View style={[styles.corner, styles.tl]} />
                                    <View style={[styles.corner, styles.tr]} />
                                    <View style={[styles.corner, styles.bl]} />
                                    <View style={[styles.corner, styles.br]} />
                                    <AnimatedScanLine />
                                </View>
                                <View style={styles.overlayFill} />
                            </View>

                            {/* Bottom */}
                            <View style={[styles.overlaySection, styles.bottomSection]}>
                                <Animated.View entering={FadeIn.delay(500)} style={styles.hintCard}>
                                    <LinearGradient colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']} style={StyleSheet.absoluteFill} />
                                    <MaterialCommunityIcons name="barcode-scan" size={20} color="#A78BFA" />
                                    <YStack ml="$3" f={1}>
                                        <Text color="#FFF" fontSize={14} fontWeight="700">Point at any barcode</Text>
                                        <Text color="rgba(255,255,255,0.5)" fontSize={12}>We'll find the best price instantly</Text>
                                    </YStack>
                                </Animated.View>

                                <TouchableOpacity onPress={onClose} style={styles.cancelBtn} activeOpacity={0.8}>
                                    <Text color="rgba(255,255,255,0.6)" fontSize={15} fontWeight="700">Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </CameraView>
                )}
            </View>
        </Modal>
    );
}

const RETICLE_SIZE = 260;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    camera: { flex: 1 },
    permissionScreen: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    closeBtn: {
        position: 'absolute', right: 20, width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center',
    },
    permIcon: {
        width: 80, height: 80, borderRadius: 24, justifyContent: 'center', alignItems: 'center',
        overflow: 'hidden', marginBottom: 8,
    },
    grantBtn: {
        width: '100%', height: 54, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
        overflow: 'hidden', marginTop: 8,
    },
    overlay: { flex: 1 },
    overlaySection: { backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', paddingBottom: 20 },
    bottomSection: { flex: 1, paddingTop: 30, paddingHorizontal: 24, gap: 20 },
    centerRow: { flexDirection: 'row', height: RETICLE_SIZE },
    overlayFill: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
    reticleWrap: { width: RETICLE_SIZE, height: RETICLE_SIZE, position: 'relative' },
    headerBtn: {
        width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)',
        justifyContent: 'center', alignItems: 'center',
    },
    livePulse: {
        width: 8, height: 8, borderRadius: 4, backgroundColor: '#3FB950',
        shadowColor: '#3FB950', shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
    },
    corner: {
        position: 'absolute', width: 30, height: 30,
        borderColor: '#A78BFA', borderWidth: 3,
    },
    tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
    tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
    bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
    br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },
    scanLine: { position: 'absolute', width: '100%', alignItems: 'center' },
    scanLineGlow: {
        width: '60%', height: 20, marginTop: -10,
        backgroundColor: 'rgba(139,92,246,0.15)', borderRadius: 10,
    },
    hintCard: {
        flexDirection: 'row', alignItems: 'center', width: '100%',
        padding: 16, borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    cancelBtn: {
        height: 50, justifyContent: 'center', alignItems: 'center',
        borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
});
