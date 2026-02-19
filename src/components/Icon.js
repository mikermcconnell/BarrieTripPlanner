import React from 'react';
import ArrowUpDownIcon from 'lucide-react-native/dist/esm/icons/arrow-up-down.js';
import LocateFixedIcon from 'lucide-react-native/dist/esm/icons/locate-fixed.js';
import MapIcon from 'lucide-react-native/dist/esm/icons/map.js';
import MapPinIcon from 'lucide-react-native/dist/esm/icons/map-pin.js';
import NavigationIcon from 'lucide-react-native/dist/esm/icons/navigation.js';
import SearchIcon from 'lucide-react-native/dist/esm/icons/search.js';
import UserIcon from 'lucide-react-native/dist/esm/icons/user.js';
import XIcon from 'lucide-react-native/dist/esm/icons/x.js';
import { COLORS } from '../config/theme';

/**
 * Centralized Icon component that wraps lucide-react-native.
 * Allows passing a string `name` to render the corresponding icon.
 * Ensures consistent styling, stroke weights, and colors across the app.
 *
 * @example
 * <Icon name="Search" color={COLORS.primary} size={24} />
 */
const Icon = ({ name, color = COLORS.textPrimary, size = 24, strokeWidth = 2, ...rest }) => {
    const iconMap = {
        ArrowUpDown: ArrowUpDownIcon,
        LocateFixed: LocateFixedIcon,
        Map: MapIcon,
        MapPin: MapPinIcon,
        Navigation: NavigationIcon,
        Search: SearchIcon,
        User: UserIcon,
        X: XIcon,
    };

    const IconComponent = iconMap[name];

    if (!IconComponent) {
        console.warn(`Icon "${name}" is not registered in Icon component.`);
        return null;
    }

    return <IconComponent color={color} size={size} strokeWidth={strokeWidth} {...rest} />;
};

export default Icon;
