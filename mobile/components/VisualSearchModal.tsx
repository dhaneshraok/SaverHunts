import React, { useState } from 'react';
import {
  StyleSheet, TouchableOpacity, Modal, Alert, ActivityIndicator,
} from 'react-native';
import { YStack, XStack, Text, View, Spinner } from 'tamagui';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';

import { api } from '../lib/api';
import { COLORS } from '../constants/Theme';

interface VisualSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onResult: (query: string, data: any) => void;
}

export default function VisualSearchModal({ visible, onClose, onResult }: VisualSearchModalProps) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);

  const reset = () => {
    setImageUri(null);
    setIsAnalyzing(false);
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pickImage = async (useCamera: boolean) => {
    const permMethod = useCamera
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;
    const { status } = await permMethod();
    if (status !== 'granted') {
      Alert.alert('Permission needed', `Please allow ${useCamera ? 'camera' : 'gallery'} access.`);
      return;
    }

    const launchMethod = useCamera
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    const pickerResult = await launchMethod({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (pickerResult.canceled || !pickerResult.assets?.[0]) return;

    const asset = pickerResult.assets[0];
    setImageUri(asset.uri);
    setResult(null);

    if (asset.base64) {
      analyzeImage(asset.base64);
    }
  };

  const analyzeImage = async (base64: string) => {
    setIsAnalyzing(true);
    try {
      const res = await api.visualSearch(base64);
      if (res.status === 'success' && res.data) {
        setResult(res.data);
      } else {
        Alert.alert('Could not identify', res.error || 'Try a clearer image.');
      }
    } catch {
      Alert.alert('Error', 'Visual search failed. Try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSearchProduct = () => {
    if (result?.search_query) {
      onResult(result.search_query, result);
      handleClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={st.overlay}>
        <Animated.View entering={FadeInUp.duration(400)} style={st.sheet}>
          <LinearGradient colors={['#0F1629', '#0A0F1A']} style={StyleSheet.absoluteFill} />

          {/* Header */}
          <XStack ai="center" jc="space-between" px={20} pt={16} pb={12}>
            <XStack ai="center" gap={10}>
              <View style={st.headerIcon}>
                <LinearGradient colors={['rgba(139,92,246,0.2)', 'rgba(59,130,246,0.1)']} style={StyleSheet.absoluteFill} />
                <MaterialCommunityIcons name="camera-iris" size={18} color={COLORS.brandPurpleLight} />
              </View>
              <YStack>
                <Text color={COLORS.textPrimary} fontSize={18} fontWeight="900">Visual Search</Text>
                <Text color={COLORS.textTertiary} fontSize={11}>Snap a photo to find the product</Text>
              </YStack>
            </XStack>
            <TouchableOpacity onPress={handleClose} style={st.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </XStack>

          {/* Content */}
          <YStack px={20} f={1}>
            {!imageUri ? (
              /* Pick source */
              <YStack ai="center" jc="center" f={1} gap={20}>
                <View style={st.cameraPlaceholder}>
                  <MaterialCommunityIcons name="image-search-outline" size={48} color="rgba(139,92,246,0.3)" />
                </View>
                <Text color={COLORS.textSecondary} fontSize={14} ta="center">
                  Take a photo or pick from gallery
                </Text>
                <XStack gap={14}>
                  <TouchableOpacity onPress={() => pickImage(true)} style={st.sourceBtn} activeOpacity={0.8}>
                    <LinearGradient colors={[COLORS.brandPurple, COLORS.brandPurpleDark]} style={StyleSheet.absoluteFill} />
                    <MaterialCommunityIcons name="camera" size={22} color="#FFF" />
                    <Text color="#FFF" fontSize={14} fontWeight="800" mt={6}>Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => pickImage(false)} style={st.sourceBtn} activeOpacity={0.8}>
                    <LinearGradient colors={[COLORS.brandBlue, COLORS.brandBlueDark]} style={StyleSheet.absoluteFill} />
                    <MaterialCommunityIcons name="image-multiple" size={22} color="#FFF" />
                    <Text color="#FFF" fontSize={14} fontWeight="800" mt={6}>Gallery</Text>
                  </TouchableOpacity>
                </XStack>
              </YStack>
            ) : (
              /* Analysis view */
              <YStack f={1} gap={16} mt={8}>
                {/* Image preview */}
                <View style={st.imagePreview}>
                  <ExpoImage source={{ uri: imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  {isAnalyzing && (
                    <View style={st.analyzingOverlay}>
                      <Spinner size="large" color={COLORS.brandPurpleLight} />
                      <Text color="#FFF" fontSize={13} fontWeight="700" mt={10}>Identifying product...</Text>
                    </View>
                  )}
                  <TouchableOpacity onPress={reset} style={st.retakeBtn} activeOpacity={0.8}>
                    <MaterialCommunityIcons name="camera-retake" size={16} color="#FFF" />
                  </TouchableOpacity>
                </View>

                {/* Result */}
                {result && (
                  <Animated.View entering={FadeIn.duration(400)}>
                    <View style={st.resultCard}>
                      <LinearGradient colors={['rgba(139,92,246,0.08)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
                      <XStack ai="center" gap={8} mb={10}>
                        <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.accentGreen} />
                        <Text color={COLORS.accentGreen} fontSize={12} fontWeight="800">
                          {result.confidence >= 80 ? 'HIGH' : result.confidence >= 50 ? 'MEDIUM' : 'LOW'} CONFIDENCE
                        </Text>
                        <Text color={COLORS.textTertiary} fontSize={11}>{result.confidence}%</Text>
                      </XStack>

                      <Text color={COLORS.textPrimary} fontSize={16} fontWeight="900" numberOfLines={2}>
                        {result.product_name}
                      </Text>

                      {result.description && (
                        <Text color={COLORS.textSecondary} fontSize={12} mt={4} numberOfLines={2}>
                          {result.description}
                        </Text>
                      )}

                      <XStack ai="center" gap={12} mt={10}>
                        {result.brand && (
                          <View style={st.infoPill}>
                            <Text color={COLORS.brandPurpleLight} fontSize={11} fontWeight="700">{result.brand}</Text>
                          </View>
                        )}
                        <View style={st.infoPill}>
                          <Text color={COLORS.brandPurpleLight} fontSize={11} fontWeight="700">{result.category}</Text>
                        </View>
                        {result.price_range_min && result.price_range_max && (
                          <Text color={COLORS.textTertiary} fontSize={11}>
                            ~₹{result.price_range_min.toLocaleString('en-IN')} – ₹{result.price_range_max.toLocaleString('en-IN')}
                          </Text>
                        )}
                      </XStack>

                      <TouchableOpacity onPress={handleSearchProduct} style={st.searchProductBtn} activeOpacity={0.8}>
                        <LinearGradient colors={[COLORS.brandPurple, COLORS.brandPurpleDark]} style={StyleSheet.absoluteFill} />
                        <MaterialCommunityIcons name="magnify" size={18} color="#FFF" />
                        <Text color="#FFF" fontSize={14} fontWeight="900" ml={8}>Search &amp; Compare Prices</Text>
                      </TouchableOpacity>
                    </View>
                  </Animated.View>
                )}
              </YStack>
            )}
          </YStack>
        </Animated.View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '85%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  headerIcon: {
    width: 38, height: 38, borderRadius: 12, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
  },
  cameraPlaceholder: {
    width: 120, height: 120, borderRadius: 30,
    backgroundColor: 'rgba(139,92,246,0.06)',
    borderWidth: 2, borderColor: 'rgba(139,92,246,0.15)',
    borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center',
  },
  sourceBtn: {
    width: 120, height: 100, borderRadius: 18, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
  },
  imagePreview: {
    height: 250, borderRadius: 20, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  retakeBtn: {
    position: 'absolute', top: 12, right: 12,
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  resultCard: {
    borderRadius: 18, padding: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.1)',
  },
  infoPill: {
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  searchProductBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 48, borderRadius: 14, overflow: 'hidden', marginTop: 16,
  },
});
