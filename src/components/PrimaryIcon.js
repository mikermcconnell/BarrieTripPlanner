import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { COLORS } from '../config/theme';

const ICON_PATHS = {
  Map: 'M3.5 6.5 9 3.5l6 3 5.5-3v14L15 20.5l-6-3-5.5 3v-14ZM9 3.5v14M15 6.5v14',
  Search: 'm20 20-4.35-4.35M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  User: 'M19 20a7 7 0 0 0-14 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
};

const PrimaryIcon = ({ name, size = 24, color = COLORS.textPrimary, strokeWidth = 2, ...rest }) => {
  const path = ICON_PATHS[name];
  if (!path) return null;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...rest}>
      <Path
        d={path}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {name === 'Map' ? <Circle cx="15" cy="12.5" r="1.4" fill={color} /> : null}
    </Svg>
  );
};

export default React.memo(PrimaryIcon);
