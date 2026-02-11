import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { fetchServiceAlerts } from '../services/alertService';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';
import { getSeverityIcon, getSeverityColor, formatAlertPeriod } from '../utils/alertHelpers';

const AlertsScreen = ({ navigation }) => {
  const [alerts, setAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const loadAlerts = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchServiceAlerts();
      setAlerts(data);
    } catch (err) {
      console.error('Error loading alerts:', err);
      setError('Unable to load service alerts');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadAlerts();
  };

  const renderAlert = ({ item }) => {
    const isExpanded = expandedId === item.id;
    const severityColor = getSeverityColor(item.severity);

    return (
      <TouchableOpacity
        style={[styles.alertCard, { borderLeftColor: severityColor }]}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.alertHeader}>
          <View style={[styles.iconContainer, { backgroundColor: severityColor + '20' }]}>
            <Text style={styles.icon}>{getSeverityIcon(item.severity)}</Text>
          </View>
          <View style={styles.headerContent}>
            <Text style={styles.alertTitle}>{item.title}</Text>
            {item.effect && (
              <View style={[styles.effectBadge, { backgroundColor: severityColor + '20' }]}>
                <Text style={[styles.effectText, { color: severityColor }]}>{item.effect}</Text>
              </View>
            )}
          </View>
          <Text style={styles.chevron}>{isExpanded ? '▼' : '▶'}</Text>
        </View>

        {isExpanded && (
          <View style={styles.alertDetails}>
            {item.description && (
              <Text style={styles.description}>{item.description}</Text>
            )}

            {item.cause && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Cause:</Text>
                <Text style={styles.detailValue}>{item.cause}</Text>
              </View>
            )}

            {item.activePeriods?.length > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Period:</Text>
                <Text style={styles.detailValue}>
                  {formatAlertPeriod(item.activePeriods[0])}
                </Text>
              </View>
            )}

            {item.affectedRoutes?.length > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Affected Routes:</Text>
                <View style={styles.routesContainer}>
                  {item.affectedRoutes.map((route, index) => (
                    <View key={index} style={styles.routeBadge}>
                      <Text style={styles.routeText}>{route}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {item.affectedStops?.length > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Affected Stops:</Text>
                <Text style={styles.detailValue}>
                  {item.affectedStops.length} stop{item.affectedStops.length > 1 ? 's' : ''}
                </Text>
              </View>
            )}

            {item.url && (
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => Linking.openURL(item.url)}
              >
                <Text style={styles.linkText}>More Information →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Service Alerts</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading alerts...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Service Alerts</Text>
        <View style={styles.placeholder} />
      </View>

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={renderAlert}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyText}>No active alerts</Text>
            <Text style={styles.emptySubtext}>All services are running normally</Text>
          </View>
        }
        ListHeaderComponent={
          alerts.length > 0 ? (
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderText}>
                {alerts.length} active alert{alerts.length > 1 ? 's' : ''}
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.textPrimary,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  placeholder: {
    width: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  listHeader: {
    marginBottom: SPACING.sm,
  },
  listHeaderText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  alertCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    borderLeftWidth: 4,
    ...SHADOWS.small,
    overflow: 'hidden',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  icon: {
    fontSize: 20,
  },
  headerContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  effectBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  effectText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 12,
    color: COLORS.grey400,
    marginLeft: SPACING.sm,
  },
  alertDetails: {
    padding: SPACING.md,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  description: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.xs,
  },
  detailLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    width: 100,
  },
  detailValue: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
  },
  routesContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  routeBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  routeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  linkText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
});

export default AlertsScreen;
