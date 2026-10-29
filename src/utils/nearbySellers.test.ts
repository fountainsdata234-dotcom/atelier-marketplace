import { describe, expect, it } from 'vitest';
import { calculateDistanceKm, isConfirmedBusinessLocation, isValidCoordinates } from './nearbySellers';

describe('nearby seller geolocation', () => {
  it('calculates real geographic distance and keeps latitude/longitude order', () => {
    const lagos = { lat: 6.5244, lng: 3.3792 };
    const nearbyLagos = { lat: 6.5694, lng: 3.3841 };
    expect(calculateDistanceKm(lagos, nearbyLagos)).toBeGreaterThan(4.5);
    expect(calculateDistanceKm(lagos, nearbyLagos)).toBeLessThan(5.5);
    expect(calculateDistanceKm(lagos, { lat: 51.5072, lng: -0.1276 })).toBeGreaterThan(5_000);
  });

  it('requires valid, explicitly seller-confirmed coordinates for a business marker', () => {
    expect(isValidCoordinates({ lat: 0, lng: 0 })).toBe(true);
    expect(isValidCoordinates({ lat: 91, lng: 0 })).toBe(false);
    expect(isConfirmedBusinessLocation({ country: 'Nigeria', state: 'Abia', city: 'Aba', lat: 5.1, lng: 7.3 })).toBe(false);
    expect(isConfirmedBusinessLocation({
      country: 'Nigeria', state: 'Abia', city: 'Aba', lat: 5.1, lng: 7.3, verificationStatus: 'seller_confirmed',
    })).toBe(true);
  });
});
