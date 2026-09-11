import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, MapPin, Filter, Star, Heart, Bookmark, MessageCircle, Share2, Send, Phone, Scissors, Sparkles, Navigation, Download, ExternalLink, ShieldCheck, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { ClothPost, User, UserLocation } from '../types';
import { WORLD_COUNTRIES, calculateDistanceKm } from '../data/worldData';
import { storageService } from '../services/storage';
import { api } from '../services/api';

interface MarketplaceProps {
  posts: ClothPost[];
  users: User[];
  currentUser: User | null;
  onOpenAuth: () => void;
  onSelectPostForMessage: (post: ClothPost) => void;
  onSaveImageToViewer: (url: string, title: string) => void;
  onSharePost: (post: ClothPost) => void;
  onShareTailorProfile: (user: User) => void;
  isDarkMode: boolean;
}

export const Marketplace: React.FC<MarketplaceProps> = ({
  posts,
  users,
  currentUser,
  onOpenAuth,
  onSelectPostForMessage,
  onSaveImageToViewer,
  onSharePost,
  onShareTailorProfile,
  isDarkMode
}) => {
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [filterState, setFilterState] = useState<string>('all');
  const [filterCity, setFilterCity] = useState<string>('all');
  const [nearMeActive, setNearMeActive] = useState<boolean>(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState<number>(0);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [visiblePostsCount, setVisiblePostsCount] = useState<number>(10);

  // Extract unique tags across all posts
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    posts.forEach(p => p.tags.forEach(t => tagsSet.add(t.toLowerCase())));
    return Array.from(tagsSet);
  }, [posts]);

  const carouselPosts = useMemo(() => {
    const eligible = posts.filter(post => !users.find(user => user.id === post.authorId)?.isBlocked);
    const weighted = eligible.flatMap(post => {
      const author = users.find(user => user.id === post.authorId);
      const weight = post.isPromoted || author?.isPromoted ? 4 : 1;
      return Array.from({ length: weight }, () => post);
    });
    return [...weighted].sort(() => Math.random() - 0.5).filter((post, index, list) => list.findIndex(item => item.id === post.id) === index).slice(0, 8);
  }, [posts, users]);

  const trendingPosts = useMemo(() => {
    const qualityRated = posts.filter(post => (post.rating || 0) >= 4.5);
    const source = qualityRated.length > 0 ? qualityRated : posts;
    return [...source]
      .filter(post => !users.find(user => user.id === post.authorId)?.isBlocked)
      .sort((a, b) => {
        const scoreA = (a.rating || 0) * 10 + a.likes.length * 2 + a.saves.length * 3 + (a.isPromoted ? 8 : 0) + new Date(a.createdAt).getTime() / 1e10;
        const scoreB = (b.rating || 0) * 10 + b.likes.length * 2 + b.saves.length * 3 + (b.isPromoted ? 8 : 0) + new Date(b.createdAt).getTime() / 1e10;
        return scoreB - scoreA;
      })
      .slice(0, 5);
  }, [posts, users]);

  const searchSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    const suggestions = new Map<string, string>();
    posts.forEach(post => {
      [post.title, post.authorName, ...post.tags].forEach(value => {
        if (value.toLowerCase().includes(query)) suggestions.set(value.toLowerCase(), value);
      });
    });
    return Array.from(suggestions.values()).slice(0, 7);
  }, [posts, searchQuery]);

  // Filter and sort posts
  const filteredPosts = useMemo(() => {
    let result = posts.filter(post => {
      // Find author to check blocked status
      const author = users.find(u => u.id === post.authorId);
      if (author?.isBlocked) return false;

      // Search Query filter (matches author name, handle, title, description, tags)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesAuthor = post.authorName.toLowerCase().includes(q) || post.authorHandle.toLowerCase().includes(q);
        const matchesTitle = post.title.toLowerCase().includes(q);
        const matchesDesc = post.description.toLowerCase().includes(q);
        const matchesTags = post.tags.some(t => t.toLowerCase().includes(q));
        if (!matchesAuthor && !matchesTitle && !matchesDesc && !matchesTags) {
          return false;
        }
      }

      // Tag filter
      if (selectedTag !== 'all') {
        if (!post.tags.some(t => t.toLowerCase() === selectedTag.toLowerCase())) {
          return false;
        }
      }

      // Location filters
      if (filterCountry !== 'all' && post.authorLocation.country !== filterCountry) {
        return false;
      }
      if (filterState !== 'all' && post.authorLocation.state !== filterState) {
        return false;
      }
      if (filterCity !== 'all' && post.authorLocation.city !== filterCity) {
        return false;
      }

      return true;
    });

    // Sorting: Promoted posts first, or distance if Near Me is active
    if (nearMeActive && userCoords) {
      result.sort((a, b) => {
        const distA = a.authorLocation.lat && a.authorLocation.lng
          ? calculateDistanceKm(userCoords.lat, userCoords.lng, a.authorLocation.lat, a.authorLocation.lng)
          : 99999;
        const distB = b.authorLocation.lat && b.authorLocation.lng
          ? calculateDistanceKm(userCoords.lat, userCoords.lng, b.authorLocation.lat, b.authorLocation.lng)
          : 99999;
        return distA - distB;
      });
    } else {
      // Priority: Promoted items first, then newest
      result.sort((a, b) => {
        if (a.isPromoted && !b.isPromoted) return -1;
        if (!a.isPromoted && b.isPromoted) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    return result;
  }, [posts, users, searchQuery, selectedTag, filterCountry, filterState, filterCity, nearMeActive, userCoords]);

  const visiblePosts = filteredPosts.slice(0, visiblePostsCount);

  const getGreeting = (userName: string | null | undefined) => {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return `${greeting}${userName ? `, ${userName}` : ''}`;
  };

  useEffect(() => {
    setVisiblePostsCount(10);
  }, [searchQuery, selectedTag, filterCountry, filterState, filterCity, nearMeActive, userCoords]);

  useEffect(() => {
    const onScroll = () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 350;
      if (nearBottom && visiblePostsCount < filteredPosts.length) {
        setVisiblePostsCount(prev => Math.min(prev + 10, filteredPosts.length));
      }
    };

    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, [filteredPosts.length, visiblePostsCount]);

  useEffect(() => {
    if (carouselPosts.length < 2) return;
    const timer = window.setInterval(() => setActiveCarouselIndex(index => (index + 1) % carouselPosts.length), 4500);
    return () => window.clearInterval(timer);
  }, [carouselPosts.length]);

  // Request browser geolocation for Near Me proximity filtering
  const handleEnableLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('Geolocation is not supported by your browser.');
      return;
    }

    setLocationStatus('Pinpointing your coordinates...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setNearMeActive(true);
        setLocationStatus('GPS active: Tailors prioritized by proximity.');
      },
      (error) => {
        setLocationStatus('Could not retrieve GPS location. You can select your city manually below.');
        setNearMeActive(false);
      },
      { timeout: 10000 }
    );
  };

  // Handle Like
  const handleLike = (postId: string) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    api.toggleLike(postId).then(() => window.dispatchEvent(new CustomEvent('atelier_posts_updated'))).catch(error => setLocationStatus(error.message));
  };

  const handleRate = (postId: string, rating: number) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    api.ratePost(postId, rating).then(() => window.dispatchEvent(new CustomEvent('atelier_posts_updated'))).catch(error => setLocationStatus(error.message));
  };

  // Handle Save Picture
  const handleSave = (post: ClothPost) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }

    storageService.addSavedPhoto({
      url: post.imageUrl,
      title: post.title,
      postId: post.id,
    });

    api.toggleSave(post.id)
      .then(() => window.dispatchEvent(new CustomEvent('atelier_posts_updated')))
      .catch(error => setLocationStatus(error.message));

    onSaveImageToViewer(post.imageUrl, post.title);
  };

  // Handle Follow Tailor
  const handleFollow = (authorId: string) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    storageService.toggleFollowUser(authorId, currentUser.id);
  };

  // Direct WhatsApp Inquiry link
  const openWhatsApp = (post: ClothPost) => {
    const phone = post.authorWhatsapp?.replace(/\D/g, '') || '2348000000000';
    const text = encodeURIComponent(
      `Hello ${post.authorName}! I saw your design "${post.title}" on Fabrilux Atelier. I would like to place an order or discuss custom tailoring.`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  return (
    <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-amber-500/15 pb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs text-amber-500 font-semibold tracking-wider uppercase mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Curated Haute Couture & Fabrics</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight">
            {getGreeting(currentUser?.name || currentUser?.shopName || currentUser?.handle)}
          </h1>
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            Explore handcrafted bespoke garments and fine fabrics from authenticated tailors.
          </p>
        </div>

        {/* Global Search Bar (Searches tailors, tags, cloth titles) */}
        <div className="w-full md:w-96 relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by tailor name, tags (e.g. Silk, Kaftan), or fabric..."
            className={`w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border transition-all focus:outline-none focus:border-amber-500 ${
              isDarkMode
                ? 'bg-neutral-900/60 border-neutral-700 text-white placeholder-neutral-500'
                : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400 shadow-xs'
            }`}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => window.setTimeout(() => setIsSearchFocused(false), 150)}
          />
          {isSearchFocused && searchSuggestions.length > 0 && (
            <div className={`absolute z-30 top-full left-0 right-0 mt-2 rounded-xl border shadow-xl overflow-hidden ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-200'}`}>
              {searchSuggestions.map(suggestion => (
                <button
                  key={suggestion}
                  type="button"
                  onMouseDown={() => setSearchQuery(suggestion)}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-amber-500/10 flex items-center gap-2"
                >
                  <Search className="w-3.5 h-3.5 text-amber-500" />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          )}
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-neutral-500 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Randomized picture carousel with promoted posts weighted more often */}
      {carouselPosts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 text-neutral-950 font-bold text-xs">
                ★
              </div>
              <h2 className="text-sm font-semibold tracking-wide uppercase text-amber-400 font-mono">
                Fabrilux Atelier Runway
              </h2>
            </div>
            <span className="text-[11px] text-neutral-400">Selected atelier work</span>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-amber-500/30 bg-neutral-950 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
            {(() => {
              const post = carouselPosts[activeCarouselIndex];
              return (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0.5, scale: 1.02 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.45 }}
                  className="relative aspect-[16/7] min-h-[320px]"
                >
                  <img src={post.imageUrl} alt={post.title} className="absolute inset-0 h-full w-full object-cover" loading="eager" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.25),transparent_28%),linear-gradient(90deg,rgba(0,0,0,0.9),rgba(0,0,0,0.55),rgba(0,0,0,0.2))]" />

                  <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 sm:p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      {post.isPromoted && (
                        <span className="rounded-full border border-amber-300/70 bg-amber-400/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-neutral-950">
                          Promoted
                        </span>
                      )}
                      <span className="rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-amber-100 backdrop-blur-sm">
                        {post.authorRole === 'tailor' ? 'Bespoke Tailor' : 'Fabric Merchant'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-2 py-1.5 backdrop-blur-md">
                      {post.authorAvatar ? (
                        <img src={post.authorAvatar} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-amber-300/80" />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-neutral-950 ring-2 ring-amber-200/80">
                          {post.authorName.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="hidden text-xs font-semibold text-white sm:block">{post.authorName}</span>
                    </div>
                  </div>

                  <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 lg:p-8">
                    <div className="max-w-3xl rounded-[1.5rem] border border-white/10 bg-black/25 p-4 backdrop-blur-md sm:p-5">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-amber-300 font-semibold">
                        <span>{post.authorLocation.city}, {post.authorLocation.country}</span>
                        <span className="text-neutral-400">•</span>
                        <span>{post.pricing.basic > 0 ? `${post.pricing.currency || 'USD'} ${post.pricing.basic}` : 'Negotiable price'}</span>
                      </div>

                      <h2 className="mt-2 text-2xl font-serif font-extrabold leading-tight text-white sm:text-4xl">
                        {post.title}
                      </h2>

                      <p className="mt-2 max-w-2xl text-sm text-neutral-200 sm:text-base">
                        {post.description}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {post.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-amber-200"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>

                      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-200">
                          <span className="rounded-lg border border-neutral-700 bg-neutral-900/70 px-2.5 py-1.5">
                            <span className="text-neutral-400">Likes</span> {post.likes.length}
                          </span>
                          <span className="rounded-lg border border-neutral-700 bg-neutral-900/70 px-2.5 py-1.5">
                            <span className="text-neutral-400">Saves</span> {post.saves.length}
                          </span>
                          <span className="rounded-lg border border-neutral-700 bg-neutral-900/70 px-2.5 py-1.5">
                            <span className="text-neutral-400">Rating</span> {post.rating ? post.rating.toFixed(1) : 'New'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onSaveImageToViewer(post.imageUrl, post.title)}
                            className="rounded-xl bg-amber-400 px-3 py-2 text-[11px] font-bold text-neutral-950 transition hover:bg-amber-300"
                          >
                            View Details
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectPostForMessage(post)}
                            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-white/10"
                          >
                            Message Seller
                          </button>
                          <button
                            type="button"
                            onClick={() => openWhatsApp(post)}
                            className="rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-emerald-500"
                          >
                            WhatsApp
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })()}

            {carouselPosts.length > 1 && (
              <>
                <button
                  onClick={() => setActiveCarouselIndex(index => (index - 1 + carouselPosts.length) % carouselPosts.length)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white transition hover:bg-amber-400 hover:text-neutral-950"
                  aria-label="Previous runway post"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActiveCarouselIndex(index => (index + 1) % carouselPosts.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white transition hover:bg-amber-400 hover:text-neutral-950"
                  aria-label="Next runway post"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {trendingPosts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-400" /><h2 className="text-sm font-semibold tracking-wide uppercase text-emerald-400 font-mono">Trending Craft</h2><span className="text-[11px] text-neutral-400">Latest quality and engagement signals</span></div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {trendingPosts.map(post => <button key={post.id} onClick={() => setSearchQuery(post.title)} className="min-w-56 max-w-64 text-left rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900/70 hover:border-emerald-400/50 transition-colors">
              <img src={post.imageUrl} alt="" className="w-full h-28 object-cover" loading="lazy" />
              <div className="p-3"><p className="text-xs font-semibold truncate">{post.title}</p><p className="text-[10px] text-neutral-400 mt-1">{post.authorName} · {post.likes.length + post.saves.length} signals</p>{post.rating ? <span className="text-[10px] text-amber-400 flex items-center gap-1 mt-1"><Star className="w-3 h-3 fill-current" /> {post.rating.toFixed(1)}</span> : <span className="text-[10px] text-emerald-400 mt-1 block">Rising now</span>}</div>
            </button>)}
          </div>
        </section>
      )}

      {/* Geospatial Location Filter Bar & Tags */}
      <section className={`p-4 rounded-2xl border space-y-3 transition-colors ${
        isDarkMode ? 'bg-[#121316]/80 border-neutral-800' : 'bg-white border-neutral-200 shadow-xs'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Near Me GPS Proximity Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleEnableLocation}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
                nearMeActive
                  ? 'bg-amber-500 text-neutral-950 border-amber-400 shadow-md shadow-amber-500/20'
                  : 'border-neutral-700 hover:border-amber-500/50 text-neutral-300 hover:text-white'
              }`}
            >
              <Navigation className={`w-3.5 h-3.5 ${nearMeActive ? 'animate-spin' : ''}`} />
              <span>{nearMeActive ? 'Location Monitoring Active' : 'Filter Tailors Near Me (GPS)'}</span>
            </button>

            {locationStatus && (
              <span className="text-[11px] text-amber-400/90 font-mono hidden sm:inline">
                {locationStatus}
              </span>
            )}
          </div>

          {/* Cascading Location Selectors */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Country Selector */}
            <select
              value={filterCountry}
              onChange={(e) => {
                setFilterCountry(e.target.value);
                setFilterState('all');
                setFilterCity('all');
              }}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-800/80 border border-neutral-700 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Countries</option>
              {WORLD_COUNTRIES.map((c) => (
                <option key={c.code} value={c.name}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>

            {/* State Selector */}
            {filterCountry !== 'all' && (
              <select
                value={filterState}
                onChange={(e) => {
                  setFilterState(e.target.value);
                  setFilterCity('all');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-neutral-800/80 border border-neutral-700 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All States</option>
                {WORLD_COUNTRIES.find(c => c.name === filterCountry)?.states.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            {/* City Selector */}
            {filterState !== 'all' && (
              <select
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-neutral-800/80 border border-neutral-700 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Cities</option>
                {WORLD_COUNTRIES.find(c => c.name === filterCountry)
                  ?.states.find(s => s.name === filterState)
                  ?.cities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
              </select>
            )}

            {(filterCountry !== 'all' || filterState !== 'all' || filterCity !== 'all' || nearMeActive) && (
              <button
                onClick={() => {
                  setFilterCountry('all');
                  setFilterState('all');
                  setFilterCity('all');
                  setNearMeActive(false);
                  setLocationStatus(null);
                }}
                className="text-xs text-amber-400 hover:underline px-1"
              >
                Reset Location
              </button>
            )}
          </div>
        </div>

        {/* Tags / Categories Filter bar */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-2 pb-1 scrollbar-none">
            <span className="text-[11px] text-neutral-400 uppercase tracking-wider shrink-0 mr-1 font-mono">
              Tags:
            </span>
            <button
              onClick={() => setSelectedTag('all')}
              className={`px-2.5 py-1 rounded-full text-xs shrink-0 transition-all ${
                selectedTag === 'all'
                  ? 'bg-amber-500 text-neutral-950 font-semibold'
                  : 'bg-neutral-800/60 hover:bg-neutral-800 text-neutral-400'
              }`}
            >
              All Items
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-2.5 py-1 rounded-full text-xs capitalize shrink-0 transition-all ${
                  selectedTag === tag
                    ? 'bg-amber-500 text-neutral-950 font-semibold'
                    : 'bg-neutral-800/60 hover:bg-neutral-800 text-neutral-400'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Posts Feed Grid */}
      {filteredPosts.length === 0 ? (
        /* Zero Demo Data Empty State - User strictly instructed no demo clothes! */
        <div className={`text-center py-16 px-6 rounded-3xl border ${
          isDarkMode ? 'bg-[#121316]/50 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
        }`}>
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-4">
            <Scissors className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-serif font-bold mb-2">No Garments or Fabric Items Listed Yet</h3>
          <p className={`text-xs max-w-md mx-auto mb-6 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            Every piece on Atelier is created and posted by real registered tailors and fabric sellers. No demo or dummy clothes are generated.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {currentUser && (currentUser.role === 'tailor' || currentUser.role === 'fabric_seller') ? (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('navigate_to_tab', { detail: 'dashboard' }))}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:shadow-lg hover:shadow-amber-500/25 transition-all"
              >
                Publish Your First Garment / Fabric Post →
              </button>
            ) : (
              <button
                onClick={onOpenAuth}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:shadow-lg hover:shadow-amber-500/25 transition-all"
              >
                Register as Tailor / Fabric Merchant to Post
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visiblePosts.map((post) => {
            const isLiked = currentUser ? post.likes.includes(currentUser.id) : false;
            const isSaved = currentUser ? post.saves.includes(currentUser.id) : false;

            // Distance calculation if userCoords present
            const distanceKm = userCoords && post.authorLocation.lat && post.authorLocation.lng
              ? calculateDistanceKm(userCoords.lat, userCoords.lng, post.authorLocation.lat, post.authorLocation.lng)
              : null;

            return (
              <motion.article
                key={post.id}
                layout
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`rounded-[1.7rem] border overflow-hidden transition-all group flex flex-col justify-between ${
                  isDarkMode
                    ? 'bg-[#121316] border-neutral-800/90 hover:border-amber-500/40'
                    : 'bg-white border-neutral-200/90 hover:border-amber-500/40 shadow-sm'
                } ${post.isPromoted ? 'ring-1 ring-amber-500/50 shadow-[0_0_0_1px_rgba(251,191,36,0.18),0_20px_40px_rgba(251,191,36,0.12)]' : ''}`}
              >
                {/* Post Header: Tailor Handle, Location & Promoted Symbol */}
                <div className="p-3.5 flex items-center justify-between border-b border-neutral-800/40">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 font-bold text-xs flex items-center justify-center">
                      {post.authorName.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold block leading-tight">
                          {post.authorName}
                        </span>
                        {post.isPromoted && (
                          <span
                            title="Promoted Atelier"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500 text-neutral-950 uppercase tracking-tighter"
                          >
                            ★ Promoted
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-neutral-400">
                        <MapPin className="w-2.5 h-2.5 text-amber-500" />
                        <span>{post.authorLocation.city}, {post.authorLocation.country}</span>
                        {distanceKm !== null && (
                          <span className="text-amber-400 font-mono">({distanceKm} km away)</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Share post */}
                  <button
                    onClick={() => onSharePost(post)}
                    title="Share garment post"
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-neutral-800/50 transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Garment Image with High-Res Zoom / Save */}
                <div className={`relative aspect-4/5 w-full bg-neutral-900 overflow-hidden group/img ${post.isPromoted ? 'p-2 border-[3px] border-amber-500/60 bg-gradient-to-br from-amber-500/10 via-transparent to-amber-500/20 rounded-[1.5rem]' : ''}`}>
                  <img
                    src={post.imageUrl}
                    alt={post.title}
                    className="w-full h-full object-cover object-center group-hover/img:scale-102 transition-transform duration-500 rounded-[1.1rem]"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    draggable={false}
                    onContextMenu={(event) => event.preventDefault()}
                  />

                  {/* Top image overlay badges */}
                  <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold backdrop-blur-md bg-black/60 text-white border border-white/10">
                      {post.authorRole === 'tailor' ? 'Bespoke Tailoring' : 'Fine Fabric Material'}
                    </span>
                  </div>

                  {/* Save Picture Action overlay */}
                  <button
                    onClick={() => handleSave(post)}
                    title="Save High-Res Picture"
                    className={`absolute top-2.5 right-2.5 p-2 rounded-xl backdrop-blur-md transition-all ${
                      isSaved
                        ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                        : 'bg-black/60 hover:bg-black/80 text-white border border-white/20'
                    }`}
                  >
                    <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-neutral-950' : ''}`} />
                  </button>

                  {/* Quick Preview trigger */}
                  <button
                    onClick={() => onSaveImageToViewer(post.imageUrl, post.title)}
                    className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold backdrop-blur-md bg-black/70 hover:bg-black text-amber-300 border border-amber-500/30 flex items-center gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity"
                  >
                    <Download className="w-3 h-3" />
                    <span>View & Save Full Res</span>
                  </button>
                </div>

                {/* Post Body: Title, Description, Tags, Custom Pricing */}
                <div className="p-4 space-y-3 flex-1">
                  <div>
                    <h3 className="font-serif font-bold text-lg leading-snug">
                      {post.title}
                    </h3>
                    <p className={`text-xs mt-1 line-clamp-2 leading-relaxed ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>
                      {post.description}
                    </p>
                  </div>

                  {/* Tags */}
                  {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Seller price / negotiable state */}
                  <div className="p-2.5 rounded-xl border border-neutral-800/80 bg-neutral-900/30 text-[11px] space-y-1">
                    <span className="text-[9px] uppercase font-bold tracking-wider text-amber-500/80 block">
                      Seller Price
                    </span>
                    <div className="flex items-center justify-between text-neutral-400">
                      <span>{post.pricing.basic > 0 ? `${post.pricing.currency || post.authorLocation.currency || 'USD'} ${post.pricing.basic}` : 'Negotiable'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-1 font-mono">
                    <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                    <span>{post.saves.length} Saves</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-neutral-800/60 pt-2">
                    <span className="text-[10px] text-neutral-400">Rate this work</span>
                    <div className="flex items-center gap-0.5" aria-label="Rate this cloth from one to five stars">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button key={star} type="button" onClick={() => handleRate(post.id, star)} className="p-0.5 text-neutral-600 hover:text-amber-400" aria-label={`${star} star${star === 1 ? '' : 's'}`}>
                          <Star className={`w-3.5 h-3.5 ${post.rating && post.rating >= star ? 'fill-amber-400 text-amber-400' : ''}`} />
                        </button>
                      ))}
                      {post.ratingCount ? <span className="ml-1 text-[10px] text-amber-400">{post.rating.toFixed(1)} ({post.ratingCount})</span> : null}
                    </div>
                  </div>
                </div>

                {/* Footer: Like Counter, In-App Message & WhatsApp Button */}
                <div className="p-3 border-t border-neutral-800/60 bg-neutral-900/20 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleLike(post.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      isLiked
                        ? 'text-red-400 bg-red-500/15 border border-red-500/30'
                        : 'text-neutral-400 hover:text-red-400 bg-neutral-800/40 hover:bg-neutral-800'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-400' : ''}`} />
                    <span>{post.likes.length}</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {/* In-App Direct Message Order Button */}
                    <button
                      onClick={() => onSelectPostForMessage(post)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1.5 transition-colors"
                      title="Direct In-App Message"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-amber-400" />
                      <span>Inquire</span>
                    </button>

                    {/* WhatsApp Direct Order Button */}
                    <button
                      onClick={() => openWhatsApp(post)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors shadow-xs"
                      title="Order on WhatsApp"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </div>
  );
};
