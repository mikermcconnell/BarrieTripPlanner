import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { COLORS } from '../config/theme';

const PulsingSpinner = ({ size = 60, color = COLORS.primary }) => {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(0.8);

    useEffect(() => {
        scale.value = withRepeat(
            withSequence(
                withTiming(1.3, { duration: 1000, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
                withTiming(1, { duration: 1000, easing: Easing.bezier(0.25, 0.1, 0.25, 1) })
            ),
            -1,
            true
        );

        opacity.value = withRepeat(
            withSequence(
                withTiming(0.4, { duration: 1000, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
                withTiming(0.8, { duration: 1000, easing: Easing.bezier(0.25, 0.1, 0.25, 1) })
            ),
            -1,
            true
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            <Animated.View
                style={[
                    styles.circle,
                    {
                        width: size * 0.6,
                        height: size * 0.6,
                        borderRadius: size * 0.3,
                        backgroundColor: color,
                    },
                    animatedStyle,
                ]}
            />
            {/* Inner stable dot */}
            <View
                style={[
                    styles.innerDot,
                    {
                        width: size * 0.3,
                        height: size * 0.3,
                        borderRadius: size * 0.15,
                        backgroundColor: color,
                    },
                ]}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    circle: {
        position: 'absolute',
    },
    innerDot: {
        position: 'absolute',
    },
});

export default PulsingSpinner;
