
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Search, MapPin, Filter, Star, Heart, Bookmark, Share2, Phone, Scissors, Sparkles, Navigation, Download, ExternalLink, ChevronLeft, ChevronRight, TrendingUp, EyeOff, Flame } from 'lucide-react';
import { ClothPost, CountryGeo, DiscoveryEvent, MarketplaceFeedView, MarketplaceSort, MarketplaceStyleReferencePage, MarketplaceTrendCategory, MarketplaceTrendingPage, RecommendationEventType, RecommendationPreferences, SellerCollection, User, UserLocation } from '../types';
import { storageService } from '../services/storage';
import { api } from '../services/api';
import { MarketplaceInterlude } from './MarketplaceInterlude';
import { buildPostShareUrl, getProfileInitials, getRoleLabel } from '../utils/profile';
import { matchesLocationFilter } from '../utils/artisanFilters';
import { rankMarketplaceListings } from '../utils/marketplaceRanking';
import { buildWhatsAppUrl } from '../utils/whatsapp';
import { safeCustomerErrorMessage } from '../utils/customerMessages';
import { animateActionFeedback } from '../utils/actionFeedback';
import { SearchableLocationField } from './SearchableLocationField';
import { PostImage } from './PostImage';
import { ContentSkeleton } from './ContentSkeleton';
import { PromotedTailorRail, StoryRail } from './StoryRail';
import { StyleReferenceGallery } from './StyleReferenceGallery';

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
  onOpenPromotionPlans: () => void;
  pendingStoryFile: File | null;
  onPendingStoryFileHandled: () => void;
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
const TREND_CATEGORY_LABELS: Partial<Record<MarketplaceTrendCategory, string>> = {
  TRENDING_NOW: 'Trending Now',
  RISING: 'Rising',
  POPULAR: 'Popular',
  NEW_NOTICED: 'New & Noticed',
  MOST_VIEWED: 'Most Viewed',
};

const DISCOVERY_POST_THRESHOLD = 6;

const DISCOVERY_CATEGORIES: Array<{ title: string; keywords: string[] }> = [
  { title: 'Bridal Wear', keywords: ['bridal', 'bride', 'wedding', 'white wedding'] },
  { title: 'Office Wear', keywords: ['office', 'corporate', 'workwear', 'business wear'] },
  { title: 'Evening & Occasion Wear', keywords: ['evening', 'party', 'occasion', 'gown', 'cocktail'] },
  { title: 'Traditional & Native Wear', keywords: ['traditional', 'native', 'ankara', 'agbada', 'kaftan'] },
  { title: 'Casual Wear', keywords: ['casual', 'everyday', 'streetwear'] },
];

const discoveryImage = (post: ClothPost) => post.imageAssets?.find(asset => asset.url)?.url
  || post.imageAssets?.find(asset => asset.thumbnailUrl)?.thumbnailUrl
  || post.imageUrl;

interface DiscoveryCarouselProps {
  title: string;
  subtitle: string;
  posts: ClothPost[];
  isDarkMode: boolean;
  onSelectPost: (post: ClothPost) => void;
}

