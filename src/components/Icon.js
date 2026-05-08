import React from 'react';
import Svg, { Path } from 'react-native-svg';
import {
    Route,
    Pin as MapPin,
    Map as MapIcon,
    AddressHome as HomeIcon,
    Work as WorkIcon,
    School as SchoolIcon,
    Grocery as GroceryIcon,
    Gym as GymIcon,
    Doctor as DoctorIcon,
    Bus,
    Search,
    User,
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

/**
 * Centralized Icon component that wraps our custom Cartoon SVGs.
 * Allows passing a string `name` to render the corresponding icon.
 * Ensures consistent styling and colors across the app.
 *
 * @example
 * <Icon name="Search" color={COLORS.primary} size={24} />
 */
const Icon = ({ name, color = COLORS.textPrimary, size = 24, strokeWidth = 2, ...rest }) => {
    if (name === 'X') {
        const { fill, ...safeRest } = rest;
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...safeRest}>
                <Path
                    d="M6 6L18 18M18 6L6 18"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </Svg>
        );
    }

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
    };

    const IconComponent = iconMap[name];

    if (!IconComponent) {
        console.warn(`Icon "${name}" is not registered in Icon component.`);
        return null;
    }

    const { fill, ...safeRest } = rest;

    return <IconComponent color={color} size={size} {...safeRest} />;
};

export default Icon;
