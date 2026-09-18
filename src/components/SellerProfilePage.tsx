import React, { useMemo } from 'react';
import { ArrowLeft, MapPin, Phone, Share2, Star, Users } from 'lucide-react';
import { ClothPost, User } from '../types';
import { getProfileInitials, getRoleLabel } from '../utils/profile';

interface SellerProfilePageProps {
  seller: User;
  posts: ClothPost[];
  currentUser: User | null;
  isDarkMode: boolean;
  onBack: () => void;
  onShare: (seller: User) => void;
  onToggleFollow: (seller: User) => void;
}

export const SellerProfilePage: React.FC<SellerProfilePageProps> = ({ seller, posts, currentUser, isDarkMode, onBack, onShare, onToggleFollow }) => {
  const sellerPosts = useMemo(() => posts.filter(post => post.authorId === seller.id), [posts, seller.id]);
  const averageRating = sellerPosts.reduce((total, post) => total + (post.rating || 0), 0) / Math.max(1, sellerPosts.filter(post => post.rating).length);
  const surface = isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm';

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-amber-500 hover:text-amber-300"><ArrowLeft className="h-4 w-4" /> Back to marketplace</button>
      <section className={`overflow-hidden rounded-3xl border ${surface}`}>
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/20 via-neutral-950 to-orange-900/20 p-6 sm:p-10">
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-4">
              {seller.avatarUrl ? <img src={seller.avatarUrl} alt={seller.name} className="h-20 w-20 rounded-2xl object-cover ring-2 ring-amber-400/60" /> : <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-2xl font-black text-neutral-950">{getProfileInitials(seller.name)}</div>}
              <div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">Verified atelier profile</p><h1 className="mt-1 text-3xl font-serif font-bold text-white sm:text-4xl">{seller.name}</h1><p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">{getRoleLabel(seller.role)}</p><p className="text-xs text-amber-100/70">{seller.handle}{seller.shopName ? ` · ${seller.shopName}` : ''}</p></div>
            </div>
            <div className="flex gap-2"><button type="button" onClick={() => onToggleFollow(seller)} className="rounded-xl border border-amber-400/60 px-4 py-2.5 text-xs font-bold text-amber-200 hover:bg-amber-400/10">{currentUser && seller.followers?.includes(currentUser.id) ? 'Following' : 'Follow'}</button><button type="button" onClick={() => onShare(seller)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-neutral-950 hover:bg-amber-300"><Share2 className="h-4 w-4" /> Share profile</button></div>
          </div>
          {seller.bio && <p className="relative mt-6 max-w-2xl text-sm leading-relaxed text-neutral-200">{seller.bio}</p>}
          <div className="relative mt-6 flex flex-wrap gap-3 text-xs text-neutral-200"><span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-amber-300" />{seller.location.city}, {seller.location.country}</span><span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-amber-300" />{Array.isArray(seller.followers) ? seller.followers.length : 0} followers</span><span className="inline-flex items-center gap-1.5"><Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />{averageRating ? averageRating.toFixed(1) : 'New'} rating</span>{seller.whatsappNumber && <a href={`https://wa.me/${seller.whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-emerald-300"><Phone className="h-3.5 w-3.5" /> WhatsApp</a>}</div>
        </div>
        <div className="p-5 sm:p-8"><div className="mb-6 flex flex-col gap-2 border-b border-neutral-800/70 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">Seller collection</p><h2 className="mt-1 text-2xl font-serif font-bold">{seller.name}'s collection</h2><p className="mt-1 max-w-xl text-xs text-neutral-400">A considered edit of garments and materials published by this {getRoleLabel(seller.role).toLowerCase()}.</p></div><span className="text-xs text-neutral-400">{sellerPosts.length} piece{sellerPosts.length === 1 ? '' : 's'} available</span></div>{sellerPosts.length === 0 ? <p className="rounded-2xl border border-dashed border-neutral-700 p-8 text-center text-xs text-neutral-400">This seller has not published a collection yet.</p> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{sellerPosts.map(post => <article key={post.id} className={`overflow-hidden rounded-2xl border ${isDarkMode ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50'}`}><img src={post.imageUrl} alt={post.title} className="aspect-[4/3] w-full object-cover" /><div className="p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-500">{post.tags[0] || getRoleLabel(seller.role)}</p><h3 className="mt-1 font-serif text-lg font-bold">{post.title}</h3><p className="mt-1 line-clamp-2 text-xs text-neutral-400">{post.description}</p><div className="mt-3 flex items-center justify-between text-[10px] text-neutral-400"><span>{post.likes?.length || 0} likes</span><span>{post.saves?.length || 0} saves</span><span>{post.rating ? `${post.rating.toFixed(1)} rating` : 'New'}</span></div></div></article>)}</div>}</div>
      </section>
    </main>
  );
};
