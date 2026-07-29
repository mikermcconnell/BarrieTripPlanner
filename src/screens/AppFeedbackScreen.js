import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BORDER_RADIUS, COLORS, FONT_SIZES, SHADOWS, SPACING } from '../config/theme';
import { APP_FEEDBACK_MESSAGE_LIMITS } from '../config/appFeedback';
import { addSafeBottomPadding, useSafeBottomInset } from '../utils/androidNavigationBar';
import { appFeedbackService } from '../services/appFeedbackService';

const CATEGORIES = [
  { id: 'bug', label: 'Bug' },
  { id: 'usability', label: 'Confusing' },
  { id: 'idea', label: 'Idea' },
  { id: 'other', label: 'Other' },
];

const { min: MIN_MESSAGE_LENGTH, max: MAX_MESSAGE_LENGTH } = APP_FEEDBACK_MESSAGE_LIMITS;

export default function AppFeedbackScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const bottomInset = useSafeBottomInset(insets.bottom);
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionIdRef = useRef(appFeedbackService.createSubmissionId());
  const trimmedMessage = message.trim();
  const charactersNeeded = Math.max(MIN_MESSAGE_LENGTH - trimmedMessage.length, 0);
  const canSubmit = useMemo(
    () => trimmedMessage.length >= MIN_MESSAGE_LENGTH
      && trimmedMessage.length <= MAX_MESSAGE_LENGTH
      && !isSubmitting,
    [isSubmitting, trimmedMessage.length]
  );

  const submitFeedback = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await appFeedbackService.submit({
        category,
        message: trimmedMessage,
        source: route?.params?.source || 'profile',
        submissionId: submissionIdRef.current,
      });
      Alert.alert(
        'Feedback received',
        'Thank you. Your feedback was sent privately to the app developer.',
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert('Could not send feedback', error.message || 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Back" style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>App Feedback</Text>
        <View style={styles.headerSpacer} />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: addSafeBottomPadding(SPACING.xl, bottomInset) }]}
        >
          <View style={styles.introCard}>
            <Text style={styles.title}>Help improve the app</Text>
            <Text style={styles.body}>
              Report a bug, confusing experience, or feature idea. Your message stays in the private developer inbox.
            </Text>
          </View>

          <Text style={styles.label}>What kind of feedback is this?</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((option) => {
              const selected = category === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.categoryButton, selected && styles.categoryButtonSelected]}
                  onPress={() => setCategory(option.id)}
                >
                  <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Tell us what happened</Text>
          <TextInput
            accessibilityLabel="App feedback message"
            style={styles.input}
            value={message}
            onChangeText={setMessage}
            placeholder="What happened? What did you expect instead?"
            placeholderTextColor={COLORS.textSecondary}
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            textAlignVertical="top"
          />
          <Text accessibilityLiveRegion="polite" style={styles.characterCount}>
            {charactersNeeded > 0
              ? `${charactersNeeded} more character${charactersNeeded === 1 ? '' : 's'} needed • `
              : 'Minimum met • '}
            {message.length.toLocaleString()}/{MAX_MESSAGE_LENGTH.toLocaleString()} maximum
          </Text>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            disabled={!canSubmit}
            onPress={submitFeedback}
          >
            <Text style={styles.submitButtonText}>{isSubmitting ? 'Sending…' : 'Send feedback'}</Text>
          </TouchableOpacity>
          <Text style={styles.privacyNote}>
            No email app will open, and your email address is not included. Do not include passwords or other sensitive personal information.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backButtonText: { fontSize: 24, color: COLORS.textPrimary },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '600', color: COLORS.textPrimary },
  headerSpacer: { width: 40 },
  content: { padding: SPACING.md },
  introCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, ...SHADOWS.small },
  title: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.textPrimary, marginBottom: SPACING.sm },
  body: { fontSize: FONT_SIZES.md, lineHeight: 22, color: COLORS.textSecondary },
  label: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.textPrimary, marginBottom: SPACING.sm },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg },
  categoryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  categoryButtonSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySubtle },
  categoryText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, fontWeight: '700' },
  categoryTextSelected: { color: COLORS.primary },
  input: { minHeight: 180, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, color: COLORS.textPrimary, fontSize: FONT_SIZES.md, lineHeight: 22 },
  characterCount: { alignSelf: 'flex-end', color: COLORS.textSecondary, fontSize: FONT_SIZES.xs, marginTop: 4, marginBottom: SPACING.lg },
  submitButton: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, alignItems: 'center' },
  submitButtonDisabled: { opacity: 0.45 },
  submitButtonText: { color: COLORS.white, fontSize: FONT_SIZES.md, fontWeight: '700' },
  privacyNote: { marginTop: SPACING.sm, color: COLORS.textSecondary, textAlign: 'center', fontSize: FONT_SIZES.xs, lineHeight: 18 },
});
