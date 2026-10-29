import type { UserLocation } from '../types';

export const isValidCoordinates = (location: Pick<UserLocation, 'lat' | 'lng'> | null | undefined): location is Pick<UserLocation, 'lat' | 'lng'> & { lat: number; lng: number } => (
  Boolean(location)
  && typeof location?.lat === 'number' && Number.isFinite(location.lat) && location.lat >= -90 && location.lat <= 90
  && typeof location?.lng === 'number' && Number.isFinite(location.lng) && location.lng >= -180 && location.lng <= 180
);

export const isConfirmedBusinessLocation = (location: UserLocation | null | undefined) => (
  isValidCoordinates(location) && location.verificationStatus === 'seller_confirmed'
);

export const calculateDistanceKm = (from: Pick<UserLocation, 'lat' | 'lng'>, to: Pick<UserLocation, 'lat' | 'lng'>) => {
  const radians = Math.PI / 180;
  const deltaLat = (to.lat! - from.lat!) * radians;
  const deltaLng = (to.lng! - from.lng!) * radians;
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(from.lat! * radians) * Math.cos(to.lat! * radians) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

export const NEARBY_SELLER_RADII_KM = [1, 5, 10, 25, 50] as const;
