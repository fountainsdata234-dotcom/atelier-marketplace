import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Compass, Globe2, MapPin, Navigation, Phone, ShieldCheck, Star, Sparkles, UserPlus, ZoomIn, ZoomOut } from 'lucide-react';
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
  const [globeZoom, setGlobeZoom] = useState(1);
  const [globeRotation, setGlobeRotation] = useState({ x: 0, y: 0 });
  const [selectedGlobeArtisanId, setSelectedGlobeArtisanId] = useState<string | null>(null);
  const dragStart = useRef<{ x: number; y: number; rotationX: number; rotationY: number } | null>(null);
  const filteredArtisans = nearMeOnly ? artisans.filter((artisan) => artisan.distanceKm !== null && artisan.distanceKm <= 250) : artisans;
  const mappedArtisans = filteredArtisans.filter((artisan) => Number.isFinite(artisan.location.lat) && Number.isFinite(artisan.location.lng));

  const updateGlobeZoom = (nextZoom: number) => setGlobeZoom(Math.min(2.65, Math.max(0.68, nextZoom)));

  const handleGlobePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, y: event.clientY, rotationX: globeRotation.x, rotationY: globeRotation.y };
  };

  const handleGlobePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    setGlobeRotation({
      x: dragStart.current.rotationX + (event.clientY - dragStart.current.y) * 0.35,
      y: dragStart.current.rotationY + (event.clientX - dragStart.current.x) * 0.35,
    });
  };

  const stopGlobeDrag = () => {
    dragStart.current = null;
  };

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

        <section className={`relative mb-6 overflow-hidden rounded-[1.7rem] border ${isDarkMode ? 'border-cyan-400/20 bg-[#07131b]' : 'border-cyan-700/20 bg-slate-950'} text-white`}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.12),transparent_45%),linear-gradient(115deg,transparent_25%,rgba(34,211,238,0.05),transparent_75%)]" />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-cyan-400/15 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-cyan-300" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Live artisan signal</p>
                <p className="text-xs text-slate-300">{mappedArtisans.length} account{mappedArtisans.length === 1 ? '' : 's'} transmitting verified coordinates</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => updateGlobeZoom(globeZoom - 0.2)} aria-label="Zoom out globe" className="rounded-lg border border-cyan-300/20 p-2 text-cyan-200 transition hover:bg-cyan-300/10"><ZoomOut className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => updateGlobeZoom(globeZoom + 0.2)} aria-label="Zoom in globe" className="rounded-lg border border-cyan-300/20 p-2 text-cyan-200 transition hover:bg-cyan-300/10"><ZoomIn className="h-3.5 w-3.5" /></button>
              <span className="ml-1 min-w-12 text-right font-mono text-[10px] text-cyan-200">{Math.round(globeZoom * 100)}%</span>
            </div>
          </div>

          <div
            className="artisan-globe-stage relative h-[min(78vw,31rem)] min-h-[19rem] touch-none select-none overflow-hidden"
            onPointerDown={handleGlobePointerDown}
            onPointerMove={handleGlobePointerMove}
            onPointerUp={stopGlobeDrag}
            onPointerCancel={stopGlobeDrag}
            onWheel={(event) => { event.preventDefault(); updateGlobeZoom(globeZoom + (event.deltaY > 0 ? -0.12 : 0.12)); }}
          >
            <div className="artisan-globe-orbit artisan-globe-orbit-one" />
            <div className="artisan-globe-orbit artisan-globe-orbit-two" />
            <div className="artisan-globe-sphere" style={{ transform: `translate(-50%, -50%) scale(${globeZoom}) rotateX(${globeRotation.x}deg) rotateY(${globeRotation.y}deg)` }}>
              <div className="artisan-globe-grid" />
              {mappedArtisans.map((artisan) => {
                const left = `${((Number(artisan.location.lng) + 180) / 360) * 100}%`;
                const top = `${((90 - Number(artisan.location.lat)) / 180) * 100}%`;
                const detailLevel = globeZoom >= 2.25 ? 3 : globeZoom >= 1.7 ? 2 : globeZoom >= 1.2 ? 1 : 0;
                const isSelected = selectedGlobeArtisanId === artisan.id;
                return (
                  <button
                    key={artisan.id}
                    type="button"
                    className={`artisan-signal absolute ${isSelected ? 'z-30' : 'z-10'}`}
                    style={{ left, top }}
                    onClick={(event) => { event.stopPropagation(); setSelectedGlobeArtisanId(artisan.id); }}
                    aria-label={`Open ${artisan.name} in ${artisan.location.city}, ${artisan.location.country}`}
                  >
                    <span className="artisan-signal-pulse" />
                    <span className="artisan-signal-dot" />
                    {detailLevel >= 1 && <span className="artisan-signal-avatar">{artisan.avatarUrl ? <img src={artisan.avatarUrl} alt="" /> : getProfileInitials(artisan.name)}</span>}
                    {detailLevel >= 2 && <span className="artisan-signal-label">{artisan.name}<small>{artisan.location.city}</small></span>}
                    {detailLevel >= 3 && isSelected && (
                      <span className="artisan-signal-card" onClick={(event) => { event.stopPropagation(); onSelectArtisan(artisan); }}>
                        <strong>{artisan.name}</strong>
                        <span>{getRoleLabel(artisan.role)}</span>
                        <small><MapPin className="inline h-3 w-3" /> {artisan.location.city}, {artisan.location.state}</small>
                        <em>View profile</em>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-cyan-300/15 bg-slate-950/70 px-3 py-1.5 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-cyan-100/70">Drag to rotate · scroll to scan</div>
          </div>
        </section>

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
