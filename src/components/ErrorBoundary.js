import React, { Component } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../config/theme';
import logger from '../utils/logger';
import { getStartupFatal, recordStartupFatal } from '../utils/startupDiagnostics';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    recordStartupFatal({
      error,
      componentStack: errorInfo?.componentStack || null,
      origin: 'react-boundary',
    });
    this.setState({
      componentStack: errorInfo?.componentStack || null,
    });
    logger.error('Error caught by boundary:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, componentStack: null });
  };

  render() {
    if (this.state.hasError) {
      const startupFatal = getStartupFatal();
      const diagnosticMessage =
        this.state.error?.message || startupFatal?.message || null;
      const diagnosticStack =
        this.state.error?.stack || startupFatal?.stack || null;
      const diagnosticComponentStack =
        this.state.componentStack || startupFatal?.componentStack || null;

      return (
        <View style={styles.container}>
          <Text style={styles.icon}>😵</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.props.fallbackMessage || 'An unexpected error occurred. Please try again.'}
          </Text>
          {diagnosticMessage ? (
            <Text style={styles.errorDetail} numberOfLines={4}>
              Error details: {diagnosticMessage}
            </Text>
          ) : null}
          {diagnosticStack ? (
            <Text style={styles.diagnosticStack} numberOfLines={6}>
              Stack: {diagnosticStack}
            </Text>
          ) : null}
          {diagnosticComponentStack ? (
            <Text style={styles.diagnosticStack} numberOfLines={6}>
              Component stack: {diagnosticComponentStack}
            </Text>
          ) : null}
          <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

// Functional wrapper for hook-based error handling
export const ErrorFallback = ({ error, resetError, message }) => (
  <View style={styles.container}>
    <Text style={styles.icon}>😵</Text>
    <Text style={styles.title}>Something went wrong</Text>
    <Text style={styles.message}>{message || error?.message || 'An unexpected error occurred.'}</Text>
    {resetError && (
      <TouchableOpacity style={styles.button} onPress={resetError}>
        <Text style={styles.buttonText}>Try Again</Text>
      </TouchableOpacity>
    )}
  </View>
);

// Inline error display for smaller components
export const InlineError = ({ message, onRetry }) => (
  <View style={styles.inlineContainer}>
    <Text style={styles.inlineIcon}>⚠️</Text>
    <Text style={styles.inlineMessage}>{message}</Text>
    {onRetry && (
      <TouchableOpacity onPress={onRetry}>
        <Text style={styles.inlineRetry}>Retry</Text>
      </TouchableOpacity>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.background,
  },
  icon: {
    fontSize: 64,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },
  errorDetail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
    textAlign: 'center',
    marginBottom: SPACING.md,
    lineHeight: 18,
  },
  diagnosticStack: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: 'left',
    width: '100%',
    marginBottom: SPACING.sm,
    lineHeight: 16,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  inlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.error + '15',
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginVertical: SPACING.xs,
  },
  inlineIcon: {
    fontSize: 16,
    marginRight: SPACING.xs,
  },
  inlineMessage: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
  },
  inlineRetry: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
    marginLeft: SPACING.sm,
  },
});

export default ErrorBoundary;
