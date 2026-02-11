import { useRef, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { AnimatedRegion } from 'react-native-maps';

export const useAnimatedMarker = (coordinate) => {
    // Initialize AnimatedRegion
    const animatedCoordinate = useRef(
        new AnimatedRegion({
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
            latitudeDelta: 0,
            longitudeDelta: 0,
        })
    ).current;

    useEffect(() => {
        if (Platform.OS === 'android') {
            // Android works best with timing
            animatedCoordinate.timing({
                latitude: coordinate.latitude,
                longitude: coordinate.longitude,
                duration: 1000, // 1 second animation matches standard frequent updates
                useNativeDriver: false, // AnimatedRegion doesn't support native driver
            }).start();
        } else {
            // iOS works best with spring or timing
            animatedCoordinate.timing({
                latitude: coordinate.latitude,
                longitude: coordinate.longitude,
                duration: 1000,
                useNativeDriver: false,
            }).start();
        }
    }, [coordinate.latitude, coordinate.longitude]);

    return animatedCoordinate;
};
