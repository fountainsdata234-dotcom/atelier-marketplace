import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, X, ChevronLeft, ChevronRight, Trash2, Eye, Heart, Send, Play, Pause, BarChart3, Check } from 'lucide-react';
import { TailorStory, User } from '../types';
import { api, StoryUploadAsset } from '../services/api';
import { getStoryUploadMimeType, getStoryUploadSizeError, getStoryUploadTypeError, MAX_STORY_IMAGE_UPLOAD_BYTES } from '../utils/mediaLimits';
import { prepareStoryImageForUpload } from '../services/mediaUpload';
import { buildWhatsAppUrl } from '../utils/whatsapp';
import { fetchShareableImageFile } from '../utils/imageSharing';

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
  pendingStoryFile: File | null;
  onPendingStoryFileHandled: () => void;
}

export function StoryRail({ users, currentUser, isDarkMode, onOpenPlans, onSelectSeller, pendingStoryFile, onPendingStoryFileHandled }: StoryRailProps) {
  const [stories, setStories] = useState<TailorStory[]>([]);
  const [activeTailorId, setActiveTailorId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preparingMedia, setPreparingMedia] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftUrl, setDraftUrl] = useState('');
  const [draftCaption, setDraftCaption] = useState('');
  const [uploadedMedia, setUploadedMedia] = useState<StoryUploadAsset | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadCanRetry, setUploadCanRetry] = useState(false);
  const storyFileInputRef = useRef<HTMLInputElement>(null);
  const unavailableStoryIds = useRef(new Set<string>());
  const storyLoadRequestRef = useRef(0);
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);

  const loadStories = () => {
    const requestId = ++storyLoadRequestRef.current;
    api.getStories().then(loadedStories => {
      if (requestId !== storyLoadRequestRef.current) return;
      setStories(loadedStories.filter(story =>
        new Date(story.expiresAt).getTime() > Date.now()
        && !unavailableStoryIds.current.has(story.id),
      ));
    }).catch(error => {
      if (requestId !== storyLoadRequestRef.current) return;
      console.error('Unable to load stories.', error);
    });
  };

  const updateStoryViewCount = useCallback((storyId: string, viewCount: number) => {
    setStories(current => current.map(story => story.id === storyId ? { ...story, viewCount } : story));
  }, []);

  const updateStoryLike = useCallback((storyId: string, likeCount: number, likedByViewer: boolean) => {
    setStories(current => current.map(story => story.id === storyId
      ? { ...story, likeCount, likedByViewer }
      : story));
  }, []);

  const hideUnavailableStory = (storyId: string) => {
    if (unavailableStoryIds.current.has(storyId)) return;
    unavailableStoryIds.current.add(storyId);
    setStories(current => current.filter(story => story.id !== storyId));
  };

  useEffect(() => {
    loadStories();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadStories();
    };
    const refresh = window.setInterval(refreshWhenVisible, 15_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(refresh);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
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

  const uploadSelectedMedia = async (file: File): Promise<StoryUploadAsset | null> => {
    setUploadProgress(0);
    setUploadError('');
    setUploadedMedia(null);
    const typeError = getStoryUploadTypeError(file);
    if (typeError) {
      setUploadCanRetry(false);
      setUploadError(typeError);
      return null;
    }

    setUploading(true);
    setPreparingMedia(false);
    try {
      let uploadFile = file;
      const mimeType = getStoryUploadMimeType(file);
      if (['image/jpeg', 'image/png', 'image/webp'].includes(mimeType || '')
        && file.size > MAX_STORY_IMAGE_UPLOAD_BYTES) {
        setPreparingMedia(true);
        uploadFile = await prepareStoryImageForUpload(file);
        setPreparingMedia(false);
      }
      const sizeError = getStoryUploadSizeError(uploadFile);
      if (sizeError) {
        setUploadCanRetry(false);
        setUploadError(sizeError);
        return null;
      }
      const asset = await api.uploadStoryMedia(uploadFile, setUploadProgress);
      setUploadedMedia(asset);
      setUploadCanRetry(false);
      return asset;
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'The media could not be uploaded.');
      setUploadCanRetry(true);
      return null;
    } finally {
      setUploading(false);
      setPreparingMedia(false);
    }
  };

  const openComposer = (file: File) => {
    setUploadError('');
    if (draftUrl) URL.revokeObjectURL(draftUrl);
    setDraftFile(file);
    setDraftUrl(URL.createObjectURL(file));
    setDraftCaption('');
    setUploadedMedia(null);
    setUploadCanRetry(false);
    setUploadProgress(0);
  };

  useEffect(() => {
    if (!pendingStoryFile) return;
    openComposer(pendingStoryFile);
    onPendingStoryFileHandled();
  }, [pendingStoryFile, onPendingStoryFileHandled]);

  const handleStoryFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      openComposer(file);
      return;
    }
  };

  const retryUpload = () => {
    if (draftFile && !uploading) void uploadSelectedMedia(draftFile);
  };

  const publishStory = async () => {
    if ((!uploadedMedia && !draftFile) || publishing) return;
    setPublishing(true);
    setUploadError('');
    try {
      const media = uploadedMedia || await uploadSelectedMedia(draftFile!);
      if (!media) return;
      const publishedStory = await api.publishStory(media, draftCaption);
      unavailableStoryIds.current.delete(publishedStory.id);
      storyLoadRequestRef.current += 1;
      setStories(current => [
        ...current.filter(story => story.id !== publishedStory.id),
        publishedStory,
      ]);
      setUploadedMedia(null);
      setDraftFile(null);
      setDraftUrl('');
      setUploadError('');
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
      {(currentUser?.role === 'tailor' || currentUser?.role === 'admin' || groupedStories.length > 0) && (
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
        <input id="story-media-input" ref={storyFileInputRef} className="sr-only" aria-label="Add a story" type="file" accept="image/*,video/*,.heic,.heif,.mov,.mp4,.webm" disabled={uploading || publishing || cleaningUp} onChange={handleStoryFileChange} />
        {uploadError && !draftFile && <p role="alert" className="mx-1 mb-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">{uploadError}</p>}
        <div className="flex snap-x gap-3.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:gap-4">
          {groupedStories.map(([tailorId, tailorStories], storyIndex) => {
            const tailor = userById.get(tailorId);
            const latestStory = tailorStories[tailorStories.length - 1];
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
                  <span className={`relative block h-[62px] w-[62px] overflow-hidden rounded-full border-[3px] bg-neutral-950 md:h-[78px] md:w-[78px] ${isDarkMode ? 'border-neutral-950' : 'border-white'}`}>
                    <span className="absolute inset-0 grid place-items-center text-lg font-bold text-amber-300">
                      {(tailor?.shopName || tailor?.name || '@').slice(0, 1).toUpperCase()}
                    </span>
                    <img
                      data-story-image
                      src={latestStory.thumbnailUrl || latestStory.mediaUrl}
                      alt=""
                      draggable={false}
                      loading={storyIndex < 4 ? 'eager' : 'lazy'}
                      fetchPriority={storyIndex < 4 ? 'high' : 'auto'}
                      decoding="async"
                      onError={event => { event.currentTarget.style.visibility = 'hidden'; }}
                      className="relative h-full w-full object-cover"
                    />
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
              setActiveTailorId(null);
            }}
            onViewCount={updateStoryViewCount}
            onLikeChange={updateStoryLike}
            onUnavailable={hideUnavailableStory}
            onAdd={() => storyFileInputRef.current?.click()}
            onClose={() => setActiveTailorId(null)}
            onPrevious={() => setActiveTailorId(groupedStories[Math.max(0, activeIndex - 1)]?.[0] || null)}
            onNext={() => setActiveTailorId(groupedStories[Math.min(groupedStories.length - 1, activeIndex + 1)]?.[0] || null)}
          />
        )}
      </AnimatePresence>
      {draftFile && createPortal(
          <motion.div data-story-interaction initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-x-0 top-0 z-[110] flex h-[100dvh] items-end justify-center bg-black/75 sm:items-center">
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} className="max-h-[96dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-neutral-950 text-white sm:rounded-[28px]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div><p className="text-[9px] font-bold uppercase tracking-[.18em] text-amber-400">New story</p><h2 className="font-serif text-lg font-bold">Preview & compose</h2></div>
                <button type="button" aria-label="Close composer" disabled={uploading || publishing || cleaningUp} onClick={() => void closeComposer()} className="rounded-full p-2 text-neutral-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"><X className="h-5 w-5" /></button>
              </div>
              <div className="relative mx-4 mt-4 aspect-[9/16] max-h-[54dvh] overflow-hidden rounded-2xl bg-black">
                {getStoryUploadMimeType(draftFile)?.startsWith('video/')
                  ? <video src={draftUrl} controls playsInline className="h-full w-full object-contain" />
                  : <img src={draftUrl} alt="Story preview" className="h-full w-full object-contain" />}
                {draftCaption && <p className="absolute bottom-5 left-5 right-5 rounded-xl bg-black/55 px-3 py-2 text-center text-sm font-semibold backdrop-blur">{draftCaption}</p>}
              </div>
              <div className="px-4 py-4">
                {uploading ? (
                  <div className="rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-300/10 to-orange-500/5 p-4" role="status" aria-live="polite">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold text-white">{preparingMedia ? 'Preparing your photo' : 'Uploading your media'}</p>
                        <p className="mt-1 text-xs text-neutral-400">{preparingMedia ? 'Compressing the photo to fit the 5 MB story limit.' : uploadProgress === 100 ? 'Finishing media processing...' : 'Keep this window open while your story is prepared.'}</p>
                      </div>
                      {!preparingMedia && <span className="min-w-[3.5rem] text-right font-serif text-2xl font-bold tabular-nums text-amber-300">{uploadProgress}%</span>}
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10" role={preparingMedia ? 'status' : 'progressbar'} aria-label={preparingMedia ? 'Preparing story photo' : 'Story media upload progress'} aria-valuemin={preparingMedia ? undefined : 0} aria-valuemax={preparingMedia ? undefined : 100} aria-valuenow={preparingMedia ? undefined : uploadProgress}>
                      <div className={`h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500 transition-[width] duration-200 ${preparingMedia ? 'w-1/3 animate-pulse' : ''}`} style={preparingMedia ? undefined : { width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                ) : uploadedMedia || !uploadError ? (
                  <>
                    <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-200">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/20"><Check className="h-3 w-3" /></span>
                      {uploadedMedia ? 'Your media is uploaded. Publish your story.' : 'Your preview is ready. Add a caption, then publish.'}
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
                      <p className="font-semibold text-red-200">{uploadCanRetry ? 'Upload didn’t finish' : 'This media can’t be uploaded yet'}</p>
                      <p role="alert" className="mt-1 text-xs leading-relaxed text-red-100/80">{uploadError || 'Please try uploading your media again.'}</p>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {uploadCanRetry && (
                        <button type="button" onClick={retryUpload} className="flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 py-3 text-sm font-bold text-neutral-950 transition hover:bg-amber-300">
                          <Play className="h-4 w-4 fill-current" />Retry upload
                        </button>
                      )}
                      <button type="button" onClick={() => storyFileInputRef.current?.click()} className={`${uploadCanRetry ? '' : 'col-span-2'} flex items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-3 text-sm font-semibold text-white transition hover:bg-white/10`}>
                        <Plus className="h-4 w-4" />Choose different media
                      </button>
                    </div>
                  </>
                )}
                {cleaningUp && <p className="mt-3 text-center text-xs text-neutral-400">Cleaning up uploaded media...</p>}
              </div>
            </motion.div>
          </motion.div>,
          document.body)
      }
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

export function StoriesViewer({ stories, tailor, owner, onDelete, onAdd, onClose, onPrevious, onNext, onUnavailable, onViewCount, onLikeChange }: {
  stories: TailorStory[];
  tailor?: User;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  owner: boolean;
  onDelete: (storyId: string) => Promise<void>;
  onAdd: () => void;
  onUnavailable: (storyId: string) => void;
  onViewCount: (storyId: string, viewCount: number) => void;
  onLikeChange: (storyId: string, likeCount: number, likedByViewer: boolean) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [readyStoryId, setReadyStoryId] = useState<string | null>(null);
  const [replyComposerActive, setReplyComposerActive] = useState(false);
  const [reply, setReply] = useState('');
  const [replyStatus, setReplyStatus] = useState('');
  const [replyFallbackUrl, setReplyFallbackUrl] = useState('');
  const [isSharingReply, setIsSharingReply] = useState(false);
  const [liking, setLiking] = useState(false);
  const [deletingStory, setDeletingStory] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [likeError, setLikeError] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoAutoplayBlocked, setVideoAutoplayBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartX = useRef<number | null>(null);
  const holdTimeout = useRef<number | null>(null);
  const chronologicalStories = useMemo(
    () => [...stories].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    [stories],
  );
  const story = chronologicalStories[activeIndex];
  const [liked, setLiked] = useState(Boolean(story?.likedByViewer));
  const isStoryPaused = isPaused || replyComposerActive || isSharingReply || readyStoryId !== story?.id;

  useEffect(() => {
    setActiveIndex(0);
    setIsPaused(false);
    setReplyComposerActive(false);
  }, [tailor?.id]);

  useEffect(() => {
    if (activeIndex >= chronologicalStories.length) {
      setActiveIndex(Math.max(0, chronologicalStories.length - 1));
    }
  }, [activeIndex, chronologicalStories.length]);

  useEffect(() => {
    setLiked(Boolean(story?.likedByViewer));
    setReply('');
    setReplyStatus('');
    setReplyFallbackUrl('');
    setLikeError('');
  }, [story?.id]);

  useEffect(() => {
    setIsPaused(false);
    setVideoDuration(0);
    setVideoCurrentTime(0);
    setVideoAutoplayBlocked(false);
    if (story && !owner) {
      void api.recordStoryView(story.id)
        .then(({ viewCount }) => onViewCount(story.id, viewCount))
        .catch(error => console.error('Unable to record story view.', error));
    }
  }, [story?.id, owner, onViewCount]);

  useEffect(() => {
    if (!story || isStoryPaused || story.mediaType === 'video') return;
    const timer = window.setTimeout(() => move(1), 7000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, isStoryPaused, story?.mediaType, story?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !story) return;
    if (isStoryPaused) void video.pause();
    else void video.play().then(() => setVideoAutoplayBlocked(false)).catch(error => {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setVideoAutoplayBlocked(true);
        return;
      }
      console.error('Unable to play story video.', error);
    });
  }, [isStoryPaused, story?.id]);

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
    if (liking) return;
    setLiking(true);
    setLikeError('');
    void api.toggleStoryLike(story.id).then(result => {
      setLiked(result.isLiked);
      onLikeChange(story.id, result.likeCount, result.isLiked);
    }).catch(error => {
      console.error('Unable to update story like.', error);
      setLikeError(error instanceof Error ? error.message : 'Your like could not be saved.');
    }).finally(() => setLiking(false));
  };

  const deleteCurrentStory = async () => {
    if (deletingStory) return;
    setDeletingStory(true);
    setDeleteError('');
    try {
      await onDelete(story.id);
    } catch (error) {
      console.error('Unable to delete story.', error);
      setDeleteError(error instanceof Error ? error.message : 'The story could not be deleted.');
    } finally {
      setDeletingStory(false);
    }
  };

  const sendReply = async () => {
    const message = reply.trim();
    if (!message || !story || isSharingReply) return;
    const merchantName = tailor?.shopName || tailor?.name || 'the merchant';
    const shareText = `Hello ${merchantName}, I'm replying to your FABSATTIRE story.\n\n${message}`;
    const whatsappUrl = buildWhatsAppUrl(
      tailor?.whatsappNumber || tailor?.phone,
      `${shareText}\n\nStory image: ${story.mediaUrl}`,
    );
    if (!whatsappUrl) {
      setReplyStatus('This merchant has not added a WhatsApp number yet.');
      return;
    }
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function' || story.mediaType !== 'image') {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      setReply('');
      setReplyComposerActive(false);
      setReplyFallbackUrl(whatsappUrl);
      setReplyStatus('WhatsApp opened with your message and a link to this story image. Review and send it there.');
      return;
    }

    setIsSharingReply(true);
    setReplyStatus('Preparing the story image for sharing…');
    setReplyFallbackUrl('');
    try {
      const imageFile = await fetchShareableImageFile(story.mediaUrl, `fabsattire-story-${story.id}`);
      if (!navigator.canShare({ files: [imageFile] })) {
        setReplyFallbackUrl(whatsappUrl);
        setReplyStatus('This browser cannot attach images directly. You can still send the story link through WhatsApp.');
        return;
      }

      await navigator.share({
        files: [imageFile],
        title: `Story from ${merchantName}`,
        text: shareText,
      });
      setReply('');
      setReplyComposerActive(false);
      setReplyStatus('The image and message are ready in the share sheet. Choose WhatsApp to send them to the merchant.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setReplyStatus('Sharing was canceled. Your reply is still here.');
        return;
      }
      console.warn('Story image could not be attached to the reply.', error);
      setReplyFallbackUrl(whatsappUrl);
      setReplyStatus('Could not attach the image on this device. You can send the story link through WhatsApp instead.');
    } finally {
      setIsSharingReply(false);
    }
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
          ? <video
              ref={videoRef}
              data-story-image
              key={story.id}
              src={story.mediaUrl}
              poster={story.thumbnailUrl}
              playsInline
              controls={false}
              className="h-full w-full object-contain"
              onLoadedMetadata={event => setVideoDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
              onCanPlayThrough={() => setReadyStoryId(story.id)}
              onTimeUpdate={event => {
                const video = event.currentTarget;
                setVideoCurrentTime(video.currentTime);
                if (Number.isFinite(video.duration)) setVideoDuration(video.duration);
              }}
              onError={() => onUnavailable(story.id)}
              onEnded={() => move(1)}
            />
          : <img data-story-image key={story.id} src={story.mediaUrl} alt={`${tailor?.shopName || tailor?.name || 'Merchant'} story`} draggable={false} className="h-full w-full object-contain" onLoad={() => setReadyStoryId(story.id)} onError={() => onUnavailable(story.id)} />}
        {story.mediaType === 'video' && videoAutoplayBlocked && (
          <button
            type="button"
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              void video.play().then(() => setVideoAutoplayBlocked(false)).catch(error => {
                console.error('Unable to start story video playback.', error);
              });
            }}
            className="absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-black/70 px-4 py-3 text-sm font-semibold text-white backdrop-blur"
          >
            <Play className="h-4 w-4 fill-current" /> Tap to play with sound
          </button>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/75" />
        <div className="absolute left-3 right-3 top-3 z-20 flex gap-1">
          {chronologicalStories.map((item, index) => (
            <span key={item.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
              <span
                className={`block h-full bg-white ${index < activeIndex ? 'w-full' : index === activeIndex && story.mediaType !== 'video' ? 'animate-[story-progress_7s_linear_forwards]' : ''}`}
                style={index === activeIndex && story.mediaType === 'video'
                  ? { width: `${videoDuration > 0 ? Math.min(100, (videoCurrentTime / videoDuration) * 100) : 0}%` }
                  : undefined}
                {...(index === activeIndex && story.mediaType !== 'video'
                  ? { style: { animationPlayState: isStoryPaused ? 'paused' as const : 'running' as const } }
                  : {})}
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
        <button type="button" aria-label={isStoryPaused ? 'Resume story' : 'Pause story'} onClick={() => setIsPaused(isStoryPaused ? false : true)} className="absolute bottom-[92px] left-4 z-40 rounded-full bg-black/45 p-2 text-white backdrop-blur">
          {isStoryPaused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
        </button>
        {!owner && (
          <div className="absolute bottom-4 left-4 right-4 z-40 flex items-center gap-2">
            <input value={reply} disabled={isSharingReply} onFocus={() => setReplyComposerActive(true)} onBlur={() => setReplyComposerActive(false)} onMouseEnter={() => setReplyComposerActive(true)} onMouseLeave={() => setReplyComposerActive(false)} onChange={event => { setReplyComposerActive(true); setReply(event.target.value); setReplyStatus(''); setReplyFallbackUrl(''); }} onKeyDown={event => { if (event.key === 'Enter' && reply.trim()) void sendReply(); }} placeholder={`Message ${formatHandle(tailor?.handle) || '@merchant'}...`} className="min-w-0 flex-1 rounded-full border border-white/35 bg-black/40 px-4 py-3 text-sm text-white outline-none placeholder:text-white/65 backdrop-blur disabled:opacity-60" />
            <button type="button" aria-label={isSharingReply ? 'Preparing story image' : 'Send story reply to WhatsApp'} disabled={!reply.trim() || isSharingReply} onClick={() => void sendReply()} className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-950 disabled:opacity-50"><Send className="h-4 w-4" /></button>
            <button type="button" aria-label={liked ? `Unlike story (${story.likeCount} likes)` : `Like story (${story.likeCount} likes)`} disabled={liking} onClick={toggleLike} className="flex h-11 min-w-11 items-center justify-center gap-1 rounded-full bg-black/45 px-2 text-white backdrop-blur disabled:opacity-60">
              <Heart className="h-5 w-5" fill={liked ? 'currentColor' : 'none'} />
              <span className="text-xs tabular-nums">{story.likeCount}</span>
            </button>
          </div>
        )}
        {replyStatus && !owner && (
          <p role="status" className="absolute bottom-[70px] left-4 right-4 z-50 rounded-lg bg-black/75 px-3 py-2 text-center text-xs text-white backdrop-blur">
            {replyStatus}
            {replyFallbackUrl && <a href={replyFallbackUrl} target="_blank" rel="noopener noreferrer" className="ml-1 font-bold underline underline-offset-2">Open WhatsApp</a>}
          </p>
        )}
        {likeError && <p role="alert" className="absolute bottom-20 left-4 right-4 z-50 rounded-lg bg-red-950/90 px-3 py-2 text-xs text-red-100">{likeError}</p>}
        {owner && (
          <div className="absolute bottom-4 left-4 right-4 z-40 flex items-center gap-2 rounded-2xl bg-neutral-950/90 p-2 text-white backdrop-blur">
            <span className="flex items-center gap-1.5 px-2 text-xs"><Eye className="h-4 w-4 text-amber-400" />{story.viewCount}</span>
            <span className="flex items-center gap-1.5 px-2 text-xs"><Heart className="h-4 w-4 text-rose-400" />{story.likeCount}</span>
            <button type="button" onClick={onAdd} className="ml-auto flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-neutral-950"><Plus className="h-3.5 w-3.5" />Add story</button>
            <button type="button" aria-label="Story insights" className="rounded-lg bg-white/10 p-2"><BarChart3 className="h-4 w-4" /></button>
            <button type="button" onClick={() => void deleteCurrentStory()} disabled={deletingStory} aria-label="Delete story" className="rounded-lg bg-red-500/15 p-2 text-red-300 disabled:cursor-wait disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
          </div>
        )}
        {deleteError && <p role="alert" className="absolute bottom-20 left-4 right-4 z-50 rounded-lg bg-red-950/90 px-3 py-2 text-xs text-red-100">{deleteError}</p>}
      </div>
      <style>{`@keyframes story-progress { from { width: 0%; } to { width: 100%; } }`}</style>
    </motion.div>,
    document.body
  );
}
