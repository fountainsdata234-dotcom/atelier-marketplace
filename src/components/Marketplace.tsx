
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, MapPin, Filter, Star, Heart, Bookmark, Share2, Phone, Scissors, Sparkles, Navigation, Download, ExternalLink, ChevronLeft, ChevronRight, TrendingUp, Flame, Trophy, Zap, EyeOff } from 'lucide-react';
import { ClothPost, CountryGeo, DiscoveryEvent, MarketplaceFeedView, MarketplaceSort, MarketplaceTrendCategory, MarketplaceTrendingPage, RecommendationEventType, RecommendationPreferences, User, UserLocation } from '../types';
import { storageService } from '../services/storage';
import { api } from '../services/api';
import { MarketplaceInterlude } from './MarketplaceInterlude';
import { getProfileInitials, getRoleLabel } from '../utils/profile';
import { matchesLocationFilter } from '../utils/artisanFilters';
import { getTopTailors, rankMarketplaceListings } from '../utils/marketplaceRanking';
import { buildWhatsAppUrl } from '../utils/whatsapp';

interface MarketplaceProps {
  posts: ClothPost[];
  postsLoadError: boolean;
  onRetryLoad: () => void;
  users: User[];
  currentUser: User | null;
  onOpenAuth: () => void;
  onSelectPost: (post: ClothPost) => void;
  onSaveImageToViewer: (url: string, title: string) => void;
  onSharePost: (post: ClothPost) => void;
  onShareTailorProfile: (user: User) => void;
  onToggleFollow: (user: User) => void;
  onSelectSeller: (user: User) => void;
  isDarkMode: boolean;
}

const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const earthRadiusKm = 6371;
  const deltaLat = (lat2 - lat1) * (Math.PI / 180);
  const deltaLon = (lon2 - lon1) * (Math.PI / 180);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
};

const getLikeCount = (post: ClothPost) => post.likeCount ?? post.likes.length;
const getSaveCount = (post: ClothPost) => post.saveCount ?? post.saves.length;
const TREND_CATEGORY_LABELS: Record<MarketplaceTrendCategory, string> = {
  TRENDING_NOW: 'Trending Now',
  RISING: 'Rising',
  POPULAR: 'Popular',
  NEW_NOTICED: 'New & Noticed',
  HIGHLY_RATED: 'Highly Rated',
  MOST_VIEWED: 'Most Viewed',
};

