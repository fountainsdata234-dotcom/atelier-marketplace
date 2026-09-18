import React from 'react';
import { motion } from 'motion/react';
import { Scissors, Sparkles, MapPin, MessageSquare, ShieldCheck, Heart, Share2, Compass, ArrowRight, Star, ShoppingBag } from 'lucide-react';
import { UserRole } from '../types';
import { CraftAnimationReel } from './CraftAnimationReel';

interface LandingPageProps {
  onOpenAuth: (defaultRole: UserRole) => void;
  onExploreMarketplace: () => void;
  isDarkMode: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenAuth,
  onExploreMarketplace,
  isDarkMode
}) => {
  return (
    <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-16">
      {/* Hero Section */}
      <section className="mx-auto max-w-6xl px-3 pb-10 pt-6 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="glass-panel overflow-hidden rounded-[32px] p-4 sm:p-6 lg:p-8"
        >
          <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="text-center lg:text-left">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                <Sparkles className="w-3.5 h-3.5" />
                Bespoke tailoring marketplace
              </div>

              <h1 className="text-4xl font-black leading-none tracking-[-0.06em] text-slate-900 sm:text-5xl lg:text-7xl">
                <span className="relative inline-block">
                  Fabric Reality
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

              <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Discover premium fabrics, connect with expert tailors, and manage every order and saved design from one polished marketplace.
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <button
                  onClick={onExploreMarketplace}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  <Compass className="w-4 h-4" />
                  Explore marketplace
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => onOpenAuth('buyer')}
                  className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-amber-300 hover:text-amber-700"
                >
                  Register as client
                </button>
              </div>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500 lg:justify-start">
                <span className="rounded-full bg-slate-100 px-2.5 py-1.5">Worldwide tailors</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1.5">Mobile-first shopping</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1.5">Virtual fit estimate</span>
              </div>
            </div>

            <div className="relative">
              <div className="soft-card relative overflow-hidden rounded-[28px] p-4">
                <div className="rounded-[22px] bg-gradient-to-br from-amber-100 via-white to-orange-50 p-4">
                  <div className="mb-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    <span>Featured</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">Live fit</span>
                  </div>

                  <div className="rounded-[22px] bg-gradient-to-br from-slate-900 to-slate-700 p-4 text-white">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Classic senator</p>
                        <h2 className="mt-1 text-2xl font-semibold">Royal Blue</h2>
                      </div>
                      <div className="rounded-full bg-white/10 px-2 py-1 text-xs">Try on</div>
                    </div>

                    <div className="relative h-48 overflow-hidden rounded-[20px] bg-slate-900">
                      <img src="https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=900&q=75" alt="Rows of richly textured garments and cloth in a fashion atelier" className="h-full w-full object-cover transition duration-700 hover:scale-105" referrerPolicy="no-referrer" fetchPriority="high" />
                      <div className="absolute inset-x-3 bottom-3 rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-sm">Textiles with a point of view</div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-2xl bg-white px-3 py-2 shadow-sm">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">From</p>
                      <p className="text-lg font-bold text-slate-900">$148</p>
                    </div>
                    <button
                      onClick={() => onOpenAuth('buyer')}
                      className="rounded-full bg-amber-400 px-4 py-2 text-xs font-bold text-slate-900"
                    >
                      Shop now
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <CraftAnimationReel />

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
