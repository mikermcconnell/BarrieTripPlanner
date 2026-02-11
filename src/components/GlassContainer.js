import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, BORDER_RADIUS, SHADOWS } from '../config/theme';

const GlassContainer = ({
    children,
    style,
    intensity = 80,
    tint = 'light',
    borderRadius = BORDER_RADIUS.lg
}) => {
    if (Platform.OS === 'android') {
        // Android fallback since BlurView support can be spotty or expensive
        return (
            <View style={[styles.androidContainer, { borderRadius }, style]}>
                {children}
            </View>
        );
    }

    return (
        <View style={[styles.container, { borderRadius }, style]}>
            <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
            <View style={styles.content}>
                {children}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.6)', // Fallback / Base color
        ...SHADOWS.small,
        borderColor: 'rgba(255, 255, 255, 0.3)',
        borderWidth: 1,
    },
    androidContainer: {
        backgroundColor: COLORS.surface, // Solid background for Android
        ...SHADOWS.medium,
        elevation: 4,
    },
    content: {
        zIndex: 1,
    },
});

export default GlassContainer;
