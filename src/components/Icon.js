import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import {
    Route,
    Pin as MapPin,
    Map as MapIcon,
    Home as HomeIcon,
    Bus,
    Search,
    User,
    Add,
    Settings,
    Star,
    Clock,
    Warning,
    Walk,
    BusStop,
    Transfer,
    Door,
    Phone,
    Hourglass,
    Celebration,
} from './CartoonIcons';
import { COLORS } from '../config/theme';

const outlineProps = (color) => ({
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
});

const WorkIcon = ({ size = 24, color = COLORS.textPrimary, style, ...props }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style} {...props}>
        <Rect x="4" y="7" width="16" height="13" rx="2" {...outlineProps(color)} />
        <Path d="M9 7V5.5C9 4.7 9.7 4 10.5 4H13.5C14.3 4 15 4.7 15 5.5V7" {...outlineProps(color)} />
        <Line x1="4" y1="12" x2="20" y2="12" {...outlineProps(color)} />
        <Line x1="12" y1="11" x2="12" y2="13" {...outlineProps(color)} />
    </Svg>
);

const SchoolIcon = ({ size = 24, color = COLORS.textPrimary, style, ...props }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style} {...props}>
        <Path d="M3 9L12 4L21 9L12 14L3 9Z" {...outlineProps(color)} />
        <Path d="M7 11.5V15.5C8.5 17 10.2 17.8 12 17.8C13.8 17.8 15.5 17 17 15.5V11.5" {...outlineProps(color)} />
        <Line x1="21" y1="9" x2="21" y2="15" {...outlineProps(color)} />
    </Svg>
);

const GroceryIcon = ({ size = 24, color = COLORS.textPrimary, style, ...props }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style} {...props}>
        <Path d="M6 8H20L18.5 16H8L6 5H3" {...outlineProps(color)} />
        <Circle cx="9" cy="19" r="1.4" stroke={color} strokeWidth={2} fill="none" />
        <Circle cx="17" cy="19" r="1.4" stroke={color} strokeWidth={2} fill="none" />
        <Line x1="9" y1="11" x2="18" y2="11" {...outlineProps(color)} />
    </Svg>
);

const GymIcon = ({ size = 24, color = COLORS.textPrimary, style, ...props }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style} {...props}>
        <Line x1="7" y1="8" x2="17" y2="16" {...outlineProps(color)} />
        <Line x1="5" y1="6" x2="3" y2="8" {...outlineProps(color)} />
        <Line x1="8" y1="3" x2="3" y2="8" {...outlineProps(color)} />
        <Line x1="16" y1="21" x2="21" y2="16" {...outlineProps(color)} />
        <Line x1="19" y1="18" x2="21" y2="16" {...outlineProps(color)} />
        <Line x1="6" y1="11" x2="11" y2="6" {...outlineProps(color)} />
        <Line x1="13" y1="18" x2="18" y2="13" {...outlineProps(color)} />
    </Svg>
);

const DoctorIcon = ({ size = 24, color = COLORS.textPrimary, style, ...props }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style} {...props}>
        <Rect x="4" y="4" width="16" height="16" rx="4" {...outlineProps(color)} />
        <Line x1="12" y1="8" x2="12" y2="16" {...outlineProps(color)} />
        <Line x1="8" y1="12" x2="16" y2="12" {...outlineProps(color)} />
    </Svg>
);

/**
 * Centralized Icon component that wraps our custom Cartoon SVGs.
 * Allows passing a string `name` to render the corresponding icon.
 * Ensures consistent styling and colors across the app.
 *
 * @example
 * <Icon name="Search" color={COLORS.primary} size={24} />
 */
const Icon = ({ name, color = COLORS.textPrimary, size = 24, strokeWidth = 2, ...rest }) => {
    // We map legacy Lucide names to our new custom cartoon SVGs to avoid 
    // needing to touch any other files in the codebase!
    const iconMap = {
        ArrowUpDown: Route, // For the trip direction button
        Route: Route, // Direct alias for route/arrow icon
        LocateFixed: MapPin, // For the "Locate Me" button
        Map: MapIcon,
        MapPin: MapPin,
        Home: HomeIcon,
        Work: WorkIcon,
        School: SchoolIcon,
        Grocery: GroceryIcon,
        Gym: GymIcon,
        Doctor: DoctorIcon,
        Bus: Bus, // ProfileScreen uses name="Bus"
        Navigation: Bus, // The main Trip FAB icon
        Search: Search,
        User: User,
        Settings: Settings,
        Star: Star,
        Clock: Clock,
        Warning: Warning,
        Walk: Walk,
        BusStop: BusStop,
        Transfer: Transfer,
        Door: Door,
        Phone: Phone,
        Hourglass: Hourglass,
        Celebration: Celebration,
        X: Add // We can rotate the "Add" (plus) icon 45deg to create an X!
    };

    const IconComponent = iconMap[name];

    if (!IconComponent) {
        console.warn(`Icon "${name}" is not registered in Icon component.`);
        return null;
    }

    const { fill, ...safeRest } = rest;

    // Apply a 45deg rotation if it's the X icon using the Add SVG
    const rotationStyle = name === 'X' ? { transform: [{ rotate: '45deg' }] } : {};

    return <IconComponent color={color} size={size} style={rotationStyle} {...safeRest} />;
};

export default Icon;
