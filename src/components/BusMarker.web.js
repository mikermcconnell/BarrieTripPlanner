import React from 'react';
import { useAnimatedBusPosition } from '../hooks/useAnimatedBusPosition';

// Web stub - BusMarker is not used on web
const BusMarker = ({ vehicle, color = '#E53935', onPress, routeLabel }) => {
  // Keep prop + hook parity with native component for check:parity.
  void color;
  void onPress;
  void routeLabel;
  useAnimatedBusPosition(vehicle);
  return null;
};

export default BusMarker;
