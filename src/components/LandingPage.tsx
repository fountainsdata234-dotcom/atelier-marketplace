import React, { lazy } from 'react';
import { motion } from 'motion/react';
import { Scissors, Sparkles, Compass, ArrowRight, ShoppingBag, Globe2, Zap } from 'lucide-react';
import { AdminPromoPlan, ClothPost, User, UserRole } from '../types';
import type { GlobeArtisan } from './ArtisanGlobe3D';

const ArtisanGlobe3D = lazy(() => import('./ArtisanGlobe3D').then(module => ({ default: module.ArtisanGlobe3D })));

const RESPONSIVE_LANDSCAPE_IMAGE = 'https://user36765.na.imgto.link/public/20260926/chatgpt-image-sep-26-2026-10-17-44-am.avif';
const RESPONSIVE_PORTRAIT_IMAGE = 'https://user36765.na.imgto.link/public/20260926/chatgpt-image-sep-26-2026-10-16-27-am.avif';

interface LandingPageProps {
  onOpenAuth: (defaultRole: UserRole) => void;
  onExploreMarketplace: () => void;
  onExploreArtisans: () => void;
  isDarkMode: boolean;
  users: User[];
  posts: ClothPost[];
  promoPlans: AdminPromoPlan[];
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenAuth,
  onExploreMarketplace,
  onExploreArtisans,
  isDarkMode,
  users,
  posts,
  promoPlans,
}) => {
  const [selectedPreviewArtisanId, setSelectedPreviewArtisanId] = React.useState<string | null>(null);
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
  const previewArtisans = React.useMemo<GlobeArtisan[]>(() => users
    .filter(user => user.role === 'tailor' || user.role === 'fabric_seller')
    .filter(user => Number.isFinite(user.location?.lat) && Number.isFinite(user.location?.lng))
    .map(user => {
      const userPosts = posts.filter(post => post.authorId === user.id);
      return { ...user, distanceKm: null, postCount: userPosts.length, rating: userPosts.reduce((sum, post) => sum + (post.rating || 0), 0) / Math.max(userPosts.length, 1) };
    }), [posts, users]);

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
                Bespoke tailoring marketplace
              </div>

              <h1 className="text-4xl font-black leading-none tracking-[-0.06em] text-white sm:text-5xl lg:text-7xl">
                <span className="relative inline-block">
                  Fabrilux Atelier
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
                Discover real tailors and fabric sellers, compare their work by location, and move from a saved idea to a direct conversation in one focused marketplace.
              </p>

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
                <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1.5">Worldwide tailors</span>
                <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1.5">Mobile-first shopping</span>
                <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1.5">Direct conversations</span>
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
                      {featuredPost ? <img src={featuredPost.imageUrl} alt={featuredPost.title} className="h-full w-full object-cover transition duration-700 hover:scale-105" loading="eager" decoding="async" /> : <div className="flex h-full items-center justify-center px-6 text-center text-xs text-neutral-500">Seller work will appear here as the network grows.</div>}
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

      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.6 }} className="border-t border-amber-500/15 py-12">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-500">Live network preview</p><h2 className="mt-2 text-2xl font-serif font-bold sm:text-3xl">See where the craft lives.</h2></div><button type="button" onClick={onExploreArtisans} className="inline-flex items-center gap-2 self-start text-xs font-bold text-amber-500 hover:text-amber-300">Open artisan directory <ArrowRight className="h-4 w-4" /></button></div>
        <div className="landing-globe overflow-hidden">
          {previewArtisans.length > 0 ? <React.Suspense fallback={<div className="flex h-[22rem] items-center justify-center text-xs text-amber-200/70">Loading the live artisan globe...</div>}><ArtisanGlobe3D artisans={previewArtisans} selectedArtisanId={selectedPreviewArtisanId} onSelectArtisan={artisan => setSelectedPreviewArtisanId(artisan.id)} onOpenArtisan={onExploreArtisans} onCloseArtisan={() => setSelectedPreviewArtisanId(null)} isDarkMode={isDarkMode} /></React.Suspense> : <div className="flex h-[22rem] items-center justify-center px-6 text-center text-xs text-amber-100/60">The live globe will populate as artisans join the network.</div>}
        </div>
      </motion.section>

      <motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.6 }} className="border-t border-amber-500/15 py-12">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-500">Current atelier plans</p><h2 className="mt-2 text-2xl font-serif font-bold sm:text-3xl">Promotion that stays current.</h2></div><button type="button" onClick={onExploreArtisans} className="inline-flex items-center gap-2 text-xs font-bold text-amber-500 hover:text-amber-300">Meet the artisans <ArrowRight className="h-4 w-4" /></button></div>
        <div className="grid gap-4 md:grid-cols-3">{promoPlans.map(plan => <article key={plan.id} className={`rounded-2xl border p-5 ${isDarkMode ? 'border-neutral-800 bg-neutral-900/70' : 'border-neutral-200 bg-white shadow-sm'}`}><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">{plan.badgeLabel || 'Atelier plan'}</p><h3 className="mt-2 text-lg font-serif font-bold">{plan.caption}</h3><p className={`mt-2 min-h-12 text-xs leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>{plan.description}</p><div className="mt-5 flex items-end justify-between gap-3"><strong className="text-xl">{plan.currency} {plan.amount}</strong><span className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">{plan.timeRange}</span></div></article>)}</div>
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
