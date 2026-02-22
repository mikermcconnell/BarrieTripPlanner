import React from 'react';
import {
    Route,
    Pin as MapPin,
    Map as MapIcon,
    Bus,
    Search,
    User,
    Add,
    Settings,
    Star,
    Clock,
    Warning
} from './CartoonIcons';
import { COLORS } from '../config/theme';

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
        LocateFixed: MapPin, // For the "Locate Me" button
        Map: MapIcon,
        MapPin: MapPin,
        Bus: Bus, // ProfileScreen uses name="Bus"
        Navigation: Bus, // The main Trip FAB icon
        Search: Search,
        User: User,
        Settings: Settings,
        Star: Star,
        Clock: Clock,
        Warning: Warning,
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
