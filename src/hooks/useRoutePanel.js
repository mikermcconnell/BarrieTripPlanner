import { useState, useCallback } from 'react';
import { Dimensions, Platform } from 'react-native';

const isWideScreen = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.innerWidth > 768;
  }
  return Dimensions.get('window').width > 768;
};

/**
 * Hook managing expand/collapse state for the route filter panel.
 *
 * @param {Object} options
 * @param {boolean} [options.defaultExpanded] - Override default; if omitted, auto-detects from screen width
 * @param {boolean} [options.autoCollapseOnSelect=true] - Collapse when a route is selected
 * @returns {{ isExpanded: boolean, toggle: () => void, expand: () => void, collapse: () => void }}
 */
export default function useRoutePanel({
  defaultExpanded,
  autoCollapseOnSelect = true,
} = {}) {
  const initialExpanded = defaultExpanded ?? isWideScreen();
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const toggle = useCallback(() => setIsExpanded(prev => !prev), []);
  const expand = useCallback(() => setIsExpanded(true), []);
  const collapse = useCallback(() => setIsExpanded(false), []);

  return { isExpanded, toggle, expand, collapse, autoCollapseOnSelect };
}
