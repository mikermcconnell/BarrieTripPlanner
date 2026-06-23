import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { View, Text, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING, BORDER_RADIUS, SHADOWS } from '../config/theme';
import { useAndroidBottomChromeLift, useSafeBottomInset } from '../utils/androidNavigationBar';
import { getDesktopTabBarStyle, isWideWebViewport } from '../utils/webLayout';

import HomeScreen from '../screens/HomeScreen';

const getSearchScreen = () => require('../screens/SearchScreen').default;
const getTripDetailsScreen = () => require('../screens/TripDetailsScreen').default;
const getNavigationScreen = () => require('../screens/NavigationScreen').default;
const getProfileScreen = () => require('../screens/ProfileScreen').default;
const getSignInScreen = () => require('../screens/SignInScreen').default;
const getSignUpScreen = () => require('../screens/SignUpScreen').default;
const getAccountScreen = () => require('../screens/AccountScreen').default;
const getFavoritesScreen = () => require('../screens/FavoritesScreen').default;
const getTripHistoryScreen = () => require('../screens/TripHistoryScreen').default;
const getAlertsScreen = () => require('../screens/AlertsScreen').default;
const getSettingsScreen = () => require('../screens/SettingsScreen').default;
const getNewsScreen = () => require('../screens/NewsScreen').default;
const getSurveyScreen = () => require('../screens/SurveyScreen').default;
const getSurveyResultsScreen = () => require('../screens/SurveyResultsScreen').default;

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

// Tab Icon Component with indicator
const TabIcon = ({ name, focused, color }) => {
  const iconProps = { size: 26, color, strokeWidth: focused ? 2.5 : 1.5 };

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
    <Stack.Screen name="Alerts" getComponent={getAlertsScreen} options={{ animation: 'slide_from_bottom' }} />
    <Stack.Screen name="TripDetails" getComponent={getTripDetailsScreen} />
    <Stack.Screen
      name="Navigation"
      getComponent={getNavigationScreen}
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
    <Stack.Screen name="ProfileMain" getComponent={getProfileScreen} />
    <Stack.Screen name="SignIn" getComponent={getSignInScreen} options={{ animation: 'slide_from_bottom' }} />
    <Stack.Screen name="SignUp" getComponent={getSignUpScreen} options={{ animation: 'slide_from_bottom' }} />
    <Stack.Screen name="Account" getComponent={getAccountScreen} />
    <Stack.Screen name="Favorites" getComponent={getFavoritesScreen} />
    <Stack.Screen name="TripHistory" getComponent={getTripHistoryScreen} />
    <Stack.Screen name="Settings" getComponent={getSettingsScreen} />
    <Stack.Screen name="News" getComponent={getNewsScreen} />
    <Stack.Screen name="Survey" getComponent={getSurveyScreen} />
    <Stack.Screen name="SurveyResults" getComponent={getSurveyResultsScreen} />
  </Stack.Navigator>
);

// Main Tab Navigator
const MainTabs = () => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWideWeb = isWideWebViewport({ platform: Platform.OS, width });
  const bottomInset = useSafeBottomInset(insets.bottom);
  const bottomChromeLift = useAndroidBottomChromeLift();
  const tabBarPaddingBottom = Math.max(bottomInset, 10);
  const visibleTabBarStyle = {
    ...styles.tabBar,
    ...(isWideWeb
      ? {
          ...styles.tabBarDesktop,
          ...getDesktopTabBarStyle({ isWideWeb }),
        }
      : {
          height: 72 + bottomInset,
          marginBottom: bottomChromeLift,
          paddingBottom: tabBarPaddingBottom,
        }),
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => (
          <TabIcon name={route.name} focused={focused} color={color} />
        ),
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.grey500,
        tabBarStyle: visibleTabBarStyle,
        tabBarPosition: isWideWeb ? 'left' : 'bottom',
        tabBarLabelPosition: isWideWeb ? 'beside-icon' : 'below-icon',
        tabBarLabelStyle: [styles.tabBarLabel, isWideWeb && styles.tabBarLabelDesktop],
        tabBarItemStyle: [styles.tabBarItem, isWideWeb && styles.tabBarItemDesktop],
        headerShown: false,
        freezeOnBlur: Platform.OS === 'web',
      })}
    >
      <Tab.Screen
        name="Map"
        component={MapStack}
        options={({ route }) => {
          const nestedRouteName = getFocusedRouteNameFromRoute(route) ?? 'MapMain';
          const hideTabBar = nestedRouteName === 'Navigation';

          return {
            tabBarLabel: 'Map',
            tabBarStyle: hideTabBar ? { display: 'none' } : visibleTabBarStyle,
          };
        }}
      />
      <Tab.Screen
        name="Search"
        getComponent={getSearchScreen}
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
    borderTopWidth: 0,
    paddingTop: 10,
    paddingHorizontal: SPACING.xxl,
    ...SHADOWS.medium,
    // Web-specific premium shadow
    ...(Platform.OS === 'web' && {
      boxShadow: '0 -2px 20px rgba(23, 43, 77, 0.06)',
      backdropFilter: 'blur(16px)',
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
    }),
  },
  tabBarDesktop: {
    borderTopWidth: 0,
    borderRadius: 0,
    alignItems: 'stretch',
  },
  tabBarLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: 4,
    marginBottom: 6,
    letterSpacing: 0.1,
  },
  tabBarLabelDesktop: {
    marginTop: 0,
    marginBottom: 0,
    fontSize: FONT_SIZES.md,
  },
  tabBarItem: {
    paddingTop: 2,
  },
  tabBarItemDesktop: {
    minHeight: 56,
    borderRadius: BORDER_RADIUS.lg,
    marginVertical: 4,
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
    width: 24,
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 1.5,
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
