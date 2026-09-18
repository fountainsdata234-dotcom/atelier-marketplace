import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Compass, MapPin, Navigation, Phone, ShieldCheck, Star, Sparkles, UserPlus } from 'lucide-react';
import { ClothPost, User } from '../types';
import { calculateDistanceKm } from '../data/geoData';
import { getProfileInitials, getRoleLabel } from '../utils/profile';

interface ArtisanDirectoryProps {
  users: User[];
  posts: ClothPost[];
  currentUser: User | null;
  onSelectArtisan: (artisan: User) => void;
  onToggleFollow: (artisan: User) => void;
  isDarkMode: boolean;
}

export const ArtisanDirectory: React.FC<ArtisanDirectoryProps> = ({ users, posts, currentUser, onSelectArtisan, onToggleFollow, isDarkMode }) => {
  const artisans = useMemo(() => {
    return users.filter((user) => user.role === 'tailor' || user.role === 'fabric_seller')
      .map((user) => {
        const userPosts = posts.filter((post) => post.authorId === user.id);
        const latestPost = [...userPosts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        const baseLocation = user.location ?? { city: 'Unknown city', state: 'Unknown', country: 'Unknown', lat: 0, lng: 0 };
        const distanceKm = currentUser && baseLocation.lat && baseLocation.lng && currentUser.location.lat && currentUser.location.lng
          ? calculateDistanceKm(currentUser.location.lat, currentUser.location.lng, baseLocation.lat, baseLocation.lng)
          : null;

        return {
          ...user,
          distanceKm,
          postCount: userPosts.length,
          latestPost,
          rating: userPosts.reduce((sum, post) => sum + (post.rating || 0), 0) / Math.max(userPosts.length, 1),
        };
      })
      .sort((a, b) => {
        if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
        if (a.distanceKm !== null) return -1;
        if (b.distanceKm !== null) return 1;
        return b.postCount - a.postCount;
      });
  }, [currentUser, posts, users]);

  const [nearMeOnly, setNearMeOnly] = useState(false);
  const filteredArtisans = nearMeOnly ? artisans.filter((artisan) => artisan.distanceKm !== null && artisan.distanceKm <= 250) : artisans;

  return (
    <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className={`rounded-[2rem] border p-5 sm:p-6 ${isDarkMode ? 'border-neutral-800 bg-[#121316]/80' : 'border-neutral-200 bg-white/90 shadow-sm'}`}>
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-500">Artisan network</p>
            <h1 className="mt-2 text-3xl font-serif font-bold tracking-tight">Nearby tailors & fabric merchants</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setNearMeOnly((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                nearMeOnly
                  ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                  : isDarkMode
                    ? 'border-neutral-700 bg-neutral-900 text-neutral-200'
                    : 'border-neutral-200 bg-neutral-100 text-neutral-700'
              }`}
            >
              <Navigation className="h-3.5 w-3.5" />
              {nearMeOnly ? 'Showing 250km radius' : 'Filter near me'}
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50'}`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Verified artisans</p>
            <p className="mt-2 text-2xl font-black text-amber-500">{artisans.length}</p>
          </div>
          <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50'}`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Within reach</p>
            <p className="mt-2 text-2xl font-black text-emerald-500">{artisans.filter((artisan) => artisan.distanceKm !== null && artisan.distanceKm <= 100).length}</p>
          </div>
          <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50'}`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Promoted</p>
            <p className="mt-2 text-2xl font-black text-violet-500">{artisans.filter((artisan) => artisan.isPromoted).length}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredArtisans.map((artisan) => (
            <motion.article
              key={artisan.id}
              layout
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              className={`overflow-hidden rounded-[1.7rem] border ${isDarkMode ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-white shadow-sm'}`}
              onClick={() => onSelectArtisan(artisan)}
            >
              <div className="relative p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {artisan.avatarUrl ? <img src={artisan.avatarUrl} alt={artisan.name} className="h-12 w-12 rounded-2xl object-cover ring-1 ring-amber-500/30" /> : <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-black text-neutral-950 ring-1 ring-amber-500/30">{getProfileInitials(artisan.name)}</div>}
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold">{artisan.name}</h2>
                        {artisan.isPromoted && <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-neutral-950">Promoted</span>}
                      </div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-500">{getRoleLabel(artisan.role)}</p>
                      {artisan.shopName && <p className="text-[10px] text-amber-400">{artisan.shopName} · {artisan.handle}</p>}
                    </div>
                  </div>

                  <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-400">
                    {artisan.distanceKm !== null ? `${Math.round(artisan.distanceKm)} km` : 'Global'}
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-neutral-400">
                    <MapPin className="h-3.5 w-3.5 text-amber-400" />
                    <span>{artisan.location.city}, {artisan.location.state}, {artisan.location.country}</span>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-400">
                    <Compass className="h-3.5 w-3.5 text-amber-400" />
                    <span>{artisan.postCount} live post{artisan.postCount === 1 ? '' : 's'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-400">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span>{artisan.rating ? artisan.rating.toFixed(1) : 'New profile'}</span>
                  </div>
                </div>

                {artisan.latestPost && (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/5">
                    <img src={artisan.latestPost.imageUrl} alt={artisan.latestPost.title} className="h-32 w-full object-cover" />
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold">{artisan.latestPost.title}</p>
                        <span className="text-[10px] text-amber-400">{artisan.latestPost.tags[0] || 'Featured'}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-neutral-800/60 pt-3">
                  <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    Verified
                  </div>
                  <div className="flex items-center gap-2">
                    {currentUser?.id !== artisan.id && <button type="button" onClick={(event) => { event.stopPropagation(); onToggleFollow({ ...artisan, followers: Array.isArray(artisan.followers) ? artisan.followers : [] }); }} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-2.5 py-1.5 text-[10px] font-bold text-amber-300"><UserPlus className="h-3 w-3" />{currentUser && (Array.isArray(artisan.followers) ? artisan.followers : []).includes(currentUser.id) ? 'Following' : 'Follow'}</button>}
                    {artisan.whatsappNumber && (
                    <a
                      onClick={(event) => event.stopPropagation()}
                      href={`https://wa.me/${artisan.whatsappNumber.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[10px] font-bold text-white"
                    >
                      <Phone className="h-3 w-3" />
                      WhatsApp
                    </a>
                    )}
                  </div>
                </div>
              </div>
            </motion.article>
          ))}
        </div>

        {filteredArtisans.length === 0 && (
          <div className={`mt-4 rounded-2xl border border-dashed p-6 text-center ${isDarkMode ? 'border-neutral-700 text-neutral-400' : 'border-neutral-300 text-neutral-500'}`}>
            No artisans match the current location filter yet. Try a wider radius or browse the full network.
          </div>
        )}
      </div>
    </div>
  );
};