export const Marketplace: React.FC<MarketplaceProps> = ({
  posts,
  postsLoadError,
  onRetryLoad,
  users,
  currentUser,
  onOpenAuth,
  onSelectPost,
  onSaveImageToViewer,
  onSharePost,
  onShareTailorProfile,
  onToggleFollow,
  onSelectSeller,
  isDarkMode
}) => {
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = sessionStorage.getItem('atelier_recent_marketplace_searches_v1');
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string').slice(0, 6) : [];
    } catch {
      return [];
    }
  });
  const [activeFeedView, setActiveFeedView] = useState<MarketplaceFeedView>('for-you');
  const [sortOrder, setSortOrder] = useState<MarketplaceSort>('relevance');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [minimumPriceFilter, setMinimumPriceFilter] = useState('');
  const [maximumPriceFilter, setMaximumPriceFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [materialFilter, setMaterialFilter] = useState('');
  const [colourFilter, setColourFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [fulfilmentFilter, setFulfilmentFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('');
  const [feedPosts, setFeedPosts] = useState<ClothPost[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedRetry, setFeedRetry] = useState(0);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const reportedAnalyticsFailures = useRef(new Set<string>());
  const analyticsRetryAfter = useRef(0);
  const [failedPostImageUrls, setFailedPostImageUrls] = useState<Record<string, string>>({});
  const recommendationScope = useMemo(() => storageService.getRecommendationScope(currentUser?.id), [currentUser?.id]);
  const [recommendationPreferences, setRecommendationPreferences] = useState<RecommendationPreferences>(
    () => storageService.getRecommendationPreferences(storageService.getRecommendationScope(currentUser?.id)),
  );
  const [recommendationEvents, setRecommendationEvents] = useState<DiscoveryEvent[]>(
    () => storageService.getRecommendationEvents(storageService.getRecommendationScope(currentUser?.id)),
  );
  const [recommendationNotice, setRecommendationNotice] = useState<string | null>(null);
  const [categoryPreferenceInput, setCategoryPreferenceInput] = useState('');
  const [stylePreferenceInput, setStylePreferenceInput] = useState('');
  const [minimumPriceInput, setMinimumPriceInput] = useState('');
  const [maximumPriceInput, setMaximumPriceInput] = useState('');
  const [currencyPreferenceInput, setCurrencyPreferenceInput] = useState('');
  const [countryPreferenceInput, setCountryPreferenceInput] = useState('');
  const [statePreferenceInput, setStatePreferenceInput] = useState('');
  const [recommendationRevision, setRecommendationRevision] = useState(0);
  const hasLoadedServerFeed = useRef(false);
  const actionLocks = useRef(new Set<string>());
  const feedGeneration = useRef(0);
  const handlePostImageError = (post: ClothPost, failedSource?: string) => {
    const source = failedSource || post.imageAssets?.[0]?.thumbnailUrl || post.imageAssets?.[0]?.url || post.imageUrl;
    setFailedPostImageUrls(current => ({ ...current, [post.id]: source }));
  };
  const refreshRecommendationSignals = () => {
    setRecommendationEvents(storageService.getRecommendationEvents(recommendationScope));
    setRecommendationRevision(value => value + 1);
  };
  const recordRecommendationSignal = (listingId: string, eventType: RecommendationEventType, reason?: string) => {
    const listing = feedPosts.find(post => post.id === listingId);
    storageService.recordRecommendationEvent(listingId, eventType, recommendationScope, listing, reason);
    refreshRecommendationSignals();
  };
  const saveRecommendationSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    const minimum = minimumPriceInput.trim() ? Number(minimumPriceInput) : null;
    const maximum = maximumPriceInput.trim() ? Number(maximumPriceInput) : null;
    if ((minimum !== null && (!Number.isFinite(minimum) || minimum < 0))
      || (maximum !== null && (!Number.isFinite(maximum) || maximum < 0))
      || (minimum !== null && maximum !== null && minimum > maximum)
      || ((minimum !== null || maximum !== null) && !currencyPreferenceInput.trim())) {
      setRecommendationNotice('Enter a valid price range and its currency, with the minimum no greater than the maximum.');
      return;
    }
    const splitList = (value: string) => Array.from(new Set(value.split(',').map(item => item.trim()).filter(Boolean))).slice(0, 20);
    const next: RecommendationPreferences = {
      ...recommendationPreferences,
      categories: splitList(categoryPreferenceInput),
      styles: splitList(stylePreferenceInput),
      minimumPrice: minimum,
      maximumPrice: maximum,
      currency: currencyPreferenceInput.trim().toUpperCase().slice(0, 3),
      country: countryPreferenceInput.trim().slice(0, 80),
      state: statePreferenceInput.trim().slice(0, 80),
    };
    storageService.saveRecommendationPreferences(recommendationScope, next);
    setRecommendationPreferences(next);
    if (currentUser) {
      try {
        await api.saveRecommendationPreferences(next);
        setRecommendationNotice(next.enabled
          ? 'Your preferences are saved to your account and will shape For You recommendations.'
          : 'Preferences saved. Personalization remains off until you enable it.');
      } catch (error) {
        setRecommendationNotice(`Preferences are saved on this device, but account sync failed: ${error instanceof Error ? error.message : 'try again later.'}`);
      }
    } else {
      setRecommendationNotice(next.enabled
        ? 'Your preferences are saved on this device and will shape the For You feed.'
        : 'Preferences saved. Personalization remains off until you enable it.');
    }
  };
  const setRecommendationEnabled = async (enabled: boolean) => {
    const next = { ...recommendationPreferences, enabled };
    storageService.saveRecommendationPreferences(recommendationScope, next);
    setRecommendationPreferences(next);
    if (!enabled) {
      setRecommendationEvents([]);
      setRecommendationNotice('Personalization is off. Your local recommendation activity was cleared.');
    } else {
      setRecommendationNotice('Personalization is on. Recommendation activity stays on this device for up to 180 days.');
    }
    if (currentUser) {
      try {
        await api.saveRecommendationPreferences(next);
      } catch (error) {
        setRecommendationNotice(`Your choice is saved on this device, but account sync failed: ${error instanceof Error ? error.message : 'try again later.'}`);
      }
    }
  };
  const resetRecommendations = async () => {
    storageService.resetRecommendationData(recommendationScope);
    const defaults = storageService.getRecommendationPreferences(recommendationScope);
    setRecommendationPreferences(defaults);
    setRecommendationEvents([]);
    setCategoryPreferenceInput('');
    setStylePreferenceInput('');
    setMinimumPriceInput('');
    setMaximumPriceInput('');
    setCurrencyPreferenceInput('');
    setCountryPreferenceInput('');
    setStatePreferenceInput('');
    setRecommendationNotice('Your recommendation preferences and local activity were reset.');
    if (currentUser) {
      try {
        await api.resetRecommendationPreferences();
      } catch (error) {
        setRecommendationNotice(`Local recommendation data was reset, but account data could not be cleared: ${error instanceof Error ? error.message : 'try again later.'}`);
      }
    }
  };
  useEffect(() => {
    const preferences = storageService.getRecommendationPreferences(recommendationScope);
    setRecommendationPreferences(preferences);
    setRecommendationEvents(storageService.getRecommendationEvents(recommendationScope));
    setCategoryPreferenceInput(preferences.categories.join(', '));
    setStylePreferenceInput(preferences.styles.join(', '));
    setMinimumPriceInput(preferences.minimumPrice === null ? '' : String(preferences.minimumPrice));
    setMaximumPriceInput(preferences.maximumPrice === null ? '' : String(preferences.maximumPrice));
    setCurrencyPreferenceInput(preferences.currency);
    setCountryPreferenceInput(preferences.country);
    setStatePreferenceInput(preferences.state);
  }, [recommendationScope]);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    void api.getRecommendationPreferences().then(({ preferences }) => {
      if (cancelled || !preferences) return;
      storageService.saveRecommendationPreferences(recommendationScope, preferences);
      setRecommendationPreferences(preferences);
      setCategoryPreferenceInput(preferences.categories.join(', '));
      setStylePreferenceInput(preferences.styles.join(', '));
      setMinimumPriceInput(preferences.minimumPrice === null ? '' : String(preferences.minimumPrice));
      setMaximumPriceInput(preferences.maximumPrice === null ? '' : String(preferences.maximumPrice));
      setCurrencyPreferenceInput(preferences.currency);
      setCountryPreferenceInput(preferences.country);
      setStatePreferenceInput(preferences.state);
    }).catch(error => {
      if (!cancelled) {
        console.warn('Account recommendation preferences could not be loaded.', error);
        setRecommendationNotice('Account preferences are temporarily unavailable; this device’s saved settings are still in use.');
      }
    });
    return () => { cancelled = true; };
  }, [currentUser?.id, recommendationScope]);

  useEffect(() => {
    const update = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== recommendationScope) return;
      setRecommendationPreferences(storageService.getRecommendationPreferences(recommendationScope));
      setRecommendationEvents(storageService.getRecommendationEvents(recommendationScope));
      setRecommendationRevision(value => value + 1);
    };
    window.addEventListener('atelier_recommendations_updated', update);
    return () => window.removeEventListener('atelier_recommendations_updated', update);
  }, [recommendationScope]);

  const [showAllTrending, setShowAllTrending] = useState(false);
  const [activeTrendCategory, setActiveTrendCategory] = useState<MarketplaceTrendCategory>('TRENDING_NOW');
  const [trendingPage, setTrendingPage] = useState<MarketplaceTrendingPage | null>(null);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState<string | null>(null);
  const seenPostIdsRef = useRef(new Set<string>());
  const seenImpressionIdsRef = useRef(new Set<string>());
  const trendScrollRef = useRef<HTMLDivElement | null>(null);
  const marketplaceRootRef = useRef<HTMLDivElement | null>(null);
  const locationDataRequestRef = useRef<Promise<CountryGeo[]> | null>(null);
  const [trendingRetry, setTrendingRetry] = useState(0);

  const trendScores = useMemo(() => new Map(
    (trendingPage?.items || []).map(post => [post.id, {
      score: post.trendScore || 0,
      confidence: post.trendConfidence || 0,
    }]),
  ), [trendingPage]);
  const sourcePosts = useMemo(() => {
    if (activeFeedView !== 'for-you' || sortOrder !== 'relevance') return feedPosts;
    return rankMarketplaceListings(feedPosts, users, recommendationEvents, recommendationPreferences, {
      search: searchQuery,
      categoryId: selectedCategory === 'all' ? undefined : selectedCategory,
      trendScores,
    });
  }, [feedPosts, users, recommendationEvents, recommendationPreferences, activeFeedView, sortOrder, searchQuery, selectedCategory, trendScores, recommendationRevision]);
  const getPostImageSource = (post: ClothPost): string | undefined => {
    const thumbnail = post.imageAssets?.[0]?.thumbnailUrl;
    const original = post.imageAssets?.[0]?.url || post.imageUrl;
    if (thumbnail && failedPostImageUrls[post.id] !== thumbnail) return thumbnail;
    if (original && failedPostImageUrls[post.id] !== original) return original;
    return undefined;
  };
  const sellerPosts = useMemo(() => sourcePosts
    .filter(post => (post.status === undefined || (post.status === 'published' && (post.moderationStatus === undefined || post.moderationStatus === 'approved')))
      && !post.deletedAt
      && post.availability !== 'unavailable'
      && post.status !== 'sold_out'
      && !post.isBlocked
      && (post.authorRole === 'tailor' || post.authorRole === 'fabric_seller')
      && Boolean(post.imageAssets?.some(asset => asset.url.trim()) || post.imageUrl?.trim()))
    .map(post => {
      const author = users.find(user => user.id === post.authorId);
      return {
        ...post,
        title: post.title || 'Untitled atelier post',
        description: post.description || '',
        authorName: author?.shopName || author?.name || post.authorName || 'Atelier Member',
        authorHandle: author?.handle || post.authorHandle || '@atelier_member',
        authorAvatar: author?.avatarUrl || post.authorAvatar,
        authorWhatsapp: author?.whatsappNumber || post.authorWhatsapp || author?.phone || '',
        authorLocation: author?.location || post.authorLocation || { country: '', state: '', city: '' },
        isPromoted: author?.isPromoted || post.isPromoted,
        tags: Array.isArray(post.tags) ? post.tags : [],
        likes: Array.isArray(post.likes) ? post.likes : [],
        saves: Array.isArray(post.saves) ? post.saves : [],
        rating: Number(post.rating) || 0,
        ratingCount: Number(post.ratingCount) || 0,
      };
    }), [sourcePosts, users, failedPostImageUrls]);
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);
  const tailorPosts = sellerPosts;
  const formatLocation = (location?: Partial<UserLocation>) => [location?.city, location?.state, location?.country].filter(Boolean).join(', ');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [filterState, setFilterState] = useState<string>('all');
  const [filterCity, setFilterCity] = useState<string>('all');
  const [worldCountries, setWorldCountries] = useState<CountryGeo[]>([]);
  const [showLocationFilters, setShowLocationFilters] = useState(false);
  const [isLoadingLocationFilters, setIsLoadingLocationFilters] = useState(false);
  const [nearMeActive, setNearMeActive] = useState<boolean>(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState<number>(0);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    if (!hasLoadedServerFeed.current && posts.length > 0) setFeedPosts(posts.slice(0, 16));
  }, [posts]);

  useEffect(() => {
    const generation = ++feedGeneration.current;
    let cancelled = false;
    setFeedLoading(true);
    setFeedLoadingMore(false);
    setFeedError(null);
    setFeedPosts([]);
    setFeedCursor(null);
    setFeedHasMore(false);
    const timer = window.setTimeout(() => {
      void api.getMarketplaceFeed({
        view: activeFeedView,
        sort: sortOrder,
        search: searchQuery.trim() || undefined,
        categoryId: selectedCategory === 'all' ? undefined : selectedCategory,
        tag: selectedTag === 'all' ? undefined : selectedTag,
        minimumPrice: minimumPriceFilter === '' ? undefined : Number(minimumPriceFilter),
        maximumPrice: maximumPriceFilter === '' ? undefined : Number(maximumPriceFilter),
        currency: currencyFilter.trim().toUpperCase() || undefined,
        material: materialFilter.trim() || undefined,
        colour: colourFilter.trim() || undefined,
        size: sizeFilter.trim() || undefined,
        fulfilment: fulfilmentFilter ? fulfilmentFilter as 'ready_made' | 'made_to_order' : undefined,
        availability: availabilityFilter ? availabilityFilter as 'available' | 'made_to_order' | 'limited' : undefined,
        country: filterCountry === 'all' ? undefined : filterCountry,
        state: filterState === 'all' ? undefined : filterState,
        city: filterCity === 'all' ? undefined : filterCity,
        limit: 16,
      }).then(page => {
        if (cancelled || generation !== feedGeneration.current) return;
        hasLoadedServerFeed.current = true;
        setFeedPosts(page.items);
        setFeedCursor(page.nextCursor);
        setFeedHasMore(page.hasMore);
        if (searchQuery.trim().length >= 2) recordSearchEvent('impression', undefined, page.items.length);
      }).catch(error => {
        if (!cancelled && generation === feedGeneration.current) setFeedError(error instanceof Error ? error.message : 'Marketplace listings could not be loaded.');
      }).finally(() => {
        if (!cancelled && generation === feedGeneration.current) setFeedLoading(false);
      });
    }, searchQuery.trim() ? 300 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeFeedView, sortOrder, searchQuery, selectedCategory, selectedTag, minimumPriceFilter, maximumPriceFilter, currencyFilter, materialFilter, colourFilter, sizeFilter, fulfilmentFilter, availabilityFilter, filterCountry, filterState, filterCity, feedRetry, currentUser?.id]);

  const loadMoreListings = async () => {
    if (!feedHasMore || !feedCursor || feedLoadingMore) return;
    const generation = feedGeneration.current;
    setFeedLoadingMore(true);
    setFeedError(null);
    try {
      const page = await api.getMarketplaceFeed({
        view: activeFeedView,
        sort: sortOrder,
        search: searchQuery.trim() || undefined,
        categoryId: selectedCategory === 'all' ? undefined : selectedCategory,
        tag: selectedTag === 'all' ? undefined : selectedTag,
        minimumPrice: minimumPriceFilter === '' ? undefined : Number(minimumPriceFilter),
        maximumPrice: maximumPriceFilter === '' ? undefined : Number(maximumPriceFilter),
        currency: currencyFilter.trim().toUpperCase() || undefined,
        material: materialFilter.trim() || undefined,
        colour: colourFilter.trim() || undefined,
        size: sizeFilter.trim() || undefined,
        fulfilment: fulfilmentFilter ? fulfilmentFilter as 'ready_made' | 'made_to_order' : undefined,
        availability: availabilityFilter ? availabilityFilter as 'available' | 'made_to_order' | 'limited' : undefined,
        country: filterCountry === 'all' ? undefined : filterCountry,
        state: filterState === 'all' ? undefined : filterState,
        city: filterCity === 'all' ? undefined : filterCity,
        cursor: feedCursor,
        limit: 16,
      });
      if (generation !== feedGeneration.current) return;
      setFeedPosts(current => {
        const ids = new Set(current.map(post => post.id));
        return [...current, ...page.items.filter(post => {
          if (ids.has(post.id)) return false;
          ids.add(post.id);
          return true;
        })];
      });
      setFeedCursor(page.nextCursor);
      setFeedHasMore(page.hasMore);
      if (searchQuery.trim().length >= 2) recordSearchEvent('impression', undefined, page.items.length);
    } catch (error) {
      if (generation === feedGeneration.current) setFeedError(error instanceof Error ? error.message : 'More listings could not be loaded.');
    } finally {
      if (generation === feedGeneration.current) setFeedLoadingMore(false);
    }
  };

  const loadLocationFilters = () => {
    setShowLocationFilters(true);
    if (locationDataRequestRef.current) return;
    setIsLoadingLocationFilters(true);
    locationDataRequestRef.current = import('../data/geoData')
      .then(({ WORLD_COUNTRIES }) => {
        setWorldCountries(WORLD_COUNTRIES);
        return WORLD_COUNTRIES;
      })
      .catch(() => {
        locationDataRequestRef.current = null;
        setLocationStatus('Location filters could not be loaded. Try again.');
        return [];
      })
      .finally(() => setIsLoadingLocationFilters(false));
  };

  // Extract unique tags across all posts
  const allTags = useMemo(() => {
    const tagsByLowercase = new Map<string, string>();
    sellerPosts.forEach(post => post.tags.forEach(tag => {
      const normalized = tag.trim();
      if (normalized) tagsByLowercase.set(normalized.toLowerCase(), normalized);
    }));
    return Array.from(tagsByLowercase.values());
  }, [sellerPosts]);
  const categories = useMemo(() => Array.from(new Set(sellerPosts.map(post => post.categoryId).filter((category): category is string => Boolean(category)))).sort(), [sellerPosts]);
  const hasActiveFeedFilters = Boolean(searchQuery.trim()
    || selectedCategory !== 'all'
    || selectedTag !== 'all'
    || minimumPriceFilter
    || maximumPriceFilter
    || materialFilter
    || colourFilter
    || sizeFilter
    || fulfilmentFilter
    || availabilityFilter
    || filterCountry !== 'all'
    || filterState !== 'all'
    || filterCity !== 'all'
    || nearMeActive
    || recommendationPreferences.enabled
    || recommendationPreferences.categories.length > 0
    || recommendationPreferences.styles.length > 0
    || recommendationPreferences.minimumPrice !== null
    || recommendationPreferences.maximumPrice !== null
    || Boolean(recommendationPreferences.country)
    || Boolean(recommendationPreferences.state));

  const carouselPosts = useMemo(() => {
    return rankMarketplaceListings(tailorPosts, users, recommendationEvents, recommendationPreferences, { trendScores })
      .slice(0, 8);
  }, [tailorPosts, users, recommendationEvents, recommendationPreferences, trendScores, recommendationRevision]);

  const trendingPosts = useMemo(
    () => (trendingPage?.items || []).slice(0, showAllTrending ? 12 : 7),
    [trendingPage, showAllTrending],
  );
  const activeTrendCategoryLabel = TREND_CATEGORY_LABELS[activeTrendCategory];

  const lastWeekHits = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return [...tailorPosts]
      .filter(post => !userById.get(post.authorId)?.isBlocked)
      .filter(post => Number.isFinite(Date.parse(post.createdAt)) && Date.parse(post.createdAt) >= weekAgo)
      .sort((a, b) => (getLikeCount(b) + getSaveCount(b)) - (getLikeCount(a) + getSaveCount(a)))
      .slice(0, 3);
  }, [tailorPosts, userById]);

  const topTailors = useMemo(() => {
    return getTopTailors(tailorPosts, users).slice(0, 3);
  }, [users, tailorPosts]);

  const smartMarketplaceHighlights = useMemo(() => [
    {
      title: (trendingPage?.fallback ? 'NEW LISTINGS' : activeTrendCategoryLabel).toUpperCase(),
      icon: Flame,
      accent: 'text-orange-300 border-orange-500/25 bg-orange-500/10',
      items: trendingPosts.slice(0, 3).map(post => ({
        id: post.id,
        listingId: post.id,
        sellerId: post.authorId,
        title: post.title,
        subtitle: trendingPage?.fallback ? `${post.authorName} · New listing` : `${post.authorName} · Recent customer interest`,
        imageUrl: post.imageUrl,
        isPromoted: post.isPromoted,
      })),
    },
    {
      title: 'LAST WEEK HIT',
      icon: Zap,
      accent: 'text-sky-300 border-sky-500/25 bg-sky-500/10',
      items: lastWeekHits.map(post => ({
        id: post.id,
        listingId: post.id,
        sellerId: post.authorId,
        title: post.title,
        subtitle: `${post.authorName} · ${(post.tags && post.tags[0]) || 'new release'}`,
        imageUrl: post.imageUrl,
        isPromoted: post.isPromoted,
      })),
    },
    {
      title: 'ARTISAN DISCOVERY',
      icon: Trophy,
      accent: 'text-violet-300 border-violet-500/25 bg-violet-500/10',
      items: topTailors.map(seller => ({
        id: seller.id,
        listingId: undefined,
        sellerId: undefined,
        title: seller.shopName || seller.name,
        subtitle: `${seller.role === 'fabric_seller' ? 'Fabric seller' : 'Tailor'} · ${tailorPosts.filter(post => post.authorId === seller.id).length} portfolio pieces`,
        imageUrl: tailorPosts.find(post => post.authorId === seller.id && post.imageUrl?.trim())?.imageUrl || '',
        isPromoted: seller.isPromoted,
      })),
    },
  ], [trendingPosts, lastWeekHits, topTailors, tailorPosts, activeTrendCategoryLabel, trendingPage?.fallback]);

  const rememberSearch = (value: string) => {
    const query = value.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (query.length < 2) return;
    const recent = [query, ...recentSearches.filter(item => item.toLowerCase() !== query.toLowerCase())].slice(0, 6);
    setRecentSearches(recent);
    try {
      sessionStorage.setItem('atelier_recent_marketplace_searches_v1', JSON.stringify(recent));
    } catch (error) {
      console.warn('Unable to retain recent marketplace searches for this session.', error);
    }
  };
  const searchSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const suggestions = new Map<string, { label: string; type: 'seller' | 'post' | 'tag' | 'recent'; user?: User; post?: ClothPost }>();
    if (!query) {
      recentSearches.forEach(term => suggestions.set(`recent-${term}`, { label: term, type: 'recent' }));
      return Array.from(suggestions.values()).slice(0, 6);
    }
    tailorPosts.forEach(post => {
      if (post.title.toLowerCase().includes(query)) suggestions.set(`post-${post.id}`, { label: post.title, type: 'post', post });
      post.tags.forEach(tag => { if (tag.toLowerCase().includes(query)) suggestions.set(`tag-${tag}`, { label: tag, type: 'tag' }); });
    });
    users.filter(user => !user.isBlocked && (user.role === 'tailor' || user.role === 'fabric_seller')).forEach(user => {
      [user.name, user.shopName || '', user.handle].forEach(value => { if (value && value.toLowerCase().includes(query)) suggestions.set(`seller-${user.id}`, { label: user.name, type: 'seller', user }); });
    });
    return Array.from(suggestions.values()).slice(0, 8);
  }, [tailorPosts, searchQuery, users, recentSearches]);

  const selectSearchSuggestion = (suggestion: (typeof searchSuggestions)[number]) => {
    if (suggestion.type === 'recent') {
      setSearchQuery(suggestion.label);
      rememberSearch(suggestion.label);
    } else if (suggestion.user) onSelectSeller(suggestion.user);
    else if (suggestion.post) openListing(suggestion.post);
    else {
      setSearchQuery(suggestion.label);
      rememberSearch(suggestion.label);
    }
    setIsSearchFocused(false);
    setActiveSuggestionIndex(-1);
  };

  // Filter and sort posts
  const filteredPosts = useMemo(() => {
    let result = tailorPosts.filter(post => {
      // Find author to check blocked status
      const author = userById.get(post.authorId);
      if (author?.isBlocked) return false;

      // Search Query filter (matches author name, handle, title, description, tags)
      // Location filters
      if (!matchesLocationFilter(post.authorLocation, filterCountry, filterState, filterCity)) {
        return false;
      }

      return true;
    });

    // Sorting: Promoted posts first, or distance if Near Me is active
    if (nearMeActive && userCoords && !searchQuery.trim()) {
      result.sort((a, b) => {
        const distA = a.authorLocation.lat && a.authorLocation.lng
          ? calculateDistanceKm(userCoords.lat, userCoords.lng, a.authorLocation.lat, a.authorLocation.lng)
          : 99999;
        const distB = b.authorLocation.lat && b.authorLocation.lng
          ? calculateDistanceKm(userCoords.lat, userCoords.lng, b.authorLocation.lat, b.authorLocation.lng)
          : 99999;
        return distA - distB;
      });
    }

    return result;
  }, [tailorPosts, userById, filterCountry, filterState, filterCity, nearMeActive, userCoords, searchQuery]);

  const visiblePosts = filteredPosts;

  const getGreeting = (userName: string | null | undefined) => {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return `${greeting}${userName ? `, ${userName}` : ''}`;
  };

  useEffect(() => {
    if (carouselPosts.length < 2) return;
    const timer = window.setInterval(() => setActiveCarouselIndex(index => (index + 1) % carouselPosts.length), 4500);
    return () => window.clearInterval(timer);
  }, [carouselPosts.length]);

  useEffect(() => {
    let cancelled = false;
    setTrendingLoading(true);
    setTrendingError(null);
    api.getMarketplaceTrending({
      category: activeTrendCategory,
      limit: showAllTrending ? 12 : 7,
    }).then(page => {
      if (!cancelled) setTrendingPage(page);
    }).catch(error => {
      if (!cancelled) {
        const reason = error instanceof Error ? error.message : 'Trending listings could not be loaded.';
        setTrendingError(`${reason} Previously loaded listings remain visible when available.`);
      }
    }).finally(() => {
      if (!cancelled) setTrendingLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeTrendCategory, showAllTrending, trendingRetry]);

  useEffect(() => {
    const node = trendScrollRef.current;
    if (!node || trendingPosts.length === 0) return;

    const handleScroll = () => {
      const center = node.scrollLeft + node.clientWidth / 2;
      let nearestIndex = 0;
      let lowestDistance = Number.POSITIVE_INFINITY;

      Array.from(node.children).forEach((child, index) => {
        const element = child as HTMLElement;
        const childCenter = element.offsetLeft + element.offsetWidth / 2;
        const distance = Math.abs(childCenter - center);
        if (distance < lowestDistance) {
          lowestDistance = distance;
          nearestIndex = index;
        }
      });

      setFocusIndex(nearestIndex);
    };

    handleScroll();
    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => node.removeEventListener('scroll', handleScroll);
  }, [trendingPosts]);

  useEffect(() => {
    const root = marketplaceRootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const timers = new Map<string, number>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const listingId = (entry.target as HTMLElement).dataset.marketplaceListingId;
        if (!listingId) return;
        const sellerId = (entry.target as HTMLElement).dataset.marketplaceSellerId;
        if (currentUser?.id && currentUser.id === sellerId) return;

        if (entry.intersectionRatio >= 0.25 && !seenImpressionIdsRef.current.has(listingId)) {
          seenImpressionIdsRef.current.add(listingId);
          const feedPosition = visiblePosts.findIndex(post => post.id === listingId);
          const trendPosition = trendingPosts.findIndex(post => post.id === listingId);
          const fromSearch = searchQuery.trim().length >= 2;
          const feedName = fromSearch
            ? 'search'
            : selectedCategory !== 'all' ? 'category' : trendPosition >= 0 ? 'trending' : 'for_you';
          const rankedPosition = Math.max(1, (trendPosition >= 0 ? trendPosition : feedPosition) + 1);
          const recommendationReason = visiblePosts.find(post => post.id === listingId)?.recommendationReason;
          recordRecommendationSignal(listingId, 'IMPRESSION', recommendationReason);
          void recordTrendEvent(listingId, 'IMPRESSION', sellerId, {
            feedName,
            rankedPosition,
            reasonCode: recommendationReason || '',
          });
        }
        if (entry.intersectionRatio >= 0.5) {
          if (seenPostIdsRef.current.has(listingId) || timers.has(listingId)) return;
          const timer = window.setTimeout(() => {
            seenPostIdsRef.current.add(listingId);
            timers.delete(listingId);
            recordRecommendationSignal(listingId, 'VIEW', visiblePosts.find(post => post.id === listingId)?.recommendationReason);
            void recordTrendEvent(listingId, 'VIEW');
          }, 2000);
          timers.set(listingId, timer);
        } else {
          const timer = timers.get(listingId);
          if (timer !== undefined) {
            window.clearTimeout(timer);
            timers.delete(listingId);
          }
        }
      });
    }, { threshold: [0.25, 0.5] });
    const cards = root.querySelectorAll<HTMLElement>('[data-marketplace-listing-id]');
    cards.forEach(card => observer.observe(card));
    return () => {
      observer.disconnect();
      timers.forEach(timer => window.clearTimeout(timer));
    };
  }, [visiblePosts, currentUser?.id, trendingPosts, activeCarouselIndex, smartMarketplaceHighlights, recommendationScope, searchQuery, selectedCategory]);

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

  function recordTrendEvent(
    listingId: string,
    eventType: 'IMPRESSION' | 'VIEW' | 'SHARE' | 'ENQUIRY' | 'HIDE',
    sellerId?: string,
    recommendation?: {
      feedName: 'for_you' | 'trending' | 'category' | 'search';
      rankedPosition: number;
      reasonCode?: string;
    },
  ) {
    if (currentUser?.id && currentUser.id === sellerId) return;
    if (Date.now() < analyticsRetryAfter.current) return;
    void api.recordMarketplaceEvent(listingId, eventType, recommendation).catch(error => {
      analyticsRetryAfter.current = Date.now() + 60_000;
      if (reportedAnalyticsFailures.current.has(eventType)) return;
      reportedAnalyticsFailures.current.add(eventType);
      console.warn(
        `Marketplace ${eventType.toLowerCase()} analytics are temporarily unavailable; listing discovery is unaffected.`,
        error,
      );
    });
  }

  function recordSearchEvent(
    eventType: 'impression' | 'click' | 'save' | 'enquiry',
    listingId?: string,
    resultCount?: number,
  ) {
    const query = searchQuery.trim();
    if (query.length < 2) return;
    if (Date.now() < analyticsRetryAfter.current) return;
    void api.recordMarketplaceSearchEvent(query, eventType, listingId, resultCount).catch(error => {
      analyticsRetryAfter.current = Date.now() + 60_000;
      if (reportedAnalyticsFailures.current.has(`search-${eventType}`)) return;
      reportedAnalyticsFailures.current.add(`search-${eventType}`);
      console.warn(`Marketplace search ${eventType} analytics are temporarily unavailable; search results are unaffected.`, error);
    });
  }

  function openListing(post: ClothPost) {
    recordRecommendationSignal(post.id, 'VIEW');
    recordTrendEvent(post.id, 'VIEW', post.authorId);
    recordSearchEvent('click', post.id);
    onSelectPost(post);
  }

  // Handle Like
  const handleLike = (postId: string) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    if (actionLocks.current.has(postId)) return;
    actionLocks.current.add(postId);
    setPendingActions(new Set(actionLocks.current));

    const previousPost = feedPosts.find(post => post.id === postId);
    const wasLiked = Boolean(previousPost?.likes.includes(currentUser.id));
    storageService.toggleLikePost(postId, currentUser.id);
    setFeedPosts(current => current.map(post => {
      if (post.id !== postId) return post;
      const likes = post.likes.filter(userId => userId !== currentUser.id);
      if (!wasLiked) likes.push(currentUser.id);
      return { ...post, likes, likeCount: Math.max(0, (post.likeCount ?? post.likes.length) + (wasLiked ? -1 : 1)) };
    }));
    window.dispatchEvent(new CustomEvent('atelier_posts_updated'));

    api.toggleLike(postId)
      .then(result => {
        const likes = feedPosts.find(item => item.id === postId)?.likes.filter(userId => userId !== currentUser.id) || [];
        if (result.isLiked) likes.push(currentUser.id);
        setFeedPosts(current => current.map(post => post.id === postId
          ? { ...post, likes, likeCount: result.likesCount }
          : post));
        storageService.reconcilePostEngagement(postId, { likes });
        if (result.isLiked && !wasLiked) recordRecommendationSignal(postId, 'LIKE');
        window.dispatchEvent(new CustomEvent('atelier_posts_updated'));
      })
      .catch(error => {
        setLocationStatus(error.message);
        storageService.toggleLikePost(postId, currentUser.id);
        setFeedPosts(current => current.map(post => post.id === postId
          ? { ...post, likes: previousPost?.likes || [], likeCount: previousPost?.likeCount ?? previousPost?.likes.length ?? 0 }
          : post));
        window.dispatchEvent(new CustomEvent('atelier_posts_updated'));
      })
      .finally(() => {
        actionLocks.current.delete(postId);
        setPendingActions(new Set(actionLocks.current));
      });
  };

  // Handle Save Picture
  const handleSave = (post: ClothPost) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    if (actionLocks.current.has(post.id)) return;
    actionLocks.current.add(post.id);
    setPendingActions(new Set(actionLocks.current));

    const previousPost = feedPosts.find(item => item.id === post.id);
    const wasSaved = Boolean(previousPost?.saves.includes(currentUser.id));
    const previousSavedPhoto = storageService.getSavedPhotos().find(photo => photo.postId === post.id);
    const result = storageService.toggleSavePost(post.id, currentUser.id);
    if (result.isSaved) storageService.addSavedPhoto({ url: post.imageUrl, title: post.title, postId: post.id });
    setFeedPosts(current => current.map(item => {
      if (item.id !== post.id) return item;
      const saves = item.saves.filter(userId => userId !== currentUser.id);
      if (!wasSaved) saves.push(currentUser.id);
      return { ...item, saves, saveCount: Math.max(0, (item.saveCount ?? item.saves.length) + (wasSaved ? -1 : 1)) };
    }));
    window.dispatchEvent(new CustomEvent('atelier_posts_updated'));

    api.toggleSave(post.id)
      .then(serverResult => {
        const saves = feedPosts.find(item => item.id === post.id)?.saves.filter(userId => userId !== currentUser.id) || [];
        if (serverResult.isSaved) saves.push(currentUser.id);
        setFeedPosts(current => current.map(item => item.id === post.id
          ? { ...item, saves, saveCount: serverResult.savesCount }
          : item));
        storageService.reconcilePostEngagement(post.id, { saves });
        if (serverResult.isSaved && !wasSaved) {
          recordRecommendationSignal(post.id, 'SAVE');
          recordSearchEvent('save', post.id);
        }
        const savedPhotos = storageService.getSavedPhotos();
        if (!serverResult.isSaved) {
          const saved = savedPhotos.find(photo => photo.postId === post.id);
          if (saved) storageService.removeSavedPhoto(saved.id);
        }
        window.dispatchEvent(new CustomEvent('atelier_posts_updated'));
      })
      .catch(error => {
        setLocationStatus(error.message);
        storageService.toggleSavePost(post.id, currentUser.id);
        if (result.isSaved) {
          const saved = storageService.getSavedPhotos().find(photo => photo.postId === post.id);
          if (saved) storageService.removeSavedPhoto(saved.id);
        } else if (previousSavedPhoto) {
          storageService.addSavedPhoto({ url: previousSavedPhoto.url, title: previousSavedPhoto.title, postId: previousSavedPhoto.postId });
        }
        setFeedPosts(current => current.map(item => item.id === post.id
          ? { ...item, saves: previousPost?.saves || [], saveCount: previousPost?.saveCount ?? previousPost?.saves.length ?? 0 }
          : item));
        window.dispatchEvent(new CustomEvent('atelier_posts_updated'));
      })
      .finally(() => {
        actionLocks.current.delete(post.id);
        setPendingActions(new Set(actionLocks.current));
      });
  };

  const downloadImage = async (imageUrl: string, title: string) => {
    const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'atelier_garment'}.jpg`;
    try {
      const response = await fetch(imageUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('Image download failed');
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = filename;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  };

  // Handle Follow Tailor
  const handleFollow = (authorId: string) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    const author = users.find(user => user.id === authorId);
    if (author) onToggleFollow(author);
  };

  // Direct WhatsApp Inquiry link
  const openWhatsApp = (post: ClothPost) => {
                                                                                                                    
    const url = getWhatsAppUrl(post);
    if (!url) return;
    recordTrendEvent(post.id, 'ENQUIRY', post.authorId);
    recordSearchEvent('enquiry', post.id);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const getWhatsAppUrl = (post: ClothPost) => buildWhatsAppUrl(
    post.authorWhatsapp,
    `Hello ${post.authorName}! I saw "${post.title}" on FABSATTIRE and would like to discuss it.`,
  );

  return (
    <div ref={marketplaceRootRef} className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
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
            Discover handcrafted garments and premium fabrics from makers who take the details seriously.
          </p>
        </div>

        {/* Global Search Bar (Searches tailors, tags, cloth titles) */}
        <div className="w-full md:w-96 relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setActiveSuggestionIndex(-1);
            }}
            placeholder="Search fabrics, garments, tags, or descriptions..."
            role="combobox"
            aria-label="Search marketplace listings"
            aria-autocomplete="list"
            aria-expanded={isSearchFocused && searchSuggestions.length > 0}
            aria-controls="marketplace-search-suggestions"
            aria-activedescendant={activeSuggestionIndex >= 0 ? `marketplace-search-option-${activeSuggestionIndex}` : undefined}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (activeSuggestionIndex >= 0 && searchSuggestions[activeSuggestionIndex]) {
                  selectSearchSuggestion(searchSuggestions[activeSuggestionIndex]);
                } else {
                  rememberSearch(searchQuery);
                  setIsSearchFocused(false);
                }
                return;
              }
              if (!searchSuggestions.length) return;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const direction = event.key === 'ArrowDown' ? 1 : -1;
                setActiveSuggestionIndex(index => index < 0
                  ? (direction > 0 ? 0 : searchSuggestions.length - 1)
                  : (index + direction + searchSuggestions.length) % searchSuggestions.length);
              } else if (event.key === 'Escape') {
                setIsSearchFocused(false);
                setActiveSuggestionIndex(-1);
              }
            }}
            className={`w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border transition-all focus:outline-none focus:border-amber-500 ${
              isDarkMode
                ? 'bg-neutral-900/60 border-neutral-700 text-white placeholder-neutral-500'
                : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400 shadow-xs'
            }`}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => window.setTimeout(() => setIsSearchFocused(false), 150)}
          />
          {isSearchFocused && searchSuggestions.length > 0 && (
            <div id="marketplace-search-suggestions" role="listbox" aria-label="Marketplace search suggestions" className={`absolute z-30 top-full left-0 right-0 mt-2 rounded-xl border shadow-xl overflow-hidden ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-200'}`}>
              {searchSuggestions.map(suggestion => (
                <button
                  key={`${suggestion.type}-${suggestion.label}`}
                  type="button"
                  id={`marketplace-search-option-${searchSuggestions.indexOf(suggestion)}`}
                  role="option"
                  aria-selected={activeSuggestionIndex === searchSuggestions.indexOf(suggestion)}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => selectSearchSuggestion(suggestion)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs hover:bg-amber-500/10"
                >
                  {suggestion.user?.avatarUrl ? <img src={suggestion.user.avatarUrl} alt={suggestion.user.name || 'Seller avatar'} className="h-9 w-9 rounded-lg object-cover" /> : suggestion.user ? <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-[10px] font-black text-neutral-950">{getProfileInitials(suggestion.user.name)}</span> : suggestion.post ? <img src={suggestion.post.imageUrl} alt={suggestion.post.title || 'Marketplace listing'} className="h-9 w-9 rounded-lg bg-neutral-950 object-contain" /> : <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10"><Search className="h-3.5 w-3.5 text-amber-500" /></span>}
                  <span className="min-w-0"><strong className="block truncate">{suggestion.label}</strong><small className="text-[10px] text-neutral-400">{suggestion.type === 'recent' ? 'Recent search · this session' : suggestion.user ? getRoleLabel(suggestion.user.role) : suggestion.type === 'post' ? (suggestion.post?.isPromoted ? 'Sponsored listing' : 'Marketplace listing') : 'Category'}</small></span>
                </button>
              ))}
            </div>
          )}
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear marketplace search"
              className="absolute right-3 top-2.5 text-xs text-neutral-500 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <section aria-label="Marketplace discovery views" className={`rounded-2xl border p-3 sm:p-4 ${isDarkMode ? 'border-neutral-800 bg-[#121316]/80' : 'border-neutral-200 bg-white shadow-sm'}`}>
        <div role="tablist" aria-label="Browse marketplace listings" className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {([
            ['for-you', 'For You'],
            ['all', 'All listings'],
            ['clothing', 'Clothing'],
            ['fabrics', 'Fabrics'],
            ['tailors', 'Tailors'],
          ] as const).map(([view, label], index, tabs) => (
            <button
              key={view}
              id={`marketplace-tab-${view}`}
              type="button"
              role="tab"
              aria-selected={activeFeedView === view}
              aria-controls="marketplace-feed-panel"
              tabIndex={activeFeedView === view ? 0 : -1}
              onClick={() => setActiveFeedView(view)}
              onKeyDown={event => {
                const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                const targetIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length;
                if (!offset && event.key !== 'Home' && event.key !== 'End') return;
                event.preventDefault();
                const target = tabs[targetIndex][0];
                setActiveFeedView(target);
                document.getElementById(`marketplace-tab-${target}`)?.focus();
              }}
              className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                activeFeedView === view
                  ? 'border-amber-400 bg-amber-400 text-neutral-950'
                  : isDarkMode
                    ? 'border-neutral-700 text-neutral-300 hover:border-amber-400/60'
                    : 'border-neutral-300 text-neutral-700 hover:border-amber-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-[11px] ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            {activeFeedView === 'for-you'
              ? 'An optional, privacy-conscious mix of eligible listings. Personalization is off until you enable it; sponsored listings stay labeled.'
              : activeFeedView === 'tailors'
                ? 'Explore published work from tailor profiles.'
                : activeFeedView === 'fabrics'
                  ? 'Browse fabric listings with material and price-unit details.'
                  : activeFeedView === 'clothing'
                    ? 'Browse garments, including ready-made and made-to-order pieces.'
                    : 'Browse clothing, fabrics, and tailor portfolios in clearly labeled cards.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="marketplace-category">Filter by category</label>
            <input
              id="marketplace-category"
              type="search"
              value={selectedCategory === 'all' ? '' : selectedCategory}
              onChange={event => setSelectedCategory(event.target.value.trim() || 'all')}
              list="marketplace-category-options"
              placeholder="All categories"
              autoComplete="off"
              className={`min-h-10 rounded-lg border px-3 text-xs ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-neutral-100' : 'border-neutral-300 bg-white text-neutral-800'}`}
            />
            <datalist id="marketplace-category-options">
              {categories.map(category => <option key={category} value={category} />)}
            </datalist>
            <label className="sr-only" htmlFor="marketplace-sort">Sort listings</label>
            <select
              id="marketplace-sort"
              value={sortOrder}
              onChange={event => setSortOrder(event.target.value as MarketplaceSort)}
              className={`min-h-10 rounded-lg border px-3 text-xs ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-neutral-100' : 'border-neutral-300 bg-white text-neutral-800'}`}
            >
              <option value="relevance">Relevance</option>
              <option value="newest">Newest</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="rating">Top rated</option>
              <option value="popularity">Popularity</option>
            </select>
          </div>
        </div>
      </section>
      <details className={`rounded-2xl border p-4 ${isDarkMode ? 'border-neutral-800 bg-[#121316]/80' : 'border-neutral-200 bg-white shadow-sm'}`}>
        <summary className="cursor-pointer text-sm font-semibold text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
          More search filters
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
            Minimum price
            <input type="number" min="0" step="any" value={minimumPriceFilter} onChange={event => setMinimumPriceFilter(event.target.value)} className={`mt-1 min-h-10 w-full rounded-lg border px-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`} />
          </label>
          <label className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
            Maximum price
            <input type="number" min="0" step="any" value={maximumPriceFilter} onChange={event => setMaximumPriceFilter(event.target.value)} className={`mt-1 min-h-10 w-full rounded-lg border px-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`} />
          </label>
          <label className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
            Currency (required for price)
            <input value={currencyFilter} maxLength={8} onChange={event => setCurrencyFilter(event.target.value.replace(/[^a-z]/gi, '').toUpperCase())} placeholder="NGN" className={`mt-1 min-h-10 w-full rounded-lg border px-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`} />
          </label>
          <label className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
            Material
            <input value={materialFilter} onChange={event => setMaterialFilter(event.target.value)} placeholder="Cotton, linen..." className={`mt-1 min-h-10 w-full rounded-lg border px-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`} />
          </label>
          <label className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
            Colour
            <input value={colourFilter} onChange={event => setColourFilter(event.target.value)} placeholder="Black, indigo..." className={`mt-1 min-h-10 w-full rounded-lg border px-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`} />
          </label>
          <label className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
            Size
            <input value={sizeFilter} onChange={event => setSizeFilter(event.target.value)} placeholder="M, 12, XL..." className={`mt-1 min-h-10 w-full rounded-lg border px-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`} />
          </label>
          <label className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
            Clothing fulfilment
            <select value={fulfilmentFilter} onChange={event => setFulfilmentFilter(event.target.value)} className={`mt-1 min-h-10 w-full rounded-lg border px-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`}>
              <option value="">Any</option><option value="ready_made">Ready-made</option><option value="made_to_order">Made to order</option>
            </select>
          </label>
          <label className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
            Availability
            <select value={availabilityFilter} onChange={event => setAvailabilityFilter(event.target.value)} className={`mt-1 min-h-10 w-full rounded-lg border px-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`}>
              <option value="">Any</option><option value="available">Available</option><option value="limited">Limited stock</option><option value="made_to_order">Made to order</option>
            </select>
          </label>
        </div>
        <p className={`mt-3 text-[11px] ${isDarkMode ? 'text-neutral-500' : 'text-neutral-600'}`}>
          A place in your search (for example, “in Aba”) prioritizes matching seller locations but can include other areas; use the location filter to restrict results. Delivery availability is not inferred. Verified rating filters are unavailable because eligible rating-confidence data is not yet part of the feed.
        </p>
      </details>
      {activeFeedView === 'for-you' && <details className={`rounded-2xl border p-4 ${isDarkMode ? 'border-neutral-800 bg-[#121316]/80' : 'border-neutral-200 bg-white shadow-sm'}`}>
        <summary className="cursor-pointer text-sm font-semibold text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
          For You preferences and privacy
        </summary>
        <form onSubmit={saveRecommendationSettings} className="mt-4 space-y-4">
          <label className={`flex items-start gap-3 text-xs ${isDarkMode ? 'text-neutral-200' : 'text-neutral-700'}`}>
            <input
              type="checkbox"
              checked={recommendationPreferences.enabled}
              onChange={event => setRecommendationEnabled(event.target.checked)}
              className="mt-0.5 accent-amber-400"
            />
            <span><strong>Use my activity to personalize this feed</strong><span className="mt-1 block text-neutral-500">Off by default. If enabled, recent listing interactions are stored on this device for up to 180 days. Anonymous preferences last for this browser session. No sensitive attributes are inferred.</span></span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
              Preferred categories (comma separated)
              <input value={categoryPreferenceInput} onChange={event => setCategoryPreferenceInput(event.target.value)} placeholder="Clothing, Fabric" className={`mt-1 min-h-10 w-full rounded-lg border px-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`} />
            </label>
            <label className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
              Preferred styles or materials (comma separated)
              <input value={stylePreferenceInput} onChange={event => setStylePreferenceInput(event.target.value)} placeholder="Senator, linen, Ankara" className={`mt-1 min-h-10 w-full rounded-lg border px-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`} />
            </label>
            <label className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
              Minimum price
              <input type="number" min="0" step="any" value={minimumPriceInput} onChange={event => setMinimumPriceInput(event.target.value)} className={`mt-1 min-h-10 w-full rounded-lg border px-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`} />
            </label>
            <label className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
              Maximum price
              <input type="number" min="0" step="any" value={maximumPriceInput} onChange={event => setMaximumPriceInput(event.target.value)} className={`mt-1 min-h-10 w-full rounded-lg border px-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`} />
            </label>
            <label className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
              Price currency (required with a price range)
              <input value={currencyPreferenceInput} onChange={event => setCurrencyPreferenceInput(event.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 3))} maxLength={3} placeholder="USD" className={`mt-1 min-h-10 w-full rounded-lg border px-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`} />
            </label>
            <label className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
              Preferred country (optional)
              <input value={countryPreferenceInput} onChange={event => setCountryPreferenceInput(event.target.value)} maxLength={80} className={`mt-1 min-h-10 w-full rounded-lg border px-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`} />
            </label>
            <label className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
              Preferred state or region (optional)
              <input value={statePreferenceInput} onChange={event => setStatePreferenceInput(event.target.value)} maxLength={80} className={`mt-1 min-h-10 w-full rounded-lg border px-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`} />
            </label>
          </div>
          <p className={`text-[11px] ${isDarkMode ? 'text-neutral-500' : 'text-neutral-600'}`}>The current feed uses selected preferences, recent marketplace trend scores where available, listing freshness, and listing completeness. Verified rating-confidence and seller-reliability signals are not available to this ranker and are not guessed. Recent listings receive limited exploration slots; this is not a claim that they have had fewer impressions.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="min-h-10 rounded-lg bg-amber-400 px-4 text-xs font-bold text-neutral-950 hover:bg-amber-300">Save preferences</button>
            <button type="button" onClick={resetRecommendations} className={`min-h-10 rounded-lg border px-4 text-xs font-semibold ${isDarkMode ? 'border-neutral-700 text-neutral-200 hover:border-amber-400' : 'border-neutral-300 text-neutral-700 hover:border-amber-500'}`}>Reset preferences and activity</button>
            {recommendationNotice && <span role="status" className="text-xs text-neutral-500">{recommendationNotice}</span>}
          </div>
        </form>
      </details>}

      {/* Randomized picture carousel with promoted posts weighted more often */}
      {carouselPosts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-400/15 text-neutral-950 font-bold text-xs ring-1 ring-amber-500/30">
                👘
              </div>
              <h2 className="text-sm font-semibold tracking-wide uppercase text-amber-400 font-mono">
                Curated atelier picks
              </h2>
            </div>
            <span className="text-[11px] text-neutral-400">Selected work from real makers</span>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-amber-500/30 bg-neutral-950 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
            {(() => {
              const post = carouselPosts[activeCarouselIndex % carouselPosts.length];
              return (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0.5, scale: 1.02 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.45 }}
                  className="relative aspect-[10/13] min-h-[320px] bg-neutral-950 sm:aspect-[16/7] sm:min-h-[320px]"
                >
                  <button type="button" data-marketplace-listing-id={post.id} data-marketplace-seller-id={post.authorId} onClick={() => openListing(post)} aria-label={`View ${post.title}`} className="absolute inset-0 h-full w-full cursor-pointer">
                    <img src={getPostImageSource(post)} alt={post.imageAlt || post.title || 'Atelier garment listing'} className="h-full w-full object-contain brightness-110 saturate-110" loading="eager" onError={() => handlePostImageError(post, getPostImageSource(post))} />
                  </button>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.12),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.02)_25%,rgba(0,0,0,0.16)_55%,rgba(0,0,0,0.64)_100%)] sm:bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.14),transparent_30%),linear-gradient(90deg,rgba(0,0,0,0.72),rgba(0,0,0,0.3)_55%,rgba(0,0,0,0.04))]" />

                  <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-6">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      {post.isPromoted && (
                        <span className="rounded-full border border-amber-300/70 bg-amber-400/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-neutral-950 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.22em]">
                          Promoted
                        </span>
                      )}
                      <span className="rounded-full border border-white/20 bg-black/35 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-amber-100 backdrop-blur-sm sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.2em]">
                        {post.listingType === 'FABRIC' ? 'Fabric' : post.listingType === 'TAILOR_PORTFOLIO' ? 'Tailor portfolio' : 'Clothing'}
                      </span>
                      {post.isPromoted && <span className="rounded-full border border-amber-300/40 bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-100 backdrop-blur-sm">Sponsored</span>}
                    </div>

                    <button type="button" onClick={() => {
                      const author = userById.get(post.authorId);
                      if (author) onSelectSeller(author);
                    }} aria-label={`View ${post.authorName}'s atelier`} className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/35 px-2 py-1 text-left backdrop-blur-md transition hover:border-amber-300/70">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-neutral-950 sm:h-7 sm:w-7 sm:text-[10px]">
                        {post.authorName.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="text-[10px] font-semibold text-white sm:text-xs">{post.authorName}</span>
                    </button>
                  </div>

                  <div className="absolute inset-x-0 bottom-0 p-3 sm:p-6 lg:p-8">
                    <div className="max-w-3xl rounded-[1.2rem] border border-white/10 bg-black/25 p-3 backdrop-blur-md sm:rounded-[1.5rem] sm:p-5">
                      <div className="flex flex-wrap items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-amber-300 font-semibold sm:gap-2 sm:text-[10px] sm:tracking-[0.22em]">
                        <span>{formatLocation(post.authorLocation)}</span>
                        <span className="text-neutral-400">•</span>
                        <span>{post.pricing.basic > 0 ? `${post.pricing.currency || 'USD'} ${post.pricing.basic}` : 'Negotiable price'}</span>
                      </div>

                      <h2 className="mt-2 text-xl font-serif font-extrabold leading-tight text-white sm:text-2xl lg:text-4xl">
                        {post.title}
                      </h2>

                      <p className="mt-2 max-w-2xl text-xs text-neutral-200 sm:text-sm lg:text-base">
                        {post.description}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-4 sm:gap-2">
                        {post.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[8px] font-medium uppercase tracking-[0.14em] text-amber-200 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.16em]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 flex flex-col gap-2 sm:mt-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-200 sm:gap-2 sm:text-[11px]">
                          <span className="rounded-lg border border-neutral-700 bg-neutral-900/70 px-2 py-1 sm:px-2.5 sm:py-1.5">
                            <span className="text-neutral-400">Likes</span> {getLikeCount(post)}
                          </span>
                          <span className="rounded-lg border border-neutral-700 bg-neutral-900/70 px-2 py-1 sm:px-2.5 sm:py-1.5">
                            <span className="text-neutral-400">Saves</span> {getSaveCount(post)}
                          </span>
                          <span className="rounded-lg border border-neutral-700 bg-neutral-900/70 px-2 py-1 sm:px-2.5 sm:py-1.5">
                            <span className="text-neutral-400">Rating</span>{' '}
                            {post.ratingCount
                              ? `${(post.rating || 0).toFixed(1)} · ${post.ratingCount} review${post.ratingCount === 1 ? '' : 's'}`
                              : 'No reviews yet'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-end">
                          {getWhatsAppUrl(post) ? <button type="button" onClick={() => openWhatsApp(post)} className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white transition hover:bg-emerald-500 sm:text-[11px]">WhatsApp seller</button> : <span className="px-2 py-2 text-[10px] text-neutral-500">WhatsApp unavailable</span>}
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

      {(trendingPosts.length > 0 || trendingLoading || trendingError) && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold tracking-wide uppercase text-emerald-400 font-mono">{activeTrendCategoryLabel} · Craft</h2>
              <span className="text-[11px] text-neutral-400">
                {trendingPage?.fallback ? 'New listings shown until there is enough qualified activity' : 'Recent activity adjusted for exposure and confidence'}
              </span>
            </div>
            <label className="sr-only" htmlFor="marketplace-trend-category">Trending category</label>
            <select
              id="marketplace-trend-category"
              value={activeTrendCategory}
              onChange={event => {
                setActiveTrendCategory(event.target.value as MarketplaceTrendCategory);
                setShowAllTrending(false);
              }}
              className={`min-h-9 rounded-lg border px-2 text-xs ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-neutral-100' : 'border-neutral-300 bg-white text-neutral-800'}`}
            >
              <option value="TRENDING_NOW">Trending Now</option>
              <option value="RISING">Rising</option>
              <option value="POPULAR">Popular</option>
              <option value="NEW_NOTICED">New &amp; Noticed</option>
              <option value="HIGHLY_RATED">Highly Rated</option>
              <option value="MOST_VIEWED">Most Viewed</option>
            </select>
          </div>
          {trendingError && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200" role="status">
              <span>{trendingError}</span>
              <button type="button" onClick={() => setTrendingRetry(value => value + 1)} className="font-semibold underline underline-offset-2">Retry</button>
            </div>
          )}
          {trendingPage?.fallbackMessage && <p className="text-xs text-neutral-400">{trendingPage.fallbackMessage}</p>}
          {trendingLoading && <p className="text-xs text-neutral-400" role="status">Refreshing qualified trend signals…</p>}
          <div ref={trendScrollRef} className="flex gap-3 overflow-x-auto pb-3 scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {trendingPosts.map((post, index) => {
              const isFocused = index === focusIndex;
              return (
                <button
                  key={post.id}
                  data-marketplace-listing-id={post.id}
                  data-marketplace-seller-id={post.authorId}
                  type="button"
                  onClick={() => {
                    openListing(post);
                  }}
                  aria-label={`Explore ${post.title}`}
                  className="group relative min-w-[260px] max-w-[320px] flex-1 shrink-0 snap-center overflow-hidden rounded-[1.5rem] border bg-neutral-900/70 text-left transition-all duration-300 ease-out"
                  style={{
                    transform: `scale(${isFocused ? 1 : 0.92}) translateY(${isFocused ? '0px' : '12px'})`,
                    opacity: isFocused ? 1 : 0.45,
                    filter: isFocused ? 'blur(0px)' : 'blur(0.8px)',
                    borderColor: isFocused ? 'rgba(251, 191, 36, 0.45)' : 'rgba(255,255,255,0.08)',
                    boxShadow: isFocused ? '0 30px 70px rgba(251, 191, 36, 0.12)' : '0 8px 24px rgba(0,0,0,0.12)',
                  }}
                >
                  <div className="relative overflow-hidden">
                    <img src={getPostImageSource(post)} alt={post.imageAlt || post.title || 'Trending atelier piece'} className="h-36 w-full bg-neutral-950 object-contain brightness-110 saturate-110" loading="lazy" onError={() => handlePostImageError(post, getPostImageSource(post))} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    {post.isPromoted && <span className="absolute left-2 top-2 rounded bg-amber-500 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-neutral-950">Sponsored</span>}
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-xs font-semibold truncate text-white">{post.title}</p>
                      <p className="mt-1 text-[10px] text-neutral-200">{post.authorName} · {getLikeCount(post) + getSaveCount(post)} signals</p>
                      {post.ratingCount
                        ? <span className="mt-1 flex items-center gap-1 text-[10px] text-amber-400"><Star className="h-3 w-3 fill-current" /> {post.rating?.toFixed(1)} · {post.ratingCount} review{post.ratingCount === 1 ? '' : 's'}</span>
                        : <span className="mt-1 block text-[10px] text-neutral-300">No reviews yet</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {trendingPosts.length >= 7 && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setShowAllTrending(value => !value)}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300 transition hover:border-emerald-400 hover:bg-emerald-500/20"
              >
                {showAllTrending ? 'Show top 7' : 'See more trending'}
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showAllTrending ? 'rotate-90' : ''}`} />
              </button>
            </div>
          )}
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
            <button type="button" onClick={() => showLocationFilters ? setShowLocationFilters(false) : loadLocationFilters()} aria-expanded={showLocationFilters} className="rounded-xl border border-neutral-700 px-3.5 py-2 text-xs font-semibold text-neutral-300 transition hover:border-amber-500/50 hover:text-white">
              {isLoadingLocationFilters ? 'Loading locations...' : showLocationFilters ? 'Hide location filters' : 'Filter by country'}
            </button>
          </div>

          {/* Cascading Location Selectors */}
          {showLocationFilters && worldCountries.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs">
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
              {worldCountries.map((c) => (
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
                {worldCountries.find(c => c.name === filterCountry)?.states.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            {/* City Selector */}
            {filterState !== 'all' && (
              <input
                type="text"
                value={filterCity === 'all' ? '' : filterCity}
                onChange={(e) => setFilterCity(e.target.value.trim() || 'all')}
                placeholder="Filter by city"
                aria-label="Filter listings by city"
                className="px-2.5 py-1.5 rounded-lg bg-neutral-800/80 border border-neutral-700 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
              />
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
          </div>}
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

      <section id="marketplace-feed-panel" role="tabpanel" aria-labelledby={`marketplace-tab-${activeFeedView}`} className="space-y-5">
      {/* Server-paginated listings feed */}
      {feedLoading && filteredPosts.length === 0 ? (
        <div aria-label="Loading listings" aria-busy="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className={`overflow-hidden rounded-3xl border ${isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white'}`}>
              <div className="aspect-[4/3] animate-pulse bg-neutral-700/30" />
              <div className="space-y-3 p-4">
                <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-700/30" />
                <div className="h-5 w-3/4 animate-pulse rounded bg-neutral-700/30" />
                <div className="h-3 w-full animate-pulse rounded bg-neutral-700/30" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className={`text-center py-16 px-6 rounded-3xl border ${
          isDarkMode ? 'bg-[#121316]/50 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
        }`}>
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-4">
            <Scissors className="w-8 h-8" />
          </div>

          <h3 className="text-2xl font-serif font-bold mb-2">
            {postsLoadError || feedError
              ? 'The atelier feed could not be reached'
              : hasActiveFeedFilters || sellerPosts.length > 0
                ? 'No pieces match this view'
                : currentUser?.role === 'tailor'
                  ? 'Your first collection is waiting to be shared'
                  : currentUser?.role === 'fabric_seller'
                    ? 'Your fabric collection is ready to be listed'
                    : 'Fresh work from the atelier is on its way'}
          </h3>

          <p className={`text-xs max-w-md mx-auto mb-6 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            {postsLoadError || feedError
              ? (feedError || 'Your saved listings are safe. Check your connection and try loading the feed again.')
              : hasActiveFeedFilters || sellerPosts.length > 0
                ? 'Adjust your search, category, location, or For You preferences to see more listings.'
                : currentUser?.role === 'tailor'
                  ? 'Publish garments, pricing, and fabric details for buyers to discover.'
                  : currentUser?.role === 'fabric_seller'
                    ? 'List materials, textures, and wholesale details for designers and tailors.'
                    : 'No listings match this view right now. Try a broader search or check back for fresh drops.'}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {postsLoadError || feedError ? (
              <button
                type="button"
                onClick={() => {
                  onRetryLoad();
                  setFeedRetry(value => value + 1);
                }}
                className="rounded-xl bg-amber-400 px-5 py-2.5 text-xs font-semibold text-neutral-950 transition hover:bg-amber-300"
              >
                Retry loading listings
              </button>
            ) : hasActiveFeedFilters || sellerPosts.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setSelectedTag('all');
                  setSortOrder('relevance');
                  setMinimumPriceFilter('');
                  setMaximumPriceFilter('');
                  setCurrencyFilter('');
                  setMaterialFilter('');
                  setColourFilter('');
                  setSizeFilter('');
                  setFulfilmentFilter('');
                  setAvailabilityFilter('');
                  setFilterCountry('all');
                  setFilterState('all');
                  setFilterCity('all');
                  setNearMeActive(false);
                  setUserCoords(null);
                }}
                className="rounded-xl bg-amber-400 px-5 py-2.5 text-xs font-semibold text-neutral-950 transition hover:bg-amber-300"
              >
                Reset search and filters
              </button>
            ) : currentUser && (currentUser.role === 'tailor' || currentUser.role === 'fabric_seller') ? (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('navigate_to_tab', { detail: 'dashboard' }))}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:shadow-lg hover:shadow-amber-500/25 transition-all"
              >
                {currentUser.role === 'tailor' ? 'Post Your Cloth Collection →' : 'Post Your Fabric Inventory →'}
              </button>
            ) : (
              <button
                onClick={onOpenAuth}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:shadow-lg hover:shadow-amber-500/25 transition-all"
              >
                {currentUser ? 'Join as Tailor / Fabric Seller' : 'Register as Tailor / Fabric Merchant to Post'}
              </button>
            )}
            {activeFeedView === 'for-you' && hasActiveFeedFilters && <button
              type="button"
              onClick={resetRecommendations}
              className="rounded-xl border border-amber-500/40 px-5 py-2.5 text-xs font-semibold text-amber-500 transition hover:bg-amber-500/10"
            >
              Reset For You preferences
            </button>}
          </div>
        </div>
      ) : (
        <div className="marketplace-masonry grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
          {visiblePosts.map((post, postIndex) => {
            const isLiked = currentUser ? post.likes.includes(currentUser.id) : false;
            const isSaved = currentUser ? post.saves.includes(currentUser.id) : false;
            const likeCount = post.likeCount ?? post.likes.length;
            const saveCount = post.saveCount ?? post.saves.length;
            const details = (post.listingDetails || {}) as Record<string, unknown>;
            const priceMin = post.priceMin ?? (post.pricing?.basic || null);
            const priceMax = post.priceMax ?? priceMin;
            const currency = post.currency || post.pricing?.currency || post.authorLocation.currency || 'USD';
            const priceLabel = priceMin === null
              ? 'Price on enquiry'
              : `${currency} ${Number(priceMin).toLocaleString()}${priceMax !== null && priceMax !== priceMin ? ` – ${currency} ${Number(priceMax).toLocaleString()}` : ''}${typeof details.priceUnit === 'string' ? ` / ${details.priceUnit}` : ''}`;
            const locationLabel = formatLocation(post.authorLocation);
            const listingTypeLabel = post.listingType === 'FABRIC'
              ? 'Fabric'
              : post.listingType === 'TAILOR_PORTFOLIO'
                ? 'Tailor portfolio'
                : 'Clothing';
            const postImageSource = getPostImageSource(post);

            // Distance calculation if userCoords present
            const distanceKm = userCoords && post.authorLocation.lat && post.authorLocation.lng
              ? calculateDistanceKm(userCoords.lat, userCoords.lng, post.authorLocation.lat, post.authorLocation.lng)
              : null;

            return (
              <React.Fragment key={post.id}>
              <motion.article
                data-marketplace-listing-id={post.id}
                data-marketplace-seller-id={post.authorId}
                layout
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('button, a, input, textarea, select')) return;
                  openListing(post);
                }}
                className={`marketplace-card feed-card-wave mb-3 break-inside-avoid rounded-[1.5rem] border overflow-hidden transition-all group flex flex-col justify-between ${
                  isDarkMode
                    ? 'bg-[#121316] border-neutral-800/90 hover:border-amber-500/40'
                    : 'bg-white border-neutral-200/90 hover:border-amber-500/40 shadow-sm'
                } ${post.isPromoted ? 'border-amber-400/70 shadow-[0_18px_42px_rgba(251,191,36,0.14)]' : ''}`}
              >
                {/* Post Header: Tailor Handle, Location & Promoted Symbol */}
                <div className="p-3 flex items-center justify-between border-b border-neutral-800/40">
                  <button type="button" onClick={() => {
                    const author = userById.get(post.authorId);
                    if (author) onSelectSeller(author);
                  }} className="flex min-w-0 items-center gap-2.5 text-left">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 font-bold text-xs flex items-center justify-center overflow-hidden">
                      {post.authorAvatar ? <img src={post.authorAvatar} alt={`${post.authorName || 'Seller'} avatar`} className="h-full w-full object-cover" /> : post.authorName.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold block leading-tight">
                          {post.authorName}
                        </span>
                        {post.isPromoted && (
                          <span
                            title="Paid placement"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-300 uppercase tracking-tighter ring-1 ring-amber-500/25"
                          >
                            Sponsored
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-start gap-0.5 text-[10px] text-neutral-400">
                        <span className="font-semibold uppercase tracking-[0.12em] text-amber-500">{getRoleLabel(post.authorRole)}</span>
                        <span>{post.authorHandle}</span>
                      </div>
                      {(locationLabel || distanceKm !== null) && (
                        <div className="flex items-center gap-1 text-[10px] text-neutral-400">
                          <MapPin className="w-2.5 h-2.5 text-amber-500" />
                          {locationLabel && <span>{locationLabel}</span>}
                          {distanceKm !== null && <span className="text-amber-400 font-mono">({distanceKm} km away)</span>}
                        </div>
                      )}
                      {post.searchLocationHint && (
                        <span className={`block text-[10px] ${post.searchLocationMatch ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {post.searchLocationMatch
                            ? `Matches ${post.searchLocationHint}`
                            : locationLabel
                              ? `Outside ${post.searchLocationHint} · ask about delivery`
                              : 'Seller location not provided · ask about delivery'}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Share post */}
                  <div className="flex items-center gap-1">
                    {(() => {
                      const author = users.find(user => user.id === post.authorId);
                      const isFollowing = Boolean(currentUser && author?.followers?.includes(currentUser.id));
                      return author && author.id !== currentUser?.id ? (
                        <button type="button" onClick={() => handleFollow(author.id)} className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${isFollowing ? 'border-emerald-500/40 text-emerald-300' : 'border-amber-500/40 text-amber-300 hover:bg-amber-500/10'}`}>
                          {isFollowing ? 'Following' : 'Follow'}
                        </button>
                      ) : null;
                    })()}
                    <button type="button" onClick={() => { recordTrendEvent(post.id, 'SHARE', post.authorId); onSharePost(post); }} title="Share listing" aria-label={`Share ${post.title}`} className="p-1.5 rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-neutral-800/50 transition-colors">
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Garment Image with High-Res Zoom / Save */}
                <div className="feed-card-image group/img relative w-full overflow-hidden bg-neutral-950">
                  {postImageSource ? (
                    <img
                      src={postImageSource}
                      alt={post.title}
                      className="block h-auto w-full cursor-pointer object-contain brightness-110 saturate-110 transition-[filter] duration-300 group-hover/img:brightness-125"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      onContextMenu={(event) => event.preventDefault()}
                      onClick={() => openListing(post)}
                      onError={() => handlePostImageError(post, postImageSource)}
                    />
                  ) : (
                    <div
                      role="img"
                      aria-label={`Image unavailable for ${post.title}`}
                      className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-neutral-900/80 text-neutral-500"
                    >
                      <Scissors aria-hidden="true" className="h-8 w-8 text-amber-500/70" />
                      <span className="text-xs">Listing image unavailable</span>
                    </div>
                  )}

                  {/* Top image overlay badges */}
                  <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold backdrop-blur-md bg-black/60 text-white border border-white/10">
                      {listingTypeLabel}
                    </span>
                    {post.categoryId && <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold capitalize backdrop-blur-md bg-black/60 text-white border border-white/10">{post.categoryId.replace(/[-_]/g, ' ')}</span>}
                  </div>
                  {post.imageAssets && post.imageAssets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => openListing(post)}
                      className="absolute bottom-2.5 left-2.5 rounded-md bg-black/70 px-2 py-1 text-[10px] font-semibold text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                      aria-label={`View ${post.imageAssets.length} photos for ${post.title}`}
                    >
                      {post.imageAssets.length} photos · View gallery
                    </button>
                  )}

                  {/* Save listing */}
                  <button
                    type="button"
                    onClick={() => handleSave(post)}
                    disabled={pendingActions.has(post.id)}
                  aria-pressed={isSaved}
                    aria-label={`${isSaved ? 'Remove saved listing' : 'Save listing'}: ${post.title}`}
                    title={isSaved ? 'Remove from saved listings' : 'Save listing'}
                    className={`absolute top-2.5 right-2.5 p-2 rounded-xl backdrop-blur-md transition-all ${
                      isSaved
                        ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                        : 'bg-black/60 hover:bg-black/80 text-white border border-white/20'
                    }`}
                  >
                    <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-neutral-950' : ''}`} />
                  </button>
                  {activeFeedView === 'for-you' && recommendationPreferences.enabled && <button
                    type="button"
                    onClick={() => {
                      recordRecommendationSignal(post.id, 'NOT_INTERESTED');
                      if (!currentUser) {
                        setRecommendationNotice('We will avoid this listing on this device and adjust its category and style signals.');
                        return;
                      }
                      setPendingActions(current => new Set(current).add(`feedback-${post.id}`));
                      void api.setRecommendationFeedback(post.id, 'not_interested', true)
                        .then(() => {
                          setFeedPosts(current => current.filter(item => item.id !== post.id));
                          setRecommendationNotice('This listing is hidden from your recommendations for 30 days.');
                        })
                        .catch(error => {
                          setRecommendationNotice(`This device will avoid the listing, but account feedback could not be saved: ${error instanceof Error ? error.message : 'try again later.'}`);
                        })
                        .finally(() => setPendingActions(current => {
                          const next = new Set(current);
                          next.delete(`feedback-${post.id}`);
                          return next;
                        }));
                    }}
                    disabled={pendingActions.has(`feedback-${post.id}`)}
                    aria-label={`Show me fewer listings like ${post.title}`}
                    title="Not interested"
                    className="absolute right-2.5 top-14 rounded-xl border border-white/20 bg-black/70 p-2 text-white backdrop-blur-md hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    <EyeOff className="h-4 w-4" />
                  </button>}

                  {/* Quick Preview trigger */}
                  <div className="absolute bottom-2.5 right-2.5 flex gap-1.5 opacity-0 transition-opacity group-hover/img:opacity-100">
                    <button
                      onClick={() => void downloadImage(post.imageUrl, post.title)}
                      title="Download image to device"
                      className="px-2.5 py-1 rounded-lg text-[10px] font-semibold backdrop-blur-md bg-black/70 hover:bg-black text-amber-300 border border-amber-500/30 flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </button>
                  </div>
                </div>

                {/* Post Body: Title, Description, Tags, Custom Pricing */}
                <div className="flex-1 space-y-2 p-3">
                  <div>
                    <h3 className="font-serif font-bold text-base leading-snug">
                      {post.title}
                    </h3>
                    <p className={`mt-1 line-clamp-1 text-xs leading-relaxed ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>
                      {post.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openListing(post)}
                    className="min-h-9 rounded-lg border border-amber-500/30 px-3 text-left text-[11px] font-semibold text-amber-400 hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    View listing details and gallery
                  </button>

                  {/* Tags */}
                  {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {post.tags.slice(0, 3).map((tag) => (
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
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-neutral-800/80 bg-neutral-900/30 p-2 text-[11px]">
                    <span className="text-[9px] uppercase font-bold tracking-wider text-amber-500/80">
                      Price
                    </span>
                    <span className="text-right text-neutral-200">{priceLabel}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-neutral-400">
                    <span className="capitalize">{post.availability === 'made_to_order' ? 'Made to order' : post.availability === 'limited' ? 'Limited availability' : 'Available'}</span>
                    {typeof post.stockQuantity === 'number' && <span>{post.stockQuantity} in stock</span>}
                    {typeof details.leadTimeDays === 'number' && <span>{details.leadTimeDays} day lead time</span>}
                    {details.fulfilment === 'ready_made' && <span>Ready-made</span>}
                    {details.fulfilment === 'made_to_order' && <span>Made to order</span>}
                    {typeof details.material === 'string' && <span>{details.material}</span>}
                    {typeof details.colour === 'string' && <span>{details.colour}</span>}
                    {Array.isArray(details.sizes) && details.sizes.length > 0 && <span>Sizes: {details.sizes.slice(0, 4).join(', ')}</span>}
                    {Array.isArray(details.customizationOptions) && details.customizationOptions.length > 0 && <span>Customization available</span>}
                  </div>

                  <div className="flex items-center justify-between pt-0 text-[10px] font-mono text-neutral-400">
                    <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                    <span>{saveCount} Saves</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-neutral-800/60 pt-2">
                    <span className="text-[10px] text-neutral-500">Firsthand feedback is shown on the listing page</span>
                    <button type="button" onClick={() => openListing(post)} className="text-[10px] font-semibold text-amber-500 hover:text-amber-300">Read reviews</button>
                  </div>
                  {activeFeedView === 'for-you' && post.recommendationReason && <p className="text-[10px] text-neutral-500">Why this appears: {post.recommendationReason}</p>}
                </div>

                {/* Footer: Like Counter and WhatsApp Contact */}
                <div className="flex items-center justify-between gap-2 border-t border-neutral-800/60 bg-neutral-900/20 px-3 py-2">
                  <button
                    type="button"
                    disabled={pendingActions.has(post.id)}
                    aria-label={`${isLiked ? 'Unlike' : 'Like'} ${post.title}`}
                    aria-pressed={isLiked}
                    onClick={() => handleLike(post.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      isLiked
                        ? 'text-red-400 bg-red-500/15 border border-red-500/30'
                        : 'text-neutral-400 hover:text-red-400 bg-neutral-800/40 hover:bg-neutral-800'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-400' : ''}`} />
                    <span>{likeCount}</span>
                  </button>

                  {getWhatsAppUrl(post) ? <button type="button" onClick={() => openWhatsApp(post)} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500" title="Contact seller on WhatsApp"><Phone className="h-3.5 w-3.5" /><span>WhatsApp</span></button> : <span className="text-[10px] text-neutral-500">WhatsApp unavailable</span>}
                </div>
              </motion.article>
              {(postIndex === 9 || postIndex === 19) && smartMarketplaceHighlights.length > 0 && (
                <section className="md:col-span-2 lg:col-span-3 rounded-[2rem] border border-amber-500/20 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_18%),linear-gradient(135deg,rgba(17,17,17,0.92),rgba(20,24,30,0.96))] p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400">Smart discovery</p>
                      <h2 className="mt-1 font-serif text-2xl font-bold text-white">Marketplace pulse</h2>
                    </div>
                    <TrendingUp className="h-5 w-5 text-amber-300" />
                  </div>
                  <div className="grid gap-4 lg:grid-cols-3">
                    {smartMarketplaceHighlights.map((block) => {
                      const Icon = block.icon;
                      return (
                        <div key={block.title} className={`rounded-[1.5rem] border p-3 ${block.accent}`}>
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em]">
                              <Icon className="h-3.5 w-3.5" />
                              {block.title}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {block.items.length > 0 ? block.items.map(item => (
                              <button key={`${block.title}-${item.id}`} type="button" data-marketplace-listing-id={item.listingId} data-marketplace-seller-id={item.sellerId} onClick={() => {
                                const internalPost = tailorPosts.find(post => post.id === item.id);
                                if (internalPost) openListing(internalPost);
                                else if (item.title && item.imageUrl) {
                                  const seller = users.find(user => user.id === item.id);
                                  if (seller) onSelectSeller(seller);
                                }
                              }} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-black/15 p-2 text-left transition hover:border-white/20 hover:bg-black/20">
                                {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-neutral-950 object-contain" loading="lazy" onError={() => { const failedPost = tailorPosts.find(post => post.imageUrl === item.imageUrl); if (failedPost) handlePostImageError(failedPost, item.imageUrl); }} /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 text-[10px] uppercase tracking-[0.12em] text-white/80">Live</div>}
                                <span className="min-w-0">
                                  <strong className="block truncate text-xs text-white">{item.title}</strong>
                                  {item.isPromoted && <small className="mt-0.5 block text-[9px] font-bold uppercase tracking-wider text-amber-300">Sponsored</small>}
                                  <small className="mt-1 block truncate text-[10px] text-neutral-300">{item.subtitle}</small>
                                </span>
                              </button>
                            )) : (
                              <div className="rounded-2xl border border-dashed border-white/15 p-3 text-[10px] uppercase tracking-[0.18em] text-neutral-300/80">No live signal yet</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
              {(postIndex + 1) % 12 === 0 && postIndex + 1 < filteredPosts.length && (
                <div className="md:col-span-2 lg:col-span-3">
                  <MarketplaceInterlude posts={filteredPosts} users={users} isDarkMode={isDarkMode} onSelectSeller={onSelectSeller} />
                </div>
              )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {feedError && filteredPosts.length > 0 && (
        <div role="alert" className="flex flex-col items-start justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-200 sm:flex-row sm:items-center">
          <span>{feedError}</span>
          <button type="button" onClick={() => void loadMoreListings()} className="rounded-lg border border-red-300/40 px-3 py-2 font-semibold hover:bg-red-500/20">
            Retry loading more
          </button>
        </div>
      )}

      {feedHasMore && (
        <div className="flex justify-center pb-3">
          <button
            type="button"
            onClick={() => void loadMoreListings()}
            disabled={feedLoadingMore}
            className="min-h-11 rounded-xl border border-amber-500/40 bg-amber-500/10 px-6 py-3 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            {feedLoadingMore ? 'Loading more listings…' : 'Load more listings'}
          </button>
        </div>
      )}
      </section>

    </div>
  );
};
