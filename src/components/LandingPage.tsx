import React, { lazy } from 'react';
import { motion } from 'motion/react';
import { Scissors, Sparkles, Compass, ArrowRight, ShoppingBag, Globe2, TrendingUp } from 'lucide-react';
import { AdminPromoPlan, ClothPost, User, UserLocation, UserRole } from '../types';
import type { GlobeArtisan } from './ArtisanGlobe3D';
import { PostImage } from './PostImage';
import { api } from '../services/api';

const ArtisanGlobe3D = lazy(() => import('./ArtisanGlobe3D').then(module => ({ default: module.ArtisanGlobe3D })));

const RESPONSIVE_LANDSCAPE_IMAGE = 'https://user36765.na.imgto.link/public/20260926/chatgpt-image-sep-26-2026-10-17-44-am.avif';
const RESPONSIVE_PORTRAIT_IMAGE = 'https://user36765.na.imgto.link/public/20260926/chatgpt-image-sep-26-2026-10-16-27-am.avif';

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
  const [resolvedSellerLocations, setResolvedSellerLocations] = React.useState<Record<string, UserLocation>>({});
  const resolvingSellerIds = React.useRef(new Set<string>());
  const [failedFeaturedPostId, setFailedFeaturedPostId] = React.useState<string | null>(null);
  const globeSectionRef = React.useRef<HTMLElement | null>(null);
  const featuredPostIdRef = React.useRef<string | null>(null);
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
    .filter(user => !user.isBlocked && (user.role === 'tailor' || user.role === 'fabric_seller'))
    .flatMap(user => {
      const location = typeof user.location.lat === 'number' && Number.isFinite(user.location.lat)
        && user.location.lat >= -90 && user.location.lat <= 90
        && typeof user.location.lng === 'number' && Number.isFinite(user.location.lng)
        && user.location.lng >= -180 && user.location.lng <= 180
        ? user.location
        : resolvedSellerLocations[user.id] || null;
      if (!location) return [];
      const userPosts = posts.filter(post => post.authorId === user.id);
      return [{ ...user, location, distanceKm: null, postCount: userPosts.length }];
    }), [posts, resolvedSellerLocations, users]);

  React.useEffect(() => {
    if (!shouldLoadGlobe) return;
    const unresolved = users.filter(user => !user.isBlocked
      && (user.role === 'tailor' || user.role === 'fabric_seller')
      && !previewArtisans.some(artisan => artisan.id === user.id)
      && !resolvingSellerIds.current.has(user.id));
    if (unresolved.length === 0) return;
    unresolved.forEach(user => resolvingSellerIds.current.add(user.id));
    const batches = Array.from({ length: Math.ceil(unresolved.length / 250) }, (_, index) => (
      unresolved.slice(index * 250, (index + 1) * 250).map(user => ({ id: user.id, location: user.location }))
    ));
    let active = true;
    void Promise.all(batches.map(locations => api.resolveMapLocations(locations))).then(results => {
      if (!active) return;
      setResolvedSellerLocations(current => ({
        ...current,
        ...Object.fromEntries(results.flat().map(result => [result.id, result.location])),
      }));
    }).catch(error => {
      console.error('Some seller locations could not be resolved for the artisan globe.', error);
      unresolved.forEach(user => resolvingSellerIds.current.delete(user.id));
    });
    return () => { active = false; };
  }, [previewArtisans, shouldLoadGlobe, users]);

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
    <div className="relative z-10 mx-auto w-full max-w-[90rem] px-3 py-6 sm:px-6 sm:py-10 lg:px-8 md:py-16">
      {/* Hero Section */}
      <section className="mx-auto max-w-none px-0 pb-8 pt-4 sm:pb-10 sm:pt-6">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full"
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

            {featuredPost && featuredPost.id !== failedFeaturedPostId && <article className="min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br from-neutral-900 via-[#17181c] to-[#2a1715] p-3 sm:rounded-3xl sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-400 sm:text-xs">
                    <span>From the seller network</span>
                    <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1.5 text-emerald-300">Live post</span>
                  </div>

                  <div className="rounded-xl bg-neutral-900 p-3 text-white sm:rounded-2xl sm:p-5">
                    <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300">Seller post</p>
                        <h2 className="mt-1 line-clamp-2 text-2xl font-semibold">{featuredPost?.title || 'Real work from real makers'}</h2>
                      </div>
                      <div className="shrink-0 rounded-full bg-white/10 px-2.5 py-1.5 text-xs">Marketplace</div>
                    </div>

                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-950 sm:rounded-2xl">
                      {featuredPost && <PostImage src={featuredPost.imageUrl} alt={featuredPost.imageAlt || featuredPost.title || 'Atelier listing'} className="h-full w-full" imageClassName="brightness-110 saturate-110" loading="eager" fetchPriority="high" decoding="async" onError={() => setFailedFeaturedPostId(featuredPost.id)} />}
                    </div>
                    <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-neutral-300">{featuredPost?.description || 'A living catalogue of garments, fabrics, and ideas published by the people who make them.'}</p>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-neutral-900/80 px-3 py-3 sm:mt-4 sm:rounded-2xl sm:px-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Seller catalogue</p>
                      <p className="text-sm font-bold text-amber-300">Browse the full post</p>
                    </div>
                    <button
                      onClick={onExploreMarketplace}
                      className="shrink-0 rounded-full bg-amber-400 px-4 py-2 text-xs font-bold text-slate-900"
                    >
                      Explore
                    </button>
                  </div>
                </article>}
          </div>
        </motion.div>
      </section>

      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: 0.6 }} className="border-t border-amber-500/15 py-12">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-500">One atelier, every screen</p><h2 className="mt-2 text-2xl font-serif font-bold sm:text-3xl">Made for the way you browse.</h2></div><span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Responsive by design</span></div>
        <div className="grid items-end gap-5 md:grid-cols-[1.45fr_0.55fr]"><figure className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 p-2"><img src={RESPONSIVE_LANDSCAPE_IMAGE} alt="FABSATTIRE on a landscape screen" loading="lazy" decoding="async" className="h-auto w-full rounded-xl object-cover" /></figure><figure className="mx-auto w-full max-w-[19rem] overflow-hidden rounded-[2rem] border border-neutral-800 bg-neutral-950 p-2"><img src={RESPONSIVE_PORTRAIT_IMAGE} alt="FABSATTIRE on a portrait screen" loading="lazy" decoding="async" className="h-auto w-full rounded-[1.5rem] object-cover" /></figure></div>
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

      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.6 }} className="border-t border-amber-500/15 py-12">
        <div className="flex flex-col gap-5 rounded-3xl border border-amber-500/20 bg-gradient-to-br from-neutral-900 via-neutral-950 to-amber-950/30 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-300">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-400">Activity-based discovery</p>
              <h2 className="mt-2 text-xl font-serif font-bold text-white sm:text-2xl">Trends are earned, not invented.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-300">
                Marketplace trends use qualified customer activity. Until enough real signals are available, listings stay in the regular feed instead of being labelled “hot.”
              </p>
            </div>
          </div>
          <button type="button" onClick={onExploreMarketplace} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-xs font-bold text-neutral-950 transition hover:bg-amber-300">
            Explore the marketplace <ArrowRight className="h-4 w-4" />
          </button>
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
                <span>Direct WhatsApp & In-App enquiry channel</span>
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
              Discover master craftsmen in your city or anywhere in the world. Filter by country, state, or GPS proximity, like posts, save high-resolution garment inspirations, and discuss bespoke cuts directly with sellers.
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
