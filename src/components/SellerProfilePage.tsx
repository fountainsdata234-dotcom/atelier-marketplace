import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MapPin, Phone, Search, Share2, Star, Users, CheckCircle2, Grid3X3, Layers } from 'lucide-react';
import { ClothPost, User } from '../types';
import { getProfileInitials, getRoleLabel } from '../utils/profile';
import { getRatingQuality } from '../utils/marketplaceRanking';

const SELLER_ATELIER_IMAGE = 'https://res.cloudinary.com/auwy7fil/image/upload/f_auto,q_auto,w_1200/v1790415437/ChatGPT_Image_Sep_26_2026_10_19_39_AM.png';

interface SellerProfilePageProps {
  seller: User;
  posts: ClothPost[];
  featuredPostId?: string | null;
  currentUser: User | null;
  isDarkMode: boolean;
  onBack: () => void;
  onShare: (seller: User) => void;
  onToggleFollow: (seller: User) => void;
  onSelectPost: (post: ClothPost) => void;
}

export const SellerProfilePage: React.FC<SellerProfilePageProps> = ({ seller, posts, featuredPostId, currentUser, isDarkMode, onBack, onShare, onToggleFollow, onSelectPost }) => {
  const allSellerPosts = useMemo(() => posts.filter(post => post.authorId === seller.id), [posts, seller.id]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'rating' | 'price'>('newest');
  const collectionTags = useMemo(() => {
    const tagsByKey = new Map<string, string>();
    allSellerPosts.forEach(post => (Array.isArray(post.tags) ? post.tags : []).forEach(tag => {
      const cleanTag = tag.trim();
      const normalizedTag = cleanTag.toLowerCase();
      if (normalizedTag && !tagsByKey.has(normalizedTag)) tagsByKey.set(normalizedTag, cleanTag);
    }));
    return Array.from(tagsByKey.values()).sort((a, b) => a.localeCompare(b));
  }, [allSellerPosts]);
  const sellerPosts = useMemo(() => allSellerPosts.filter(post => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || `${post.title} ${post.description} ${post.tags.join(' ')}`.toLowerCase().includes(query);
    const matchesTag = selectedTag === 'all' || post.tags.some(tag => tag.trim().toLowerCase() === selectedTag.toLowerCase());
    return matchesSearch && matchesTag;
  }).sort((a, b) => {
    if (sortBy === 'rating') return getRatingQuality(b.rating, b.ratingCount) - getRatingQuality(a.rating, a.ratingCount) || (b.ratingCount || 0) - (a.ratingCount || 0);
    if (sortBy === 'price') return (a.pricing.basic || Number.MAX_SAFE_INTEGER) - (b.pricing.basic || Number.MAX_SAFE_INTEGER);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }), [allSellerPosts, searchQuery, selectedTag, sortBy]);
  const averageRating = allSellerPosts.reduce((total, post) => total + (post.rating || 0) * (post.ratingCount || 0), 0) / Math.max(1, allSellerPosts.reduce((total, post) => total + (post.ratingCount || 0), 0));
  const surface = isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm';

  useEffect(() => {
    if (!featuredPostId || !allSellerPosts.some(post => post.id === featuredPostId)) return;
    const timer = window.setTimeout(() => document.getElementById(`collection-post-${featuredPostId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    return () => window.clearTimeout(timer);
  }, [featuredPostId, allSellerPosts]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-amber-500 hover:text-amber-300"><ArrowLeft className="h-4 w-4" /> Back to marketplace</button>
      <section className={`overflow-hidden rounded-[2rem] border ${surface}`} onClick={(event) => {
        const card = (event.target as HTMLElement).closest('article[id^="collection-post-"]');
        if (!card) return;
        const post = allSellerPosts.find(item => item.id === card.id.replace('collection-post-', ''));
        if (post) onSelectPost(post);
      }}>
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/25 via-neutral-950 to-orange-900/30 p-6 sm:p-10">
          <img
            src={SELLER_ATELIER_IMAGE}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-[0.16]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-neutral-950/95 via-neutral-950/75 to-neutral-950/35" />
          <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full border border-amber-300/10 bg-amber-400/5" />
          <div className="relative flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-4">
              {seller.avatarUrl ? <img src={seller.avatarUrl} alt={seller.name} loading="lazy" decoding="async" className="h-20 w-20 rounded-2xl object-cover ring-2 ring-amber-400/60" /> : <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-2xl font-black text-neutral-950">{getProfileInitials(seller.name)}</div>}
              <div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">Atelier storefront</p><h1 className="mt-1 text-3xl font-serif font-bold text-white sm:text-4xl">{seller.name}</h1><p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">{getRoleLabel(seller.role)}</p><p className="text-xs text-amber-100/70">{seller.handle}{seller.shopName ? ` · ${seller.shopName}` : ''}</p></div>
            </div>
            <div className="flex gap-2"><button type="button" onClick={() => onToggleFollow(seller)} className="rounded-xl border border-amber-400/60 px-4 py-2.5 text-xs font-bold text-amber-200 hover:bg-amber-400/10">{currentUser && seller.followers?.includes(currentUser.id) ? 'Following' : 'Follow'}</button><button type="button" onClick={() => onShare(seller)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-neutral-950 hover:bg-amber-300"><Share2 className="h-4 w-4" /> Share profile</button></div>
          </div>
          {seller.bio && <p className="relative mt-6 max-w-2xl text-sm leading-relaxed text-neutral-200">{seller.bio}</p>}
          <div className="relative mt-6 flex flex-wrap gap-3 text-xs text-neutral-200"><span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-amber-300" />{[seller.location.city, seller.location.state, seller.location.country].filter(Boolean).join(', ')}</span><span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-amber-300" />{Array.isArray(seller.followers) ? seller.followers.length : 0} followers</span><span className="inline-flex items-center gap-1.5"><Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />{averageRating ? averageRating.toFixed(1) : 'New'} rating</span>{seller.whatsappNumber && <a href={`https://wa.me/${seller.whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-emerald-300"><Phone className="h-3.5 w-3.5" /> WhatsApp</a>}</div>
          <div className="relative mt-7 grid max-w-xl grid-cols-3 gap-2 border-t border-white/10 pt-5 text-center"><div><strong className="block text-lg text-white">{sellerPosts.length}</strong><span className="text-[9px] uppercase tracking-[0.16em] text-neutral-400">Pieces</span></div><div><strong className="block text-lg text-white">{seller.followers?.length || 0}</strong><span className="text-[9px] uppercase tracking-[0.16em] text-neutral-400">Followers</span></div><div><strong className="block text-lg text-white">{averageRating ? averageRating.toFixed(1) : 'New'}</strong><span className="text-[9px] uppercase tracking-[0.16em] text-neutral-400">Rating</span></div></div>
        </div>
        <div className={`border-b px-5 py-4 sm:px-8 ${isDarkMode ? 'border-neutral-800/70 bg-[#121316]' : 'border-neutral-200 bg-white'}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className={`relative min-w-0 flex-1 sm:max-w-md ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search pieces, materials, or tags" aria-label="Search seller collection" className={`w-full rounded-lg border py-2.5 pl-9 pr-3 text-xs outline-none focus:border-amber-500 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white placeholder-neutral-500' : 'border-neutral-300 bg-white text-neutral-900 placeholder-neutral-400'}`} />
            </label>
            <select value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)} aria-label="Sort seller collection" className={`rounded-lg border px-3 py-2.5 text-xs outline-none focus:border-amber-500 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`}>
              <option value="newest">Newest</option><option value="rating">Top rated</option><option value="price">Price: low to high</option>
            </select>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button type="button" onClick={() => setSelectedTag('all')} aria-pressed={selectedTag === 'all'} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${selectedTag === 'all' ? 'border-amber-400 bg-amber-400 text-neutral-950' : 'border-neutral-700 text-neutral-400 hover:border-amber-500/50'}`}>All pieces</button>
            {collectionTags.map(tag => <button key={tag} type="button" onClick={() => setSelectedTag(tag)} aria-pressed={selectedTag.toLowerCase() === tag.toLowerCase()} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${selectedTag.toLowerCase() === tag.toLowerCase() ? 'border-amber-400 bg-amber-400 text-neutral-950' : 'border-neutral-700 text-neutral-400 hover:border-amber-500/50'}`}>#{tag}</button>)}
          </div>
          <p className="mt-2 text-[10px] text-neutral-500">{sellerPosts.length} matching piece{sellerPosts.length === 1 ? '' : 's'}</p>
        </div>
        <div className="p-5 sm:p-8"><div className="mb-6 flex flex-col gap-4 border-b border-neutral-800/70 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><Grid3X3 className="h-4 w-4 text-amber-500" /><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">The collection</p></div><h2 className="mt-1 text-2xl font-serif font-bold">{seller.name}'s edit</h2><p className="mt-1 max-w-xl text-xs text-neutral-400">A considered edit of garments and materials published by this {getRoleLabel(seller.role).toLowerCase()}.</p><div className="mt-3 flex flex-wrap gap-1.5">{collectionTags.map(tag => <span key={tag} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-400">{tag}</span>)}</div></div><span className="text-xs text-neutral-400">{sellerPosts.length} piece{sellerPosts.length === 1 ? '' : 's'} available</span></div>{sellerPosts.length === 0 ? <p className="rounded-2xl border border-dashed border-neutral-700 p-8 text-center text-xs text-neutral-400">{allSellerPosts.length > 0 ? 'No pieces match these filters.' : 'This seller has not published a collection yet.'}</p> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{sellerPosts.map(post => <article id={`collection-post-${post.id}`} key={post.id} className={`group cursor-pointer overflow-hidden rounded-2xl border transition ${featuredPostId === post.id ? 'border-amber-400 ring-2 ring-amber-400/60 shadow-xl shadow-amber-500/20' : isDarkMode ? 'border-neutral-800 bg-neutral-950/60 hover:border-amber-500/40' : 'border-neutral-200 bg-neutral-50 hover:border-amber-500/40'}`}><div className="relative overflow-hidden"><img src={post.imageUrl} alt={post.title} loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:brightness-105" />{featuredPostId === post.id && <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-neutral-950"><CheckCircle2 className="h-3 w-3" /> Shared piece</span>}</div><div className="p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-500">{post.tags[0] || getRoleLabel(seller.role)}</p><h3 className="mt-1 font-serif text-lg font-bold">{post.title}</h3><p className="mt-1 line-clamp-2 text-xs text-neutral-400">{post.description}</p><div className="mt-3 flex items-center justify-between text-[10px] text-neutral-400"><span>{post.likes?.length || 0} likes</span><span>{post.saves?.length || 0} saves</span><span>{post.rating ? `${post.rating.toFixed(1)} rating` : 'New'}</span></div></div></article>)}</div>}</div>
      </section>
    </main>
  );
};
