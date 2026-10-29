import React, { useState } from 'react';
import { CheckCircle2, LocateFixed, MapPin } from 'lucide-react';
import type { User, UserLocation } from '../types';
import { api } from '../services/api';
import { storageService } from '../services/storage';
import { safeCustomerErrorMessage } from '../utils/customerMessages';

interface SellerLocationSetupProps {
  currentUser: User;
  isDarkMode: boolean;
}

const isSeller = (user: User) => user.role === 'tailor' || user.role === 'fabric_seller';

export const SellerLocationSetup: React.FC<SellerLocationSetupProps> = ({ currentUser, isDarkMode }) => {
  const [candidate, setCandidate] = useState<{ location: UserLocation; confirmationToken: string } | null>(null);
  const [businessAddress, setBusinessAddress] = useState(currentUser.location.businessAddress || '');
  const [confirmed, setConfirmed] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null);
  if (!isSeller(currentUser)) return null;

  const detectShopLocation = () => {
    setStatus(null);
    setCandidate(null);
    setConfirmed(false);
    if (!navigator.geolocation) {
      setStatus({ message: 'Location detection is not supported on this device. Enable location services or try a supported browser.', isError: true });
      return;
    }

    setIsDetecting(true);
    navigator.geolocation.getCurrentPosition(async position => {
      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(accuracy) || accuracy > 200) {
        setStatus({ message: `Your device accuracy is about ${Math.round(accuracy)} m. Move outdoors or closer to your shop and retry; we need a reading within 200 m.`, isError: true });
        setIsDetecting(false);
        return;
      }
      try {
        const result = await api.reverseGeocodeBusinessLocation({
          lat: latitude,
          lng: longitude,
          accuracyMeters: accuracy,
        });
        setCandidate({ location: result.location, confirmationToken: result.confirmationToken });
        setBusinessAddress(result.location.businessAddress || '');
        setStatus({
          message: `Position detected with about ${Math.round(accuracy)} m accuracy. Review the map and address, and confirm only if this is your actual shop.`,
          isError: false,
        });
      } catch (error) {
        setStatus({ message: safeCustomerErrorMessage(error, 'The detected point could not be matched to an address. Please retry.'), isError: true });
      } finally {
        setIsDetecting(false);
      }
    }, error => {
      const message = error.code === error.PERMISSION_DENIED
        ? 'Location permission was denied. Allow location access in your device settings and try again.'
        : error.code === error.TIMEOUT
          ? 'Your device took too long to find a precise position. Move outdoors and retry.'
          : 'Your device could not determine a location. Check that location services are enabled and retry.';
      setStatus({ message, isError: true });
      setIsDetecting(false);
    }, {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 0,
    });
  };

  const saveBusinessLocation = async () => {
    if (!candidate || !confirmed || !businessAddress.trim()) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const location = await api.saveBusinessLocation(candidate.confirmationToken, businessAddress.trim());
      const updatedUser = storageService.updateUser(currentUser.id, { location });
      if (updatedUser) window.dispatchEvent(new CustomEvent('atelier_auth_changed', { detail: updatedUser }));
      setCandidate(null);
      setConfirmed(false);
      setStatus({ message: 'Your confirmed shop location is saved and now available for nearby discovery and directions.', isError: false });
    } catch (error) {
      setStatus({ message: safeCustomerErrorMessage(error, 'Your shop location could not be saved. Please try again.'), isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  const shownLocation = candidate?.location || currentUser.location;
  const hasCoordinates = typeof shownLocation.lat === 'number' && typeof shownLocation.lng === 'number';
  const mapUrl = hasCoordinates
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${shownLocation.lng! - 0.012}%2C${shownLocation.lat! - 0.009}%2C${shownLocation.lng! + 0.012}%2C${shownLocation.lat! + 0.009}&layer=mapnik&marker=${shownLocation.lat}%2C${shownLocation.lng}`
    : '';
  const surface = isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white';
  const isLocationConfirmed = currentUser.location.verificationStatus === 'seller_confirmed' && hasCoordinates;

  return (
    <section className={`mt-6 rounded-2xl border p-4 sm:p-6 ${surface}`} aria-labelledby="seller-location-title">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">Seller location setup</p>
          <h2 id="seller-location-title" className="mt-1 text-lg font-bold">Confirm your shop on the map</h2>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            Detect your position while you are physically at your business. Your phone location is never assumed to be your shop. The confirmed business pin and address will be public so customers can find you and request directions.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={detectShopLocation}
          disabled={isDetecting || isSaving}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-neutral-950 transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60"
        >
          <LocateFixed className={`h-4 w-4 ${isDetecting ? 'animate-pulse' : ''}`} />
          {isDetecting ? 'Detecting precise position…' : isLocationConfirmed ? 'Update shop location' : 'Detect my shop location'}
        </button>
        {isLocationConfirmed && !candidate && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Seller-confirmed location</span>
        )}
      </div>

      {status && <p className={`mt-3 text-xs leading-relaxed ${status.isError ? 'text-red-300' : 'text-emerald-300'}`} role={status.isError ? 'alert' : 'status'}>{status.message}</p>}

      {hasCoordinates && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(16rem,0.7fr)]">
          <div className="overflow-hidden rounded-xl border border-neutral-700">
            <iframe
              title="Map preview of detected business location"
              src={mapUrl}
              className="h-64 w-full border-0 sm:h-80"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            <a
              href={`https://www.openstreetmap.org/?mlat=${shownLocation.lat}&mlon=${shownLocation.lng}#map=18/${shownLocation.lat}/${shownLocation.lng}`}
              target="_blank"
              rel="noreferrer"
              className="block border-t border-neutral-700 px-3 py-2 text-[10px] text-amber-300"
            >
              OpenStreetMap · {shownLocation.lat!.toFixed(6)}, {shownLocation.lng!.toFixed(6)}
            </a>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-neutral-700 bg-neutral-950/30 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Detected address</p>
              <p className="mt-1 text-xs leading-relaxed">{candidate?.location.businessAddress || shownLocation.businessAddress || 'Address is not available. Detect the location again to retrieve it.'}</p>
              <p className="mt-2 text-[10px] text-neutral-500">
                {[shownLocation.city, shownLocation.state, shownLocation.country].filter(Boolean).join(', ')}
              </p>
              {typeof (candidate?.location.accuracyMeters || shownLocation.accuracyMeters) === 'number' && (
                <p className="mt-2 text-[10px] text-emerald-300">Device accuracy: about {Math.round(candidate?.location.accuracyMeters || shownLocation.accuracyMeters || 0)} m</p>
              )}
            </div>
            {candidate && (
              <>
                <label className="block text-xs font-semibold" htmlFor="seller-business-address">
                  Business address (correct wording if needed)
                  <input
                    id="seller-business-address"
                    value={businessAddress}
                    onChange={event => setBusinessAddress(event.target.value)}
                    maxLength={300}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white"
                    autoComplete="street-address"
                  />
                </label>
                <label className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-relaxed">
                  <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-0.5 accent-amber-400" />
                  <span>I am at this actual business location, have checked the map and address, and agree to show its pin and address to customers.</span>
                </label>
                <button
                  type="button"
                  onClick={() => void saveBusinessLocation()}
                  disabled={!confirmed || !businessAddress.trim() || isSaving}
                  className="w-full rounded-xl bg-amber-400 px-4 py-3 text-xs font-bold text-neutral-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? 'Saving confirmed shop location…' : 'Confirm and save shop location'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
