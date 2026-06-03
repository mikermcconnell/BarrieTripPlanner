import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONT_WEIGHTS, SHADOWS } from '../config/theme';

const ControlButton = ({ label, accessibilityLabel, onPress, disabled = false, wide = false }) => (
  <TouchableOpacity
    style={[
      styles.button,
      wide ? styles.wideButton : null,
      disabled ? styles.buttonDisabled : null,
    ]}
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
  >
    <Text style={[styles.buttonText, disabled ? styles.buttonTextDisabled : null]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const DevMapControlPad = ({
  onPan,
  onZoom,
  onFocusActiveDetours,
  hasActiveDetours = false,
}) => (
  <View
    testID="dev-map-control-pad"
    pointerEvents="box-none"
    style={styles.container}
  >
    <View pointerEvents="auto" style={styles.card}>
      <Text style={styles.title}>Map QA</Text>
      <View style={styles.row}>
        <View style={styles.spacer} />
        <ControlButton label="↑" accessibilityLabel="Pan map north" onPress={() => onPan?.('north')} />
        <View style={styles.spacer} />
      </View>
      <View style={styles.row}>
        <ControlButton label="←" accessibilityLabel="Pan map west" onPress={() => onPan?.('west')} />
        <ControlButton label="•" accessibilityLabel="Focus active detours" onPress={onFocusActiveDetours} disabled={!hasActiveDetours} />
        <ControlButton label="→" accessibilityLabel="Pan map east" onPress={() => onPan?.('east')} />
      </View>
      <View style={styles.row}>
        <View style={styles.spacer} />
        <ControlButton label="↓" accessibilityLabel="Pan map south" onPress={() => onPan?.('south')} />
        <View style={styles.spacer} />
      </View>
      <View style={styles.row}>
        <ControlButton label="−" accessibilityLabel="Zoom map out" onPress={() => onZoom?.(-1)} />
        <ControlButton label="+" accessibilityLabel="Zoom map in" onPress={() => onZoom?.(1)} />
      </View>
      <ControlButton
        label="Detours"
        accessibilityLabel="Focus all active detours"
        onPress={onFocusActiveDetours}
        disabled={!hasActiveDetours}
        wide
      />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 12,
    top: 190,
    zIndex: 1200,
    elevation: 1200,
  },
  card: {
    padding: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
    gap: 5,
    ...SHADOWS.medium,
  },
  title: {
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  spacer: {
    width: 34,
    height: 34,
  },
  button: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  wideButton: {
    width: 112,
  },
  buttonDisabled: {
    backgroundColor: 'rgba(148, 163, 184, 0.45)',
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: FONT_WEIGHTS.extrabold,
  },
  buttonTextDisabled: {
    color: 'rgba(255,255,255,0.68)',
  },
});

export default memo(DevMapControlPad);