const DiscoveryCarousel: React.FC<DiscoveryCarouselProps> = ({ title, subtitle, posts, isDarkMode, onSelectPost }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const availablePosts = posts.filter(post => Boolean(discoveryImage(post)));

  useEffect(() => {
    if (availablePosts.length < 2) return;
    const timer = window.setInterval(() => setActiveIndex(index => (index + 1) % availablePosts.length), 12000);
    return () => window.clearInterval(timer);
  }, [availablePosts.length]);

  useEffect(() => {
    if (activeIndex >= availablePosts.length) setActiveIndex(0);
  }, [activeIndex, availablePosts.length]);

  if (availablePosts.length < DISCOVERY_POST_THRESHOLD) return null;
  const activePost = availablePosts[activeIndex % availablePosts.length];

  return (
    <section className={`overflow-hidden rounded-[1.75rem] border ${isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm'}`}>
      <div className="flex items-end justify-between gap-4 border-b border-neutral-800/50 px-5 py-4 sm:px-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">{subtitle}</p>
          <h2 className="mt-1 font-serif text-xl font-bold sm:text-2xl">{title}</h2>
        </div>
        {availablePosts.length > 1 && (
          <div className="flex gap-2">
            <button type="button" aria-label={`Previous ${title}`} onClick={() => setActiveIndex(index => (index - 1 + availablePosts.length) % availablePosts.length)} className="rounded-full border border-neutral-700 p-2"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label={`Next ${title}`} onClick={() => setActiveIndex(index => (index + 1) % availablePosts.length)} className="rounded-full border border-neutral-700 p-2"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>
      <button type="button" onClick={() => onSelectPost(activePost)} className="group relative block h-[min(68svh,560px)] min-h-[420px] w-full overflow-hidden text-left sm:h-[420px]">
        <motion.img key={activePost.id} initial={{ opacity: 0.45 }} animate={{ opacity: 1 }} transition={{ duration: 0.45 }} src={discoveryImage(activePost)} alt={activePost.imageAlt || activePost.title} className="absolute inset-0 h-full w-full bg-[#f3f0e9] object-contain" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />
        <div className="absolute bottom-0 left-0 p-5 text-white sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-300">{activePost.authorName}</p>
          <h3 className="mt-1 max-w-xl font-serif text-2xl font-bold sm:text-3xl">{activePost.title}</h3>
          <span className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-xs font-bold text-neutral-950">View piece</span>
        </div>
      </button>
      <div className="grid grid-cols-4 gap-2 p-3 sm:grid-cols-6 lg:grid-cols-8">
        {availablePosts.slice(0, 8).map((post, index) => (
          <button key={post.id} type="button" aria-label={`Show ${post.title}`} onClick={() => setActiveIndex(index)} className={`aspect-square overflow-hidden rounded-xl border-2 ${index === activeIndex ? 'border-amber-400' : 'border-transparent opacity-70'}`}>
            <img src={discoveryImage(post)} alt="" className="h-full w-full bg-[#f3f0e9] object-contain" />
          </button>
        ))}
      </div>
    </section>
  );
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
  isDarkMode,
  onOpenPromotionPlans,
  pendingStoryFile,
  onPendingStoryFileHandled,
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
  const [publicCollections, setPublicCollections] = useState<SellerCollection[]>([]);
  const [styleReferencePage, setStyleReferencePage] = useState<MarketplaceStyleReferencePage | null>(null);
  const [styleReferenceLoading, setStyleReferenceLoading] = useState(true);
  const [styleReferenceLoadingMore, setStyleReferenceLoadingMore] = useState(false);
  const [styleReferenceError, setStyleReferenceError] = useState<string | null>(null);
  const [showAllStyleReferences, setShowAllStyleReferences] = useState(false);
  const [styleReferenceRetry, setStyleReferenceRetry] = useState(0);
  const [showAllCollections, setShowAllCollections] = useState(false);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const [downloadMessage, setDownloadMessage] = useState<{ listingId: string; message: string } | null>(null);
  const reportedAnalyticsFailures = useRef(new Set<string>());
  const analyticsRetryAfter = useRef(0);
  const impressionRequestInFlight = useRef(false);
  const [failedPostImageUrls, setFailedPostImageUrls] = useState<Record<string, string>>({});
  const [failedAvatarUrls, setFailedAvatarUrls] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!showAllCollections) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowAllCollections(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showAllCollections]);
  const postsRef = useRef(posts);
  postsRef.current = posts;
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
        setRecommendationNotice(`Preferences are saved on this device, but account sync could not be completed: ${safeCustomerErrorMessage(error, 'please try again later.')}`);
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
        setRecommendationNotice(`Your choice is saved on this device, but account sync could not be completed: ${safeCustomerErrorMessage(error, 'please try again later.')}`);
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
        setRecommendationNotice(`Your settings were reset on this device, but account settings could not be cleared: ${safeCustomerErrorMessage(error, 'please try again later.')}`);
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
  const marketplaceRootRef = useRef<HTMLDivElement | null>(null);
  const locationDataRequestRef = useRef<Promise<CountryGeo[]> | null>(null);
  const [trendingRetry, setTrendingRetry] = useState(0);
  const activeTrendingPage = trendingPage?.category === activeTrendCategory ? trendingPage : null;

  useEffect(() => {
    let active = true;
    void api.getPublicSellerCollections()
      .then(collections => {
        if (active) setPublicCollections(Array.isArray(collections) ? collections.filter(collection => collection.imageUrls.some(Boolean)) : []);
      })
      .catch(error => console.warn('Public seller collections could not be loaded.', error));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setStyleReferenceLoading(true);
    setStyleReferenceError(null);
    void api.getMarketplaceStyleReferences()
      .then(page => { if (active) setStyleReferencePage(page); })
      .catch(error => {
        if (active) {
          console.warn('Marketplace style references could not be loaded.', error);
          setStyleReferenceError(safeCustomerErrorMessage(error, 'Style inspiration could not be loaded.'));
        }
      })
      .finally(() => { if (active) setStyleReferenceLoading(false); });
    return () => { active = false; };
  }, [styleReferenceRetry]);

  const loadMoreStyleReferences = async () => {
    const cursor = styleReferencePage?.nextCursor;
    if (!cursor || styleReferenceLoadingMore) return;
    setStyleReferenceLoadingMore(true);
    setStyleReferenceError(null);
    try {
      const nextPage = await api.getMarketplaceStyleReferences(Number(cursor), 15);
      setStyleReferencePage(current => current ? {
        items: [...current.items, ...nextPage.items.filter(item => !current.items.some(existing => existing.id === item.id))],
        nextCursor: nextPage.nextCursor,
        hasMore: nextPage.hasMore,
      } : nextPage);
    } catch (error) {
      console.warn('Additional marketplace style references could not be loaded.', error);
      setStyleReferenceError(safeCustomerErrorMessage(error, 'More style references could not be loaded. Please try again.'));
    } finally {
      setStyleReferenceLoadingMore(false);
    }
  };

  const trendScores = useMemo(() => new Map(
    (activeTrendingPage && !activeTrendingPage.fallback ? activeTrendingPage.items : []).map(post => [post.id, {
      score: post.trendScore || 0,
      confidence: post.trendConfidence || 0,
    }]),
  ), [activeTrendingPage]);
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
    if (original && failedPostImageUrls[post.id] !== original) return original;
    if (thumbnail && failedPostImageUrls[post.id] !== thumbnail) return thumbnail;
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
  const discoveryCategorySections = useMemo(() => DISCOVERY_CATEGORIES.map(category => ({
    ...category,
    posts: tailorPosts.filter(post => {
      const haystack = [
        post.categoryId || '',
        post.title,
        post.description,
        ...(post.tags || []),
        'garmentType' in (post.listingDetails || {}) ? String((post.listingDetails as { garmentType?: string }).garmentType || '') : '',
      ].join(' ').toLowerCase();
      return Boolean(discoveryImage(post)) && category.keywords.some(keyword => haystack.includes(keyword));
    }),
  })).filter(category => category.posts.length >= DISCOVERY_POST_THRESHOLD), [tailorPosts]);
  const topTailors = useMemo(() => {
    const counts = new Map<string, ClothPost[]>();
    tailorPosts.forEach(post => {
      if (!discoveryImage(post)) return;
      counts.set(post.authorId, [...(counts.get(post.authorId) || []), post]);
    });
    return Array.from(counts.entries())
      .map(([sellerId, sellerPostsForTailor]) => ({
        seller: userById.get(sellerId),
        posts: sellerPostsForTailor,
      }))
      .filter((entry): entry is { seller: User; posts: ClothPost[] } =>
        Boolean(entry.seller && entry.posts.length >= DISCOVERY_POST_THRESHOLD))
      .sort((a, b) => b.posts.length - a.posts.length)
      .slice(0, 8);
  }, [tailorPosts, userById]);
  const visibleSellerCollections = useMemo(() => (
    sellerPosts.length >= DISCOVERY_POST_THRESHOLD
      ? publicCollections.filter(collection => collection.imageUrls.filter(Boolean).length > 0).slice(0, 8)
      : []
  ), [publicCollections, sellerPosts.length]);
  const formatLocation = (location?: Partial<UserLocation>) => [location?.city, location?.state, location?.country].filter(Boolean).join(', ');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [filterState, setFilterState] = useState<string>('all');
  const [filterCity, setFilterCity] = useState<string>('all');
  const [countrySearch, setCountrySearch] = useState('');
  const [stateSearch, setStateSearch] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [worldCountries, setWorldCountries] = useState<CountryGeo[]>([]);
  const [showLocationFilters, setShowLocationFilters] = useState(false);
  const [isLoadingLocationFilters, setIsLoadingLocationFilters] = useState(false);
  const [nearMeActive, setNearMeActive] = useState<boolean>(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState<number>(0);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const selectedFilterCountry = worldCountries.find(country => country.name === filterCountry || country.code === filterCountry);
  const selectedFilterState = selectedFilterCountry?.states.find(state => state.name === filterState || state.code === filterState);
  const countryFilterOptions = worldCountries.filter(country => !countrySearch.trim()
    || country.name.toLowerCase().includes(countrySearch.trim().toLowerCase())
    || country.code.toLowerCase().includes(countrySearch.trim().toLowerCase())).slice(0, 100);
  const stateFilterOptions = (selectedFilterCountry?.states || []).filter(state => !stateSearch.trim()
    || state.name.toLowerCase().includes(stateSearch.trim().toLowerCase())
    || state.code.toLowerCase().includes(stateSearch.trim().toLowerCase())).slice(0, 100);
  const cityFilterOptions = (selectedFilterState?.cities || []).filter(city => !citySearch.trim()
    || city.toLowerCase().includes(citySearch.trim().toLowerCase())).slice(0, 100);

  useEffect(() => {
    if (!hasLoadedServerFeed.current && posts.length > 0) setFeedPosts(posts.slice(0, 16));
  }, [posts]);

  useEffect(() => {
    const generation = ++feedGeneration.current;
    let cancelled = false;
    setFeedLoading(true);
    setFeedLoadingMore(false);
    setFeedError(null);
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
        setFeedPosts(page.items.length > 0
          ? page.items
          : hasActiveFeedFilters
            ? []
            : postsRef.current.slice(0, 16));
        setFeedCursor(page.nextCursor);
        setFeedHasMore(page.hasMore);
        if (searchQuery.trim().length >= 2) recordSearchEvent('impression', undefined, page.items.length);
      }).catch(error => {
        if (!cancelled && generation === feedGeneration.current) {
          setFeedPosts(postsRef.current.slice(0, 16));
          setFeedCursor(null);
          setFeedHasMore(false);
          setFeedError(hasActiveFeedFilters
            ? safeCustomerErrorMessage(error, "We couldn't load listings. Please try again.")
            : null);
        }
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
      if (generation === feedGeneration.current) setFeedError(safeCustomerErrorMessage(error, "We couldn't load more listings. Please try again."));
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

  const carouselPosts = useMemo(() => rankMarketplaceListings(
    tailorPosts,
    users,
    recommendationEvents,
    recommendationPreferences,
    { trendScores },
  ).slice(0, 8), [tailorPosts, users, recommendationEvents, recommendationPreferences, trendScores, recommendationRevision]);

  const trendingPosts = useMemo(
    () => (activeTrendingPage && !activeTrendingPage.fallback ? activeTrendingPage.items : []).slice(0, showAllTrending ? 48 : 7),
    [activeTrendingPage, showAllTrending],
  );
  const activeTrendCategoryLabel = TREND_CATEGORY_LABELS[activeTrendCategory];

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
      limit: showAllTrending ? 48 : 7,
    }).then(page => {
      if (!cancelled) setTrendingPage(page);
    }).catch(error => {
      if (!cancelled) {
        const reason = safeCustomerErrorMessage(error, "We couldn't load popular listings. Please try again.");
        setTrendingPage(current => current?.category === activeTrendCategory && !current.fallback ? current : null);
        setTrendingError(reason);
      }
    }).finally(() => {
      if (!cancelled) setTrendingLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeTrendCategory, showAllTrending, trendingRetry]);

  useEffect(() => {
    if (!showAllTrending || trendingLoading || trendingError) return;
    document.getElementById('marketplace-trends-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showAllTrending, trendingLoading, trendingError, activeTrendingPage]);

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
  }, [visiblePosts, currentUser?.id, trendingPosts, activeCarouselIndex, recommendationScope, searchQuery, selectedCategory]);

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
    const isImpression = eventType === 'IMPRESSION';
    if (isImpression && impressionRequestInFlight.current) return;
    if (isImpression) impressionRequestInFlight.current = true;
    void api.recordMarketplaceEvent(listingId, eventType, recommendation).catch(error => {
      analyticsRetryAfter.current = Date.now() + 60_000;
      if (reportedAnalyticsFailures.current.has(eventType)) return;
      reportedAnalyticsFailures.current.add(eventType);
      if (import.meta.env.DEV) console.warn(`Marketplace ${eventType.toLowerCase()} activity could not be recorded.`, error);
    }).finally(() => {
      if (isImpression) impressionRequestInFlight.current = false;
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
      if (import.meta.env.DEV) console.warn(`Marketplace search ${eventType} activity could not be recorded.`, error);
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
        setLocationStatus(safeCustomerErrorMessage(error, "We couldn't update your saved listings. Please try again."));
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
  const handleSave = (post: ClothPost, button: HTMLButtonElement) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    if (actionLocks.current.has(post.id)) return;
    actionLocks.current.add(post.id);
    setPendingActions(new Set(actionLocks.current));

    const previousPost = feedPosts.find(item => item.id === post.id) || post;
    const wasSaved = Boolean(previousPost?.saves.includes(currentUser.id));
    const previousSavedPhoto = storageService.getSavedPhotos().find(photo => photo.postId === post.id);
    const nextSaves = wasSaved
      ? previousPost.saves.filter(userId => userId !== currentUser.id)
      : [...previousPost.saves, currentUser.id];
    storageService.reconcilePostEngagement(post.id, { saves: nextSaves });
    if (wasSaved) {
      if (previousSavedPhoto) storageService.removeSavedPhoto(previousSavedPhoto.id);
    } else {
      storageService.addSavedPhoto({ url: post.imageUrl, title: post.title, postId: post.id });
    }
    setFeedPosts(current => current.map(item => {
      if (item.id !== post.id) return item;
      const saves = item.saves.filter(userId => userId !== currentUser.id);
      if (!wasSaved) saves.push(currentUser.id);
      return { ...item, saves, saveCount: Math.max(0, (item.saveCount ?? item.saves.length) + (wasSaved ? -1 : 1)) };
    }));
    window.dispatchEvent(new CustomEvent('atelier_posts_updated'));

    api.toggleSave(post.id)
      .then(serverResult => {
        const saves = previousPost.saves.filter(userId => userId !== currentUser.id);
        if (serverResult.isSaved) saves.push(currentUser.id);
        setFeedPosts(current => current.map(item => {
          if (item.id !== post.id) return item;
          const itemSaves = item.saves.filter(userId => userId !== currentUser.id);
          if (serverResult.isSaved) itemSaves.push(currentUser.id);
          return { ...item, saves: itemSaves, saveCount: serverResult.savesCount };
        }));
        storageService.reconcilePostEngagement(post.id, { saves });
        if (serverResult.isSaved && !wasSaved) {
          storageService.addSavedPhoto({ url: post.imageUrl, title: post.title, postId: post.id });
          animateActionFeedback(button, 'save');
          recordRecommendationSignal(post.id, 'SAVE');
          recordSearchEvent('save', post.id);
        }
        const savedPhotos = storageService.getSavedPhotos();
        if (!serverResult.isSaved) {
          const saved = savedPhotos.find(photo => photo.postId === post.id);
          if (saved) storageService.removeSavedPhoto(saved.id);
        } else if (!savedPhotos.some(photo => photo.postId === post.id)) {
          storageService.addSavedPhoto({ url: post.imageUrl, title: post.title, postId: post.id });
        }
        window.dispatchEvent(new CustomEvent('atelier_posts_updated'));
      })
      .catch(error => {
        setLocationStatus(safeCustomerErrorMessage(error, "We couldn't update your saved listings. Please try again."));
        storageService.reconcilePostEngagement(post.id, { saves: previousPost.saves });
        if (!wasSaved) {
          const saved = storageService.getSavedPhotos().find(photo => photo.postId === post.id);
          if (saved) storageService.removeSavedPhoto(saved.id);
        } else if (previousSavedPhoto) {
          storageService.addSavedPhoto({ url: previousSavedPhoto.url, title: previousSavedPhoto.title, postId: previousSavedPhoto.postId });
        } else if (wasSaved) {
          storageService.addSavedPhoto({ url: post.imageUrl, title: post.title, postId: post.id });
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

  const downloadImage = async (post: ClothPost, button: HTMLButtonElement) => {
    setDownloadMessage(null);
    try {
      const blob = await api.downloadMarketplaceImage(post.id);
      const slug = post.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'atelier_garment';
      const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : blob.type === 'image/avif' ? 'avif' : 'jpg';
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${slug}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
      animateActionFeedback(button, 'download');
    } catch (error) {
      setDownloadMessage({
        listingId: post.id,
        message: safeCustomerErrorMessage(error, "We couldn't download this image. Please try again."),
      });
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

  const getWhatsAppUrl = (post: ClothPost) => {
    const seller = userById.get(post.authorId);
    return buildWhatsAppUrl(
      post.authorWhatsapp || seller?.whatsappNumber || seller?.phone,
      `Hello ${post.authorName}! I saw "${post.title}" on FABSATTIRE and would like to discuss it.\n\nView this listing: ${buildPostShareUrl(window.location.origin, post.authorHandle, post.id)}`,
    );
  };

  const prefersReducedMotion = useReducedMotion();

  return (
    <div ref={marketplaceRootRef} className="relative z-10 w-full px-2 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-amber-500/15 pb-6">
        <div>
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', bounce: 0.35, delay: 0.55 }}
            className="inline-flex items-center gap-1.5 text-xs text-amber-500 font-semibold tracking-wider mb-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{currentUser ? 'Glad you came back 😇' : 'Welcome to Fabsattire'}</span>
          </motion.div>
          <motion.h1
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-3xl text-3xl leading-tight font-serif font-bold tracking-tight sm:text-4xl lg:text-5xl"
          >
            Find your next favourite piece.
          </motion.h1>
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            Explore distinctive garments and fabrics, then contact each independent merchant directly on WhatsApp.
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
                  {suggestion.user?.avatarUrl && !failedAvatarUrls.has(suggestion.user.avatarUrl)
                    ? <img src={suggestion.user.avatarUrl} alt={suggestion.user.name || 'Seller avatar'} onError={() => setFailedAvatarUrls(current => new Set(current).add(suggestion.user!.avatarUrl!))} className="h-9 w-9 rounded-lg object-cover" />
                    : suggestion.user ? <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-[10px] font-black text-neutral-950">{getProfileInitials(suggestion.user.name)}</span>
                      : suggestion.post ? <PostImage src={suggestion.post.imageUrl} alt={suggestion.post.title || 'Marketplace listing'} className="h-9 w-9 rounded-lg" watermark={false} />
                        : <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10"><Search className="h-3.5 w-3.5 text-amber-500" /></span>}
                  <span className="min-w-0"><strong className="block truncate">{suggestion.label}</strong><small className="text-[10px] text-neutral-400">{suggestion.type === 'recent' ? 'Recent search · this session' : suggestion.user ? getRoleLabel(suggestion.user.role) : suggestion.type === 'post' ? (suggestion.post?.isPromoted ? 'Promoted listing' : 'Marketplace listing') : 'Category'}</small></span>
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

      <StoryRail
        users={users}
        currentUser={currentUser}
        isDarkMode={isDarkMode}
        onOpenPlans={onOpenPromotionPlans}
        onSelectSeller={onSelectSeller}
        pendingStoryFile={pendingStoryFile}
        onPendingStoryFileHandled={onPendingStoryFileHandled}
      />
      {styleReferencePage?.items.length || styleReferenceLoading || styleReferenceError ? (
        <StyleReferenceGallery
          references={styleReferencePage?.items || []}
          users={users}
          isDarkMode={isDarkMode}
          hasMore={styleReferencePage?.hasMore ?? false}
          isLoading={styleReferenceLoading}
          isLoadingMore={styleReferenceLoadingMore}
          error={styleReferenceError}
          isOpen={showAllStyleReferences}
          onLoadMore={() => void loadMoreStyleReferences()}
          onRetry={() => setStyleReferenceRetry(retry => retry + 1)}
          onOpen={() => setShowAllStyleReferences(true)}
          onClose={() => setShowAllStyleReferences(false)}
        />
      ) : null}

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
              ? 'An optional, privacy-conscious mix of eligible listings. Personalization is off until you enable it; promoted listings stay clearly labelled.'
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

      {carouselPosts.length >= DISCOVERY_POST_THRESHOLD && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/15 text-xs font-bold text-neutral-950 ring-1 ring-amber-500/30">👘</div>
              <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-amber-400">Curated atelier picks</h2>
            </div>
            <span className="text-[11px] text-neutral-400">Selected work from real merchants</span>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] border border-amber-500/30 bg-neutral-950 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
            {(() => {
              const post = carouselPosts[activeCarouselIndex % carouselPosts.length];
              const imageSource = getPostImageSource(post);
              return (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0.5, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                  className="grid min-h-[500px] overflow-hidden bg-neutral-950 md:min-h-[390px] md:grid-cols-[1.15fr_0.85fr]"
                >
                  <div className="group/curated-image relative flex min-h-[min(72svh,620px)] items-center justify-center overflow-hidden bg-[#f1ece3] md:min-h-0">
                    <button type="button" data-marketplace-listing-id={post.id} data-marketplace-seller-id={post.authorId} onClick={() => openListing(post)} aria-label={`View ${post.title}`} className="absolute inset-0 flex h-full w-full cursor-pointer items-center justify-center">
                      {imageSource && <PostImage src={imageSource} alt={post.imageAlt || post.title || 'Atelier garment listing'} className="absolute inset-0 h-full w-full" imageClassName="transition-transform duration-500" fit="contain" loading="eager" onError={() => handlePostImageError(post, imageSource)} />}
                    </button>
                    <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2 sm:left-6 sm:top-6">
                      {post.isPromoted && <span className="rounded-full bg-amber-400 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-neutral-950 shadow-sm">Promoted</span>}
                      <span className="rounded-full border border-neutral-900/10 bg-white/95 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-800 shadow-sm">
                        {post.listingType === 'FABRIC' ? 'Fabric' : post.listingType === 'TAILOR_PORTFOLIO' ? 'Tailor portfolio' : 'Clothing'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col justify-center border-t border-white/10 bg-gradient-to-br from-[#171615] via-[#111112] to-[#1c1710] p-5 sm:p-7 md:border-l md:border-t-0 md:p-8 lg:p-10">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">Curated atelier pick</span>
                      {post.isPromoted && <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">Promoted</span>}
                    </div>
                    <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">{post.authorName} <span className="px-1 text-neutral-600">/</span> {formatLocation(post.authorLocation)}</p>
                    <h2 className="mt-2 line-clamp-2 font-serif text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl">{post.title}</h2>
                    <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-neutral-300 sm:text-base">{post.description || post.tags.slice(0, 3).map(tag => `#${tag}`).join(' ') || 'Explore this piece from the seller collection.'}</p>
                    <p className="mt-5 text-lg font-bold text-white">{post.pricing.basic > 0 ? `${post.pricing.currency || 'USD'} ${post.pricing.basic.toLocaleString()}` : 'Price on enquiry'}</p>
                    {post.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{post.tags.slice(0, 3).map(tag => <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-neutral-300">#{tag}</span>)}</div>}
                    <button type="button" onClick={() => openListing(post)} className="mt-6 inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-bold text-neutral-950 transition hover:bg-amber-300">
                      Discover this piece <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })()}
            {carouselPosts.length > 1 && (
              <>
                <button type="button" onClick={() => setActiveCarouselIndex(index => (index - 1 + carouselPosts.length) % carouselPosts.length)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white transition hover:bg-amber-400 hover:text-neutral-950" aria-label="Previous runway post">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setActiveCarouselIndex(index => (index + 1) % carouselPosts.length)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white transition hover:bg-amber-400 hover:text-neutral-950" aria-label="Next runway post">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {(trendingPosts.length > 0 || trendingLoading || trendingError) && (
        <section className={`overflow-hidden rounded-[1.75rem] border ${isDarkMode ? 'border-orange-400/20 bg-[#13110f]' : 'border-orange-300/50 bg-[#fffaf3] shadow-sm'}`}>
          <div className={`flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${isDarkMode ? 'border-white/10 bg-gradient-to-r from-orange-950/50 via-neutral-950 to-neutral-950' : 'border-orange-200 bg-gradient-to-r from-orange-100 via-white to-amber-50'}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-400/30 bg-gradient-to-br from-orange-500/20 to-amber-400/10">
                <Flame aria-hidden="true" className="trending-flame h-6 w-6 text-orange-400" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={`text-base font-black uppercase tracking-[0.12em] sm:text-lg ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>{activeTrendCategoryLabel}</h2>
                  <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-orange-400">
                    Popular picks
                  </span>
                </div>
                <p className={`mt-1 text-[11px] ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
                  A fresh look at pieces shoppers are exploring.
                </p>
              </div>
            </div>
            <div role="group" aria-label="Trend category" className="flex flex-wrap gap-2">
              {(Object.entries(TREND_CATEGORY_LABELS) as [MarketplaceTrendCategory, string][]).map(([category, label]) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={activeTrendCategory === category}
                  onClick={() => {
                    setActiveTrendCategory(category);
                    setShowAllTrending(false);
                  }}
                  className={`min-h-9 rounded-full border px-3 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                    activeTrendCategory === category
                      ? 'border-orange-400 bg-orange-400 text-neutral-950'
                      : isDarkMode
                        ? 'border-neutral-700 text-neutral-300 hover:border-orange-400/60'
                        : 'border-neutral-300 text-neutral-700 hover:border-orange-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {trendingError && (
            <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 sm:mx-5" role="status">
              <span>{trendingError}</span>
              <button type="button" onClick={() => setTrendingRetry(value => value + 1)} className="font-semibold underline underline-offset-2">Retry</button>
            </div>
          )}
          {trendingLoading && <p className="px-4 pt-4 text-xs text-neutral-400 sm:px-5" role="status">Loading popular pieces…</p>}
          {trendingPosts.length > 0 && (
            <div id="marketplace-trends-list" className="marketplace-masonry scroll-mt-24 grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 2xl:grid-cols-4">
              {trendingPosts.map((post, index) => {
                const imageSource = getPostImageSource(post);
                const isLiked = currentUser ? post.likes.includes(currentUser.id) : false;
                const isSaved = currentUser ? post.saves.includes(currentUser.id) : false;
                const price = post.priceMin ?? (post.pricing?.basic || null);
                const currency = post.currency || post.pricing?.currency || post.authorLocation.currency || 'USD';
                return (
                  <motion.article
                    key={post.id}
                    data-marketplace-listing-id={post.id}
                    data-marketplace-seller-id={post.authorId}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(index, 5) * 0.04 }}
                    onClick={event => {
                      if ((event.target as HTMLElement).closest('button, a')) return;
                      openListing(post);
                    }}
                    className={`marketplace-card feed-card-wave mb-3 break-inside-avoid overflow-hidden rounded-[1.5rem] border transition-all ${
                      isDarkMode ? 'border-neutral-800/90 bg-[#121316] hover:border-orange-400/50' : 'border-neutral-200/90 bg-white shadow-sm hover:border-orange-400/60'
                    } ${post.isPromoted ? 'border-amber-400/70 shadow-[0_18px_42px_rgba(251,191,36,0.14)]' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-neutral-800/40 p-3">
                      <button type="button" onClick={() => {
                        const author = userById.get(post.authorId);
                        if (author) onSelectSeller(author);
                      }} className="flex min-w-0 items-center gap-2.5 text-left">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-500/40 bg-amber-500/20 text-xs font-bold text-amber-400">
                          {post.authorAvatar && !failedAvatarUrls.has(post.authorAvatar)
                            ? <img src={post.authorAvatar} alt="" className="h-full w-full object-cover" onError={() => setFailedAvatarUrls(current => new Set(current).add(post.authorAvatar))} />
                            : post.authorName.charAt(0)}
                        </span>
                        <span className="min-w-0">
                          <span className={`block truncate text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>{post.authorName}</span>
                          <span className="block truncate text-[10px] text-neutral-500">{formatLocation(post.authorLocation)}</span>
                        </span>
                      </button>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-orange-400/25 bg-orange-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-orange-400">
                        <Flame className="h-3 w-3" /> #{index + 1}
                      </span>
                    </div>

                    <div className="feed-card-image group/img relative w-full overflow-hidden bg-neutral-950">
                      {imageSource
                        ? <PostImage src={imageSource} alt={post.imageAlt || post.title || 'Trending atelier piece'} className="aspect-[4/3] w-full" loading="lazy" decoding="async" onError={() => handlePostImageError(post, imageSource)} />
                        : <div role="img" aria-label={`Image unavailable for ${post.title}`} className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-neutral-900/80 text-neutral-500"><Scissors aria-hidden="true" className="h-8 w-8 text-amber-500/70" /><span className="text-xs">Listing image unavailable</span></div>}
                      <span className="absolute left-2.5 top-2.5 rounded-md border border-orange-300/30 bg-neutral-950/90 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-orange-200">{activeTrendCategoryLabel}</span>
                      {post.isPromoted && <span className="absolute right-2.5 top-2.5 rounded-md bg-amber-400 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-neutral-950">Promoted</span>}
                      <button type="button" onClick={event => handleSave(post, event.currentTarget)} disabled={pendingActions.has(post.id)} aria-pressed={isSaved} aria-label={`${isSaved ? 'Remove saved listing' : 'Save listing'}: ${post.title}`} className={`absolute right-2.5 bottom-2.5 rounded-xl p-2 transition ${isSaved ? 'bg-amber-500 text-neutral-950' : 'border border-white/20 bg-black/70 text-white hover:bg-black'}`}>
                        <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-neutral-950' : ''}`} />
                      </button>
                    </div>

                    <div className="space-y-2 p-3">
                      <div>
                        <h3 className={`font-serif text-base font-bold leading-snug ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>{post.title}</h3>
                        <div className="mt-1 flex items-center gap-1 text-[11px]">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          <span className="font-semibold text-amber-500">{post.rating > 0 ? post.rating.toFixed(1) : 'New'}</span>
                          <span className={isDarkMode ? 'text-neutral-500' : 'text-neutral-500'}>({post.ratingCount || 0} reviews)</span>
                        </div>
                        <p className={`mt-1 line-clamp-2 text-xs leading-relaxed ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>{post.description || post.tags.slice(0, 3).map(tag => `#${tag}`).join(' ') || 'Contact the seller for details about this piece.'}</p>
                      </div>
                      <button type="button" onClick={() => openListing(post)} className="min-h-9 rounded-lg border border-amber-500/30 px-3 text-left text-[11px] font-semibold text-amber-500 hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                        View listing details and gallery
                      </button>
                      {post.tags.length > 0 && <div className="flex flex-wrap gap-1">
                        {post.tags.slice(0, 3).map(tag => <span key={tag} className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-500">#{tag}</span>)}
                      </div>}
                      <div className={`flex items-center justify-between gap-2 rounded-xl border p-2 text-[11px] ${isDarkMode ? 'border-neutral-800/80 bg-neutral-900/30' : 'border-neutral-200 bg-neutral-50'}`}>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500/80">Price</span>
                        <span className={`text-right ${isDarkMode ? 'text-neutral-200' : 'text-neutral-800'}`}>{price === null ? 'Price on enquiry' : `${currency} ${Number(price).toLocaleString()}`}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-neutral-800/60 pt-2 text-[10px] text-neutral-500">
                        <span className="inline-flex items-center gap-1"><TrendingUp className="h-3 w-3 text-orange-400" />Popular now</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-neutral-800/60 bg-neutral-900/20 px-3 py-2">
                      <button type="button" disabled={pendingActions.has(post.id)} aria-pressed={isLiked} aria-label={`${isLiked ? 'Unlike' : 'Like'} ${post.title}`} onClick={() => handleLike(post.id)} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${isLiked ? 'border border-red-500/30 bg-red-500/15 text-red-400' : 'bg-neutral-800/40 text-neutral-400 hover:bg-neutral-800 hover:text-red-400'}`}>
                        <Heart className={`h-4 w-4 ${isLiked ? 'fill-red-400' : ''}`} /><span>{getLikeCount(post)}</span>
                      </button>
                      {getWhatsAppUrl(post) ? <button type="button" onClick={() => openWhatsApp(post)} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"><Phone className="h-3.5 w-3.5" /><span>WhatsApp</span></button> : <span className="text-[10px] text-neutral-500">WhatsApp unavailable</span>}
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
          {!trendingLoading && !trendingError && trendingPosts.length === 0 && !activeTrendingPage?.fallback && (
            <p className={`m-4 rounded-xl border px-4 py-5 text-center text-xs sm:m-5 ${isDarkMode ? 'border-neutral-800 bg-neutral-900/40 text-neutral-400' : 'border-neutral-200 bg-white text-neutral-600'}`}>
              Popular items will appear here as more customers explore Fabsattire.
            </p>
          )}
          {(showAllTrending ? trendingPosts.length > 7 : trendingPosts.length >= 7) && (
            <div className="flex justify-center px-4 pb-5">
              <button
                type="button"
                disabled={trendingLoading}
                onClick={() => setShowAllTrending(value => !value)}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-orange-400/30 bg-orange-500/10 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-400 transition hover:border-orange-400 hover:bg-orange-500/20 disabled:cursor-wait disabled:opacity-50"
              >
                {trendingLoading ? 'Loading trends…' : showAllTrending ? 'Show top 7' : 'See all trends'}
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
          {showLocationFilters && worldCountries.length > 0 && <div className="grid gap-2 text-xs sm:grid-cols-3">
            <SearchableLocationField
              label="Country"
              value={countrySearch}
              onChange={value => {
                setCountrySearch(value);
                const match = worldCountries.find(country => country.name.toLowerCase() === value.trim().toLowerCase()
                  || country.code.toLowerCase() === value.trim().toLowerCase());
                setFilterCountry(match?.name || 'all');
                setFilterState('all');
                setFilterCity('all');
                setStateSearch('');
                setCitySearch('');
              }}
              onClear={() => {
                setCountrySearch('');
                setFilterCountry('all');
                setFilterState('all');
                setFilterCity('all');
                setStateSearch('');
                setCitySearch('');
              }}
              options={countryFilterOptions.map(country => country.name)}
              placeholder="All countries · type to search"
              listId="marketplace-country-filter"
            />
            {selectedFilterCountry && <SearchableLocationField
              label="State / province"
              value={stateSearch}
              onChange={value => {
                setStateSearch(value);
                const match = selectedFilterCountry.states.find(state => state.name.toLowerCase() === value.trim().toLowerCase()
                  || state.code.toLowerCase() === value.trim().toLowerCase());
                setFilterState(match?.name || 'all');
                setFilterCity('all');
                setCitySearch('');
              }}
              onClear={() => {
                setStateSearch('');
                setFilterState('all');
                setFilterCity('all');
                setCitySearch('');
              }}
              options={stateFilterOptions.map(state => state.name)}
              placeholder="All states · type to search"
              listId="marketplace-state-filter"
            />}
            {selectedFilterState && <SearchableLocationField
              label="City"
              value={citySearch}
              onChange={value => {
                setCitySearch(value);
                const match = selectedFilterState.cities.find(city => city.toLowerCase() === value.trim().toLowerCase());
                setFilterCity(match || 'all');
              }}
              onClear={() => {
                setCitySearch('');
                setFilterCity('all');
              }}
              options={cityFilterOptions}
              placeholder="All cities · type to search"
              listId="marketplace-city-filter"
            />}

            {(filterCountry !== 'all' || filterState !== 'all' || filterCity !== 'all' || nearMeActive) && (
              <button
                onClick={() => {
                  setFilterCountry('all');
                  setFilterState('all');
                  setFilterCity('all');
                  setCountrySearch('');
                  setStateSearch('');
                  setCitySearch('');
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
        <ContentSkeleton isDarkMode={isDarkMode} />
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
                  setCountrySearch('');
                  setStateSearch('');
                  setCitySearch('');
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
        <div className="marketplace-masonry grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-3 2xl:grid-cols-4">
          {visiblePosts.map((post, postIndex) => {
            const daySeed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
            const railInterval = 5 + ((daySeed * 7 + Math.max(0, visiblePosts.length) * 3) % 6);
            const shouldShowPromotedRail = postIndex > 0 && postIndex % railInterval === 0;
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
            const authorAvatar = post.authorAvatar;

            // Distance calculation if userCoords present
            const distanceKm = userCoords && post.authorLocation.lat && post.authorLocation.lng
              ? calculateDistanceKm(userCoords.lat, userCoords.lng, post.authorLocation.lat, post.authorLocation.lng)
              : null;

            return (
              <React.Fragment key={post.id}>
              {shouldShowPromotedRail && (
                <PromotedTailorRail users={users} isDarkMode={isDarkMode} onSelectSeller={onSelectSeller} />
              )}
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
                <div className={`flex items-center justify-between gap-2 px-3 py-3 ${isDarkMode ? 'bg-[#121316]' : 'bg-white'}`}>
                  <button type="button" onClick={() => {
                    const author = userById.get(post.authorId);
                    if (author) onSelectSeller(author);
                  }} className="flex min-w-0 items-center gap-2.5 text-left">
                    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-amber-500/15 text-xs font-bold text-amber-600">
                      {authorAvatar && !failedAvatarUrls.has(authorAvatar)
                        ? <img src={authorAvatar} alt="" className="h-full w-full object-cover" onError={() => setFailedAvatarUrls(current => new Set(current).add(authorAvatar))} />
                        : getProfileInitials(post.authorName)}
                    </span>
                    <span className="min-w-0">
                      <span className={`block truncate text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>{post.authorName}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-neutral-500">{locationLabel || getRoleLabel(post.authorRole)}</span>
                    </span>
                  </button>
                  {post.isPromoted && <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-600">Featured</span>}
                </div>

                <div className="feed-card-image group/img relative w-full overflow-hidden bg-[#f3f0e9]">
                  {postImageSource ? (
                    <PostImage
                      src={postImageSource}
                      alt={post.title}
                      className="aspect-[4/5] w-full cursor-pointer bg-[#f3f0e9]"
                      imageClassName="transition-transform duration-500 group-hover/img:scale-[1.02]"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                      fit="contain"
                      draggable={false}
                      onContextMenu={(event) => event.preventDefault()}
                      onClick={() => openListing(post)}
                      onError={() => handlePostImageError(post, postImageSource)}
                    />
                  ) : (
                    <div
                      role="img"
                      aria-label={`Image unavailable for ${post.title}`}
                      className="flex aspect-[4/5] flex-col items-center justify-center gap-2 bg-neutral-900/80 text-neutral-500"
                    >
                      <Scissors aria-hidden="true" className="h-8 w-8 text-amber-500/70" />
                      <span className="text-xs">Listing image unavailable</span>
                    </div>
                  )}

                  {/* Top image overlay badges */}
                  <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
                    <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold ${isDarkMode ? 'border-neutral-800 bg-neutral-950/85 text-white' : 'border-neutral-200 bg-white/90 text-neutral-800'}`}>
                      {listingTypeLabel}
                    </span>
                    {post.categoryId && <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold capitalize ${isDarkMode ? 'border-neutral-800 bg-neutral-950/85 text-white' : 'border-neutral-200 bg-white/90 text-neutral-800'}`}>{post.categoryId.replace(/[-_]/g, ' ')}</span>}
                  </div>
                  {/* Save listing */}
                  <button
                    type="button"
                    onClick={event => handleSave(post, event.currentTarget)}
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
                          setRecommendationNotice(`This device will avoid the listing, but your account preference could not be saved: ${safeCustomerErrorMessage(error, 'please try again later.')}`);
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

                </div>

                <div className="space-y-3 p-3.5 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button type="button" onClick={() => openListing(post)} className="block max-w-full text-left">
                        <h3 className={`line-clamp-2 text-sm font-semibold leading-snug ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>{post.title}</h3>
                      </button>
                      <p className="mt-1 text-[10px] text-neutral-500">{listingTypeLabel}{locationLabel ? ` · ${locationLabel}` : ''}</p>
                    </div>
                    <span className="shrink-0 text-right text-xs font-bold text-amber-600">{priceLabel}</span>
                  </div>
                  {post.description && <p className={`line-clamp-2 text-[11px] leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>{post.description}</p>}
                  <div className={`flex items-center justify-between gap-2 border-t pt-3 ${isDarkMode ? 'border-neutral-800' : 'border-neutral-100'}`}>
                    <button
                      type="button"
                      disabled={pendingActions.has(post.id)}
                      aria-label={`${isLiked ? 'Unlike' : 'Like'} ${post.title}`}
                      aria-pressed={isLiked}
                      onClick={() => handleLike(post.id)}
                      className={`flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold ${
                        isLiked ? 'border-red-300/50 bg-red-50 text-red-600' : isDarkMode ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-800' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      <Heart className={`h-4 w-4 ${isLiked ? 'fill-current' : ''}`} />
                      {likeCount > 0 && <span>{likeCount}</span>}
                    </button>
                    <div className="flex items-center gap-2">
                      {getWhatsAppUrl(post) && (
                        <button type="button" onClick={() => openWhatsApp(post)} className="flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-bold text-white transition-colors hover:bg-emerald-500">
                          <Phone className="h-4 w-4" />
                          <span>WhatsApp</span>
                        </button>
                      )}
                      <button type="button" onClick={() => openListing(post)} className={`flex h-9 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition-colors ${isDarkMode ? 'border-neutral-700 text-neutral-200 hover:border-amber-400' : 'border-neutral-200 text-neutral-700 hover:border-amber-500'}`}>
                        Details <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
                {downloadMessage?.listingId === post.id && (
                  <p role="alert" className="border-t border-red-500/20 px-3 py-2 text-xs text-red-400">
                    {downloadMessage.message}
                  </p>
                )}

              </motion.article>
              {(postIndex + 1) % 12 === 0 && postIndex + 1 < filteredPosts.length && (Math.floor((postIndex + 1) / 6) % 3 !== 2) && (
                <div className="md:col-span-2 lg:col-span-3 2xl:col-span-4">
                  <MarketplaceInterlude posts={filteredPosts} users={users} isDarkMode={isDarkMode} onSelectSeller={onSelectSeller} />
                </div>
              )}
              {(postIndex + 1) % 6 === 0 && postIndex + 1 < filteredPosts.length && (() => {
                const discoveryBatch = (postIndex + 1) / 6;
                const category = discoveryCategorySections[(discoveryBatch - 1) % Math.max(discoveryCategorySections.length, 1)];
                const collection = visibleSellerCollections[(discoveryBatch - 1) % Math.max(visibleSellerCollections.length, 1)];
                const tailor = topTailors[(discoveryBatch - 1) % Math.max(topTailors.length, 1)];
                return (
                  <div className="md:col-span-2 lg:col-span-3 2xl:col-span-4">
                    {discoveryBatch % 3 === 1 && category && (
                      <DiscoveryCarousel title={category.title} subtitle="Explore the collection" posts={category.posts} isDarkMode={isDarkMode} onSelectPost={openListing} />
                    )}
                    {discoveryBatch % 3 === 2 && collection && (
                      <section className={`overflow-hidden rounded-[1.75rem] border ${isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800/50 px-5 py-4 sm:px-7">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">Collection</p>
                            <p className={`mt-1 text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>A considered edit from an independent merchant</p>
                          </div>
                          <button type="button" onClick={() => setShowAllCollections(true)} className={`min-h-10 rounded-full border px-4 text-xs font-semibold transition ${isDarkMode ? 'border-neutral-700 text-neutral-200 hover:border-amber-400' : 'border-neutral-300 text-neutral-700 hover:border-amber-500'}`}>
                            See all collections
                          </button>
                        </div>
                        <div className="p-4 sm:p-6">
                          {(() => {
                            const seller = userById.get(collection.sellerId);
                            return (
                              <button type="button" onClick={() => seller && onSelectSeller(seller)} disabled={!seller} className="mb-4 flex min-w-0 items-center gap-3 text-left disabled:cursor-default">
                                <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-amber-500/30 bg-amber-500/10 text-sm font-bold text-amber-500">
                                  {seller?.avatarUrl
                                    ? <img src={seller.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                                    : getProfileInitials(seller?.shopName || seller?.name || 'Atelier')}
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">From the atelier of</span>
                                  <span className={`mt-0.5 block truncate text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>{seller?.shopName || seller?.name || 'Independent merchant'}</span>
                                </span>
                              </button>
                            );
                          })()}
                          <div className="grid h-52 grid-cols-2 gap-1 overflow-hidden rounded-2xl bg-neutral-950 sm:h-64 sm:grid-cols-4">
                            {collection.imageUrls.filter(Boolean).slice(0, 4).map((url, index) => (
                              <img key={`${collection.id}-${index}`} src={url} alt={index === 0 ? collection.title : ''} className="h-full min-h-0 w-full object-cover" loading="lazy" decoding="async" />
                            ))}
                          </div>
                          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div className="min-w-0">
                              <h2 className={`font-serif text-2xl font-bold sm:text-3xl ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>{collection.title}</h2>
                              {collection.description && <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-neutral-500">{collection.description}</p>}
                            </div>
                            <button type="button" onClick={() => {
                              const seller = userById.get(collection.sellerId);
                              if (seller) onSelectSeller(seller);
                            }} className="inline-flex min-h-11 w-fit shrink-0 items-center gap-2 rounded-full bg-amber-400 px-5 text-xs font-bold text-neutral-950 transition hover:bg-amber-300">
                              Explore collection <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </section>
                    )}
                    {discoveryBatch % 3 === 0 && tailor && (
                      <section className={`overflow-hidden rounded-[1.75rem] border p-4 sm:p-6 ${isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm'}`}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">Top tailor to watch</p>
                        <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(220px,0.75fr)_1fr]">
                          <button type="button" onClick={() => onSelectSeller(tailor.seller)} className="overflow-hidden rounded-2xl">
                            <img src={discoveryImage(tailor.posts[0])} alt={tailor.seller.shopName || tailor.seller.name} className="h-64 w-full object-cover sm:h-full sm:min-h-72" />
                          </button>
                          <div className="flex flex-col justify-center">
                            <h2 className="font-serif text-2xl font-bold">{tailor.seller.shopName || tailor.seller.name}</h2>
                            <p className="mt-2 text-sm text-neutral-500">{tailor.posts.length} published pieces in this artisan's collection</p>
                            <button type="button" onClick={() => onSelectSeller(tailor.seller)} className="mt-5 min-h-11 w-fit rounded-full border border-amber-500 px-5 text-xs font-bold text-amber-500">View tailor profile</button>
                          </div>
                        </div>
                      </section>
                    )}
                  </div>
                );
              })()}
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

      {showAllCollections && (
        <div
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setShowAllCollections(false);
          }}
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5"
        >
          <section role="dialog" aria-modal="true" aria-labelledby="marketplace-collections-title" className={`max-h-[92dvh] w-full max-w-5xl overflow-y-auto rounded-t-3xl p-5 shadow-2xl sm:rounded-3xl sm:p-7 ${isDarkMode ? 'border border-neutral-800 bg-[#111214] text-white' : 'border border-neutral-200 bg-white text-neutral-900'}`}>
            <div className="flex items-start justify-between gap-4 border-b border-neutral-800/50 pb-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">Independent ateliers</p>
                <h2 id="marketplace-collections-title" className="mt-1 font-serif text-2xl font-bold sm:text-3xl">Browse collections</h2>
                <p className="mt-1 text-xs text-neutral-500">Meet the makers behind each edit and explore their full storefront.</p>
              </div>
              <button type="button" onClick={() => setShowAllCollections(false)} className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-semibold ${isDarkMode ? 'border-neutral-700 hover:border-amber-400' : 'border-neutral-300 hover:border-amber-500'}`}>Close</button>
            </div>
            {publicCollections.length > 0 ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {publicCollections.map(item => {
                  const seller = userById.get(item.sellerId);
                  return (
                    <article key={item.id} className={`overflow-hidden rounded-2xl border ${isDarkMode ? 'border-neutral-800 bg-neutral-900/50' : 'border-neutral-200 bg-neutral-50'}`}>
                      <div className="grid aspect-[1.7/1] grid-cols-2 gap-1 overflow-hidden bg-neutral-950">
                        {item.imageUrls.filter(Boolean).slice(0, 2).map((url, index) => <img key={`${item.id}-modal-${index}`} src={url} alt={index === 0 ? item.title : ''} className="h-full w-full object-cover" loading="lazy" decoding="async" />)}
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-amber-500/15 text-xs font-bold text-amber-500">
                            {seller?.avatarUrl ? <img src={seller.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : getProfileInitials(seller?.shopName || seller?.name || 'Atelier')}
                          </span>
                          <span className="min-w-0 truncate text-xs font-semibold">{seller?.shopName || seller?.name || 'Independent merchant'}</span>
                        </div>
                        <h3 className="mt-3 truncate font-serif text-lg font-bold">{item.title}</h3>
                        {item.description && <p className="mt-1 line-clamp-2 min-h-9 text-xs leading-relaxed text-neutral-500">{item.description}</p>}
                        <button type="button" disabled={!seller} onClick={() => {
                          if (!seller) return;
                          setShowAllCollections(false);
                          onSelectSeller(seller);
                        }} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-amber-400 px-4 text-xs font-bold text-neutral-950 transition hover:bg-amber-300 disabled:cursor-default disabled:opacity-60">
                          Visit atelier <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-neutral-500">No public collections are available yet. Check back soon.</p>
            )}
          </section>
        </div>
      )}

    </div>
  );
};
