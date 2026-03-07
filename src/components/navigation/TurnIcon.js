/**
 * TurnIcon Component
 *
 * Renders an SVG turn-arrow icon inside a colored circle based on
 * OSRM maneuver type and modifier. Works on both native and web via
 * react-native-svg.
 */
import React from 'react';
import Svg, { Path, Circle, G } from 'react-native-svg';

/**
 * Determine the icon variant from OSRM type + modifier.
 */
const getIconVariant = (type, modifier) => {
  if (type === 'arrive') return 'arrive';
  if (type === 'depart') return 'depart';
  if (modifier === 'uturn') return 'uturn';
  if (modifier === 'sharp left') return 'sharp-left';
  if (modifier === 'sharp right') return 'sharp-right';
  if (modifier === 'slight left') return 'slight-left';
  if (modifier === 'slight right') return 'slight-right';
  if (modifier === 'left') return 'left';
  if (modifier === 'right') return 'right';
  return 'straight';
};

/**
 * All arrows are drawn on a 40×40 viewBox.
 * The circle background is drawn by the parent <Circle> element.
 * Arrow paths are white, centered, with a stem + arrowhead design.
 *
 * Base upward arrow (straight/depart):
 *   Stem: 4px wide, from y=28 to y=16
 *   Head: triangle pointing up, apex at y=8
 *
 * Other directions are achieved with <G transform="rotate(deg, 20, 20)">
 * wrapping the same base path, or bespoke paths for uturn/arrive.
 */

// Base upward arrow path (centered on 40×40)
const ARROW_UP = 'M20,8 L13,18 L17,18 L17,30 L23,30 L23,18 L27,18 Z';

// U-turn: goes right, curves back left, arrow pointing left
const UTURN_PATH = 'M14,28 L14,16 C14,10 28,10 28,16 L28,22 L32,22 L27,28 L22,22 L26,22 L26,16 C26,13 16,13 16,18 L16,28 Z';

// Arrive: plus icon (destination reached)
// We render a circle + inner dot for arrive — see renderIcon below

const TurnIcon = ({ type, modifier, size = 40, color = '#1a73e8' }) => {
  const variant = getIconVariant(type, modifier);

  // Rotation angles for each direction variant (applied to the base up-arrow)
  const rotationForVariant = {
    straight: 0,
    depart: 0,
    left: -90,
    right: 90,
    'slight-left': -45,
    'slight-right': 45,
    'sharp-left': -135,
    'sharp-right': 135,
  };

  if (variant === 'arrive') {
    // Destination dot: outer ring + filled center
    return (
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Circle cx={20} cy={20} r={20} fill={color} />
        {/* Outer ring */}
        <Circle cx={20} cy={20} r={10} fill="none" stroke="white" strokeWidth={3} />
        {/* Center dot */}
        <Circle cx={20} cy={20} r={5} fill="white" />
      </Svg>
    );
  }

  if (variant === 'uturn') {
    return (
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Circle cx={20} cy={20} r={20} fill={color} />
        <Path d={UTURN_PATH} fill="white" />
      </Svg>
    );
  }

  const rotation = rotationForVariant[variant] ?? 0;

  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Circle cx={20} cy={20} r={20} fill={color} />
      <G transform={`rotate(${rotation} 20 20)`}>
        <Path d={ARROW_UP} fill="white" />
      </G>
    </Svg>
  );
};

export default TurnIcon;
