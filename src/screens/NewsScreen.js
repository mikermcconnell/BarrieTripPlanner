import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Linking,
} from 'react-native';
import { useTransit } from '../context/TransitContext';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../config/theme';

function formatDate(timestamp) {
  if (!timestamp) return null;
  // timestamp is epoch ms from the backend
  if (typeof timestamp === 'number') {
    return new Date(timestamp).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  return String(timestamp);
}

const NewsScreen = ({ navigation }) => {
  const { transitNews } = useTransit();
  const [expandedId, setExpandedId] = useState(null);

  const renderNewsItem = ({ item }) => {
    const isExpanded = expandedId === item.id;

    return (
      <TouchableOpacity
        style={styles.newsCard}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.newsHeader}>
          <View style={styles.headerContent}>
            <Text style={styles.newsTitle}>{item.title}</Text>
            {(item.date || item.publishedAt) && (
              <Text style={styles.newsDate}>
                {item.date || formatDate(item.publishedAt)}
              </Text>
            )}
          </View>
          <Text style={styles.chevron}>{isExpanded ? '\u25BC' : '\u25B6'}</Text>
        </View>

        {item.affectedRoutes?.length > 0 && (
          <View style={styles.routesRow}>
            {item.affectedRoutes.map((route) => (
              <View key={route} style={styles.routeBadge}>
                <Text style={styles.routeText}>Route {route}</Text>
              </View>
            ))}
          </View>
        )}

        {isExpanded && (
          <View style={styles.newsDetails}>
            {item.body ? (
              <Text style={styles.newsBody}>{item.body}</Text>
            ) : (
              <Text style={styles.noBody}>No additional details available.</Text>
            )}

            {item.url && (
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => Linking.openURL(item.url)}
              >
                <Text style={styles.linkText}>View on myridebarrie.ca →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>{'\u2190'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transit News</Text>
        <View style={styles.placeholder} />
      </View>

      <FlatList
        data={transitNews}
        keyExtractor={(item) => item.id}
        renderItem={renderNewsItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>{'\uD83D\uDCF0'}</Text>
            <Text style={styles.emptyText}>No transit news right now</Text>
            <Text style={styles.emptySubtext}>
              Check back later for updates from Barrie Transit
            </Text>
          </View>
        }
        ListHeaderComponent={
          transitNews.length > 0 ? (
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderText}>
                {transitNews.length} news item{transitNews.length !== 1 ? 's' : ''}
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
  newsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.small,
    overflow: 'hidden',
  },
  newsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },
  headerContent: {
    flex: 1,
  },
  newsTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  newsDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  chevron: {
    fontSize: 12,
    color: COLORS.grey400,
    marginLeft: SPACING.sm,
  },
  routesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
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
  newsDetails: {
    padding: SPACING.md,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  newsBody: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    lineHeight: 20,
    marginTop: SPACING.sm,
  },
  noBody: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: SPACING.sm,
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
    textAlign: 'center',
  },
});

export default NewsScreen;
