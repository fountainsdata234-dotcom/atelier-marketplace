import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, MapPin, Filter, Star, Heart, Bookmark, MessageCircle, Share2, Phone, Scissors, Sparkles, Navigation, Download, ExternalLink, ShieldCheck, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { ClothPost, DiscoveryEvent, DiscoveryEventType, User, UserLocation } from '../types';
import { WORLD_COUNTRIES, calculateDistanceKm } from '../data/worldData';
import { storageService } from '../services/storage';
import { api } from '../services/api';
import { MarketplaceInterlude } from './MarketplaceInterlude';
import { getProfileInitials, getRoleLabel } from '../utils/profile';

interface MarketplaceProps {
  posts: ClothPost[];
  users: User[];
  currentUser: User | null;
  onOpenAuth: () => void;
  onSelectPostForMessage: (post: ClothPost) => void;
  onSaveImageToViewer: (url: string, title: string) => void;
  onSharePost: (post: ClothPost) => void;
  onShareTailorProfile: (user: User) => void;
  onToggleFollow: (user: User) => void;
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
  onToggleFollow,
  isDarkMode
}) => {
  // Search & Filter States
  const sellerPosts = useMemo(() => posts
    .filter(post => post.authorRole === 'tailor' || post.authorRole === 'fabric_seller')
    .map(post => {
      const author = users.find(user => user.id === post.authorId);
      return {
        ...post,
        title: post.title || 'Untitled atelier post',
        description: post.description || '',
        authorName: author?.name || post.authorName || 'Atelier Member',
        authorHandle: author?.handle || post.authorHandle || '@atelier_member',
        authorAvatar: author?.avatarUrl || post.authorAvatar,
        authorLocation: author?.location || post.authorLocation || { country: '', state: '', city: '' },
        tags: Array.isArray(post.tags) ? post.tags : [],
        likes: Array.isArray(post.likes) ? post.likes : [],
        saves: Array.isArray(post.saves) ? post.saves : [],
        ratingsByUser: post.ratingsByUser || {},
        rating: Number(post.rating) || 0,
        ratingCount: Number(post.ratingCount) || 0,
      };
    }), [posts, users]);
  const tailorPosts = sellerPosts;
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
  const [focusIndex, setFocusIndex] = useState(0);
  const [showAllTrending, setShowAllTrending] = useState(false);
  const [discoveryEvents, setDiscoveryEvents] = useState<DiscoveryEvent[]>(() => storageService.getDiscoveryEvents());
  const seenPostIdsRef = useRef(new Set<string>());
  const trendScrollRef = useRef<HTMLDivElement | null>(null);

  // Extract unique tags across all posts
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    sellerPosts.forEach(p => p.tags.forEach(t => tagsSet.add(t.toLowerCase())));
    return Array.from(tagsSet);
  }, [sellerPosts]);

  const carouselPosts = useMemo(() => {
    return tailorPosts
      .filter(post => !users.find(user => user.id === post.authorId)?.isBlocked)
      .sort((a, b) => {
        const authorA = users.find(user => user.id === a.authorId);
        const authorB = users.find(user => user.id === b.authorId);
        const scoreA = (a.isPromoted || authorA?.isPromoted ? 100000 : 0) + (a.rating || 0) * 100 + Math.min(a.ratingCount || 0, 50) * 2 + a.likes.length + a.saves.length + new Date(a.createdAt).getTime() / 1e11;
        const scoreB = (b.isPromoted || authorB?.isPromoted ? 100000 : 0) + (b.rating || 0) * 100 + Math.min(b.ratingCount || 0, 50) * 2 + b.likes.length + b.saves.length + new Date(b.createdAt).getTime() / 1e11;
        return scoreB - scoreA;
      })
      .slice(0, 8);
  }, [posts, users]);

  const trendingPosts = useMemo(() => {
    const now = Date.now();
    const eventWeights: Record<DiscoveryEventType, number> = { VIEW: 1, LIKE: 5, SAVE: 7, SHARE: 6, ENQUIRY: 9, ADD_TO_CART: 10, PURCHASE: 14, RATING: 4 };
    const candidatePosts = tailorPosts.filter(post => !users.find(user => user.id === post.authorId)?.isBlocked);
    const followedSellerIds = new Set(users.filter(user => currentUser && Array.isArray(user.followers) && user.followers.includes(currentUser.id)).map(user => user.id));
    const eventScore = (post: ClothPost) => discoveryEvents.reduce((score, event) => {
      if (event.itemId !== post.id) return score;
      const ageHours = Math.max(0, (now - new Date(event.timestamp).getTime()) / 3_600_000);
      return score + eventWeights[event.eventType] * Math.exp(-ageHours / 168);
    }, 0);
    const interestScore = (post: ClothPost) => {
      if (!currentUser) return 0;
      return discoveryEvents.reduce((score, event) => {
        if (event.userId !== currentUser.id) return score;
        const interactedPost = candidatePosts.find(item => item.id === event.itemId);
        if (!interactedPost || !interactedPost.tags.some(tag => post.tags.some(postTag => postTag.toLowerCase() === tag.toLowerCase()))) return score;
        return score + eventWeights[event.eventType];
      }, 0);
    };

    const rawScores = candidatePosts.map(post => {
      const author = users.find(user => user.id === post.authorId);
      const quality = ((post.rating || 0) / 5) * ((post.ratingCount || 0) / ((post.ratingCount || 0) + 5));
      const freshness = Math.exp(-Math.max(0, now - new Date(post.createdAt).getTime()) / (30 * 86_400_000));
      const sellerPosts = candidatePosts.filter(item => item.authorId === post.authorId);
      const sellerRating = sellerPosts.reduce((sum, item) => sum + (item.rating || 0), 0) / Math.max(1, sellerPosts.length * 5);
      const followerCount = Array.isArray(author?.followers) ? author.followers.length : 0;
      const sellerReputation = Math.min(1, sellerRating * 0.8 + Math.min(followerCount / 100, 1) * 0.2);
      return { post, trend: eventScore(post) + post.likes.length * 2 + post.saves.length * 3 + (followedSellerIds.has(post.authorId) ? 25 : 0), personal: interestScore(post), quality, freshness, sellerReputation };
    });
    const maxTrend = Math.max(1, ...rawScores.map(item => item.trend));
    const maxPersonal = Math.max(1, ...rawScores.map(item => item.personal));

    return rawScores
      .sort((a, b) => {
        const scoreA = 0.30 * Math.min(a.trend / maxTrend, 1) + 0.25 * Math.min(a.personal / maxPersonal, 1) + 0.20 * a.quality + 0.15 * a.freshness + 0.10 * a.sellerReputation;
        const scoreB = 0.30 * Math.min(b.trend / maxTrend, 1) + 0.25 * Math.min(b.personal / maxPersonal, 1) + 0.20 * b.quality + 0.15 * b.freshness + 0.10 * b.sellerReputation;
        return scoreB - scoreA;
      })
      .map(item => item.post)
      .slice(0, showAllTrending ? 12 : 7);
  }, [posts, users, currentUser, discoveryEvents, showAllTrending]);

  const searchSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    const suggestions = new Map<string, { label: string; type: 'seller' | 'post' | 'tag'; user?: User; post?: ClothPost }>();
    tailorPosts.forEach(post => {
      if (post.title.toLowerCase().includes(query)) suggestions.set(`post-${post.id}`, { label: post.title, type: 'post', post });
      post.tags.forEach(tag => { if (tag.toLowerCase().includes(query)) suggestions.set(`tag-${tag}`, { label: tag, type: 'tag' }); });
    });
    users.filter(user => user.role === 'tailor' || user.role === 'fabric_seller').forEach(user => {
      [user.name, user.shopName || '', user.handle].forEach(value => { if (value && value.toLowerCase().includes(query)) suggestions.set(`seller-${user.id}`, { label: user.name, type: 'seller', user }); });
    });
    return Array.from(suggestions.values()).slice(0, 8);
  }, [tailorPosts, searchQuery, users]);

  // Filter and sort posts
  const filteredPosts = useMemo(() => {
    let result = tailorPosts.filter(post => {
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
        const followedIds = new Set(users.filter(user => currentUser && Array.isArray(user.followers) && user.followers.includes(currentUser.id)).map(user => user.id));
        if (followedIds.has(a.authorId) !== followedIds.has(b.authorId)) return followedIds.has(a.authorId) ? -1 : 1;
        if (a.isPromoted && !b.isPromoted) return -1;
        if (!a.isPromoted && b.isPromoted) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    return result;
  }, [tailorPosts, users, searchQuery, selectedTag, filterCountry, filterState, filterCity, nearMeActive, userCoords]);

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

  useEffect(() => {
    if (!currentUser) return;
    api.getDiscoveryEvents().then(setDiscoveryEvents).catch(() => undefined);
  }, [currentUser?.id]);

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
    visiblePosts.slice(0, 10).forEach(post => {
      if (seenPostIdsRef.current.has(post.id)) return;
      seenPostIdsRef.current.add(post.id);
      recordEvent(post.id, 'VIEW');
    });
  }, [visiblePosts]);

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

  const recordEvent = (itemId: string, eventType: DiscoveryEventType) => {
    const userId = currentUser?.id;
    storageService.recordDiscoveryEvent(itemId, eventType, userId);
    setDiscoveryEvents(storageService.getDiscoveryEvents());
    if (!userId) return;
    const sessionId = sessionStorage.getItem('atelier_session_id') || `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('atelier_session_id', sessionId);
    void api.recordDiscoveryEvent(itemId, eventType, sessionId);
  };

  // Handle Like
  const handleLike = (postId: string) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }

    const updated = storageService.toggleLikePost(postId, currentUser.id);
    if (updated.isLiked) recordEvent(postId, 'LIKE');
    window.dispatchEvent(new CustomEvent('atelier_posts_updated'));

    api.toggleLike(postId)
      .then(() => {
        window.dispatchEvent(new CustomEvent('atelier_posts_updated'));
      })
      .catch(error => {
        setLocationStatus(error.message);
        storageService.toggleLikePost(postId, currentUser.id);
        window.dispatchEvent(new CustomEvent('atelier_posts_updated'));
      });
  };

  const handleRate = (postId: string, rating: number) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    const localResult = storageService.ratePost(postId, currentUser.id, rating);
    recordEvent(postId, 'RATING');
    if (localResult) window.dispatchEvent(new CustomEvent('atelier_posts_updated'));
    api.ratePost(postId, rating).then(() => window.dispatchEvent(new CustomEvent('atelier_posts_updated'))).catch(error => setLocationStatus(error.message));
  };

  // Handle Save Picture
  const handleSave = (post: ClothPost) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }

    const result = storageService.toggleSavePost(post.id, currentUser.id);
    if (result.isSaved) recordEvent(post.id, 'SAVE');
    storageService.addSavedPhoto({
      url: post.imageUrl,
      title: post.title,
      postId: post.id,
    });
    window.dispatchEvent(new CustomEvent('atelier_posts_updated'));

    api.toggleSave(post.id)
      .then(() => window.dispatchEvent(new CustomEvent('atelier_posts_updated')))
      .catch(error => {
        setLocationStatus(error.message);
        storageService.toggleSavePost(post.id, currentUser.id);
        window.dispatchEvent(new CustomEvent('atelier_posts_updated'));
      });

    onSaveImageToViewer(post.imageUrl, post.title);
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
    recordEvent(post.id, 'ENQUIRY');
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
                  key={`${suggestion.type}-${suggestion.label}`}
                  type="button"
                  onMouseDown={() => setSearchQuery(suggestion.label)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs hover:bg-amber-500/10"
                >
                  {suggestion.user?.avatarUrl ? <img src={suggestion.user.avatarUrl} alt="" className="h-9 w-9 rounded-lg object-cover" /> : suggestion.user ? <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-[10px] font-black text-neutral-950">{getProfileInitials(suggestion.user.name)}</span> : suggestion.post ? <img src={suggestion.post.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10"><Search className="h-3.5 w-3.5 text-amber-500" /></span>}
                  <span className="min-w-0"><strong className="block truncate">{suggestion.label}</strong><small className="text-[10px] text-neutral-400">{suggestion.user ? getRoleLabel(suggestion.user.role) : suggestion.type === 'post' ? 'Collection piece' : 'Category'}</small></span>
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
                  className="relative aspect-[10/13] min-h-[320px] sm:aspect-[16/7] sm:min-h-[320px]"
                >
                  <img src={post.imageUrl} alt={post.title} className="absolute inset-0 h-full w-full object-cover" loading="eager" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.22),transparent_28%),linear-gradient(180deg,rgba(0,0,0,0.22),rgba(0,0,0,0.78))] sm:bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.25),transparent_28%),linear-gradient(90deg,rgba(0,0,0,0.9),rgba(0,0,0,0.55),rgba(0,0,0,0.2))]" />

                  <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-6">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      {post.isPromoted && (
                        <span className="rounded-full border border-amber-300/70 bg-amber-400/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-neutral-950 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.22em]">
                          Promoted
                        </span>
                      )}
                      <span className="rounded-full border border-white/20 bg-black/35 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-amber-100 backdrop-blur-sm sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.2em]">
                        {post.authorRole === 'tailor' ? 'Bespoke Tailor' : 'Fabric Merchant'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-1.5 py-1 backdrop-blur-md sm:px-2 sm:py-1.5">
                      {post.authorAvatar ? (
                        <img src={post.authorAvatar} alt="" className="h-7 w-7 rounded-full object-cover ring-2 ring-amber-300/80 sm:h-8 sm:w-8" />
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-neutral-950 ring-2 ring-amber-200/80 sm:h-8 sm:w-8 sm:text-sm">
                          {post.authorName.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="hidden text-[10px] font-semibold text-white sm:block sm:text-xs">{post.authorName}</span>
                    </div>
                  </div>

                  <div className="absolute inset-x-0 bottom-0 p-3 sm:p-6 lg:p-8">
                    <div className="max-w-3xl rounded-[1.2rem] border border-white/10 bg-black/25 p-3 backdrop-blur-md sm:rounded-[1.5rem] sm:p-5">
                      <div className="flex flex-wrap items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-amber-300 font-semibold sm:gap-2 sm:text-[10px] sm:tracking-[0.22em]">
                        <span>{post.authorLocation.city}, {post.authorLocation.country}</span>
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
                            <span className="text-neutral-400">Likes</span> {post.likes.length}
                          </span>
                          <span className="rounded-lg border border-neutral-700 bg-neutral-900/70 px-2 py-1 sm:px-2.5 sm:py-1.5">
                            <span className="text-neutral-400">Saves</span> {post.saves.length}
                          </span>
                          <span className="rounded-lg border border-neutral-700 bg-neutral-900/70 px-2 py-1 sm:px-2.5 sm:py-1.5">
                            <span className="text-neutral-400">Rating</span> {post.rating ? post.rating.toFixed(1) : 'New'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                          <button
                            type="button"
                            onClick={() => onSelectPostForMessage(post)}
                            className="rounded-xl border border-white/15 bg-white/5 px-2.5 py-2 text-[10px] font-semibold text-white transition hover:bg-white/10 sm:px-3 sm:text-[11px]"
                          >
                            Message Seller
                          </button>
                          <button
                            type="button"
                            onClick={() => openWhatsApp(post)}
                            className="col-span-2 rounded-xl bg-emerald-600 px-2.5 py-2 text-[10px] font-bold text-white transition hover:bg-emerald-500 sm:col-span-auto sm:px-3 sm:text-[11px]"
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
          <div ref={trendScrollRef} className="flex gap-3 overflow-x-auto pb-3 scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {trendingPosts.map((post, index) => {
              const isFocused = index === focusIndex;
              return (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => {
                    recordEvent(post.id, 'VIEW');
                    setSearchQuery(post.title);
                    window.setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 0);
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
                    <img src={post.imageUrl} alt="" className="h-36 w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-xs font-semibold truncate text-white">{post.title}</p>
                      <p className="mt-1 text-[10px] text-neutral-200">{post.authorName} · {post.likes.length + post.saves.length} signals</p>
                      {post.rating ? <span className="mt-1 flex items-center gap-1 text-[10px] text-amber-400"><Star className="h-3 w-3 fill-current" /> {post.rating.toFixed(1)}</span> : <span className="mt-1 block text-[10px] text-emerald-400">Rising now</span>}
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
        <div className={`text-center py-16 px-6 rounded-3xl border ${
          isDarkMode ? 'bg-[#121316]/50 border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
        }`}>
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-4">
            <Scissors className="w-8 h-8" />
          </div>

          <h3 className="text-2xl font-serif font-bold mb-2">
            {currentUser?.role === 'tailor'
              ? 'No cloth posts yet — publish your first collection'
              : currentUser?.role === 'fabric_seller'
                ? 'No fabric posts yet — list your first material stock'
                : 'No cloths are available right now'}
          </h3>

          <p className={`text-xs max-w-md mx-auto mb-6 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            {currentUser?.role === 'tailor'
              ? 'Tailors can publish garments, pricing, and fabric details here for buyers to discover and order.'
              : currentUser?.role === 'fabric_seller'
                ? 'Fabric sellers can upload materials, textures, and wholesale details for designers and tailors.'
                : 'The marketplace is empty right now. Tailors and fabric sellers can post new items to fill the feed.'}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {currentUser && (currentUser.role === 'tailor' || currentUser.role === 'fabric_seller') ? (
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
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {visiblePosts.map((post, postIndex) => {
            const isLiked = currentUser ? post.likes.includes(currentUser.id) : false;
            const isSaved = currentUser ? post.saves.includes(currentUser.id) : false;

            // Distance calculation if userCoords present
            const distanceKm = userCoords && post.authorLocation.lat && post.authorLocation.lng
              ? calculateDistanceKm(userCoords.lat, userCoords.lng, post.authorLocation.lat, post.authorLocation.lng)
              : null;
            const userRating = currentUser ? (post.ratingsByUser?.[currentUser.id] || 0) : (post.rating || 0);

            return (
              <React.Fragment key={post.id}>
              <motion.article
                layout
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`feed-card-wave rounded-[1.5rem] border overflow-hidden transition-all group flex flex-col justify-between ${
                  isDarkMode
                    ? 'bg-[#121316] border-neutral-800/90 hover:border-amber-500/40'
                    : 'bg-white border-neutral-200/90 hover:border-amber-500/40 shadow-sm'
                } ${post.isPromoted ? 'ring-1 ring-amber-500/50 shadow-[0_0_0_1px_rgba(251,191,36,0.18),0_20px_40px_rgba(251,191,36,0.12)]' : ''}`}
              >
                {/* Post Header: Tailor Handle, Location & Promoted Symbol */}
                <div className="p-3 flex items-center justify-between border-b border-neutral-800/40">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 font-bold text-xs flex items-center justify-center overflow-hidden">
                      {post.authorAvatar ? <img src={post.authorAvatar} alt="" className="h-full w-full object-cover" /> : post.authorName.charAt(0)}
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
                      <div className="flex flex-col items-start gap-0.5 text-[10px] text-neutral-400">
                        <span className="font-semibold uppercase tracking-[0.12em] text-amber-500">{getRoleLabel(post.authorRole)}</span>
                        <span>{post.authorHandle}</span>
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
                    <button onClick={() => onSharePost(post)} title="Share garment post" className="p-1.5 rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-neutral-800/50 transition-colors">
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Garment Image with High-Res Zoom / Save */}
                <div className={`feed-card-image relative aspect-[4/4.8] w-full bg-neutral-900 overflow-hidden group/img ${post.isPromoted ? 'p-2 border-[3px] border-amber-500/60 bg-gradient-to-br from-amber-500/10 via-transparent to-amber-500/20 rounded-[1.5rem]' : ''}`}>
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
                  <div className="absolute bottom-2.5 right-2.5 flex gap-1.5 opacity-0 transition-opacity group-hover/img:opacity-100">
                    <button
                      onClick={() => onSaveImageToViewer(post.imageUrl, post.title)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-semibold backdrop-blur-md bg-black/70 hover:bg-black text-amber-300 border border-amber-500/30 flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Details</span>
                    </button>
                  </div>
                </div>

                {/* Post Body: Title, Description, Tags, Custom Pricing */}
                <div className="p-3 space-y-2.5 flex-1">
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
                  <div className="p-2 rounded-xl border border-neutral-800/80 bg-neutral-900/30 text-[11px] space-y-1">
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
                    <div className="flex items-center gap-0.5" aria-label="Rate this cloth from one to five stars">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button key={star} type="button" onClick={() => handleRate(post.id, star)} className="rounded p-0.5 text-neutral-600 transition hover:scale-110 hover:text-amber-400" aria-label={`Rate ${star} out of 5`} title={`Rate ${star} out of 5`}>
                          <Star className={`h-3.5 w-3.5 ${userRating >= star ? 'fill-amber-400 text-amber-400' : ''}`} />
                        </button>
                      ))}
                      {post.ratingCount ? <span className="ml-1 text-[10px] text-amber-400">{(post.rating || 0).toFixed(1)} ({post.ratingCount})</span> : null}
                    </div>
                  </div>
                </div>

                {/* Footer: Like Counter, In-App Message & WhatsApp Button */}
                <div className="px-3 py-2.5 border-t border-neutral-800/60 bg-neutral-900/20 flex items-center justify-between gap-2">
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
              {postIndex === 19 && filteredPosts.length > 20 && (
                <div className="md:col-span-2 lg:col-span-3">
                  <MarketplaceInterlude posts={filteredPosts} users={users} isDarkMode={isDarkMode} onSelectSeller={(seller) => onShareTailorProfile(seller)} />
                </div>
              )}
              </React.Fragment>
            );
          })}
        </div>
      )}

    </div>
  );
};
