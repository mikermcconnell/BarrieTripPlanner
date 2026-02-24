import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS, TOUCH_TARGET } from '../config/theme';

const MODES = [
  { key: 'now', label: 'Leave Now' },
  { key: 'depart', label: 'Depart At' },
  { key: 'arrive', label: 'Arrive By' },
];

const QUICK_OFFSETS = [
  { label: '+15m', minutes: 15 },
  { label: '+30m', minutes: 30 },
  { label: '+1h', minutes: 60 },
];

const formatTime = (date) => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const isToday = (date) => date.toDateString() === new Date().toDateString();

const isTomorrow = (date) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return date.toDateString() === tomorrow.toDateString();
};

const dayLabel = (date) => {
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

const TimePicker = ({ value, onChange, mode = 'now' }) => {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customHour, setCustomHour] = useState(value.getHours());
  const [customMinute, setCustomMinute] = useState(value.getMinutes());

  const handleModeChange = (newMode) => {
    if (newMode === 'now') {
      onChange(new Date(), 'now');
    } else {
      onChange(value, newMode);
    }
  };

  const handleQuickSelect = (minutes) => {
    const newTime = new Date(Date.now() + minutes * 60 * 1000);
    onChange(newTime, mode);
  };

  const handleDayToggle = (day) => {
    const newDate = new Date(value);
    const today = new Date();
    if (day === 'today') {
      newDate.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
    } else {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      newDate.setFullYear(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    }
    onChange(newDate, mode);
  };

  const openCustomPicker = () => {
    setCustomHour(value.getHours());
    setCustomMinute(value.getMinutes());
    setShowCustomPicker(true);
  };

  const handleCustomDone = () => {
    const newDate = new Date(value);
    newDate.setHours(customHour, customMinute, 0, 0);
    onChange(newDate, mode);
    setShowCustomPicker(false);
  };

  const adjustHour = (delta) => {
    setCustomHour((prev) => (prev + delta + 24) % 24);
  };

  const adjustMinute = (delta) => {
    // Step by 5 minutes; carry overflow into the hour
    const next = customMinute + delta * 5;
    if (next >= 60) {
      setCustomMinute(next % 60);
      setCustomHour((prev) => (prev + 1) % 24);
    } else if (next < 0) {
      setCustomMinute(next + 60);
      setCustomHour((prev) => (prev - 1 + 24) % 24);
    } else {
      setCustomMinute(next);
    }
  };

  const formatHour12 = (h) => String(h % 12 || 12);
  const formatMinute = (m) => String(m).padStart(2, '0');
  const getAmPm = (h) => (h < 12 ? 'AM' : 'PM');
  const toggleAmPm = () => setCustomHour((prev) => (prev + 12) % 24);

  const showTimeOptions = mode === 'depart' || mode === 'arrive';
  const selectedDay = isToday(value) ? 'today' : isTomorrow(value) ? 'tomorrow' : null;

  return (
    <View style={styles.container}>
      {/* Three-segment control */}
      <View style={styles.segmentedControl}>
        {MODES.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.segment, mode === key && styles.segmentActive]}
            onPress={() => handleModeChange(key)}
          >
            <Text style={[styles.segmentText, mode === key && styles.segmentTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Expandable time options for Depart At / Arrive By */}
      {showTimeOptions && (
        <View style={styles.timeOptions}>
          {/* Quick offset chips (depart only) + Custom */}
          <View style={styles.chipRow}>
            {mode === 'depart' && QUICK_OFFSETS.map(({ label, minutes }) => (
              <TouchableOpacity
                key={label}
                style={styles.chip}
                onPress={() => handleQuickSelect(minutes)}
              >
                <Text style={styles.chipText}>{label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.chipCustom} onPress={openCustomPicker}>
              <Text style={styles.chipCustomText}>Set time...</Text>
            </TouchableOpacity>
          </View>

          {/* Today / Tomorrow toggle */}
          <View style={styles.dayToggle}>
            <TouchableOpacity
              style={[styles.dayButton, selectedDay === 'today' && styles.dayButtonActive]}
              onPress={() => handleDayToggle('today')}
            >
              <Text style={[styles.dayButtonText, selectedDay === 'today' && styles.dayButtonTextActive]}>
                Today
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dayButton, selectedDay === 'tomorrow' && styles.dayButtonActive]}
              onPress={() => handleDayToggle('tomorrow')}
            >
              <Text style={[styles.dayButtonText, selectedDay === 'tomorrow' && styles.dayButtonTextActive]}>
                Tomorrow
              </Text>
            </TouchableOpacity>
          </View>

          {/* Selected time summary */}
          <Text style={styles.timeSummary}>
            {mode === 'depart' ? 'Departing' : 'Arriving'} at{' '}
            {formatTime(value)}, {dayLabel(value)}
          </Text>
        </View>
      )}

      {/* Custom time picker modal */}
      <Modal visible={showCustomPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCustomPicker(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Set Time</Text>

            <View style={styles.timeWheel}>
              {/* Hour column */}
              <View style={styles.wheelColumn}>
                <TouchableOpacity style={styles.wheelArrow} onPress={() => adjustHour(1)}>
                  <Text style={styles.wheelArrowText}>&#x25B2;</Text>
                </TouchableOpacity>
                <Text style={styles.wheelValue}>{formatHour12(customHour)}</Text>
                <TouchableOpacity style={styles.wheelArrow} onPress={() => adjustHour(-1)}>
                  <Text style={styles.wheelArrowText}>&#x25BC;</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.wheelColon}>:</Text>

              {/* Minute column */}
              <View style={styles.wheelColumn}>
                <TouchableOpacity style={styles.wheelArrow} onPress={() => adjustMinute(1)}>
                  <Text style={styles.wheelArrowText}>&#x25B2;</Text>
                </TouchableOpacity>
                <Text style={styles.wheelValue}>{formatMinute(customMinute)}</Text>
                <TouchableOpacity style={styles.wheelArrow} onPress={() => adjustMinute(-1)}>
                  <Text style={styles.wheelArrowText}>&#x25BC;</Text>
                </TouchableOpacity>
              </View>

              {/* AM/PM toggle */}
              <TouchableOpacity style={styles.ampmButton} onPress={toggleAmPm}>
                <Text style={styles.ampmText}>{getAmPm(customHour)}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.doneButton} onPress={handleCustomDone}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
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

  // Segmented control
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: SPACING.sm,
    minHeight: TOUCH_TARGET.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.sm,
  },
  segmentActive: {
    backgroundColor: COLORS.surface,
    ...SHADOWS.small,
  },
  segmentText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  segmentTextActive: {
    color: COLORS.textPrimary,
    fontWeight: '600',
  },

  // Expandable time options
  timeOptions: {
    marginTop: SPACING.sm,
  },
  chipRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  chip: {
    backgroundColor: COLORS.grey100,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  chipText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  chipCustom: {
    backgroundColor: COLORS.primarySubtle,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  chipCustomText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: COLORS.primary,
  },

  // Day toggle
  dayToggle: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  dayButton: {
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  dayButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySubtle,
  },
  dayButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  dayButtonTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  // Time summary
  timeSummary: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingTop: SPACING.xs,
  },

  // Custom picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    width: 280,
    ...SHADOWS.large,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.lg,
  },

  // Time wheel
  timeWheel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  wheelColumn: {
    alignItems: 'center',
    width: 60,
  },
  wheelArrow: {
    width: TOUCH_TARGET.min,
    height: TOUCH_TARGET.min,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelArrowText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
  wheelValue: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.textPrimary,
    minWidth: 50,
    textAlign: 'center',
  },
  wheelColon: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginHorizontal: SPACING.xs,
    paddingBottom: 2,
  },
  ampmButton: {
    backgroundColor: COLORS.grey100,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginLeft: SPACING.md,
  },
  ampmText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },

  // Done button
  doneButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    alignItems: 'center',
  },
  doneButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
});

export default TimePicker;
