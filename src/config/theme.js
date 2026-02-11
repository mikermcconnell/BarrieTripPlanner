// Barrie Transit Theme - Enterprise-grade design system
// Design spec: BudgetMe-inspired with green (#4CAF50) as primary accent
export const COLORS = {
  // Primary brand colors (BudgetMe Green - per PROJECT_PLAN.md)
  primary: '#4CAF50',
  primaryLight: '#81C784',
  primaryDark: '#388E3C',
  primarySubtle: '#E8F5E9',

  // Secondary colors (Transit Blue - for informational elements)
  secondary: '#0066CC',
  secondaryLight: '#3399FF',
  secondaryDark: '#004C99',
  secondarySubtle: '#E6F2FF',

  // Accent colors (Warning Yellow)
  accent: '#FF991F',
  accentLight: '#FFB84D',
  accentDark: '#FF8B00',
  accentSubtle: '#FFF4E5',

  // Status colors
  success: '#4CAF50',
  successSubtle: '#E8F5E9',
  warning: '#FF991F',
  warningSubtle: '#FFF4E5',
  error: '#DE350B',
  errorSubtle: '#FFEBE6',
  info: '#0066CC',
  infoSubtle: '#E6F2FF',

  // Neutral colors
  white: '#FFFFFF',
  black: '#091E42',
  grey50: '#FAFBFC',
  grey100: '#F4F5F7',
  grey200: '#EBECF0',
  grey300: '#DFE1E6',
  grey400: '#C1C7D0',
  grey500: '#A5ADBA',
  grey600: '#6B778C',
  grey700: '#505F79',
  grey800: '#344563',
  grey900: '#172B4D',

  // Background colors
  background: '#F4F5F7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceHover: '#F4F5F7',
  surfacePressed: '#EBECF0',

  // Text colors
  textPrimary: '#172B4D',
  textSecondary: '#6B778C',
  textDisabled: '#A5ADBA',
  textInverse: '#FFFFFF',
  textBrand: '#4CAF50',

  // Border colors
  border: '#DFE1E6',
  borderLight: '#EBECF0',
  borderFocus: '#4CAF50',

  // Real-time indicator colors
  realtime: '#4CAF50',
  scheduled: '#6B778C',
  delayed: '#DE350B',

  // Glassmorphism
  glassWhite: 'rgba(255, 255, 255, 0.95)',
  glassDark: 'rgba(23, 43, 77, 0.8)',
};

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const FONT_SIZES = {
  xxs: 10,
  xs: 11,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
  xxxl: 28,
  display: 34,
};

export const FONT_WEIGHTS = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
};

export const LINE_HEIGHTS = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
};

export const BORDER_RADIUS = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  round: 9999,
};

export const SHADOWS = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  small: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  large: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  elevated: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 12,
  },
};

// Animation timing
export const ANIMATION = {
  fast: 150,
  normal: 250,
  slow: 400,
};

// Touch targets (accessibility)
export const TOUCH_TARGET = {
  min: 44,
  comfortable: 48,
};

// Common style patterns
export const commonStyles = {
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.small,
  },
  cardElevated: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.medium,
  },
  glass: {
    backgroundColor: COLORS.glassWhite,
    backdropFilter: 'blur(10px)',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.round, // Pill-shaped per design spec
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET.min,
  },
  buttonSecondary: {
    backgroundColor: COLORS.primarySubtle,
    borderRadius: BORDER_RADIUS.round, // Pill-shaped per design spec
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET.min,
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderRadius: BORDER_RADIUS.round, // Pill-shaped per design spec
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET.min,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 0.3,
  },
  buttonTextSecondary: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 0.3,
  },
  title: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  heading: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  bodyText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
    lineHeight: FONT_SIZES.md * LINE_HEIGHTS.normal,
  },
  bodyTextSmall: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: FONT_SIZES.sm * LINE_HEIGHTS.normal,
  },
  caption: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    letterSpacing: 0.2,
  },
  label: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  badge: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primarySubtle,
  },
  badgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },
  iconButton: {
    width: TOUCH_TARGET.comfortable,
    height: TOUCH_TARGET.comfortable,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: SPACING.xs,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  chipTextActive: {
    color: COLORS.white,
  },
};
