import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
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
import NewsScreen from '../screens/NewsScreen';
import SurveyScreen from '../screens/SurveyScreen';
import SurveyResultsScreen from '../screens/SurveyResultsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

// Tab Icon Component with indicator
const TabIcon = ({ name, focused, color }) => {
  const iconProps = { size: 26, color, strokeWidth: focused ? 2.5 : 2 };

  const icons = {
    Map: <Icon name="Map" {...iconProps} />,
    Search: <Icon name="Search" {...iconProps} />,
    Profile: <Icon name="User" {...iconProps} />,
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
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="MapMain" component={HomeScreen} />
    <Stack.Screen name="NearbyStops" component={NearbyStopsScreen} options={{ animation: 'slide_from_bottom' }} />
    <Stack.Screen name="Alerts" component={AlertsScreen} options={{ animation: 'slide_from_bottom' }} />
    <Stack.Screen name="TripDetails" component={TripDetailsScreen} />
    <Stack.Screen
      name="Navigation"
      component={NavigationScreen}
      options={{
        presentation: 'fullScreenModal',
        gestureEnabled: false,
        animation: 'fade',
      }}
    />
  </Stack.Navigator>
);

// Profile Stack Navigator
const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="ProfileMain" component={ProfileScreen} />
    <Stack.Screen name="SignIn" component={SignInScreen} options={{ animation: 'slide_from_bottom' }} />
    <Stack.Screen name="SignUp" component={SignUpScreen} options={{ animation: 'slide_from_bottom' }} />
    <Stack.Screen name="Favorites" component={FavoritesScreen} />
    <Stack.Screen name="Settings" component={SettingsScreen} />
    <Stack.Screen name="News" component={NewsScreen} />
    <Stack.Screen name="Survey" component={SurveyScreen} />
    <Stack.Screen name="SurveyResults" component={SurveyResultsScreen} />
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
