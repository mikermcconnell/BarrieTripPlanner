import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    Easing,
    withSpring,
} from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';
import { COLORS, FONT_FAMILIES, SPACING, FONT_SIZES, BORDER_RADIUS } from '../config/theme';

export const AnimatedEmptyState = ({ title, message }) => {
    const translateY = useSharedValue(0);

    useEffect(() => {
        translateY.value = withRepeat(
            withSequence(
                withTiming(-10, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
                withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.iconContainer, animatedStyle]}>
                {/* Soft, friendly map pin illustration */}
                <Svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                    <Circle cx="60" cy="60" r="50" fill={COLORS.primarySubtle} />
                    <Path
                        d="M60 25C46.2 25 35 36.2 35 50C35 68.75 60 95 60 95C60 95 85 68.75 85 50C85 36.2 73.8 25 60 25ZM60 57.5C55.85 57.5 52.5 54.15 52.5 50C52.5 45.85 55.85 42.5 60 42.5C64.15 42.5 67.5 45.85 67.5 50C67.5 54.15 64.15 57.5 60 57.5Z"
                        fill={COLORS.primary}
                    />
                    {/* Friendly face on the map pin */}
                    <Path d="M53 48 Q55 52 57 48" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    <Path d="M63 48 Q65 52 67 48" stroke="white" strokeWidth="2" strokeLinecap="round" />
                </Svg>
            </Animated.View>

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACING.xxl,
        flex: 1,
    },
    iconContainer: {
        marginBottom: SPACING.xl,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 4,
    },
    title: {
        fontSize: FONT_SIZES.xl,
        fontFamily: FONT_FAMILIES.bold,
        color: COLORS.textPrimary,
        marginBottom: SPACING.sm,
        textAlign: 'center',
    },
    message: {
        fontSize: FONT_SIZES.md,
        fontFamily: FONT_FAMILIES.regular,
        color: COLORS.textSecondary,
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 280,
    },
});

export default AnimatedEmptyState;
