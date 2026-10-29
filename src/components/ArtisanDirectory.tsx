import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, MapPin, Navigation, Search } from 'lucide-react';
import { ClothPost, LocationCity, LocationCountry, LocationRegion, NearbySellerMatch, User } from '../types';
import { findExactArtisanMatch, getSearchSuggestions } from '../utils/globe';
import { countSellerAccounts, matchesLocationFilter } from '../utils/artisanFilters';
import { calculateDistanceKm, isConfirmedBusinessLocation, NEARBY_SELLER_RADII_KM } from '../utils/nearbySellers';
import { resolveSellerMapLocation } from '../data/worldData';
import type { GlobeArtisan } from './ArtisanGlobe3D';
import { api } from '../services/api';
import { SearchableLocationField } from './SearchableLocationField';
import { isAvailableMarketplaceListing } from '../utils/marketplaceAvailability';

const ArtisanGlobe3D = lazy(() => import('./ArtisanGlobe3D').then(module => ({ default: module.ArtisanGlobe3D })));

type DirectorySeller = User & {
  location: User['location'];
  distanceKm: number | null;
  postCount: number;
  portfolioCount: number;
  latestPost?: ClothPost;
  listingTags: string[];
  specializations: string[];
  minimumPrice: number | null;
  maximumPrice: number | null;
  currency: string | null;
  priceUnit: string | null;
  minimumOrder: number | null;
  leadTimeDays: number | null;
  availability: string[];
};

const getDiscoveryTerms = (post: ClothPost): string[] => {
  const details = post.listingDetails;
  const detailTerms = details && 'material' in details
    ? [details.material, details.pattern, details.colour, details.priceUnit]
    : details && 'garmentType' in details
      ? [details.garmentType, ...(details.customizationOptions || []), ...(details.sizes || [])]
      : [];
  return [
    ...(Array.isArray(post.tags) ? post.tags : []),
    ...detailTerms,
  ].filter((term): term is string => typeof term === 'string' && Boolean(term.trim()));
};

const getLeadTime = (post: ClothPost): number | null => {
  const details = post.listingDetails;
  return details && 'leadTimeDays' in details && typeof details.leadTimeDays === 'number'
    ? details.leadTimeDays
    : null;
};

const matchesServiceType = (post: ClothPost, serviceType: string): boolean => {
  const details = post.listingDetails;
  const fulfilment = details && 'fulfilment' in details ? details.fulfilment : undefined;
  if (serviceType === 'made_to_order') return fulfilment === 'made_to_order';
  if (serviceType === 'ready_made') return fulfilment === 'ready_made';
  return post.listingType === 'FABRIC';
};

interface ArtisanDirectoryProps {
  users: User[];
  sellerDirectoryDataStatus: 'loading' | 'ready' | 'error';
  posts: ClothPost[];
  currentUser: User | null;
  onSelectArtisan: (artisan: User) => void;
  isDarkMode: boolean;
}

