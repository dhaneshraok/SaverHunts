import React from 'react';
import { StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { COLORS } from '../constants/Theme';

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  color: string;
  onPress: () => void;
}

interface QuickActionsMenuProps {
  visible: boolean;
  onClose: () => void;
  productTitle: string;
  actions: QuickAction[];
}

export default function QuickActionsMenu({ visible, onClose, productTitle, actions }: QuickActionsMenuProps) {
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={st.backdrop} activeOpacity={1} onPress={onClose}>
        <Animated.View entering={FadeIn.duration(200)} style={StyleSheet.absoluteFill} />
      </TouchableOpacity>

      <Animated.View entering={SlideInDown.springify().damping(18)} style={st.sheet}>
        <LinearGradient colors={['#141929', '#0D1117']} style={StyleSheet.absoluteFill} />

        {/* Handle bar */}
        <View style={st.handle} />

        {/* Product title */}
        <YStack px={20} pt={4} pb={14}>
          <Text color={COLORS.textTertiary} fontSize={10} fontWeight="700" textTransform="uppercase" letterSpacing={0.5}>
            Quick Actions
          </Text>
          <Text color={COLORS.textPrimary} fontSize={15} fontWeight="800" numberOfLines={1} mt={4}>
            {productTitle}
          </Text>
        </YStack>

        {/* Action grid */}
        <XStack flexWrap="wrap" px={16} gap={10} pb={30}>
          {actions.map((action) => (
            <TouchableOpacity
              key={action.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                action.onPress();
                onClose();
              }}
              activeOpacity={0.7}
              style={st.actionItem}
            >
              <View style={[st.actionIcon, { backgroundColor: action.color + '15' }]}>
                <MaterialCommunityIcons name={action.icon as any} size={22} color={action.color} />
              </View>
              <Text color={COLORS.textSecondary} fontSize={11} fontWeight="700" mt={8} ta="center" numberOfLines={1}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </XStack>

        {/* Cancel */}
        <TouchableOpacity onPress={onClose} style={st.cancelBtn} activeOpacity={0.7}>
          <Text color={COLORS.textTertiary} fontSize={14} fontWeight="700">Cancel</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingBottom: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'center', marginTop: 10, marginBottom: 12,
  },
  actionItem: {
    width: '22%',
    alignItems: 'center',
    paddingVertical: 12,
  },
  actionIcon: {
    width: 52, height: 52, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  cancelBtn: {
    alignItems: 'center', paddingVertical: 14,
    marginHorizontal: 20, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
});
