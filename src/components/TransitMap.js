import React, { useMemo, forwardRef, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { MAP_CONFIG, ROUTE_COLORS, OSM_MAP_STYLE } from '../config/constants';
import { COLORS, SHADOWS } from '../config/theme';

// Components
import BusMarker from './BusMarker';
import RoutePolyline from './RoutePolyline';

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
    getRouteColor,
}, ref) => {
    const cameraRef = useRef(null);

    const cameraDefaultSettings = useMemo(() => ({
        centerCoordinate: [MAP_CONFIG.INITIAL_REGION.longitude, MAP_CONFIG.INITIAL_REGION.latitude],
        zoomLevel: Math.log2(360 / MAP_CONFIG.INITIAL_REGION.latitudeDelta),
    }), []);

    const stopsGeoJson = useMemo(() => ({
        type: 'FeatureCollection',
        features: displayedStops.map((stop) => ({
            type: 'Feature',
            id: stop.id,
            geometry: {
                type: 'Point',
                coordinates: [stop.longitude, stop.latitude],
            },
            properties: {
                id: stop.id,
                name: stop.name || '',
                isSelected: selectedStop?.id === stop.id ? 1 : 0,
            },
        })),
    }), [displayedStops, selectedStop]);

    const handleStopPress = (e) => {
        const feature = e?.features?.[0];
        if (feature?.properties?.id) {
            const stop = displayedStops.find((s) => s.id === feature.properties.id);
            if (stop) onStopPress?.(stop);
        }
    };

    return (
        <MapLibreGL.MapView
            ref={ref}
            style={styles.map}
            mapStyle={OSM_MAP_STYLE}
            rotateEnabled
            pitchEnabled={false}
            attributionPosition={{ bottom: 8, left: 8 }}
            logoEnabled={false}
            onRegionDidChange={onRegionChange}
        >
            <MapLibreGL.Camera
                ref={cameraRef}
                defaultSettings={cameraDefaultSettings}
            />
            <MapLibreGL.UserLocation visible={true} />

            {/* --- Line layers first (rendered below annotations) --- */}

            {/* Route Shapes */}
            {displayedShapes.map((shape) => (
                <RoutePolyline
                    key={shape.id}
                    id={`transit-route-${shape.id}`}
                    coordinates={shape.coordinates}
                    color={shape.color}
                    strokeWidth={selectedRoute === shape.routeId ? 8 : 6}
                />
            ))}

            {/* Trip Planning Route Overlay */}
            {tripRouteCoordinates.map((route) => (
                <RoutePolyline
                    key={route.id}
                    id={`transit-trip-${route.id}`}
                    coordinates={route.coordinates}
                    color={route.color}
                    strokeWidth={route.isWalk ? 6 : 10}
                    lineDashPattern={route.isWalk ? [10, 5] : null}
                    opacity={1}
                />
            ))}

            {/* --- Point layers (rendered above line layers) --- */}

            {/* Stops — CircleLayer with high z-index to render above route lines */}
            <MapLibreGL.ShapeSource
                id="stops-source"
                shape={stopsGeoJson}
                onPress={handleStopPress}
                hitbox={{ width: 20, height: 20 }}
            >
                {/* White border ring — layerIndex ensures it renders above all route polylines */}
                <MapLibreGL.CircleLayer
                    id="stops-border"
                    layerIndex={200}
                    style={{
                        circleRadius: ['case', ['==', ['get', 'isSelected'], 1], 9, 6],
                        circleColor: COLORS.white,
                    }}
                />
                {/* Colored fill */}
                <MapLibreGL.CircleLayer
                    id="stops-fill"
                    layerIndex={201}
                    aboveLayerID="stops-border"
                    style={{
                        circleRadius: ['case', ['==', ['get', 'isSelected'], 1], 6, 4],
                        circleColor: ['case', ['==', ['get', 'isSelected'], 1], COLORS.accent, COLORS.primary],
                    }}
                />
            </MapLibreGL.ShapeSource>

            {/* Vehicles */}
            {displayedVehicles.map((vehicle) => (
                <BusMarker
                    key={vehicle.id}
                    vehicle={vehicle}
                    color={getRouteColor(vehicle.routeId)}
                />
            ))}

            {/* Trip Planning Markers */}
            {tripMarkers.map((marker) => (
                <MapLibreGL.PointAnnotation
                    key={marker.id}
                    id={`transit-marker-${marker.id}`}
                    coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
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
                </MapLibreGL.PointAnnotation>
            ))}
        </MapLibreGL.MapView>
    );
});


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
