import React, { useMemo, forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, PROVIDER_DEFAULT, Polyline, Marker } from 'react-native-maps';
import { CUSTOM_MAP_STYLE } from '../config/mapStyle';
import { MAP_CONFIG, ROUTE_COLORS } from '../config/constants';
import { COLORS, SHADOWS } from '../config/theme';

// Components
import BusMarker from './BusMarker';
import RoutePolyline from './RoutePolyline';
import StopMarker from './StopMarker';

const TransitMap = forwardRef(({
    routes,
    shapes,
    routeShapeMapping,
    vehicles,
    stops, // displayed stops
    selectedRoute,
    selectedStop,
    showRoutes = true,
    onRegionChange,
    onStopPress,
    // Trip Planning Props
    isTripPlanningMode,
    tripRouteCoordinates = [],
    tripMarkers = [],
    mapRegion,
}, ref) => {

    // Helper to get route color
    const getRouteColor = (routeId) => {
        const foundRoute = routes.find((r) => r.id === routeId);
        if (foundRoute?.color) return foundRoute.color;
        return ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT;
    };

    // Get shapes to display (Moved logic here or kept in parent? Parent passed specific shapes?
    // To keep this component dumb, parent should pass 'displayedShapes'.
    // But for now, let's keep the logic here to simplify the refactor speed, reusing the memo logic)

    // Actually, to make this pure, let's re-implement the memoized logic inside or accept it as props.
    // Accepted 'displayedShapes' as a prop would be cleaner, but let's recalculate here for now to avoid prop drilling hell
    // Wait, I will copy the useMemo logic from HomeScreen to here? No, better to extract it to a hook or just keep it in HomeScreen and pass 'displayedShapes'.
    // Let's assume HomeScreen passes 'displayedShapes' to avoid logic duplication.

    // REVISION: I will compute displayedShapes inside HomeScreen and pass it down.
    // So I'll just accept 'displayedShapes' prop.
},
    // Wait, I can't write the implementation yet without deciding on the props API.
    // Let's write the file ASSUMING props are passed ready-to-render.
);

const TransitMapComponent = forwardRef(({
    displayedShapes,
    displayedStops,
    displayedVehicles,
    tripRouteCoordinates,
    tripMarkers,
    selectedRoute,
    selectedStop,
    onRegionChange,
    onStopPress,
    getRouteColor, // Pass this function down or map colors beforehand. passing function is easier.
}, ref) => {
    return (
        <MapView
            ref={ref}
            style={styles.map}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
            initialRegion={MAP_CONFIG.INITIAL_REGION}
            showsUserLocation
            showsMyLocationButton={false}
            showsCompass
            rotateEnabled
            pitchEnabled={false}
            onRegionChangeComplete={onRegionChange}
            customMapStyle={CUSTOM_MAP_STYLE}
        >
            {/* Route Shapes */}
            {displayedShapes.map((shape) => (
                <RoutePolyline
                    key={shape.id}
                    coordinates={shape.coordinates}
                    color={shape.color}
                    strokeWidth={selectedRoute === shape.routeId ? 4 : 3}
                />
            ))}

            {/* Stops */}
            {displayedStops.map((stop) => (
                <StopMarker
                    key={stop.id}
                    stop={stop}
                    onPress={onStopPress}
                    isSelected={selectedStop?.id === stop.id}
                />
            ))}

            {/* Vehicles */}
            {displayedVehicles.map((vehicle) => (
                <BusMarker
                    key={vehicle.id}
                    vehicle={vehicle}
                    color={getRouteColor(vehicle.routeId)}
                />
            ))}

            {/* Trip Planning Route Overlay */}
            {tripRouteCoordinates.map((route) => (
                <Polyline
                    key={route.id}
                    coordinates={route.coordinates}
                    strokeColor={route.color}
                    strokeWidth={route.isWalk ? 3 : 5}
                    lineDashPattern={route.isWalk ? [10, 5] : null}
                />
            ))}

            {/* Trip Planning Markers */}
            {tripMarkers.map((marker) => (
                <Marker
                    key={marker.id}
                    coordinate={marker.coordinate}
                    title={marker.title}
                >
                    <View style={[
                        styles.tripMarker,
                        marker.type === 'origin' ? styles.tripMarkerOrigin : styles.tripMarkerDestination
                    ]}>
                        <View style={[
                            styles.tripMarkerInner,
                            marker.type === 'origin' ? styles.tripMarkerInnerOrigin : styles.tripMarkerInnerDestination
                        ]} />
                    </View>
                </Marker>
            ))}
        </MapView>
    );
});

import { Platform } from 'react-native'; // Missing import

const styles = StyleSheet.create({
    map: {
        flex: 1,
    },
    tripMarker: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: COLORS.white,
        ...SHADOWS.medium,
    },
    tripMarkerOrigin: {
        backgroundColor: COLORS.success,
    },
    tripMarkerDestination: {
        backgroundColor: COLORS.error,
    },
    tripMarkerInner: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    tripMarkerInnerOrigin: {
        backgroundColor: COLORS.white,
    },
    tripMarkerInnerDestination: {
        backgroundColor: COLORS.white,
    },
});

export default TransitMapComponent;
