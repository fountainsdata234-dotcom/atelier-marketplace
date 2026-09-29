import React, { lazy } from 'react';
import { motion } from 'motion/react';
import { Scissors, Sparkles, Compass, ArrowRight, ShoppingBag, Globe2, Zap, Flame, Trophy, TrendingUp, MapPin } from 'lucide-react';
import { AdminPromoPlan, ClothPost, User, UserRole } from '../types';
import { getTopTailors, rankTrendingPosts } from '../utils/marketplaceRanking';
import { storageService } from '../services/storage';
import type { GlobeArtisan } from './ArtisanGlobe3D';

const ArtisanGlobe3D = lazy(() => import('./ArtisanGlobe3D').then(module => ({ default: module.ArtisanGlobe3D })));

const RESPONSIVE_LANDSCAPE_IMAGE = 'https://user36765.na.imgto.link/public/20260926/chatgpt-image-sep-26-2026-10-17-44-am.avif';
const RESPONSIVE_PORTRAIT_IMAGE = 'https://user36765.na.imgto.link/public/20260926/chatgpt-image-sep-26-2026-10-16-27-am.avif';
const LANDING_FALLBACK_IMAGE = 'https://res.cloudinary.com/auwy7fil/image/upload/c_fill,w_720,h_400,g_auto,q_auto,f_auto/v1790415437/ChatGPT_Image_Sep_26_2026_10_19_39_AM.png';

interface LandingTrendCard {
  id: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  tag: string;
  metric: string;
  location?: string;
  accent: string;
  post?: ClothPost;
  seller?: User;
}

interface LandingTrendCarouselProps {
  items: LandingTrendCard[];
  label: string;
  accentClass: string;
  onSelectPost: (post: ClothPost) => void;
  onSelectSeller: (seller: User) => void;
}

const LandingTrendCarousel: React.FC<LandingTrendCarouselProps> = ({ items, label, accentClass, onSelectPost, onSelectSeller }) => {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const pauseUntilRef = React.useRef(0);

  React.useEffect(() => {
    if (items.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      const track = trackRef.current;
      if (!track || document.visibilityState !== 'visible' || Date.now() < pauseUntilRef.current) return;
      const bounds = track.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) return;
      const firstCard = track.querySelector<HTMLElement>('[data-trend-card]');
      if (!firstCard) return;
      const step = firstCard.offsetWidth + 16;
      const maxScroll = track.scrollWidth - track.clientWidth;
      track.scrollTo({ left: track.scrollLeft >= maxScroll - 12 ? 0 : track.scrollLeft + step, behavior: 'smooth' });
    }, 4800);
    return () => window.clearInterval(timer);
  }, [items.length]);

  const openCard = (item: LandingTrendCard) => {
    if (item.post) onSelectPost(item.post);
    else if (item.seller) onSelectSeller(item.seller);
  };

  return (
    <div
      ref={trackRef}
      aria-label={label}
      aria-roledescription="carousel"
      className="flex min-w-0 snap-x snap-mandatory touch-pan-x gap-4 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      onPointerDown={() => { pauseUntilRef.current = Date.now() + 6500; }}
      onPointerEnter={() => { pauseUntilRef.current = Date.now() + 6500; }}
      onPointerLeave={() => { pauseUntilRef.current = Date.now() + 1200; }}
      onTouchStart={() => { pauseUntilRef.current = Date.now() + 6500; }}
      onTouchEnd={() => { pauseUntilRef.current = Date.now() + 1800; }}
    >
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          data-trend-card
          onClick={() => openCard(item)}
          aria-label={item.post ? `View ${item.title} by ${item.post.authorName}` : `View ${item.title}'s seller page`}
          className="group relative min-w-[82vw] max-w-[320px] flex-none snap-start overflow-hidden rounded-2xl border border-amber-500/20 bg-[#111316] text-left shadow-[0_20px_50px_rgba(0,0,0,0.22)] transition-transform duration-300 hover:-translate-y-1 sm:min-w-[280px]"
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${item.accent}`} />
          <div className="relative aspect-[4/3] overflow-hidden border-b border-white/10">
            <img src={item.imageUrl || '/logo.png'} alt={item.post?.imageAlt || item.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" decoding="async" />
            <span className="absolute right-3 top-3 rounded-full border border-white/20 bg-black/45 px-2.5 py-1 text-[10px] font-bold uppercase text-white/90 backdrop-blur-sm">{item.tag}</span>
          </div>
          <div className="relative space-y-2.5 p-4">
            <div className="flex items-center justify-between gap-3 text-[10px] uppercase text-amber-200/80">
              <span className="truncate">{item.metric}</span>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-bold ${accentClass}`}><Flame className="h-3 w-3" />Hot</span>
            </div>
            <h3 className="line-clamp-2 text-base font-semibold text-white">{item.title}</h3>
            <p className="line-clamp-2 text-sm text-neutral-300">{item.subtitle}</p>
            {item.location && <p className="flex items-center gap-1 text-xs text-neutral-400"><MapPin className="h-3.5 w-3.5 shrink-0" />{item.location}</p>}
          </div>
        </button>
      ))}
    </div>
  );
};