export const ArtisanDirectory: React.FC<ArtisanDirectoryProps> = ({ users, sellerDirectoryDataStatus, posts, currentUser, onSelectArtisan, isDarkMode }) => {
  const availablePostsBySeller = useMemo(() => {
    const postsBySeller = new Map<string, ClothPost[]>();
    posts.forEach(post => {
      if (!isAvailableMarketplaceListing(post)) return;
      const sellerPosts = postsBySeller.get(post.authorId) ?? [];
      sellerPosts.push(post);
      postsBySeller.set(post.authorId, sellerPosts);
    });
    return postsBySeller;
  }, [posts]);

  const [nearMeOnly, setNearMeOnly] = useState(false);
  const [customerSearchLocation, setCustomerSearchLocation] = useState<{ lat: number; lng: number; accuracyMeters: number } | null>(null);
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState<number>(5);
  const [nearbyMatches, setNearbyMatches] = useState<NearbySellerMatch[]>([]);
  const [nearbySearchStatus, setNearbySearchStatus] = useState('');
  const [isNearbySearchLoading, setIsNearbySearchLoading] = useState(false);
  const nearbySellerIds = useMemo(() => new Set(nearbyMatches.map(match => match.sellerId)), [nearbyMatches]);

  const artisans = useMemo(() => {
    return users.filter((user) => !user.isBlocked
      && Boolean(user.name.trim() || user.shopName?.trim())
      && (user.role === 'tailor' || user.role === 'fabric_seller'))
      .map((user): DirectorySeller => {
        const userPosts = availablePostsBySeller.get(user.id) ?? [];
        const latestPost = [...userPosts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        const baseLocation = user.location ?? { city: 'Unknown city', state: 'Unknown', country: 'Unknown' };
        const distanceKm = customerSearchLocation && isConfirmedBusinessLocation(baseLocation)
          ? calculateDistanceKm(customerSearchLocation, baseLocation)
          : null;
        const pricedPosts = userPosts.filter(post => typeof post.priceMin === 'number' && post.priceMin >= 0);
        const pricingKeys = Array.from(new Set(pricedPosts.map(post => {
          const details = post.listingDetails;
          const unit = details && 'priceUnit' in details ? details.priceUnit : '';
          return `${post.currency || ''}:${post.listingType || ''}:${unit || 'unitless'}`;
        })));
        const comparablePricedPosts = pricingKeys.length === 1 ? pricedPosts : [];
        const currencies = Array.from(new Set(comparablePricedPosts.map(post => post.currency).filter((value): value is string => Boolean(value))));
        const priceUnits = Array.from(new Set(comparablePricedPosts.map(post => {
          const details = post.listingDetails;
          return details && 'priceUnit' in details ? details.priceUnit : null;
        }).filter((value): value is Exclude<typeof value, null> => Boolean(value))));
        const orderedPrices = comparablePricedPosts.map(post => Number(post.priceMin)).sort((a, b) => a - b);
        const orderedMaximumPrices = comparablePricedPosts.map(post => Number(post.priceMax ?? post.priceMin)).sort((a, b) => a - b);
        const minimumOrders = userPosts.map(post => {
          const details = post.listingDetails;
          return details && 'minimumOrder' in details && typeof details.minimumOrder === 'number' ? details.minimumOrder : null;
        }).filter((value): value is number => value !== null).sort((a, b) => a - b);

        return {
          ...user,
          location: baseLocation,
          distanceKm,
          postCount: userPosts.length,
          portfolioCount: userPosts.filter(post => Boolean(post.imageUrl?.trim() || post.imageAssets?.length)).length,
          latestPost,
          listingTags: Array.from(new Set(userPosts.flatMap(getDiscoveryTerms))),
          specializations: Array.from(new Set(userPosts.flatMap(getDiscoveryTerms))),
          minimumPrice: orderedPrices[0] ?? null,
          maximumPrice: orderedMaximumPrices.at(-1) ?? null,
          currency: currencies.length === 1 ? currencies[0] : null,
          priceUnit: priceUnits.length === 1 ? priceUnits[0] ?? null : null,
          minimumOrder: minimumOrders[0] ?? null,
          leadTimeDays: userPosts.map(getLeadTime).filter((days): days is number => days !== null).sort((a, b) => a - b)[0] ?? null,
          availability: Array.from(new Set(userPosts.map(post => post.availability).filter((value): value is Exclude<typeof value, undefined> => Boolean(value)))),
        };
      });
  }, [availablePostsBySeller, customerSearchLocation, users]);

  const [resolvedLocationsById, setResolvedLocationsById] = useState<Map<string, User['location']>>(() => new Map());
  const globeArtisans = useMemo(() => {
    return artisans.flatMap((artisan): GlobeArtisan[] => {
      const resolvedLocation = resolvedLocationsById.get(artisan.id)
        || resolveSellerMapLocation(artisan.location)
        || artisan.location;
      if (typeof resolvedLocation.lat !== 'number' || typeof resolvedLocation.lng !== 'number') return [];
      return [{
        ...artisan,
        location: resolvedLocation,
        distanceKm: customerSearchLocation
          ? calculateDistanceKm(customerSearchLocation, resolvedLocation)
          : null,
      }];
    });
  }, [artisans, customerSearchLocation, resolvedLocationsById]);
  const [locationCountries, setLocationCountries] = useState<LocationCountry[]>([]);
  const [locationRegions, setLocationRegions] = useState<LocationRegion[]>([]);
  const [locationCities, setLocationCities] = useState<LocationCity[]>([]);
  const [globeNearViewport, setGlobeNearViewport] = useState(false);
  const [locationDataError, setLocationDataError] = useState(false);
  const globePanelRef = useRef<HTMLElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [filterCountry, setFilterCountry] = useState('all');
  const [filterState, setFilterState] = useState('all');
  const [filterCity, setFilterCity] = useState('all');
  const [specializationFilter, setSpecializationFilter] = useState('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [minimumPriceFilter, setMinimumPriceFilter] = useState('');
  const [maximumPriceFilter, setMaximumPriceFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [selectedArtisanId, setSelectedArtisanId] = useState<string | null>(null);
  const [countrySearch, setCountrySearch] = useState('');
  const [stateSearch, setStateSearch] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [exactAreaSearch, setExactAreaSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    void api.getLocationCountries().then((countries: LocationCountry[]) => {
      if (!cancelled) setLocationCountries(countries);
    }).catch((error: unknown) => {
      console.error('Artisan directory country filters could not be loaded.', error);
      if (!cancelled) setLocationDataError(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (filterCountry === 'all' || !locationCountries.some(country => country.code === filterCountry)) {
      setLocationRegions([]);
      setLocationCities([]);
      return;
    }
    let cancelled = false;
    void api.getLocationRegions(filterCountry).then((regions: LocationRegion[]) => {
      if (!cancelled) setLocationRegions(regions);
    }).catch((error: unknown) => {
      console.error('Artisan directory regions could not be loaded.', error);
      if (!cancelled) setLocationDataError(true);
    });
    return () => { cancelled = true; };
  }, [filterCountry]);

  useEffect(() => {
    const selectedRegion = locationRegions.find(region => region.code === filterState || region.name === filterState);
    if (filterCountry === 'all' || filterCountry === '__invalid__' || !selectedRegion) {
      setLocationCities([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void api.searchLocationCities(filterCountry, selectedRegion.code, citySearch.trim()).then((cities: LocationCity[]) => {
        if (!cancelled) setLocationCities(cities);
      }).catch((error: unknown) => {
        console.error('Artisan directory city suggestions could not be loaded.', error);
        if (!cancelled) setLocationDataError(true);
      });
    }, citySearch.trim() ? 180 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [citySearch, filterCountry, filterState, locationRegions]);

  useEffect(() => {
    if (artisans.length === 0) {
      setResolvedLocationsById(new Map());
      return;
    }
    let active = true;
    void api.resolveMapLocations(artisans.map(artisan => ({ id: artisan.id, location: artisan.location }))).then(resolved => {
      if (!active) return;
      setResolvedLocationsById(new Map(resolved.map(item => [item.id, item.location])));
    }).catch((error: unknown) => {
      console.warn('Remote seller globe location resolution timed out; using the local CSC catalog.', error);
      if (active) {
        setResolvedLocationsById(new Map(artisans.flatMap(artisan => {
          const location = resolveSellerMapLocation(artisan.location);
          return location ? [[artisan.id, location] as const] : [];
        })));
      }
    });
    return () => { active = false; };
  }, [artisans]);

  useEffect(() => {
    const panel = globePanelRef.current;
    if (!panel) return;
    if (!('IntersectionObserver' in window)) {
      setGlobeNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setGlobeNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '500px 0px' });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (locationCountries.length === 0) return;
    setFilterCountry('all');
    setFilterState('all');
    setFilterCity('all');
    setCountrySearch('');
    setStateSearch('');
    setCitySearch('');
    setSelectedArtisanId(null);
  }, [locationCountries]);
  const focusArtisan = (artisan: DirectorySeller | null) => {
    if (!artisan) return;
    setSelectedArtisanId(artisan.id);
    setSearchQuery(artisan.handle.startsWith('@') ? artisan.handle : `@${artisan.handle}`);
    setSearchSuggestionsOpen(false);
  };
  const selectedCountry = locationCountries.find(country => country.code === filterCountry || country.name === filterCountry);
  const selectedState = locationRegions.find(region => region.code === filterState || region.name === filterState);
  const countryOptions = locationCountries.filter(country => !countrySearch.trim()
    || country.name.toLowerCase().includes(countrySearch.trim().toLowerCase())
    || country.code.toLowerCase().includes(countrySearch.trim().toLowerCase())).slice(0, 100);
  const stateOptions = locationRegions.filter(state => !stateSearch.trim()
    || state.name.toLowerCase().includes(stateSearch.trim().toLowerCase())
    || state.code.toLowerCase().includes(stateSearch.trim().toLowerCase())).slice(0, 100);
  const cityOptions = locationCities.map(city => city.name);
  const locationArtisans = artisans.filter((artisan) => {
    const matchesLocation = matchesLocationFilter(
      artisan.location,
      filterCountry === 'all' ? 'all' : (selectedCountry?.name || artisan.location.countryCode || filterCountry),
      filterState === 'all' ? 'all' : (selectedState?.name || artisan.location.state || filterState),
      filterCity,
    );
    const matchesRadius = !nearMeOnly || nearbySellerIds.has(artisan.id);
    const areaTerm = exactAreaSearch.trim().toLowerCase();
    const matchesArea = !areaTerm
      || `${artisan.location.businessAddress || ''} ${artisan.location.city}`.toLowerCase().includes(areaTerm);
    return matchesLocation && matchesRadius && matchesArea;
  });
  const exactSearchMatch = findExactArtisanMatch(locationArtisans, searchQuery);
  const filteredArtisans = locationArtisans.filter((artisan) => {
    const term = searchQuery.trim().toLowerCase();
    const normalizedHandle = artisan.handle.trim().toLowerCase();
    const sellerPosts = availablePostsBySeller.get(artisan.id) ?? [];
    const searchable = [
      artisan.name, artisan.shopName || '', artisan.handle,
      artisan.bio || '', artisan.role,
      artisan.location.city, artisan.location.state, artisan.location.country,
      artisan.location.businessAddress || '',
      ...artisan.specializations,
      ...artisan.listingTags,
      ...artisan.availability,
      artisan.leadTimeDays === null ? '' : `${artisan.leadTimeDays} days`,
      artisan.minimumOrder === null ? '' : `${artisan.minimumOrder} minimum order`,
      ...sellerPosts.map(post => `${post.title} ${post.description}`),
    ].join(' ').toLowerCase();
    const matchesSearch = !term || searchable.includes(term) || normalizedHandle.includes(term)
      || exactSearchMatch?.id === artisan.id;
    const matchesSpecialization = specializationFilter === 'all'
      || artisan.specializations.some(value => value.toLowerCase() === specializationFilter.toLowerCase());
    const matchesListingServiceType = serviceTypeFilter === 'all'
      || sellerPosts.some(post => matchesServiceType(post, serviceTypeFilter));
    const minimumPrice = minimumPriceFilter === '' ? null : Number(minimumPriceFilter);
    const maximumPrice = maximumPriceFilter === '' ? null : Number(maximumPriceFilter);
    const matchesPrice = (minimumPrice === null || (artisan.maximumPrice !== null && artisan.maximumPrice >= minimumPrice))
      && (maximumPrice === null || (artisan.minimumPrice !== null && artisan.minimumPrice <= maximumPrice));
    const matchesAvailability = availabilityFilter === 'all' || artisan.availability.includes(availabilityFilter);
    return matchesSearch && matchesSpecialization && matchesListingServiceType && matchesPrice && matchesAvailability;
  });
  useEffect(() => {
    if (!nearMeOnly || !customerSearchLocation) {
      setNearbyMatches([]);
      return;
    }
    let active = true;
    setIsNearbySearchLoading(true);
    setNearbySearchStatus('');
    void api.getNearbySellers(customerSearchLocation, nearbyRadiusKm).then(matches => {
      if (active) {
        setNearbyMatches(matches);
        setNearbySearchStatus('');
      }
    }).catch(error => {
      console.warn('Remote nearby-seller search timed out; using confirmed seller coordinates already loaded.', error);
      if (active) {
        const fallbackMatches = artisans
          .filter(artisan => isConfirmedBusinessLocation(artisan.location))
          .map(artisan => ({
            sellerId: artisan.id,
            distanceKm: calculateDistanceKm(customerSearchLocation, artisan.location),
          }))
          .filter(match => match.distanceKm <= nearbyRadiusKm)
          .sort((left, right) => left.distanceKm - right.distanceKm);
        setNearbyMatches(fallbackMatches);
        setNearbySearchStatus(fallbackMatches.length > 0
          ? 'Showing sellers from the confirmed locations already loaded.'
          : 'Nearby sellers could not be loaded. Check your connection and retry.');
      }
    }).finally(() => {
      if (active) setIsNearbySearchLoading(false);
    });
    return () => { active = false; };
  }, [customerSearchLocation, nearMeOnly, nearbyRadiusKm]);

  const selectedGlobeArtisan = selectedArtisanId
    ? globeArtisans.find((artisan) => artisan.id === selectedArtisanId) ?? null
    : null;
  const markerSearchActive = searchQuery.trim().length >= 2 || nearMeOnly;
  const matchingGlobeArtisans = markerSearchActive
    ? globeArtisans.filter(artisan => filteredArtisans.some(match => match.id === artisan.id))
    : [];
  const totalSellerCount = sellerDirectoryDataStatus === 'ready' ? countSellerAccounts(users) : null;
  const isMatchingCountAvailable = sellerDirectoryDataStatus === 'ready';
  const matchingArtisanCount = isMatchingCountAvailable ? filteredArtisans.length : null;
  const searchSuggestions = useMemo(() => getSearchSuggestions(locationArtisans, searchQuery, 7), [locationArtisans, searchQuery]);
  const nearbyArtisans = useMemo(() => filteredArtisans
    .filter(artisan => artisan.distanceKm !== null)
    .sort((left, right) => (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY)), [filteredArtisans]);

  const handleNearbySearch = () => {
    if (nearMeOnly) {
      setNearMeOnly(false);
      setNearbyMatches([]);
      setNearbySearchStatus('');
      return;
    }
    if (!navigator.geolocation) {
      setNearbySearchStatus('Location access is not available on this device. Use the country, state, and city filters instead.');
      return;
    }
    setIsNearbySearchLoading(true);
    setNearbySearchStatus('');
    navigator.geolocation.getCurrentPosition(position => {
      setCustomerSearchLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
      });
      setNearMeOnly(true);
    }, error => {
      const message = error.code === error.PERMISSION_DENIED
        ? 'Location permission was denied. You can still search manually by country, state, or city.'
        : error.code === error.TIMEOUT
          ? 'Your device location timed out. Retry or search manually by country, state, or city.'
          : 'Your device location is unavailable. Check location services or search manually by country, state, or city.';
      setNearbySearchStatus(message);
      setIsNearbySearchLoading(false);
    }, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 });
  };

  useEffect(() => {
    if (!navigator.geolocation) return;
    let active = true;
    navigator.geolocation.getCurrentPosition(position => {
      if (!active) return;
      setCustomerSearchLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
      });
      setNearMeOnly(true);
    }, () => {
      // Location is optional; manual country, state, city, and area search remains available.
    }, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 });
    return () => { active = false; };
  }, []);

  const handleSuggestionPick = (artisan: typeof filteredArtisans[number]) => {
    focusArtisan(artisan);
  };

  const dismissSearch = () => {
    setSearchSuggestionsOpen(false);
    if (!searchQuery.trim()) setSelectedArtisanId(null);
  };

  return (
    <div className="artisan-directory relative z-10 w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className={`artisan-directory-content rounded-[2rem] border p-5 sm:p-6 ${isDarkMode ? 'border-neutral-800 bg-[#121316]/80' : 'border-neutral-200 bg-white/90 shadow-sm'}`}>
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-500">Artisan network</p>
            <h1 className="mt-2 text-3xl font-serif font-bold tracking-tight">Find a tailor</h1>
            <p className={`mt-2 max-w-2xl text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Explore seller locations on the globe, or search to focus on a tailor.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className={`relative flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 ${isDarkMode ? 'border-neutral-700 bg-neutral-900' : 'border-neutral-200 bg-white'}`}>
              <Search className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <input
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSelectedArtisanId(null);
                  setSearchSuggestionsOpen(true);
                }}
                onFocus={() => {
                  setSearchSuggestionsOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  const firstMatch = searchSuggestions[0] ?? null;
                  if (firstMatch) {
                    focusArtisan(firstMatch);
                  }
                }}
                onBlur={() => window.setTimeout(() => dismissSearch(), 120)}
                placeholder="Search tailors by name, style, service, or location..."
                className="min-w-0 bg-transparent text-xs outline-none placeholder:text-neutral-500"
                aria-label="Search tailors by service, specialization, listing, name, or location"
              />
              {searchSuggestionsOpen && searchQuery.trim().length > 0 && searchSuggestions.length > 0 && (
                <div className={`absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-xl border shadow-2xl ${isDarkMode ? 'border-neutral-700 bg-neutral-900' : 'border-neutral-200 bg-white'}`}>
                  {searchSuggestions.map((artisan) => (
                    <button
                      key={artisan.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleSuggestionPick(artisan);
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'}`}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-semibold text-amber-400">{artisan.name}</span>
                        <span className="ml-1 text-neutral-400">{artisan.handle.startsWith('@') ? artisan.handle : `@${artisan.handle}`}</span>
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-neutral-500">{artisan.location.country}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleNearbySearch}
              disabled={isNearbySearchLoading}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-70 ${
                nearMeOnly
                  ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                  : isDarkMode
                    ? 'border-neutral-700 bg-neutral-900 text-neutral-200'
                    : 'border-neutral-200 bg-neutral-100 text-neutral-700'
              }`}
            >
              <Navigation className="h-3.5 w-3.5" />
              {isNearbySearchLoading ? 'Finding nearby sellers…' : nearMeOnly ? `Showing ${nearbyRadiusKm} km radius` : 'Filter near me'}
            </button>
          </div>
        </div>

        <div className={`mb-6 grid gap-2 rounded-2xl border p-3 sm:grid-cols-2 lg:grid-cols-3 ${isDarkMode ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50'}`}>
          <SearchableLocationField
            label="Country"
            value={countrySearch}
            onChange={value => {
              setCountrySearch(value);
              const match = locationCountries.find(country => country.name.toLowerCase() === value.trim().toLowerCase()
                || country.code.toLowerCase() === value.trim().toLowerCase());
              setFilterCountry(match?.code || (value.trim() ? '__invalid__' : 'all'));
              setFilterState('all');
              setFilterCity('all');
              setStateSearch('');
              setCitySearch('');
              setSelectedArtisanId(null);
            }}
            onClear={() => {
              setCountrySearch('');
              setFilterCountry('all');
              setFilterState('all');
              setFilterCity('all');
              setStateSearch('');
              setCitySearch('');
            }}
            options={countryOptions.map(country => country.name)}
            placeholder="All countries · type to search"
            listId="artisan-country-filter"
          />
          <SearchableLocationField
            label="State / province"
            value={stateSearch}
            onChange={value => {
              setStateSearch(value);
              const match = locationRegions.find(state => state.name.toLowerCase() === value.trim().toLowerCase()
                || state.code.toLowerCase() === value.trim().toLowerCase());
              setFilterState(match?.code || (value.trim() ? '__invalid__' : 'all'));
              setFilterCity('all');
              setCitySearch('');
              setSelectedArtisanId(null);
            }}
            onClear={() => {
              setStateSearch('');
              setFilterState('all');
              setFilterCity('all');
              setCitySearch('');
            }}
            options={stateOptions.map(state => state.name)}
            placeholder={selectedCountry ? 'All states · type to search' : 'Choose a country first'}
            listId="artisan-state-filter"
          />
          <SearchableLocationField
            label="City"
            value={citySearch}
            onChange={value => {
              setCitySearch(value);
              const match = locationCities.find(city => city.name.toLowerCase() === value.trim().toLowerCase());
              setFilterCity(match?.name || (value.trim() ? '__invalid__' : 'all'));
              setSelectedArtisanId(null);
            }}
            onClear={() => {
              setCitySearch('');
              setFilterCity('all');
            }}
            options={cityOptions}
            placeholder={selectedState ? 'All cities · type to search' : 'Choose a state first'}
            listId="artisan-city-filter"
          />
          <label className="block text-[10px] text-neutral-400">
            Exact area / street / landmark
            <input
              type="search"
              value={exactAreaSearch}
              onChange={event => {
                setExactAreaSearch(event.target.value);
                setSelectedArtisanId(null);
              }}
              placeholder="e.g. KLM 4, Osusu Amaukwa"
              className={`mt-1 w-full rounded-lg border px-2.5 py-2 text-xs ${isDarkMode ? 'border-neutral-700 bg-neutral-800/80 text-neutral-200 placeholder:text-neutral-500' : 'border-neutral-300 bg-white text-neutral-800 placeholder:text-neutral-400'}`}
              aria-label="Search exact seller area, street, or landmark"
            />
          </label>
          <label className="sr-only" htmlFor="seller-specialization">Filter by specialization</label>
          <select id="seller-specialization" value={specializationFilter} onChange={event => setSpecializationFilter(event.target.value)} className={`rounded-xl border px-3 py-2 text-xs ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-neutral-200' : 'border-neutral-300 bg-white text-neutral-800'}`}>
            <option value="all">All specializations</option>
            {Array.from(new Set(artisans.flatMap(artisan => artisan.specializations))).sort((a, b) => a.localeCompare(b)).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <label className="sr-only" htmlFor="seller-service-type">Filter by service type</label>
          <select id="seller-service-type" value={serviceTypeFilter} onChange={event => setServiceTypeFilter(event.target.value)} className={`rounded-xl border px-3 py-2 text-xs ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-neutral-200' : 'border-neutral-300 bg-white text-neutral-800'}`}>
            <option value="all">All services</option><option value="made_to_order">Made to measure / made to order</option><option value="ready_made">Ready-made clothing</option>
          </select>
          <label className="sr-only" htmlFor="seller-availability">Filter by seller listing availability</label>
          <select id="seller-availability" value={availabilityFilter} onChange={event => setAvailabilityFilter(event.target.value)} className={`rounded-xl border px-3 py-2 text-xs ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-neutral-200' : 'border-neutral-300 bg-white text-neutral-800'}`}>
            <option value="all">Any availability</option><option value="available">Available</option><option value="limited">Limited stock</option><option value="made_to_order">Made to order</option>
          </select>
          <label className="sr-only" htmlFor="seller-minimum-price">Minimum listed price</label>
          <input id="seller-minimum-price" type="number" min="0" step="any" value={minimumPriceFilter} onChange={event => setMinimumPriceFilter(event.target.value)} placeholder="Minimum listed price" className={`rounded-xl border px-3 py-2 text-xs ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-neutral-200 placeholder-neutral-500' : 'border-neutral-300 bg-white text-neutral-800 placeholder-neutral-500'}`} />
          <label className="sr-only" htmlFor="seller-maximum-price">Maximum listed price</label>
          <input id="seller-maximum-price" type="number" min="0" step="any" value={maximumPriceFilter} onChange={event => setMaximumPriceFilter(event.target.value)} placeholder="Maximum listed price" className={`rounded-xl border px-3 py-2 text-xs ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-neutral-200 placeholder-neutral-500' : 'border-neutral-300 bg-white text-neutral-800 placeholder-neutral-500'}`} />
        </div>

        <p className={`mb-4 text-[10px] ${isDarkMode ? 'text-neutral-500' : 'text-neutral-600'}`}>
          Price filters compare tailors only when their listing currency is consistent. Delivery area, response time, identity verification and skill credentials are not currently recorded; profile locations and listing details are shown as provided.
        </p>
        {sellerDirectoryDataStatus === 'loading' && <p role="status" className="mb-3 text-[11px] text-neutral-500">Loading the complete seller directory so the totals are accurate…</p>}
        {sellerDirectoryDataStatus === 'error' && <p role="alert" className="mb-3 text-[11px] text-amber-500">The full seller directory could not be refreshed. Totals are hidden rather than showing incomplete cached data.</p>}
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50'}`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Total seller accounts on Fabsattire</p>
            <p className="mt-2 text-2xl font-black text-amber-500" aria-live="polite">{totalSellerCount ?? '—'}</p>
            <p className="mt-1 text-[10px] text-neutral-500">All tailor and fabric seller accounts, regardless of listings or filters</p>
          </div>
          <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50'}`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Sellers matching your search &amp; filters</p>
            <p className="mt-2 text-2xl font-black text-violet-500" aria-live="polite">{matchingArtisanCount ?? '—'}</p>
            <p className="mt-1 text-[10px] text-neutral-500">Counts sellers matching the search and selected location, service, price and availability</p>
          </div>
        </div>

        {locationDataError && <p role="status" className="mb-3 text-[11px] text-amber-500">Some location suggestions are temporarily unavailable. You can still search by name or location.</p>}
        {exactSearchMatch && searchQuery.trim().length >= 2 && <p className={`mb-3 text-[11px] ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>This exact match still follows your selected location and listing filters.</p>}
        {nearbySearchStatus && <p role={nearbySearchStatus.toLowerCase().includes('failed') || nearbySearchStatus.toLowerCase().includes('could not') ? 'alert' : 'status'} className="mb-3 text-[11px] text-orange-300">{nearbySearchStatus}</p>}
        <section ref={globePanelRef} className={`artisan-globe-panel mb-6 overflow-hidden rounded-[1.7rem] border ${isDarkMode ? 'border-orange-300/20 bg-[#1f0d11]' : 'border-orange-500/20 bg-[#1f0d11]'} text-white`}>
          <div className="artisan-globe-panel-header">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-200">Global maker signal network</p>
              <p className="mt-1 text-xs text-orange-50/75">{selectedGlobeArtisan ? `Showing ${selectedGlobeArtisan.name} near ${selectedGlobeArtisan.location.city}, ${selectedGlobeArtisan.location.country}` : 'Signals pulse around the globe. Search a maker to reveal location markers; saved coordinates are used when available, otherwise locations are approximate—not live GPS or street addresses.'}</p>
            </div>
            <span className="artisan-globe-status"><i /> Live network</span>
          </div>
          {nearMeOnly && (
            <div className="border-b border-orange-200/15 bg-black/20 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-orange-50">Sellers near your current location</p>
                  <p className="mt-0.5 text-[10px] text-orange-50/65">Sorted by distance from your device. Select one to rotate the globe.</p>
                </div>
                <select
                  value={nearbyRadiusKm}
                  onChange={event => setNearbyRadiusKm(Number(event.target.value))}
                  className="rounded-lg border border-orange-200/20 bg-black/30 px-2 py-1.5 text-[10px] text-orange-50"
                  aria-label="Nearby seller radius"
                >
                  {NEARBY_SELLER_RADII_KM.map(radius => <option key={radius} value={radius}>{radius} km</option>)}
                </select>
              </div>
              <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                {nearbyArtisans.length > 0 ? nearbyArtisans.map(artisan => (
                  <button
                    key={artisan.id}
                    type="button"
                    onClick={() => focusArtisan(artisan)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${selectedArtisanId === artisan.id ? 'border-amber-300 bg-amber-300/15' : 'border-orange-100/10 bg-white/5 hover:bg-white/10'}`}
                  >
                    <span className="min-w-0">
                      <strong className="block truncate text-xs text-orange-50">{artisan.shopName || artisan.name}</strong>
                      <span className="block truncate text-[10px] text-orange-50/60">{artisan.location.businessAddress || [artisan.location.city, artisan.location.state].filter(Boolean).join(', ')}</span>
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold text-amber-300">{artisan.distanceKm!.toFixed(1)} km</span>
                  </button>
                )) : <p className="py-3 text-center text-[11px] text-orange-50/60">No confirmed sellers were found in this radius.</p>}
              </div>
            </div>
          )}
          {globeNearViewport ? (
            <Suspense fallback={<div className="artisan-globe-3d flex items-center justify-center" role="status" aria-label="Preparing interactive artisan globe"><span className="text-xs text-orange-100/70">Preparing interactive globe…</span></div>}>
              <ArtisanGlobe3D
                artisans={matchingGlobeArtisans}
                showArtisanMarkers={matchingGlobeArtisans.length > 0}
                selectedArtisanId={selectedArtisanId}
                onSelectArtisan={(artisan) => setSelectedArtisanId(artisan.id)}
                onOpenArtisan={onSelectArtisan}
                onCloseArtisan={() => setSelectedArtisanId(null)}
                isDarkMode={isDarkMode}
              />
            </Suspense>
          ) : (
            <div className="artisan-globe-3d flex items-center justify-center text-sm text-orange-100/80" aria-label="Interactive artisan map loads when visible">
              Artisan map loads as you reach it
            </div>
          )}
        </section>

        {searchQuery.trim().length >= 2 && filteredArtisans.length === 0 && (
          <div className={`mt-4 rounded-2xl border border-dashed p-6 text-center ${isDarkMode ? 'border-neutral-700 text-neutral-400' : 'border-neutral-300 text-neutral-500'}`}>
            No tailors match this search and these filters. Try a broader search or location.
          </div>
        )}
      </div>
    </div>
  );
};
