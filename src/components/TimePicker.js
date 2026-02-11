import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';

const TimePicker = ({ value, onChange, mode = 'depart' }) => {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedMode, setSelectedMode] = useState(mode); // 'depart' or 'arrive'

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const quickOptions = [
    { label: 'Now', getValue: () => new Date() },
    { label: '+15 min', getValue: () => new Date(Date.now() + 15 * 60 * 1000) },
    { label: '+30 min', getValue: () => new Date(Date.now() + 30 * 60 * 1000) },
    { label: '+1 hour', getValue: () => new Date(Date.now() + 60 * 60 * 1000) },
  ];

  const handleQuickSelect = (option) => {
    onChange(option.getValue(), selectedMode);
    setShowPicker(false);
  };

  const handleModeChange = (newMode) => {
    setSelectedMode(newMode);
    onChange(value, newMode);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.button} onPress={() => setShowPicker(true)}>
        <View style={styles.modeIndicator}>
          <Text style={styles.modeText}>{selectedMode === 'depart' ? 'Depart' : 'Arrive'}</Text>
        </View>
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime(value)}</Text>
          <Text style={styles.dateText}>{formatDate(value)}</Text>
        </View>
        <Text style={styles.chevron}>▼</Text>
      </TouchableOpacity>

      <Modal visible={showPicker} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPicker(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Time</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Text style={styles.closeButton}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Depart/Arrive Toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeButton, selectedMode === 'depart' && styles.modeButtonActive]}
                onPress={() => handleModeChange('depart')}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    selectedMode === 'depart' && styles.modeButtonTextActive,
                  ]}
                >
                  Depart at
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeButton, selectedMode === 'arrive' && styles.modeButtonActive]}
                onPress={() => handleModeChange('arrive')}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    selectedMode === 'arrive' && styles.modeButtonTextActive,
                  ]}
                >
                  Arrive by
                </Text>
              </TouchableOpacity>
            </View>

            {/* Quick Options */}
            <View style={styles.quickOptions}>
              {quickOptions.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.quickOption}
                  onPress={() => handleQuickSelect(option)}
                >
                  <Text style={styles.quickOptionText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Current Selection */}
            <View style={styles.currentSelection}>
              <Text style={styles.currentLabel}>Selected:</Text>
              <Text style={styles.currentValue}>
                {formatTime(value)} - {formatDate(value)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.sm,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modeIndicator: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    marginRight: SPACING.sm,
  },
  modeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  timeContainer: {
    flex: 1,
  },
  timeText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  dateText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  chevron: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  closeButton: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: '600',
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.md,
    padding: 4,
    marginBottom: SPACING.md,
  },
  modeButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
  },
  modeButtonActive: {
    backgroundColor: COLORS.surface,
    ...SHADOWS.small,
  },
  modeButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  modeButtonTextActive: {
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  quickOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  quickOption: {
    backgroundColor: COLORS.grey100,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  quickOptionText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  currentSelection: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  currentLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  currentValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
});

export default TimePicker;
