import React, { useMemo, useState } from 'react';
import { Globe2, Navigation, Search } from 'lucide-react';
import { ClothPost, User } from '../types';
import { calculateDistanceKm, WORLD_COUNTRIES } from '../data/geoData';
import { getSearchSuggestions } from '../utils/globe';
import { getDefaultLocationFilter, matchesLocationFilter } from '../utils/artisanFilters';
import { ArtisanGlobe3D } from './ArtisanGlobe3D';

interface ArtisanDirectoryProps {
  users: User[];
  posts: ClothPost[];
  currentUser: User | null;
  onSelectArtisan: (artisan: User) => void;
  onToggleFollow: (artisan: User) => void;
  isDarkMode: boolean;
}

export const ArtisanDirectory: React.FC<ArtisanDirectoryProps> = ({ users, posts, currentUser, onSelectArtisan, onToggleFollow, isDarkMode }) => {
  const artisans = useMemo(() => {
    return users.filter((user) => user.role === 'tailor' || user.role === 'fabric_seller')
      .map((user) => {
        const userPosts = posts.filter((post) => post.authorId === user.id);
        const latestPost = [...userPosts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        const baseLocation = user.location ?? { city: 'Unknown city', state: 'Unknown', country: 'Unknown', lat: 0, lng: 0 };
        const distanceKm = currentUser && baseLocation.lat && baseLocation.lng && currentUser.location.lat && currentUser.location.lng
          ? calculateDistanceKm(currentUser.location.lat, currentUser.location.lng, baseLocation.lat, baseLocation.lng)
          : null;

        return {
          ...user,
          distanceKm,
          postCount: userPosts.length,
          latestPost,
          rating: userPosts.reduce((sum, post) => sum + (post.rating || 0), 0) / Math.max(userPosts.length, 1),
        };
      })
      .sort((a, b) => {
        if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
        if (a.distanceKm !== null) return -1;
        if (b.distanceKm !== null) return 1;
        return b.postCount - a.postCount;
      });
  }, [currentUser, posts, users]);

  const [nearMeOnly, setNearMeOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [filterCountry, setFilterCountry] = useState(() => getDefaultLocationFilter(currentUser?.location));
  const [filterState, setFilterState] = useState('all');
  const [filterCity, setFilterCity] = useState('all');

  React.useEffect(() => {
    setFilterCountry(getDefaultLocationFilter(currentUser?.location));
  }, [currentUser?.id, currentUser?.location?.country, currentUser?.location?.countryCode]);
  const [selectedGlobeArtisanId, setSelectedGlobeArtisanId] = useState<string | null>(null);

  const focusArtisan = (artisan: typeof filteredArtisans[number] | null) => {
    if (!artisan) return;
    setSelectedGlobeArtisanId(artisan.id);
    setSearchQuery(artisan.handle.startsWith('@') ? artisan.handle : `@${artisan.handle}`);
    setSearchSuggestionsOpen(false);
  };
  const selectedCountry = WORLD_COUNTRIES.find((country) => country.code === filterCountry);
  const selectedState = selectedCountry?.states.find((state) => state.code === filterState);
  const filteredArtisans = artisans.filter((artisan) => {
    const term = searchQuery.trim().toLowerCase();
    const normalizedHandle = artisan.handle.trim().toLowerCase();
    const matchesSearch = !term || artisan.name.toLowerCase().includes(term) || artisan.handle.toLowerCase().includes(term) || normalizedHandle.includes(term);
    const matchesLocation = matchesLocationFilter(
      artisan.location,
      filterCountry === 'all' ? 'all' : (selectedCountry?.name || artisan.location.countryCode || filterCountry),
      filterState === 'all' ? 'all' : (selectedState?.name || artisan.location.state || filterState),
      filterCity,
    );
    const matchesRadius = !nearMeOnly || (artisan.distanceKm !== null && artisan.distanceKm <= 250);
    return matchesSearch && matchesLocation && matchesRadius;
  });
  const mappedArtisans = filteredArtisans.filter((artisan) => Number.isFinite(artisan.location.lat) && Number.isFinite(artisan.location.lng));
  const searchSuggestions = useMemo(() => getSearchSuggestions(filteredArtisans, searchQuery, 7), [filteredArtisans, searchQuery]);

  const handleSuggestionPick = (artisan: typeof filteredArtisans[number]) => {
    focusArtisan(artisan);
  };

  return (
    <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className={`rounded-[2rem] border p-5 sm:p-6 ${isDarkMode ? 'border-neutral-800 bg-[#121316]/80' : 'border-neutral-200 bg-white/90 shadow-sm'}`}>
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-500">Artisan network</p>
            <h1 className="mt-2 text-3xl font-serif font-bold tracking-tight">Nearby tailors & fabric merchants</h1>
          </div>

          <div className="flex items-center gap-2">
            <div className={`relative flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 ${isDarkMode ? 'border-neutral-700 bg-neutral-900' : 'border-neutral-200 bg-white'}`}>
              <Search className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <input
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSelectedGlobeArtisanId(null);
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
                onBlur={() => window.setTimeout(() => setSearchSuggestionsOpen(false), 120)}
                placeholder="Search name or @handle"
                className="min-w-0 bg-transparent text-xs outline-none placeholder:text-neutral-500"
                aria-label="Search artisans by name or handle"
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

        <div className={`mb-6 grid gap-2 rounded-2xl border p-3 sm:grid-cols-3 ${isDarkMode ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50'}`}>
          <select value={filterCountry} onChange={(event) => { setFilterCountry(event.target.value); setFilterState('all'); setFilterCity('all'); setSelectedGlobeArtisanId(null); }} className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 outline-none">
            <option value="all">All countries</option>
            {WORLD_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
          </select>
          <select value={filterState} onChange={(event) => { setFilterState(event.target.value); setFilterCity('all'); setSelectedGlobeArtisanId(null); }} disabled={!selectedCountry} className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 outline-none disabled:opacity-50">
            <option value="all">All states / provinces</option>
            {selectedCountry?.states.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
          </select>
          <select value={filterCity} onChange={(event) => { setFilterCity(event.target.value); setSelectedGlobeArtisanId(null); }} disabled={!selectedState} className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 outline-none disabled:opacity-50">
            <option value="all">All cities</option>
            {selectedState?.cities.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50'}`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Verified tailors & fabric sellers</p>
            <p className="mt-2 text-2xl font-black text-amber-500">{artisans.filter((artisan) => artisan.role === 'tailor' || artisan.role === 'fabric_seller').length}</p>
          </div>
          <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50'}`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Within reach</p>
            <p className="mt-2 text-2xl font-black text-emerald-500">{artisans.filter((artisan) => artisan.distanceKm !== null && artisan.distanceKm <= 100).length}</p>
          </div>
          <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50'}`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Promoted</p>
            <p className="mt-2 text-2xl font-black text-violet-500">{artisans.filter((artisan) => artisan.isPromoted).length}</p>
          </div>
        </div>

        <section className={`relative mb-6 overflow-hidden rounded-[1.7rem] border ${isDarkMode ? 'border-orange-300/20 bg-[#1f0d11]' : 'border-orange-500/20 bg-[#1f0d11]'} text-white`}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,146,60,0.28),transparent_20%),radial-gradient(circle_at_15%_18%,rgba(253,186,116,0.18),transparent_20%),linear-gradient(135deg,rgba(120,53,15,0.74),rgba(30,41,59,0.8),rgba(17,24,39,0.94))]" />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-orange-200/15 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-orange-200" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-200">Live artisan signal</p>
                <p className="text-xs text-orange-50/80">{mappedArtisans.length} account{mappedArtisans.length === 1 ? '' : 's'} transmitting verified coordinates</p>
              </div>
            </div>
          </div>

          <div className="artisan-globe-stage relative min-h-[19rem] overflow-hidden">
            <div className="artisan-globe-sun" aria-hidden="true" />
            <ArtisanGlobe3D artisans={mappedArtisans} selectedArtisanId={selectedGlobeArtisanId} onSelectArtisan={(artisan) => setSelectedGlobeArtisanId(artisan.id)} onOpenArtisan={onSelectArtisan} onCloseArtisan={() => setSelectedGlobeArtisanId(null)} isDarkMode={isDarkMode} />
          </div>
        </section>

        {filteredArtisans.length === 0 && (
          <div className={`mt-4 rounded-2xl border border-dashed p-6 text-center ${isDarkMode ? 'border-neutral-700 text-neutral-400' : 'border-neutral-300 text-neutral-500'}`}>
            No artisans match the current location filter yet. Try a wider radius or browse the full network.
          </div>
        )}
      </div>
    </div>
  );
};
