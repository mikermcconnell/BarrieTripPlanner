import React from 'react';
import { Image } from 'react-native';

const WALKING_PACE_ICONS = {
  plenty: {
    assetName: 'walk-casual-256.png',
    label: 'Person casually walking',
    source: require('../../../assets/icons/walking-pace/walk-casual-256.png'),
  },
  on_pace: {
    assetName: 'walk-normal-256.png',
    label: 'Person walking',
    source: require('../../../assets/icons/walking-pace/walk-normal-256.png'),
  },
  hurry: {
    assetName: 'walk-brisk-256.png',
    label: 'Person walking briskly',
    source: require('../../../assets/icons/walking-pace/walk-brisk-256.png'),
  },
  behind: {
    assetName: 'run-late-256.png',
    label: 'Person running late',
    source: require('../../../assets/icons/walking-pace/run-late-256.png'),
  },
};

export const getWalkingPaceIconConfig = (level = 'on_pace') => (
  WALKING_PACE_ICONS[level] || WALKING_PACE_ICONS.on_pace
);

const WalkingPaceIcon = ({
  level = 'on_pace',
  size = 32,
  style,
  accessibilityLabel,
}) => {
  const icon = getWalkingPaceIconConfig(level);

  return (
    <Image
      source={icon.source}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessible
      accessibilityLabel={accessibilityLabel || icon.label}
    />
  );
};

export default WalkingPaceIcon;
