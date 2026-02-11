import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING, BORDER_RADIUS, SHADOWS } from '../config/theme';

// Import screens
import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import TripDetailsScreen from '../screens/TripDetailsScreen';
import NavigationScreen from '../screens/NavigationScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NearbyStopsScreen from '../screens/NearbyStopsScreen';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import AlertsScreen from '../screens/AlertsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

// SVG Icon Components for better visual quality
const MapIcon = ({ size = 24, color, focused }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M20.5 3L20.34 3.03L15 5.1L9 3L3.36 4.9C3.15 4.97 3 5.15 3 5.38V20.5C3 20.78 3.22 21 3.5 21L3.66 20.97L9 18.9L15 21L20.64 19.1C20.85 19.03 21 18.85 21 18.62V3.5C21 3.22 20.78 3 20.5 3ZM15 19L9 16.89V5L15 7.11V19Z"
      fill={color}
      fillOpacity={focused ? 1 : 0.7}
    />
  </Svg>
);

const SearchIcon = ({ size = 24, color, focused }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z"
      fill={color}
      fillOpacity={focused ? 1 : 0.7}
    />
  </Svg>
);

const ProfileIcon = ({ size = 24, color, focused }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z"
      fill={color}
      fillOpacity={focused ? 1 : 0.7}
    />
  </Svg>
);

// Tab Icon Component with indicator
const TabIcon = ({ name, focused, color }) => {
  const iconProps = { size: 26, color, focused };

  const icons = {
    Map: <MapIcon {...iconProps} />,
    Search: <SearchIcon {...iconProps} />,
    Profile: <ProfileIcon {...iconProps} />,
  };

  return (
    <View style={styles.iconContainer}>
      {focused && <View style={styles.activeIndicator} />}
      <View style={[styles.iconWrapper, focused && styles.iconWrapperFocused]}>
        {icons[name]}
      </View>
    </View>
  );
};

// Map Stack Navigator (includes trip details for integrated trip planning)
const MapStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MapMain" component={HomeScreen} />
    <Stack.Screen name="NearbyStops" component={NearbyStopsScreen} />
    <Stack.Screen name="Alerts" component={AlertsScreen} />
    <Stack.Screen name="TripDetails" component={TripDetailsScreen} />
    <Stack.Screen
      name="Navigation"
      component={NavigationScreen}
      options={{
        presentation: 'fullScreenModal',
        gestureEnabled: false,
      }}
    />
  </Stack.Navigator>
);

// Profile Stack Navigator
const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ProfileMain" component={ProfileScreen} />
    <Stack.Screen name="SignIn" component={SignInScreen} />
    <Stack.Screen name="SignUp" component={SignUpScreen} />
    <Stack.Screen name="Favorites" component={FavoritesScreen} />
    <Stack.Screen name="Settings" component={SettingsScreen} />
  </Stack.Navigator>
);

// Main Tab Navigator
const MainTabs = () => {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => (
          <TabIcon name={route.name} focused={focused} color={color} />
        ),
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.grey500,
        tabBarStyle: {
          ...styles.tabBar,
          height: 72 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
        },
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="Map"
        component={MapStack}
        options={{
          tabBarLabel: 'Map',
        }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{
          tabBarLabel: 'Search',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
};

// Export the main navigator
const TabNavigator = () => {
  return <MainTabs />;
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.grey200,
    paddingTop: 10,
    paddingHorizontal: SPACING.xxl,
    // Web-specific premium shadow
    ...(Platform.OS === 'web' && {
      boxShadow: '0 -2px 20px rgba(23, 43, 77, 0.06)',
      backdropFilter: 'blur(16px)',
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      borderTopWidth: 0,
    }),
  },
  tabBarLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: 4,
    marginBottom: 6,
    letterSpacing: 0.1,
  },
  tabBarItem: {
    paddingTop: 2,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: 60,
    height: 38,
  },
  activeIndicator: {
    position: 'absolute',
    top: -8,
    width: 36,
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    // Web-specific glow effect
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 8px rgba(76, 175, 80, 0.25)',
    }),
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 38,
    borderRadius: BORDER_RADIUS.lg,
  },
  iconWrapperFocused: {
    backgroundColor: COLORS.primarySubtle,
    // Web-specific subtle shadow
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 8px rgba(76, 175, 80, 0.12)',
    }),
  },
});

export default TabNavigator;
