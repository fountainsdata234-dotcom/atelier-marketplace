import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, X, ChevronLeft, ChevronRight, Trash2, Eye, Heart, Send, Play, Pause, BarChart3, Check } from 'lucide-react';
import { TailorStory, User } from '../types';
import { api, StoryUploadAsset } from '../services/api';
import { getStoryUploadSizeError } from '../utils/mediaLimits';

const formatHandle = (handle?: string) => {
  const value = handle?.trim() || '';
  return value ? `@${value.replace(/^@+/, '')}` : '';
};

interface StoryRailProps {
  users: User[];
  currentUser: User | null;
  isDarkMode: boolean;
  onOpenPlans: () => void;
  onSelectSeller: (user: User) => void;
}

export function StoryRail({ users, currentUser, isDarkMode, onOpenPlans, onSelectSeller }: StoryRailProps) {
  const [stories, setStories] = useState<TailorStory[]>([]);
  const [activeTailorId, setActiveTailorId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftUrl, setDraftUrl] = useState('');
  const [draftCaption, setDraftCaption] = useState('');
  const [uploadedMedia, setUploadedMedia] = useState<StoryUploadAsset | null>(null);
  const [uploadError, setUploadError] = useState('');
  const storyFileInputRef = useRef<HTMLInputElement>(null);
  const unavailableStoryIds = useRef(new Set<string>());
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);

  const loadStories = () => {
    api.getStories().then(loadedStories => {
      setStories(loadedStories.filter(story =>
        new Date(story.expiresAt).getTime() > Date.now()
        && !unavailableStoryIds.current.has(story.id),
      ));
    }).catch(error => {
      console.error('Unable to load stories.', error);
      setStories([]);
    });
  };

  const hideUnavailableStory = (storyId: string) => {
    if (unavailableStoryIds.current.has(storyId)) return;
    unavailableStoryIds.current.add(storyId);
    setStories(current => current.filter(story => story.id !== storyId));
  };

  useEffect(() => {
    loadStories();
    const refresh = window.setInterval(loadStories, 60_000);
    return () => window.clearInterval(refresh);
  }, []);

  useEffect(() => {
    const nextExpiry = stories
      .map(story => new Date(story.expiresAt).getTime())
      .filter(expiry => Number.isFinite(expiry) && expiry > Date.now())
      .sort((left, right) => left - right)[0];
    if (nextExpiry === undefined) return;
    const timer = window.setTimeout(() => {
      setStories(current => current.filter(story => new Date(story.expiresAt).getTime() > Date.now()));
      loadStories();
    }, nextExpiry - Date.now());
    return () => window.clearTimeout(timer);
  }, [stories]);

  useEffect(() => {
    const openStoryPicker = () => storyFileInputRef.current?.click();
    window.addEventListener('atelier_open_story_composer', openStoryPicker);
    return () => window.removeEventListener('atelier_open_story_composer', openStoryPicker);
  }, []);

  useEffect(() => () => {
    if (draftUrl) URL.revokeObjectURL(draftUrl);
  }, [draftUrl]);

  useEffect(() => {
    if (!activeTailorId && !draftFile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeTailorId, draftFile]);

  const groupedStories = useMemo(() => {
    const groups = new Map<string, TailorStory[]>();
    [...stories]
      .filter(story => new Date(story.expiresAt).getTime() > Date.now())
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      .forEach(story => groups.set(story.tailorId, [...(groups.get(story.tailorId) || []), story]));
    const entries = [...groups.entries()];
    const currentUserIsMerchant = currentUser?.role === 'tailor' || currentUser?.role === 'fabric_seller';
    if (currentUserIsMerchant) {
      entries.sort(([leftId], [rightId]) => (
        Number(rightId === currentUser.id) - Number(leftId === currentUser.id)
      ));
    }
    return entries;
  }, [stories, currentUser?.id, currentUser?.role]);

  const canAddStory = currentUser?.role === 'admin'
    || (currentUser?.role === 'tailor'
      && currentUser.isPromoted
      && (!currentUser.promotionExpiresAt || new Date(currentUser.promotionExpiresAt).getTime() > Date.now()));
  const activeIndex = activeTailorId ? groupedStories.findIndex(([tailorId]) => tailorId === activeTailorId) : -1;
  const activeStories = activeTailorId ? groupedStories.find(([tailorId]) => tailorId === activeTailorId)?.[1] || [] : [];
  useEffect(() => {
    if (activeTailorId && activeStories.length === 0) setActiveTailorId(null);
  }, [activeTailorId, activeStories.length]);

  const uploadSelectedMedia = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    setUploadError('');
    try {
      const asset = await api.uploadStoryMedia(file, setUploadProgress);
      setUploadedMedia(asset);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'The media could not be uploaded.');
    } finally {
      setUploading(false);
    }
  };

  const openComposer = (file: File) => {
    const supportedImage = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type);
    const supportedVideo = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
    if (!supportedImage && !supportedVideo) {
      setUploadError('Choose a JPEG, PNG, WebP, or GIF photo, or an MP4, WebM, or MOV video.');
      return;
    }
    const sizeError = getStoryUploadSizeError(file);
    if (sizeError) {
      setUploadError(sizeError);
      return;
    }
    setUploadError('');
    if (draftUrl) URL.revokeObjectURL(draftUrl);
    setDraftFile(file);
    setDraftUrl(URL.createObjectURL(file));
    setDraftCaption('');
    setUploadedMedia(null);
    void uploadSelectedMedia(file);
  };

  const retryUpload = () => {
    if (draftFile && !uploading) void uploadSelectedMedia(draftFile);
  };

  const publishStory = async () => {
    if (!uploadedMedia || publishing) return;
    setPublishing(true);
    setUploadError('');
    try {
      await api.publishStory(uploadedMedia, draftCaption);
      setUploadedMedia(null);
      setDraftFile(null);
      setDraftUrl('');
      loadStories();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'The story could not be published.');
    } finally {
      setPublishing(false);
    }
  };

  const closeComposer = async () => {
    if (uploading || publishing || cleaningUp) return;
    if (uploadedMedia) {
      setCleaningUp(true);
      setUploadError('');
      try {
        await api.discardStoryUpload(uploadedMedia);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'The uploaded media could not be removed.');
        return;
      } finally {
        setCleaningUp(false);
      }
    }
    setUploadedMedia(null);
    setDraftFile(null);
    setDraftUrl('');
    setDraftCaption('');
    setUploadProgress(0);
    setUploadError('');
  };

  return (
    <>
      {(currentUser?.role === 'tailor' || groupedStories.length > 0) && (
      <section aria-label="Tailor stories" className={`overflow-hidden rounded-2xl border px-3 pb-3 pt-2.5 sm:px-4 ${isDarkMode ? 'border-amber-400/15 bg-[#111214]' : 'border-amber-200 bg-white shadow-sm'}`}>
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-300 via-orange-400 to-amber-600 text-neutral-950 shadow-[0_6px_18px_rgba(245,158,11,.28)]"><Play className="h-4 w-4 fill-current" /></span>
            <div className="min-w-0">
              <h2 className="font-serif text-sm font-bold leading-tight">Stories</h2>
              <p className={`text-[9px] ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>Discover looks from verified merchants</p>
            </div>
          </div>
          {(currentUser?.role === 'tailor' || currentUser?.role === 'admin') && (
            canAddStory ? (
              <button type="button" onClick={() => storyFileInputRef.current?.click()} className="shrink-0 rounded-full bg-gradient-to-r from-amber-300 to-orange-500 px-3 py-1.5 text-[10px] font-extrabold text-neutral-950"><Plus className="mr-1 inline h-3 w-3" strokeWidth={3} />Post a story</button>
            ) : (
              <button type="button" onClick={onOpenPlans} className="shrink-0 rounded-full border border-amber-400/30 px-3 py-1.5 text-[10px] font-bold text-amber-500">Unlock stories</button>
            )
          )}
        </div>
        <input ref={storyFileInputRef} className="hidden" aria-label="Add a story" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" disabled={uploading || publishing || cleaningUp} onChange={event => { const file = event.target.files?.[0]; if (file) openComposer(file); event.target.value = ''; }} />
        {uploadError && !draftFile && <p role="alert" className="mx-1 mb-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">{uploadError}</p>}
        <div className="flex snap-x gap-3.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:gap-4">
          {groupedStories.map(([tailorId, tailorStories]) => {
            const tailor = userById.get(tailorId);
            return (
              <button
                key={tailorId}
                type="button"
                data-story-interaction
                data-story-thumbnail
                onClick={event => {
                  event.stopPropagation();
                  setActiveTailorId(tailorId);
                }}
                className="flex min-w-[76px] flex-col items-center gap-1.5 md:min-w-[96px]"
              >
                <span className="relative rounded-full bg-gradient-to-tr from-amber-300 via-orange-500 to-red-500 p-[3px] shadow-[0_9px_22px_rgba(245,158,11,.18)]">
                  {tailor?.role === 'admin' && <span className="admin-digital-name absolute left-1/2 top-[-18px] -translate-x-1/2 whitespace-nowrap text-[9px] text-amber-400">ADMIN</span>}
                  <span className={`block h-[62px] w-[62px] overflow-hidden rounded-full border-[3px] bg-neutral-950 md:h-[78px] md:w-[78px] ${isDarkMode ? 'border-neutral-950' : 'border-white'}`}>
                    {tailorStories[0].mediaType === 'video'
                      ? <video src={tailorStories[0].thumbnailUrl || tailorStories[0].mediaUrl} muted playsInline preload="metadata" onError={() => hideUnavailableStory(tailorStories[0].id)} className="h-full w-full object-cover" />
                      : <img data-story-image src={tailorStories[0].thumbnailUrl || tailorStories[0].mediaUrl} alt="" draggable={false} onError={() => hideUnavailableStory(tailorStories[0].id)} className="h-full w-full object-cover" />}
                  </span>
                </span>
                <span className="w-[76px] truncate text-[10px] font-bold md:w-[96px] md:text-xs">
                  {tailor?.role === 'admin' ? <span className="admin-digital-name">ADMIN</span> : formatHandle(tailor?.handle) || `@${tailor?.shopName || tailor?.name || 'merchant'}`}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      )}

      <AnimatePresence>
        {activeTailorId && activeStories.length > 0 && (
          <StoriesViewer
            stories={activeStories}
            tailor={userById.get(activeTailorId)}
            owner={currentUser?.id === activeTailorId}
            onDelete={async storyId => {
              await api.deleteStory(storyId);
              unavailableStoryIds.current.add(storyId);
              setStories(current => current.filter(story => story.id !== storyId));
              loadStories();
              setActiveTailorId(null);
            }}
            onUnavailable={hideUnavailableStory}
            onAdd={() => storyFileInputRef.current?.click()}
            onClose={() => setActiveTailorId(null)}
            onPrevious={() => setActiveTailorId(groupedStories[Math.max(0, activeIndex - 1)]?.[0] || null)}
            onNext={() => setActiveTailorId(groupedStories[Math.min(groupedStories.length - 1, activeIndex + 1)]?.[0] || null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {draftFile && (
          createPortal(
          <motion.div data-story-interaction initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-x-0 top-0 z-[110] flex h-[100dvh] items-end justify-center bg-black/75 sm:items-center">
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} className="max-h-[96dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-neutral-950 text-white sm:rounded-[28px]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div><p className="text-[9px] font-bold uppercase tracking-[.18em] text-amber-400">New story</p><h2 className="font-serif text-lg font-bold">Preview & compose</h2></div>
                <button type="button" aria-label="Close composer" disabled={uploading || publishing || cleaningUp} onClick={() => void closeComposer()} className="rounded-full p-2 text-neutral-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"><X className="h-5 w-5" /></button>
              </div>
              <div className="relative mx-4 mt-4 aspect-[9/16] max-h-[54dvh] overflow-hidden rounded-2xl bg-black">
                {draftFile.type.startsWith('video/')
                  ? <video src={draftUrl} controls playsInline className="h-full w-full object-contain" />
                  : <img src={draftUrl} alt="Story preview" className="h-full w-full object-contain" />}
                {draftCaption && <p className="absolute bottom-5 left-5 right-5 rounded-xl bg-black/55 px-3 py-2 text-center text-sm font-semibold backdrop-blur">{draftCaption}</p>}
              </div>
              <div className="px-4 py-4">
                {uploading ? (
                  <div className="rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-300/10 to-orange-500/5 p-4" role="status" aria-live="polite">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold text-white">Uploading your media</p>
                        <p className="mt-1 text-xs text-neutral-400">{uploadProgress === 100 ? 'Finishing media processing...' : 'Keep this window open while your story is prepared.'}</p>
                      </div>
                      <span className="min-w-[3.5rem] text-right font-serif text-2xl font-bold tabular-nums text-amber-300">{uploadProgress}%</span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Story media upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}>
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500 transition-[width] duration-200" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                ) : uploadedMedia ? (
                  <>
                    <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-200">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/20"><Check className="h-3 w-3" /></span>
                      Your media is ready. Add a caption and publish your story.
                    </div>
                    <textarea value={draftCaption} onChange={event => setDraftCaption(event.target.value.slice(0, 280))} rows={3} maxLength={280} placeholder="Add a caption to your story..." className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none transition focus:border-amber-400" />
                    <div className="mt-1 text-right text-[10px] text-neutral-500">{draftCaption.length}/280</div>
                    {uploadError && <p role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{uploadError}</p>}
                    <button type="button" disabled={publishing || cleaningUp} onClick={() => void publishStory()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-orange-400 px-4 py-3 text-sm font-bold text-neutral-950 shadow-lg shadow-amber-950/20 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">
                      <Send className="h-4 w-4" />{publishing ? 'Publishing story...' : 'Publish story'}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm">
                      <p className="font-semibold text-red-200">Upload didn’t finish</p>
                      <p role="alert" className="mt-1 text-xs leading-relaxed text-red-100/80">{uploadError || 'Please try uploading your media again.'}</p>
                    </div>
                    <button type="button" onClick={retryUpload} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-neutral-950 transition hover:bg-amber-300">
                      <Play className="h-4 w-4 fill-current" />Try upload again
                    </button>
                  </>
                )}
                {cleaningUp && <p className="mt-3 text-center text-xs text-neutral-400">Cleaning up uploaded media...</p>}
              </div>
            </motion.div>
          </motion.div>,
          document.body)
        )}
      </AnimatePresence>
    </>
  );
}

export function PromotedTailorRail({ users, isDarkMode, onSelectSeller }: {
  users: User[];
  isDarkMode: boolean;
  onSelectSeller: (user: User) => void;
}) {
  const promotedTailors = users.filter(user =>
    user.role === 'tailor'
    && !user.isBlocked
    && user.isPromoted
    && (!user.promotionExpiresAt || new Date(user.promotionExpiresAt).getTime() > Date.now()),
  );
  if (!promotedTailors.length) return null;

  return (
    <section aria-label="Promoted tailors" className={`col-span-full rounded-2xl border px-3 py-3 ${isDarkMode ? 'border-amber-500/20 bg-[#121316]/90' : 'border-amber-200 bg-white shadow-sm'}`}>
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-500">Featured ateliers</p>
          <h2 className="text-sm font-serif font-bold">Promoted Tailors</h2>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
        {promotedTailors.map(tailor => (
          <button key={tailor.id} type="button" onClick={() => onSelectSeller(tailor)} className="flex min-w-[76px] flex-col items-center gap-1.5">
            <span className="rounded-full bg-gradient-to-tr from-amber-300 via-orange-500 to-yellow-200 p-[2px] shadow-[0_8px_20px_rgba(245,158,11,.18)]">
              <span className="block rounded-full border-2 border-neutral-950 bg-neutral-900 p-[2px]">
                {tailor.avatarUrl
                  ? <img src={tailor.avatarUrl} alt={`${tailor.shopName || tailor.name} profile`} className="h-[58px] w-[58px] rounded-full object-cover" />
                  : <span className="grid h-[58px] w-[58px] place-items-center rounded-full bg-neutral-800 text-lg font-black text-amber-300">{(tailor.shopName || tailor.name || 'T').slice(0, 1).toUpperCase()}</span>}
              </span>
            </span>
            <span className="w-[76px] truncate text-[10px] font-semibold">{tailor.shopName || tailor.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function StoriesViewer({ stories, tailor, owner, onDelete, onAdd, onClose, onPrevious, onNext, onUnavailable }: {
  stories: TailorStory[];
  tailor?: User;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  owner: boolean;
  onDelete: (storyId: string) => Promise<void>;
  onAdd: () => void;
  onUnavailable: (storyId: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [reply, setReply] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartX = useRef<number | null>(null);
  const holdTimeout = useRef<number | null>(null);
  const chronologicalStories = useMemo(
    () => [...stories].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    [stories],
  );
  const story = chronologicalStories[activeIndex];
  const [liked, setLiked] = useState(Boolean(story?.likedByViewer));

  useEffect(() => {
    setActiveIndex(0);
    setIsPaused(false);
  }, [tailor?.id]);

  useEffect(() => {
    if (activeIndex >= chronologicalStories.length) {
      setActiveIndex(Math.max(0, chronologicalStories.length - 1));
    }
  }, [activeIndex, chronologicalStories.length]);

  useEffect(() => {
    setLiked(Boolean(story?.likedByViewer));
    setReply('');
  }, [story?.id]);

  useEffect(() => {
    setIsPaused(false);
    if (story) void api.recordStoryView(story.id).catch(() => undefined);
  }, [story?.id]);

  useEffect(() => {
    if (!story || isPaused || story.mediaType === 'video') return;
    const timer = window.setTimeout(() => move(1), 7000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, isPaused, story?.mediaType, story?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !story) return;
    if (isPaused) void video.pause();
    else void video.play().catch(() => undefined);
  }, [isPaused, story?.id]);

  const move = (direction: number) => {
    if (direction < 0 && activeIndex > 0) setActiveIndex(index => index - 1);
    else if (direction > 0 && activeIndex < chronologicalStories.length - 1) setActiveIndex(index => index + 1);
    else direction < 0 ? onPrevious() : onNext();
  };
  const beginHold = () => {
    holdTimeout.current = window.setTimeout(() => setIsPaused(true), 120);
  };
  const endHold = () => {
    if (holdTimeout.current !== null) window.clearTimeout(holdTimeout.current);
    holdTimeout.current = null;
    setIsPaused(false);
  };
  const elapsed = (value: string) => {
    const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (!story) return null;

  const toggleLike = () => {
    void api.toggleStoryLike(story.id).then(result => {
      setLiked(result.isLiked);
      story.likeCount = result.likeCount;
      story.likedByViewer = result.isLiked;
    }).catch(() => undefined);
  };

  return createPortal(
    <motion.div data-story-interaction data-stories-viewer initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-x-0 top-0 z-[100] flex h-[100dvh] items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label="Story viewer">
      <div
        className="relative h-[100dvh] w-full overflow-hidden bg-neutral-950 sm:h-[94dvh] sm:max-w-[540px] sm:rounded-2xl"
        onTouchStart={event => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }}
        onTouchEnd={event => {
          if (touchStartX.current === null) return;
          const distance = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(distance) > 55) distance < 0 ? move(1) : move(-1);
        }}
        onPointerDown={beginHold}
        onPointerUp={endHold}
        onPointerCancel={endHold}
        onPointerLeave={endHold}
      >
        {story.mediaType === 'video'
          ? <video ref={videoRef} data-story-image key={story.id} src={story.mediaUrl} poster={story.thumbnailUrl} autoPlay playsInline controls={false} className="h-full w-full object-contain" onError={() => onUnavailable(story.id)} onEnded={() => move(1)} />
          : <img data-story-image key={story.id} src={story.mediaUrl} alt={`${tailor?.shopName || tailor?.name || 'Merchant'} story`} draggable={false} className="h-full w-full object-contain" onError={() => onUnavailable(story.id)} />}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/75" />
        <div className="absolute left-3 right-3 top-3 z-20 flex gap-1">
          {chronologicalStories.map((item, index) => (
            <span key={item.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
              <span
                className={`block h-full bg-white ${index < activeIndex ? 'w-full' : index === activeIndex ? 'animate-[story-progress_7s_linear_forwards]' : 'w-0'}`}
                style={{ animationPlayState: isPaused ? 'paused' : 'running' }}
              />
            </span>
          ))}
        </div>
        <div className="absolute inset-x-0 top-7 z-30 flex items-center gap-3 px-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-amber-300 bg-neutral-900 text-sm font-bold text-amber-300">
            {tailor?.avatarUrl ? <img src={tailor.avatarUrl} alt="" className="h-full w-full object-cover" /> : (tailor?.shopName || tailor?.name || '@').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{formatHandle(tailor?.handle) || `@${tailor?.shopName || tailor?.name || 'merchant'}`}</p>
            <p className="text-[11px] text-white/70">{elapsed(story.createdAt)}</p>
          </div>
          <button type="button" aria-label="Close story" onClick={onClose} className="pointer-events-auto rounded-full bg-black/45 p-2 text-white backdrop-blur-md"><X className="h-5 w-5" /></button>
        </div>
        {story.caption && <p className="absolute bottom-28 left-5 right-5 z-20 rounded-xl bg-black/55 px-3 py-2 text-center text-sm font-semibold text-white backdrop-blur">{story.caption}</p>}
        <button type="button" aria-label="Previous story" onClick={() => move(-1)} className="absolute bottom-32 left-2 z-40 grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white sm:bottom-1/2 sm:translate-y-1/2"><ChevronLeft className="h-5 w-5" /></button>
        <button type="button" aria-label="Next story" onClick={() => move(1)} className="absolute bottom-32 right-2 z-40 grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white sm:bottom-1/2 sm:translate-y-1/2"><ChevronRight className="h-5 w-5" /></button>
        <button type="button" aria-label={isPaused ? 'Resume story' : 'Pause story'} onClick={() => setIsPaused(value => !value)} className="absolute bottom-[92px] left-4 z-40 rounded-full bg-black/45 p-2 text-white backdrop-blur">
          {isPaused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
        </button>
        {!owner && (
          <div className="absolute bottom-4 left-4 right-4 z-40 flex items-center gap-2">
            <input value={reply} onChange={event => setReply(event.target.value)} placeholder={`Reply to ${formatHandle(tailor?.handle) || '@merchant'}...`} className="min-w-0 flex-1 rounded-full border border-white/35 bg-black/40 px-4 py-3 text-sm text-white outline-none placeholder:text-white/65 backdrop-blur" />
            <button type="button" aria-label="Send reply" disabled={!reply.trim()} onClick={() => setReply('')} className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-950 disabled:opacity-50"><Send className="h-4 w-4" /></button>
            <button type="button" aria-label={liked ? 'Unlike story' : 'Like story'} onClick={toggleLike} className="grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur">
              <Heart className="h-5 w-5" fill={liked ? 'currentColor' : 'none'} />
            </button>
          </div>
        )}
        {owner && (
          <div className="absolute bottom-4 left-4 right-4 z-40 flex items-center gap-2 rounded-2xl bg-neutral-950/90 p-2 text-white backdrop-blur">
            <span className="flex items-center gap-1.5 px-2 text-xs"><Eye className="h-4 w-4 text-amber-400" />{story.viewCount}</span>
            <span className="flex items-center gap-1.5 px-2 text-xs"><Heart className="h-4 w-4 text-rose-400" />{story.likeCount}</span>
            <button type="button" onClick={onAdd} className="ml-auto flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-neutral-950"><Plus className="h-3.5 w-3.5" />Add story</button>
            <button type="button" aria-label="Story insights" className="rounded-lg bg-white/10 p-2"><BarChart3 className="h-4 w-4" /></button>
            <button type="button" onClick={() => void onDelete(story.id)} aria-label="Delete story" className="rounded-lg bg-red-500/15 p-2 text-red-300"><Trash2 className="h-4 w-4" /></button>
          </div>
        )}
      </div>
      <style>{`@keyframes story-progress { from { width: 0%; } to { width: 100%; } }`}</style>
    </motion.div>,
    document.body
  );
}
