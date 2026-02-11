/**
 * Shared helper functions for service alerts
 * Consolidates duplicate functions from AlertBanner and AlertsScreen
 */

import { COLORS } from '../config/theme';

/**
 * Get severity icon based on severity level
 * @param {string} severity - 'high', 'medium', or 'low'
 * @returns {string} Emoji icon
 */
export const getSeverityIcon = (severity) => {
  switch (severity) {
    case 'high':
      return String.fromCodePoint(0x1F6A8); // Police car light emoji
    case 'medium':
      return String.fromCodePoint(0x26A0, 0xFE0F); // Warning emoji
    default:
      return String.fromCodePoint(0x2139, 0xFE0F); // Info emoji
  }
};

/**
 * Get severity color based on severity level
 * @param {string} severity - 'high', 'medium', or 'low'
 * @returns {string} Color value
 */
export const getSeverityColor = (severity) => {
  switch (severity) {
    case 'high':
      return COLORS.error;
    case 'medium':
      return COLORS.warning;
    default:
      return COLORS.info;
  }
};

/**
 * Get severity styles including icon and colors
 * @param {string} severity - 'high', 'medium', or 'low'
 * @returns {Object} { icon, color }
 */
export const getSeverityStyles = (severity) => ({
  icon: getSeverityIcon(severity),
  color: getSeverityColor(severity),
});

/**
 * Format alert active period to readable string
 * @param {Object} period - { start, end } timestamps
 * @returns {string} Formatted period string
 */
export const formatAlertPeriod = (period) => {
  const formatDate = (timestamp) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const start = formatDate(period.start);
  const end = formatDate(period.end);

  if (start && end) return `${start} - ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return 'Ongoing';
};
