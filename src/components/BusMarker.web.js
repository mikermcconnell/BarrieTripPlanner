import React from 'react';
import { useAnimatedBusPosition } from '../hooks/useAnimatedBusPosition';

// Web stub - map rendering uses WebBusMarker in WebMapView, which shares
// the same useAnimatedBusPosition smoothing hook as the native marker.
const BusMarker = ({ vehicle, color = '#E53935', onPress, routeLabel, snapPath }) => {
  void useAnimatedBusPosition;
  void vehicle;
  // Keep prop + hook parity with native component for check:parity.
  void color;
  void onPress;
  void routeLabel;
  void snapPath;
  return null;
};

export default BusMarker;
