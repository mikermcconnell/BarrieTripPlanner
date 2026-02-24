import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSurvey } from '../hooks/useSurvey';
import StarRatingInput from '../components/survey/StarRatingInput';
import SingleSelectInput from '../components/survey/SingleSelectInput';
import OpenTextInput from '../components/survey/OpenTextInput';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';

const SurveyScreen = ({ navigation, route }) => {
  const trigger = route?.params?.trigger || 'profile';
  const {
    survey,
    loading,
    answers,
    currentIndex,
    currentQuestion,
    totalQuestions,
    progress,
    setAnswer,
    canGoNext,
    goNext,
    goBack,
    isLastQuestion,
    submit,
    submitting,
    submitted,
    alreadySubmitted,
    error,
  } = useSurvey(trigger);

  // ─── Loading state ───────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading survey...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── No active survey ────────────────────────────────────────

  if (!survey) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>{'\u2190'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Feedback</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No Survey Available</Text>
          <Text style={styles.emptySubtitle}>Check back later for a new feedback opportunity.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Already submitted ───────────────────────────────────────

  if (alreadySubmitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>{'\u2190'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Feedback</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Already Submitted</Text>
          <Text style={styles.emptySubtitle}>You've already shared your feedback. Thank you!</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('SurveyResults', { surveyId: survey.id })}
          >
            <Text style={styles.primaryButtonText}>View Community Results</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Submitted — thank you ───────────────────────────────────

  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.thankYouEmoji}>{'\u2705'}</Text>
          <Text style={styles.thankYouTitle}>Thank You!</Text>
          <Text style={styles.thankYouSubtitle}>
            Your feedback helps improve Barrie Transit for everyone.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('SurveyResults', { surveyId: survey.id })}
          >
            <Text style={styles.primaryButtonText}>See How Others Responded</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.secondaryButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Survey form ─────────────────────────────────────────────

  const currentAnswer = answers[currentQuestion?.id]?.value;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>{'\u2190'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{survey.title}</Text>
        <Text style={styles.stepLabel}>{currentIndex + 1}/{totalQuestions}</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
      </View>

      {/* Question */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.questionText}>{currentQuestion?.text}</Text>
        {currentQuestion?.required && (
          <Text style={styles.requiredBadge}>Required</Text>
        )}

        {/* Input based on type */}
        {currentQuestion?.type === 'star_rating' && (
          <StarRatingInput
            value={currentAnswer}
            maxStars={currentQuestion.maxStars || 5}
            onChange={(val) => setAnswer(currentQuestion.id, val)}
          />
        )}
        {currentQuestion?.type === 'single_select' && (
          <SingleSelectInput
            options={currentQuestion.options || []}
            value={currentAnswer}
            onChange={(val) => setAnswer(currentQuestion.id, val)}
          />
        )}
        {currentQuestion?.type === 'open_text' && (
          <OpenTextInput
            value={currentAnswer || ''}
            onChange={(val) => setAnswer(currentQuestion.id, val)}
          />
        )}

        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}
      </ScrollView>

      {/* Navigation buttons */}
      <View style={styles.footer}>
        {currentIndex > 0 ? (
          <TouchableOpacity style={styles.backNavButton} onPress={goBack}>
            <Text style={styles.backNavText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backNavButton} />
        )}

        {isLastQuestion ? (
          <TouchableOpacity
            style={[styles.primaryButton, (!canGoNext() || submitting) && styles.buttonDisabled]}
            onPress={submit}
            disabled={!canGoNext() || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Submit</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, !canGoNext() && styles.buttonDisabled]}
            onPress={goNext}
            disabled={!canGoNext()}
          >
            <Text style={styles.primaryButtonText}>Next</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.textPrimary,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  stepLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    minWidth: 40,
    textAlign: 'right',
  },
  placeholder: {
    width: 40,
  },
  progressContainer: {
    height: 4,
    backgroundColor: COLORS.grey200,
  },
  progressBar: {
    height: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: SPACING.xl,
    paddingBottom: SPACING.xxxl,
  },
  questionText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
    lineHeight: 26,
  },
  requiredBadge: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.error,
    fontWeight: '500',
    marginBottom: SPACING.md,
  },
  errorText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  backNavButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minWidth: 80,
  },
  backNavText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.round,
    minWidth: 120,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
  },
  secondaryButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  thankYouEmoji: {
    fontSize: 64,
    marginBottom: SPACING.md,
  },
  thankYouTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  thankYouSubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
});

export default SurveyScreen;
