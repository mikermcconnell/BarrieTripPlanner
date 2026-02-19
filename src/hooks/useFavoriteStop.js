/**
 * useFavoriteStop — Shared logic for FavoriteStopCard across platforms.
 *
 * Returns the favorite stop, arrivals data, and visibility state.
 * Only polls when the Map tab is focused.
 */
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useStopArrivals } from './useStopArrivals';

export const useFavoriteStop = () => {
  const { favorites } = useAuth();
  const isFocused = useIsFocused();

  const favoriteStop = favorites.stops.length > 0 ? favorites.stops[0] : null;
  const stop = isFocused && favoriteStop ? favoriteStop : null;
  const { arrivals, isLoading } = useStopArrivals(stop);

  const isVisible = !!favoriteStop && (isLoading || arrivals.length > 0);
  const nextArrivals = arrivals.slice(0, 2);

  return { favoriteStop, nextArrivals, isLoading, isVisible };
};
