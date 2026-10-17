import React, { useMemo, useState } from 'react';
import { Navigation, Search } from 'lucide-react';
import { ClothPost, User } from '../types';
import { calculateDistanceKm, WORLD_COUNTRIES } from '../data/geoData';
import { getSearchSuggestions } from '../utils/globe';
import { getDefaultLocationFilter, matchesLocationFilter } from '../utils/artisanFilters';
import { ArtisanGlobe3D } from './ArtisanGlobe3D';
import { api } from '../services/api';

type SellerReviewSummary = {
  sellerId: string;
  average: number;
  count: number;
  confidenceAdjustedRating: number | null;
};

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
  posts: ClothPost[];
  currentUser: User | null;
  onSelectArtisan: (artisan: User) => void;
  isDarkMode: boolean;
}

export const ArtisanDirectory: React.FC<ArtisanDirectoryProps> = ({ users, posts, currentUser, onSelectArtisan, isDarkMode }) => {
  const artisans = useMemo(() => {
    return users.filter((user) => !user.isBlocked
      && Boolean(user.name.trim() || user.shopName?.trim())
      && user.role === 'tailor')
      .map((user): DirectorySeller => {
        const userPosts = posts.filter((post) => post.authorId === user.id
          && !post.deletedAt
          && !post.isBlocked
          && (post.status === undefined || post.status === 'published')
          && (post.moderationStatus === undefined || post.moderationStatus === 'approved')
          && post.availability !== 'unavailable'
          && post.status !== 'sold_out');
        const latestPost = [...userPosts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        const baseLocation = user.location ?? { city: 'Unknown city', state: 'Unknown', country: 'Unknown', lat: 0, lng: 0 };
        const distanceKm = currentUser && baseLocation.lat && baseLocation.lng && currentUser.location.lat && currentUser.location.lng
          ? calculateDistanceKm(currentUser.location.lat, currentUser.location.lng, baseLocation.lat, baseLocation.lng)
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
          priceUnit: priceUnits.length === 1 ? priceUnits[0] : null,
          minimumOrder: minimumOrders[0] ?? null,
          leadTimeDays: userPosts.map(getLeadTime).filter((days): days is number => days !== null).sort((a, b) => a - b)[0] ?? null,
          availability: Array.from(new Set(userPosts.map(post => post.availability).filter((value): value is Exclude<typeof value, undefined> => Boolean(value)))),
        };
      });
  }, [currentUser, posts, users]);

  const [nearMeOnly, setNearMeOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [filterCountry, setFilterCountry] = useState(() => getDefaultLocationFilter(currentUser?.location));
  const [filterState, setFilterState] = useState('all');
  const [filterCity, setFilterCity] = useState('all');
  const [specializationFilter, setSpecializationFilter] = useState('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [minimumRatingFilter, setMinimumRatingFilter] = useState(0);
  const [minimumPriceFilter, setMinimumPriceFilter] = useState('');
  const [maximumPriceFilter, setMaximumPriceFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [sellerReviews, setSellerReviews] = useState<Record<string, SellerReviewSummary>>({});
  const [sellerReviewsLoaded, setSellerReviewsLoaded] = useState(false);
  const [sellerReviewsError, setSellerReviewsError] = useState(false);
  const [selectedArtisanId, setSelectedArtisanId] = useState<string | null>(null);

  React.useEffect(() => {
    const nextCountry = getDefaultLocationFilter(currentUser?.location);
    const nextCountryData = WORLD_COUNTRIES.find((country) => country.code === nextCountry || country.name === nextCountry);
    const nextState = nextCountryData?.states.find((state) => state.name.toLowerCase() === currentUser?.location.state?.toLowerCase());
    setFilterCountry(nextCountry);
    setFilterState(nextState?.code || 'all');
    setFilterCity(nextState?.cities.some((city) => city.toLowerCase() === currentUser?.location.city?.toLowerCase()) ? currentUser?.location.city || 'all' : 'all');
    setSelectedArtisanId(null);
  }, [currentUser?.id, currentUser?.location?.country, currentUser?.location?.countryCode, currentUser?.location?.state, currentUser?.location?.city]);
  React.useEffect(() => {
    const sellerIds = artisans.map(artisan => artisan.id);
    if (!sellerIds.length) {
      setSellerReviews({});
      setSellerReviewsLoaded(true);
      return;
    }
    let cancelled = false;
    setSellerReviewsLoaded(false);
    setSellerReviewsError(false);
    Promise.all(Array.from({ length: Math.ceil(sellerIds.length / 50) }, (_, index) =>
      api.getSellerReviewSummaries(sellerIds.slice(index * 50, (index + 1) * 50)),
    )).then(summaryPages => {
      if (cancelled) return;
      const summaries = summaryPages.flat();
      setSellerReviews(Object.fromEntries(summaries.map(summary => [summary.sellerId, summary])));
      setSellerReviewsLoaded(true);
    }).catch(error => {
      if (cancelled) return;
      console.error('Unable to load public seller review summaries.', error);
      setSellerReviewsError(true);
      setSellerReviewsLoaded(true);
    });
    return () => { cancelled = true; };
  }, [artisans]);
  const focusArtisan = (artisan: DirectorySeller | null) => {
    if (!artisan) return;
    setSelectedArtisanId(artisan.id);
    setSearchQuery(artisan.handle.startsWith('@') ? artisan.handle : `@${artisan.handle}`);
    setSearchSuggestionsOpen(false);
  };
  const selectedCountry = WORLD_COUNTRIES.find((country) => country.code === filterCountry);
  const selectedState = selectedCountry?.states.find((state) => state.code === filterState);
  const locationArtisans = artisans.filter((artisan) => {
    const matchesLocation = matchesLocationFilter(
      artisan.location,
      filterCountry === 'all' ? 'all' : (selectedCountry?.name || artisan.location.countryCode || filterCountry),
      filterState === 'all' ? 'all' : (selectedState?.name || artisan.location.state || filterState),
      filterCity,
    );
    const matchesRadius = !nearMeOnly || (artisan.distanceKm !== null && artisan.distanceKm <= 250);
    return matchesLocation && matchesRadius;
  });
  const filteredArtisans = locationArtisans.filter((artisan) => {
    const term = searchQuery.trim().toLowerCase();
    const normalizedHandle = artisan.handle.trim().toLowerCase();
    const summary = sellerReviews[artisan.id];
    const searchable = [
      artisan.name, artisan.shopName || '', artisan.handle,
      artisan.bio || '', artisan.role,
      artisan.location.city, artisan.location.state, artisan.location.country,
      ...artisan.specializations,
      ...artisan.listingTags,
      ...artisan.availability,
      artisan.leadTimeDays === null ? '' : `${artisan.leadTimeDays} days`,
      artisan.minimumOrder === null ? '' : `${artisan.minimumOrder} minimum order`,
      ...posts.filter(post => post.authorId === artisan.id).map(post => `${post.title} ${post.description}`),
    ].join(' ').toLowerCase();
    const matchesSearch = !term || searchable.includes(term) || normalizedHandle.includes(term);
    const matchesSpecialization = specializationFilter === 'all'
      || artisan.specializations.some(value => value.toLowerCase() === specializationFilter.toLowerCase());
    const matchesServiceType = serviceTypeFilter === 'all'
      || posts.some(post => post.authorId === artisan.id
        && matchesServiceType(post, serviceTypeFilter));
    const matchesRating = minimumRatingFilter === 0 || !sellerReviewsLoaded || sellerReviewsError
      || Boolean(summary && summary.count > 0 && (summary.confidenceAdjustedRating ?? summary.average) >= minimumRatingFilter);
    const minimumPrice = minimumPriceFilter === '' ? null : Number(minimumPriceFilter);
    const maximumPrice = maximumPriceFilter === '' ? null : Number(maximumPriceFilter);
    const matchesPrice = (minimumPrice === null || (artisan.maximumPrice !== null && artisan.maximumPrice >= minimumPrice))
      && (maximumPrice === null || (artisan.minimumPrice !== null && artisan.minimumPrice <= maximumPrice));
    const matchesAvailability = availabilityFilter === 'all' || artisan.availability.includes(availabilityFilter);
    return matchesSearch && matchesSpecialization && matchesServiceType && matchesRating && matchesPrice && matchesAvailability;
  });
  const selectedGlobeArtisan = selectedArtisanId
    ? filteredArtisans.find((artisan) => artisan.id === selectedArtisanId) ?? null
    : null;
  const searchSuggestions = useMemo(() => getSearchSuggestions(locationArtisans, searchQuery, 7), [locationArtisans, searchQuery]);

  const handleSuggestionPick = (artisan: typeof filteredArtisans[number]) => {
    focusArtisan(artisan);
  };

  const dismissSearch = () => {
    setSearchSuggestionsOpen(false);
    if (!searchQuery.trim()) setSelectedArtisanId(null);
  };

  return (
    <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className={`rounded-[2rem] border p-5 sm:p-6 ${isDarkMode ? 'border-neutral-800 bg-[#121316]/80' : 'border-neutral-200 bg-white/90 shadow-sm'}`}>
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-500">Artisan network</p>
            <h1 className="mt-2 text-3xl font-serif font-bold tracking-tight">Find a tailor</h1>
            <p className={`mt-2 max-w-2xl text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Search for a tailor, then select a match to reveal their location on the interactive globe.
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
              onClick={() => setNearMeOnly((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                nearMeOnly
                  ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                  : isDarkMode
                    ? 'border-neutral-700 bg-neutral-900 text-neutral-200'
                    : 'border-neutral-200 bg-neutral-100 text-neutral-700'
              }`}
            >
              <Navigation className="h-3.5 w-3.5" />
              {nearMeOnly ? 'Showing 250km radius' : 'Filter near me'}
            </button>
          </div>
        </div>

        <div className={`mb-6 grid gap-2 rounded-2xl border p-3 sm:grid-cols-2 lg:grid-cols-3 ${isDarkMode ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50'}`}>
        <select value={filterCountry} onChange={(event) => { setFilterCountry(event.target.value); setFilterState('all'); setFilterCity('all'); setSelectedArtisanId(null); }} className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 outline-none">
            <option value="all">All countries</option>
            {WORLD_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
          </select>
          <select value={filterState} onChange={(event) => { setFilterState(event.target.value); setFilterCity('all'); setSelectedArtisanId(null); }} disabled={!selectedCountry} className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 outline-none disabled:opacity-50">
            <option value="all">All states / provinces</option>
            {selectedCountry?.states.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
          </select>
          <input
            type="text"
            value={filterCity === 'all' ? '' : filterCity}
            onChange={(event) => { setFilterCity(event.target.value.trim() || 'all'); setSelectedArtisanId(null); }}
            disabled={!selectedState}
            placeholder="Filter by city"
            aria-label="Filter sellers by city"
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 outline-none disabled:opacity-50"
          />
          <label className="sr-only" htmlFor="seller-specialization">Filter by specialization</label>
          <select id="seller-specialization" value={specializationFilter} onChange={event => setSpecializationFilter(event.target.value)} className={`rounded-xl border px-3 py-2 text-xs ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-neutral-200' : 'border-neutral-300 bg-white text-neutral-800'}`}>
            <option value="all">All specializations</option>
            {Array.from(new Set(artisans.flatMap(artisan => artisan.specializations))).sort((a, b) => a.localeCompare(b)).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <label className="sr-only" htmlFor="seller-service-type">Filter by service type</label>
          <select id="seller-service-type" value={serviceTypeFilter} onChange={event => setServiceTypeFilter(event.target.value)} className={`rounded-xl border px-3 py-2 text-xs ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-neutral-200' : 'border-neutral-300 bg-white text-neutral-800'}`}>
            <option value="all">All services</option><option value="made_to_order">Made to measure / made to order</option><option value="ready_made">Ready-made clothing</option>
          </select>
          <label className="sr-only" htmlFor="seller-rating-confidence">Minimum confidence-adjusted seller rating</label>
          <select id="seller-rating-confidence" value={minimumRatingFilter} onChange={event => setMinimumRatingFilter(Number(event.target.value))} className={`rounded-xl border px-3 py-2 text-xs ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-neutral-200' : 'border-neutral-300 bg-white text-neutral-800'}`}>
            <option value={0}>Any review rating</option><option value={3}>Confidence-adjusted 3+ (reviewed only)</option><option value={4}>Confidence-adjusted 4+ (reviewed only)</option>
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
        {sellerReviewsError && <p role="status" className="mb-3 text-[11px] text-amber-500">Review summaries are temporarily unavailable; the review rating filter is not being applied.</p>}
        {minimumRatingFilter > 0 && !sellerReviewsLoaded && <p role="status" className="mb-3 text-[11px] text-neutral-500">Loading eligible firsthand review summaries for the selected rating filter…</p>}
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50'}`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Tailors</p>
            <p className="mt-2 text-2xl font-black text-amber-500">{locationArtisans.length}</p>
          </div>
          <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50'}`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Matching this search</p>
            <p className="mt-2 text-2xl font-black text-violet-500">{filteredArtisans.length}</p>
          </div>
        </div>

        <section className={`artisan-globe-panel mb-6 overflow-hidden rounded-[1.7rem] border ${isDarkMode ? 'border-orange-300/20 bg-[#1f0d11]' : 'border-orange-500/20 bg-[#1f0d11]'} text-white`}>
          <div className="artisan-globe-panel-header">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-200">Live artisan signal</p>
              <p className="mt-1 text-xs text-orange-50/75">{selectedGlobeArtisan ? `Showing ${selectedGlobeArtisan.name} on the globe` : 'Search for a tailor and select a match to show them here'}</p>
            </div>
            <span className="artisan-globe-status"><i /> Live network</span>
          </div>
          <ArtisanGlobe3D
            artisans={selectedGlobeArtisan && Number.isFinite(selectedGlobeArtisan.location.lat) && Number.isFinite(selectedGlobeArtisan.location.lng)
              ? [selectedGlobeArtisan]
              : []}
            selectedArtisanId={selectedArtisanId}
            onSelectArtisan={(artisan) => setSelectedArtisanId(artisan.id)}
            onOpenArtisan={onSelectArtisan}
            onCloseArtisan={() => setSelectedArtisanId(null)}
            isDarkMode={isDarkMode}
          />
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
