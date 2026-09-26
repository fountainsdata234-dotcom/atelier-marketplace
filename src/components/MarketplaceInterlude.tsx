import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ChevronLeft, ChevronRight, Scissors, Star, Sparkles } from 'lucide-react';
import { ClothPost, User } from '../types';
import { getRatingQuality } from '../utils/marketplaceRanking';

interface MarketplaceInterludeProps {
  posts: ClothPost[];
  users: User[];
  isDarkMode: boolean;
  onSelectSeller: (user: User) => void;
}

export const MarketplaceInterlude: React.FC<MarketplaceInterludeProps> = ({ posts, users, isDarkMode, onSelectSeller }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);
  const ratedSellers = useMemo(() => {
    const bySeller = new Map<string, { user: User; ratingTotal: number; ratingCount: number; post: ClothPost }>();

    posts.forEach(post => {
      const user = userById.get(post.authorId);
      if (!user || (user.role !== 'tailor' && user.role !== 'fabric_seller')) return;
      const existing = bySeller.get(user.id) || { user, ratingTotal: 0, ratingCount: 0, post };
      const ratingCount = Number.isFinite(post.ratingCount) ? Math.max(0, post.ratingCount || 0) : 0;
      const rating = Number.isFinite(post.rating) ? Math.min(5, Math.max(0, post.rating || 0)) : 0;
      existing.ratingTotal += rating * ratingCount;
      existing.ratingCount += ratingCount;
      if ((post.ratingCount || 0) > (existing.post.ratingCount || 0)) existing.post = post;
      bySeller.set(user.id, existing);
    });

    return Array.from(bySeller.values())
      .sort((a, b) => getRatingQuality(b.ratingTotal / Math.max(1, b.ratingCount), b.ratingCount)
        - getRatingQuality(a.ratingTotal / Math.max(1, a.ratingCount), a.ratingCount)
        || b.ratingCount - a.ratingCount)
      .slice(0, 5);
  }, [posts, userById]);

  useEffect(() => {
    if (ratedSellers.length < 2) return;
    const timer = window.setInterval(() => setActiveIndex(index => (index + 1) % ratedSellers.length), 5200);
    return () => window.clearInterval(timer);
  }, [ratedSellers.length]);

  useEffect(() => {
    if (activeIndex >= ratedSellers.length) setActiveIndex(0);
  }, [activeIndex, ratedSellers.length]);

  if (ratedSellers.length === 0) return null;
  const active = ratedSellers[activeIndex];
  const averageRating = active.ratingCount ? active.ratingTotal / active.ratingCount : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      className={`relative isolate overflow-hidden rounded-[1.75rem] border ${isDarkMode ? 'border-amber-500/25 bg-[#17130d]' : 'border-amber-200 bg-[#fff8eb]'}`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(115deg,transparent_0%,rgba(245,158,11,0.12)_45%,transparent_46%),repeating-linear-gradient(90deg,transparent_0,transparent_24px,rgba(245,158,11,0.05)_25px)]" />
      <div className="relative grid items-center gap-6 p-5 sm:p-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-500">
            <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10"><Scissors className="h-3.5 w-3.5" /></span>
            The atelier edit
          </div>
          <h2 className={`max-w-md font-serif text-3xl font-bold leading-tight sm:text-4xl ${isDarkMode ? 'text-amber-50' : 'text-neutral-900'}`}>
            A pause for the hands behind the craft.
          </h2>
          <p className={`mt-3 max-w-lg text-sm leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            You have seen the latest cloths. Now meet the makers whose detail, finish, and fit keep clients coming back.
          </p>
          <div className="mt-5 flex items-center gap-2">
            {ratedSellers.map((seller, index) => (
              <button key={seller.user.id} type="button" aria-label={`Show ${seller.user.name}`} onClick={() => setActiveIndex(index)} className={`h-1.5 rounded-full transition-all ${index === activeIndex ? 'w-8 bg-amber-400' : 'w-2 bg-amber-500/30 hover:bg-amber-400/70'}`} />
            ))}
          </div>
        </div>

        <motion.div key={active.user.id} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }} className={`relative overflow-hidden rounded-2xl border ${isDarkMode ? 'border-white/10 bg-black/20' : 'border-amber-200 bg-white/70'}`}>
          <div className="flex min-h-[190px] items-stretch">
            <div className="relative w-[38%] shrink-0 overflow-hidden bg-neutral-900">
              <img src={active.post.imageUrl} alt={active.post.title} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/35" />
            </div>
            <div className="min-w-0 flex-1 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <button type="button" onClick={() => onSelectSeller(active.user)} aria-label={`Visit ${active.user.shopName || active.user.name}`} className="flex min-w-0 items-center gap-2 text-left">
                  {active.user.avatarUrl ? <img src={active.user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-amber-400/60" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400/15 text-xs font-bold text-amber-300">{active.user.name.slice(0, 2).toUpperCase()}</span>}
                  <div className="min-w-0"><p className="truncate text-sm font-bold">{active.user.shopName || active.user.name}</p><p className="truncate text-[10px] capitalize text-amber-400">{active.user.role.replace('_', ' ')}</p></div>
                </button>
                <div className="flex items-center gap-1 text-xs font-bold text-amber-400"><Star className="h-3.5 w-3.5 fill-current" />{averageRating === null ? 'New' : averageRating.toFixed(1)}</div>
              </div>
              <p className={`mt-5 line-clamp-2 font-serif text-xl font-bold ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>{active.post.title}</p>
              <p className={`mt-1 line-clamp-2 text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>{active.user.bio || 'Known for careful finishing and considered detail.'}</p>
              <button type="button" onClick={() => onSelectSeller(active.user)} className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-amber-500 transition hover:gap-2.5">Visit atelier <ArrowRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          {ratedSellers.length > 1 && <div className="absolute bottom-3 right-3 flex gap-1"><button type="button" aria-label="Previous rated seller" onClick={() => setActiveIndex(index => (index - 1 + ratedSellers.length) % ratedSellers.length)} className="rounded-full border border-amber-500/30 p-1.5 text-amber-400 hover:bg-amber-500/10"><ChevronLeft className="h-3.5 w-3.5" /></button><button type="button" aria-label="Next rated seller" onClick={() => setActiveIndex(index => (index + 1) % ratedSellers.length)} className="rounded-full border border-amber-500/30 p-1.5 text-amber-400 hover:bg-amber-500/10"><ChevronRight className="h-3.5 w-3.5" /></button></div>}
        </motion.div>
      </div>
      <Sparkles className="pointer-events-none absolute right-6 top-5 h-4 w-4 text-amber-400/40" />
    </motion.section>
  );
};