interface LandingPageProps {
  onOpenAuth: (defaultRole: UserRole) => void;
  onExploreMarketplace: () => void;
  onExploreArtisans: () => void;
  onSelectPost: (post: ClothPost) => void;
  onSelectSeller: (seller: User) => void;
  isDarkMode: boolean;
  currentUser?: User | null;
  users: User[];
  posts: ClothPost[];
  promoPlans: AdminPromoPlan[];
  promoPlansLoading: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenAuth,
  onExploreMarketplace,
  onExploreArtisans,
  onSelectPost,
  onSelectSeller,
  isDarkMode,
  currentUser,
  users,
  posts,
  promoPlans,
  promoPlansLoading,
}) => {
  const [selectedPreviewArtisanId, setSelectedPreviewArtisanId] = React.useState<string | null>(null);
  const [shouldLoadGlobe, setShouldLoadGlobe] = React.useState(false);
  const globeSectionRef = React.useRef<HTMLElement | null>(null);
  const featuredPostIdRef = React.useRef<string | null>(null);
  const searchHistory = React.useMemo(() => storageService.getSearchHistory(currentUser?.id || 'guest'), [currentUser?.id]);
  const trendingPosts = React.useMemo(
    () => rankTrendingPosts(posts, users, storageService.getDiscoveryEvents(), currentUser?.id, searchHistory, Date.now()),
    [posts, users, currentUser?.id, searchHistory],
  );
  const hottestPosts = React.useMemo(() => trendingPosts.filter(post => post.imageUrl).slice(0, 6), [trendingPosts]);
  const lastWeekHits = React.useMemo(() => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return [...trendingPosts]
      .filter(post => Number.isFinite(Date.parse(post.createdAt)) && Date.parse(post.createdAt) > oneWeekAgo)
      .slice(0, 6);
  }, [trendingPosts]);
  const topTailors = React.useMemo(() => getTopTailors(posts, users, currentUser, Date.now()).slice(0, 6), [posts, users, currentUser]);
  const featuredPost = React.useMemo(() => {
    const availablePosts = posts.filter(post => post.imageUrl && post.description?.trim());
    if (availablePosts.length === 0) return null;
    const existing = availablePosts.find(post => post.id === featuredPostIdRef.current);
    if (existing) return existing;
    const next = availablePosts[Math.floor(Math.random() * availablePosts.length)];
    featuredPostIdRef.current = next.id;
    return next;
  }, [posts]);
  const activePromoPlans = React.useMemo(() => promoPlans.filter(plan => plan.isActive), [promoPlans]);
  const previewArtisans = React.useMemo<GlobeArtisan[]>(() => users
    .filter(user => user.role === 'tailor' || user.role === 'fabric_seller')
    .filter(user => Number.isFinite(user.location?.lat) && Number.isFinite(user.location?.lng))
    .map(user => {
      const userPosts = posts.filter(post => post.authorId === user.id);
      return { ...user, distanceKm: null, postCount: userPosts.length, rating: userPosts.reduce((sum, post) => sum + (post.rating || 0), 0) / Math.max(userPosts.length, 1) };
    }), [posts, users]);

  React.useEffect(() => {
    const section = globeSectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setShouldLoadGlobe(true);
      observer.disconnect();
    }, { rootMargin: window.matchMedia('(max-width: 767px)').matches ? '80px' : '320px' });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-16">
      {/* Hero Section */}
      <section className="mx-auto max-w-6xl px-3 pb-10 pt-6 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="overflow-hidden rounded-[32px] border border-amber-500/20 bg-[#111215] p-4 shadow-2xl shadow-black/30 sm:p-6 lg:p-8"
        >
          <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="text-center lg:text-left">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300">
                <Sparkles className="w-3.5 h-3.5" />
                Tailor & fabric marketplace
              </div>

              <h1 className="text-4xl font-black leading-none tracking-[-0.06em] text-white sm:text-5xl lg:text-7xl">
                <span className="relative inline-block">
                  Tailoring and fabric sourcing with a human touch
                  <motion.span
                    aria-hidden="true"
                    animate={{ x: [0, 96, 0], y: [18, -4, 18], rotate: [-18, 12, -18] }}
                    transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                    className="pointer-events-none absolute -right-4 top-0 text-base font-normal text-amber-500 sm:text-xl"
                  >
                    ~
                  </motion.span>
                </span>
              </h1>

              <p className="mt-4 max-w-xl text-sm leading-relaxed text-neutral-300 sm:text-base">
                Discover refined fabrics, trusted makers, and pieces chosen for fit, finish, and real life. Thoughtful tailoring without the clutter.
              </p>

              <div className="mt-6 rounded-[24px] border border-amber-500/20 bg-neutral-950/70 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex-1">
                    <label className="sr-only">Search tailors and fabrics</label>
                    <input
                      type="text"
                      value=""
                      readOnly
                      placeholder="Search tailors, Ankara, lace, wedding fits..."
                      className="w-full rounded-full border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:border-amber-500/50 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={onExploreMarketplace}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-400 px-5 py-3 text-sm font-semibold text-neutral-950 shadow-lg shadow-amber-500/15 transition hover:-translate-y-0.5 hover:bg-amber-300"
                  >
                    Search
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-neutral-300">
                  {['Native', 'Wedding', 'English', 'Senator', 'Ankara', 'Lace', 'Asoebi'].map(category => (
                    <button key={category} type="button" onClick={onExploreMarketplace} className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 transition hover:border-amber-500/40 hover:text-amber-300">
                      {category}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <button
                  onClick={onExploreMarketplace}
                  className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-3 text-sm font-semibold text-neutral-950 shadow-lg shadow-amber-500/15 transition hover:-translate-y-0.5 hover:bg-amber-300"
                >
                  <Compass className="w-4 h-4" />
                  Explore marketplace
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => onOpenAuth('buyer')}
                  className="rounded-full border border-neutral-700 bg-neutral-900 px-5 py-3 text-sm font-semibold text-neutral-200 transition hover:border-amber-400 hover:text-amber-300"
                >
                  Register as client
                </button>
              </div>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-3 text-xs text-neutral-400 lg:justify-start">
                <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1.5">2,540 tailors near you</span>
                <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1.5">18 new fabrics today</span>
                <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1.5">Live seller activity</span>
              </div>
            </div>

            <div className="relative">
              <div className="relative overflow-hidden rounded-[28px] border border-neutral-800 bg-neutral-950 p-4">
                <div className="rounded-[22px] border border-amber-500/20 bg-gradient-to-br from-neutral-900 via-[#17181c] to-[#2a1715] p-4">
                  <div className="mb-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-400">
                    <span>From the seller network</span>
                    <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-300">Live post</span>
                  </div>

                  <div className="rounded-[22px] bg-neutral-900 p-4 text-white">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300">Seller post</p>
                        <h2 className="mt-1 line-clamp-2 text-2xl font-semibold">{featuredPost?.title || 'Real work from real makers'}</h2>
                      </div>
                      <div className="rounded-full bg-white/10 px-2 py-1 text-xs">Marketplace</div>
                    </div>

                    <div className="relative h-48 overflow-hidden rounded-[20px] bg-slate-900">
                      <img src={featuredPost?.imageUrl || LANDING_FALLBACK_IMAGE} alt={featuredPost?.imageAlt || featuredPost?.title || 'A bespoke garment from the Fabrilux Atelier marketplace'} className="h-full w-full object-cover transition duration-700 hover:scale-105" loading="eager" fetchPriority="high" decoding="async" />
                    </div>
                    <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-neutral-300">{featuredPost?.description || 'A living catalogue of garments, fabrics, and ideas published by the people who make them.'}</p>
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-900 px-3 py-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Seller catalogue</p>
                      <p className="text-sm font-bold text-amber-300">Browse the full post</p>
                    </div>
                    <button
                      onClick={onExploreMarketplace}
                      className="rounded-full bg-amber-400 px-4 py-2 text-xs font-bold text-slate-900"
                    >
                      Explore
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: 0.6 }} className="border-t border-amber-500/15 py-12">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-500">One atelier, every screen</p><h2 className="mt-2 text-2xl font-serif font-bold sm:text-3xl">Made for the way you browse.</h2></div><span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Responsive by design</span></div>
        <div className="grid items-end gap-5 md:grid-cols-[1.45fr_0.55fr]"><figure className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 p-2"><img src={RESPONSIVE_LANDSCAPE_IMAGE} alt="Fabrilux Atelier on a landscape screen" loading="lazy" decoding="async" className="h-auto w-full rounded-xl object-cover" /></figure><figure className="mx-auto w-full max-w-[19rem] overflow-hidden rounded-[2rem] border border-neutral-800 bg-neutral-950 p-2"><img src={RESPONSIVE_PORTRAIT_IMAGE} alt="Fabrilux Atelier on a portrait screen" loading="lazy" decoding="async" className="h-auto w-full rounded-[1.5rem] object-cover" /></figure></div>
      </motion.section>

      <motion.section ref={globeSectionRef} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.6 }} className="border-t border-amber-500/15 py-12">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-500">Maker network</p><h2 className="mt-2 text-2xl font-serif font-bold sm:text-3xl">Where the craft is based.</h2></div><button type="button" onClick={onExploreArtisans} className="inline-flex items-center gap-2 self-start text-xs font-bold text-amber-500 hover:text-amber-300">Open artisan directory <ArrowRight className="h-4 w-4" /></button></div>
        <div className="landing-globe overflow-hidden">
          {shouldLoadGlobe ? <React.Suspense fallback={<div className="flex h-[22rem] flex-col items-center justify-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/70 text-center" role="status"><span className="h-9 w-9 animate-spin rounded-full border-2 border-amber-300/25 border-t-amber-300" /><span className="text-xs tracking-[0.18em] text-neutral-300 uppercase">Loading maker network</span></div>}><ArtisanGlobe3D artisans={previewArtisans} selectedArtisanId={selectedPreviewArtisanId} onSelectArtisan={artisan => setSelectedPreviewArtisanId(artisan.id)} onOpenArtisan={onExploreArtisans} onCloseArtisan={() => setSelectedPreviewArtisanId(null)} isDarkMode={isDarkMode} /></React.Suspense> : <div className="flex h-[22rem] flex-col items-center justify-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900/40 px-6 text-center"><div className="h-10 w-10 animate-pulse rounded-full border border-cyan-300/40 bg-cyan-400/10" aria-hidden="true" /><div className="space-y-2"><p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Loading maker network</p><p className="text-sm text-neutral-300">The artisan map is preparing itself for the next studio updates.</p></div><button type="button" onClick={() => setShouldLoadGlobe(true)} className="inline-flex min-h-11 items-center justify-center rounded-full bg-amber-400 px-5 text-sm font-semibold text-neutral-950">Load network view</button></div>}
        </div>
        {previewArtisans.length === 0 && <p className="mt-3 text-center text-xs text-neutral-400">The maker map updates as new tailors and fabric sellers join the network.</p>}
      </motion.section>

      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.6 }} className="border-t border-amber-500/15 py-12">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-500">Current studio offers</p><h2 className="mt-2 text-2xl font-serif font-bold sm:text-3xl">Featured studio plans.</h2></div><button type="button" onClick={onExploreArtisans} className="inline-flex items-center gap-2 text-xs font-bold text-amber-500 hover:text-amber-300">Meet the artisans <ArrowRight className="h-4 w-4" /></button></div>
        {promoPlansLoading ? <div className="grid gap-4 md:grid-cols-3" aria-label="Loading promotion plans">{[0, 1, 2].map(index => <div key={index} className="h-40 animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900/50" />)}</div> : activePromoPlans.length > 0 ? <div className="grid gap-4 md:grid-cols-3">{activePromoPlans.map(plan => <article key={plan.id} className={`rounded-2xl border p-5 ${isDarkMode ? 'border-neutral-800 bg-neutral-900/70' : 'border-neutral-200 bg-white shadow-sm'}`}><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">{plan.badgeLabel || 'Atelier plan'}</p><h3 className="mt-2 text-lg font-serif font-bold">{plan.caption}</h3><p className={`mt-2 min-h-12 text-xs leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>{plan.description}</p><div className="mt-5 flex items-end justify-between gap-3"><strong className="text-xl">{plan.currency || 'USD'} {plan.amount}</strong><span className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">{plan.timeRange}</span></div></article>)}</div> : <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-8 text-center"><p className="text-sm text-neutral-300">No studio plans are live right now.</p><p className="mt-2 text-xs text-neutral-400">New offers will appear here as soon as the next atelier edit is published.</p></div>}
      </motion.section>

      <motion.section initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.6 }} className="border-t border-amber-500/15 py-12">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-500">Marketplace pulse</p>
              <h2 className="mt-2 text-2xl font-serif font-bold sm:text-3xl">What buyers are browsing right now</h2>
            </div>
          </div>
          <button type="button" onClick={onExploreMarketplace} className="inline-flex items-center gap-2 self-start text-xs font-bold text-amber-500 hover:text-amber-300">Open marketplace <ArrowRight className="h-4 w-4" /></button>
        </div>

        <div className="space-y-8">
          <div className="rounded-[28px] border border-amber-500/15 bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.22),_transparent_18%),linear-gradient(135deg,#120d0a,#171c23,#111317)] p-4 shadow-[0_30px_70px_rgba(251,146,60,0.12)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-300">
                <TrendingUp className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-[0.22em]">Trending tailors near you</span>
              </div>
            </div>
            <LandingTrendCarousel
              label="Trending tailor posts"
              accentClass="bg-amber-500/15 text-amber-200"
              onSelectPost={onSelectPost}
              onSelectSeller={onSelectSeller}
              items={
              hottestPosts.map(post => ({
                id: post.id,
                title: post.title,
                subtitle: `${post.authorName} • ${post.tags.slice(0, 2).join(' • ')}`,
                imageUrl: post.imageUrl,
                post,
                tag: 'Trending',
                metric: `${(post.likes?.length || 0) + (post.saves?.length || 0) + (post.ratingCount || 0)} live signals`,
                location: post.authorLocation ? `${post.authorLocation.city}, ${post.authorLocation.country}` : undefined,
                accent: 'from-orange-400/35 via-amber-500/20 to-transparent',
              }))}
            />
          </div>

          <div className="rounded-[28px] border border-amber-500/15 bg-[linear-gradient(135deg,#12161d,#0f172a,#111317)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-300">
                <Zap className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-[0.22em]">Trending fabrics near you</span>
              </div>
            </div>
            <LandingTrendCarousel
              label="Recently active fabric posts"
              accentClass="bg-cyan-500/15 text-cyan-200"
              onSelectPost={onSelectPost}
              onSelectSeller={onSelectSeller}
              items={
              lastWeekHits.map(post => ({
                id: post.id,
                title: post.title,
                subtitle: `${post.authorName} • ${post.tags[0] || 'fashion'} update`,
                imageUrl: post.imageUrl,
                post,
                tag: 'Fresh',
                metric: `${Math.max(1, (post.likes?.length ?? 0) + (post.saves?.length ?? 0))} engaged this week`,
                location: post.authorLocation ? `${post.authorLocation.city}, ${post.authorLocation.country}` : undefined,
                accent: 'from-cyan-400/25 via-sky-500/20 to-transparent',
              }))}
            />
          </div>

          <div className="rounded-[28px] border border-amber-500/15 bg-[linear-gradient(135deg,#19120f,#0f1015,#17130d)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-300">
                <Trophy className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-[0.22em]">Promoted tailors</span>
              </div>
            </div>
            <LandingTrendCarousel
              label="Featured tailor and fabric seller profiles"
              accentClass="bg-fuchsia-500/15 text-fuchsia-200"
              onSelectPost={onSelectPost}
              onSelectSeller={onSelectSeller}
              items={topTailors.map(seller => {
                const sellerPosts = posts.filter(post => post.authorId === seller.id);
                const avgRating = sellerPosts.length ? sellerPosts.reduce((sum, post) => sum + (post.rating || 0), 0) / sellerPosts.length : 0;
                const featuredImage = sellerPosts[0]?.imageUrl || '/logo.png';
                const sellerLocation = seller.location ? `${seller.location.city}, ${seller.location.country}` : 'Global atelier';
                return {
                  id: seller.id,
                  title: seller.shopName || seller.name,
                  subtitle: `${seller.role === 'fabric_seller' ? 'Fabric merchant' : 'Tailor'} • Avg rating ${avgRating.toFixed(1)}/5`,
                  imageUrl: featuredImage,
                  seller,
                  tag: seller.isPromoted ? 'Featured' : 'Popular',
                  metric: `${seller.followers.length} followers`,
                  location: sellerLocation,
                  accent: 'from-fuchsia-500/30 via-purple-500/20 to-transparent',
                };
              })}
            />
          </div>
        </div>
      </motion.section>

      {/* 3 Pillars / Roles Section */}
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.6 }} className="py-12 border-t border-amber-500/15">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-serif font-bold mb-2">Designed for the Bespoke Fashion Ecosystem</h2>
          <p className={`text-sm ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            Select your journey whether you design masterpieces, supply fine textiles, or seek bespoke attire.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Tailors */}
          <div
            className={`p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${
              isDarkMode
                ? 'bg-neutral-900/50 border-neutral-800 hover:border-amber-500/40'
                : 'bg-white border-neutral-200/80 hover:border-amber-500/40 shadow-sm'
            }`}
          >
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-5">
              <Scissors className="w-6 h-6" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-serif font-bold">Master Tailors</h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
                Atelier
              </span>
            </div>
            <p className={`text-sm mb-4 leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Post your bespoke garments with customizable pricing based on fabric and complexity. Receive direct orders, get promoted by the admin, and connect with customers worldwide.
            </p>
            <ul className={`text-xs space-y-2 mb-6 ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Multi-tier pricing: Basic, Premium Material, Bespoke</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Direct WhatsApp & In-App order channel</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Runway Carousel & Promoted Atelier Symbol</span>
              </li>
            </ul>
            <button
              onClick={() => onOpenAuth('tailor')}
              className="w-full py-2.5 rounded-lg text-xs font-medium border border-amber-500/40 hover:bg-amber-500 hover:text-neutral-950 transition-colors"
            >
              Start Tailor Profile
            </button>
          </div>

          {/* Card 2: Fabric Sellers */}
          <div
            className={`p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${
              isDarkMode
                ? 'bg-neutral-900/50 border-neutral-800 hover:border-amber-500/40'
                : 'bg-white border-neutral-200/80 hover:border-amber-500/40 shadow-sm'
            }`}
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-5">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-serif font-bold">Fabric Merchants</h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                Textiles
              </span>
            </div>
            <p className={`text-sm mb-4 leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Vend pure silks, raw linens, cashmere, laces, and authentic African Ankara prints directly to tailors and individual buyers with transparent yardage pricing.
            </p>
            <ul className={`text-xs space-y-2 mb-6 ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Tag by material origin & weight (gsm/yard)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Wholesale & retail direct inquiries</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Built-in image link compression program</span>
              </li>
            </ul>
            <button
              onClick={() => onOpenAuth('fabric_seller')}
              className="w-full py-2.5 rounded-lg text-xs font-medium border border-emerald-500/40 hover:bg-emerald-500 hover:text-neutral-950 transition-colors"
            >
              List Fabric Inventory
            </button>
          </div>

          {/* Card 3: Discerning Clients */}
          <div
            className={`p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${
              isDarkMode
                ? 'bg-neutral-900/50 border-neutral-800 hover:border-amber-500/40'
                : 'bg-white border-neutral-200/80 hover:border-amber-500/40 shadow-sm'
            }`}
          >
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-5">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-serif font-bold">Discerning Clients</h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
                Clients
              </span>
            </div>
            <p className={`text-sm mb-4 leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Discover master craftsmen in your city or anywhere in the world. Filter by country, state, or GPS proximity, like posts, save high-resolution garment inspirations, and order bespoke cuts.
            </p>
            <ul className={`text-xs space-y-2 mb-6 ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                <span>Active location monitoring & proximity sorting</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                <span>Save high-res garment photos & like designs</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                <span>Real-time follower updates & instant chat</span>
              </li>
            </ul>
            <button
              onClick={() => onOpenAuth('buyer')}
              className="w-full py-2.5 rounded-lg text-xs font-medium border border-purple-500/40 hover:bg-purple-500 hover:text-neutral-950 transition-colors"
            >
              Join as Client
            </button>
          </div>
        </div>
      </motion.section>

      {/* Feature Highlights Grid */}
      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.6, delay: 0.08 }} className="py-12 border-t border-amber-500/15">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="p-4">
            <div className="text-amber-400 font-serif text-3xl font-bold mb-1">Global</div>
            <div className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Country, State & City Geospatial Filter
            </div>
          </div>
          <div className="p-4">
            <div className="text-amber-400 font-serif text-3xl font-bold mb-1">Direct</div>
            <div className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              WhatsApp & In-App Custom Order Inquiries
            </div>
          </div>
          <div className="p-4">
            <div className="text-amber-400 font-serif text-3xl font-bold mb-1">100%</div>
            <div className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Real Tailor Posts (Zero Artificial Mock Data)
            </div>
          </div>
          <div className="p-4">
            <div className="text-amber-400 font-serif text-3xl font-bold mb-1">VIP</div>
            <div className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Admin Promoted Atelier Runway Carousel
            </div>
          </div>
        </div>
      </motion.section>
    </div>
  );
};
