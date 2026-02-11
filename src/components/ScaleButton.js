import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const ScaleButton = ({
    children,
    onPress,
    style,
    scaleTo = 0.95,
    hapticType = Haptics.ImpactFeedbackStyle.Light,
    disabled = false
}) => {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }],
        };
    });

    const handlePressIn = () => {
        if (disabled) return;
        scale.value = withSpring(scaleTo, { damping: 10, stiffness: 300 });
        Haptics.impactAsync(hapticType).catch(() => { }); // catch for web/unsupported
    };

    const handlePressOut = () => {
        if (disabled) return;
        scale.value = withSpring(1, { damping: 10, stiffness: 300 });
    };

    return (
        <Pressable
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={disabled}
            style={({ pressed }) => [style, { opacity: pressed ? 0.8 : 1 }]}
        >
            <Animated.View style={[animatedStyle, styles.content]}>
                {children}
            </Animated.View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    content: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default ScaleButton;
