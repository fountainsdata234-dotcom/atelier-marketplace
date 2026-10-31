import React, { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, Download, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { User, ClothPost, AdminPromoPlan, BroadcastMessage, UserRole, AppNotification, DirectMessage } from './types';
import { storageService } from './services/storage';
import { NeedleThreadBackground } from './components/NeedleThreadBackground';
import { IntroLoader } from './components/IntroLoader';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { CollectionPage } from './components/CollectionPage';
import { ProfilePage } from './components/ProfilePage';
const ArtisanDirectory = lazy(() => import('./components/ArtisanDirectory').then(module => ({ default: module.ArtisanDirectory })));
const Marketplace = lazy(() => import('./components/Marketplace').then(module => ({ default: module.Marketplace })));
const PostDetailPage = lazy(() => import('./components/PostDetailPage').then(module => ({ default: module.PostDetailPage })));
const TailorDashboard = lazy(() => import('./components/TailorDashboard').then(module => ({ default: module.TailorDashboard })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const DirectMessaging = lazy(() => import('./components/DirectMessaging').then(module => ({ default: module.DirectMessaging })));
const AuthModal = lazy(() => import('./components/AuthModal').then(module => ({ default: module.AuthModal })));
const PasswordRecoveryModal = lazy(() => import('./components/PasswordRecoveryModal').then(module => ({ default: module.PasswordRecoveryModal })));
import { SocialShareModal } from './components/SocialShareModal';
import { SavePictureModal } from './components/SavePictureModal';
import { BroadcastBanner } from './components/BroadcastBanner';
import { Footer } from './components/Footer';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ContentSkeleton } from './components/ContentSkeleton';
import { LegalPage } from './components/LegalPage';
import { SellerProfilePage } from './components/SellerProfilePage';
import { LuminaFloatingShortcut } from './components/LuminaFloatingShortcut';
import { api } from './services/api';
import { buildPostShareUrl, buildSellerShareUrl, getHandleSlug } from './utils/profile';
import { buildWhatsAppUrl } from './utils/whatsapp';
import { animateActionFeedback } from './utils/actionFeedback';

const PUBLIC_VIEW_BY_PATH: Record<string, string> = {
  '/': 'landing',
  '/marketplace': 'marketplace',
  '/artisan': 'artisan',
  '/about': 'about',
  '/privacy': 'privacy',
  '/terms': 'terms',
  '/contact': 'contact',
  '/profile': 'profile',
  '/collections': 'collections',
  '/dashboard': 'dashboard',
  '/admin': 'admin',
};

const PATH_BY_VIEW: Record<string, string> = Object.fromEntries(Object.entries(PUBLIC_VIEW_BY_PATH).map(([path, view]) => [view, path]));

const hasPasswordResetQuery = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('auth') === 'reset'
    || params.get('type') === 'recovery'
    || window.location.hash.includes('type=recovery');
};

const getInitialView = () => {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (/^\/@[^/]+\/post\/[^/]+$/i.test(path)) return 'post';
  if (/^\/@[^/]+$/i.test(path)) return 'seller';
  const storedView = sessionStorage.getItem('fabsattire_active_view') || sessionStorage.getItem('fabrilux_active_view');
  return PUBLIC_VIEW_BY_PATH[path] || (storedView === 'lumina' ? 'admin' : storedView) || 'landing';
};

const getInitialPostId = () => {
  const encodedId = window.location.pathname.match(/^\/@[^/]+\/post\/([^/]+)$/i)?.[1]
    || new URLSearchParams(window.location.search).get('post');
  if (!encodedId) return null;
  try {
    return decodeURIComponent(encodedId);
  } catch {
    return encodedId;
  }
};

const normalizeMarketplacePosts = (remotePosts: ClothPost[]): ClothPost[] => remotePosts.map(post => ({
  ...post,
  likes: Array.isArray(post.likes) ? post.likes : [],
  saves: Array.isArray(post.saves) ? post.saves : [],
  tags: Array.isArray(post.tags) ? post.tags : [],
  rating: Number(post.rating) || 0,
  ratingCount: Number(post.ratingCount) || 0,
  authorLocation: post.authorLocation || { country: '', state: '', city: '' },
}));

export default function App() {
  const sharedPathMatch = window.location.pathname.match(/^\/@([^/]+)(?:\/post\/([^/]+))?$/i);
  const routeParams = new URLSearchParams(window.location.search);
  const publicSellerRoute = Boolean(sharedPathMatch || routeParams.get('seller'));
  const publicPostRoute = Boolean(sharedPathMatch?.[2] || routeParams.get('post'));
  // Intro Loading animation state
  const [showIntro, setShowIntro] = useState<boolean>(() => sessionStorage.getItem('fabsattire_intro_seen') !== '1');
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState('');
  const [isMobileInstallDevice, setIsMobileInstallDevice] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  ));
  const [isAppInstalled, setIsAppInstalled] = useState(() => (
    typeof window !== 'undefined'
      && (window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
  ));
  const isAndroidDevice = /android/i.test(navigator.userAgent);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [imageViewer, setImageViewer] = useState<{ src: string; alt: string; isPost: boolean; postId?: string } | null>(null);
  const [imageViewport, setImageViewport] = useState({ scale: 1, x: 0, y: 0 });
  const [isImageDownloading, setIsImageDownloading] = useState(false);
  const [imageDownloadError, setImageDownloadError] = useState('');
  const imageStageRef = useRef<HTMLDivElement | null>(null);
  const imagePointers = useRef(new Map<number, { x: number; y: number }>());
  const imageDragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const imagePinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const imageLastTap = useRef(0);
  const [imageDragMode, setImageDragMode] = useState(false);
  const pullStartY = useRef<number | null>(null);

  const openImageViewer = useCallback((src: string, alt: string, isPost: boolean, postId?: string) => {
    setImageViewport({ scale: 1, x: 0, y: 0 });
    setImageDragMode(false);
    imageLastTap.current = 0;
    setImageDownloadError('');
    setImageViewer({ src, alt, isPost, postId });
  }, []);

  // Theme state: default to sophisticated dark luxury aesthetic with full light toggle
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('atelier_theme_mode');
    return saved ? saved === 'dark' : true;
  });

  // Navigation View: 'landing' | 'marketplace' | 'collections' | 'profile' | 'dashboard' | 'admin' | 'messages' | 'artisan'
  const [currentView, setCurrentView] = useState<string>(getInitialView);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [sharedSeller, setSharedSeller] = useState<User | null>(null);
  const [sharedPostId, setSharedPostId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(getInitialPostId);
  const lastDataRefreshStartedAt = useRef(0);
  const inFlightDataRefresh = useRef<Promise<void> | null>(null);
  const landingPostsRequestStarted = useRef(false);
  const landingPromoPlansRequestStarted = useRef(false);

  // Application Data States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>(() => storageService.getUsers());
  const [sellerDirectoryDataStatus, setSellerDirectoryDataStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [posts, setPosts] = useState<ClothPost[]>(() => storageService.getPosts());
  const [postsLoadError, setPostsLoadError] = useState(false);
  const [promoPlans, setPromoPlans] = useState<AdminPromoPlan[]>([]);
  const [isPromoPlansLoading, setIsPromoPlansLoading] = useState(false);
  const [broadcasts, setBroadcasts] = useState<BroadcastMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastAuthEventUserId = useRef<string | null>(null);

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    const handleImageClick = (event: MouseEvent) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement)
        || image.getAttribute('aria-hidden') === 'true'
        || image.closest('[data-image-viewer], [data-open-image-on-click]')) return;
      const src = image.currentSrc || image.src;
      if (!src || new URL(src, window.location.href).pathname.endsWith('/logo.png')) return;

      event.preventDefault();
      event.stopPropagation();
      const listing = image.closest<HTMLElement>('[data-marketplace-listing-id]');
      openImageViewer(
        src,
        image.alt || image.closest('button')?.getAttribute('aria-label') || 'Fabsattire photo',
        Boolean(image.closest('[data-post-image]')),
        listing?.dataset.marketplaceListingId,
      );
    };

    root.addEventListener('click', handleImageClick, true);
    return () => root.removeEventListener('click', handleImageClick, true);
  }, [openImageViewer]);

  useEffect(() => {
    if (!imageViewer) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setImageViewer(null);
      if (event.key === '0') setImageViewport({ scale: 1, x: 0, y: 0 });
      if (event.key === '+' || event.key === '=') {
        setImageViewport(current => ({ ...current, scale: Math.min(5, current.scale * 1.25) }));
      }
      if (event.key === '-') {
        setImageViewport(current => {
          const scale = Math.max(1, current.scale / 1.25);
          return scale === 1 ? { scale: 1, x: 0, y: 0 } : { ...current, scale };
        });
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [imageViewer]);

  const zoomImageAtPoint = (clientX: number, clientY: number, nextScale: number) => {
    const stage = imageStageRef.current;
    if (!stage) return;
    if (nextScale <= 1) setImageDragMode(false);
    const bounds = stage.getBoundingClientRect();
    setImageViewport(current => {
      if (nextScale <= 1) return { scale: 1, x: 0, y: 0 };
      const ratio = nextScale / current.scale;
      const focusX = clientX - bounds.left - bounds.width / 2;
      const focusY = clientY - bounds.top - bounds.height / 2;
      const maxX = bounds.width * (nextScale - 1) / 2;
      const maxY = bounds.height * (nextScale - 1) / 2;
      const x = focusX - (focusX - current.x) * ratio;
      const y = focusY - (focusY - current.y) * ratio;
      return {
        scale: nextScale,
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y)),
      };
    });
  };

  const handleImagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') {
      event.preventDefault();
      if (event.button === 2) {
        zoomImageAtPoint(event.clientX, event.clientY, Math.min(5, imageViewport.scale * 1.2));
      } else if (event.button === 0) {
        zoomImageAtPoint(event.clientX, event.clientY, Math.max(1, imageViewport.scale / 1.2));
      }
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    imagePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const now = performance.now();
    const activatedDragMode = event.pointerType === 'touch'
      && now - imageLastTap.current < 320
      && imageViewport.scale > 1;
    if (activatedDragMode) setImageDragMode(true);
    imageLastTap.current = now;
    if (imagePointers.current.size === 2) {
      const [first, second] = Array.from(imagePointers.current.values());
      imagePinchStart.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        scale: imageViewport.scale,
      };
      imageDragStart.current = null;
    } else if (imageViewport.scale > 1 && (imageDragMode || activatedDragMode)) {
      imageDragStart.current = {
        x: event.clientX,
        y: event.clientY,
        panX: imageViewport.x,
        panY: imageViewport.y,
      };
    }
  };

  const handleImagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!imagePointers.current.has(event.pointerId)) return;
    imagePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (imagePointers.current.size >= 2 && imagePinchStart.current) {
      const [first, second] = Array.from(imagePointers.current.values());
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const scale = Math.max(1, Math.min(5, imagePinchStart.current.scale * distance / imagePinchStart.current.distance));
      zoomImageAtPoint(midpoint.x, midpoint.y, scale);
      return;
    }
    if (imageDragStart.current) {
      const { x, y, panX, panY } = imageDragStart.current;
      const bounds = event.currentTarget.getBoundingClientRect();
      const maxX = bounds.width * (imageViewport.scale - 1) / 2;
      const maxY = bounds.height * (imageViewport.scale - 1) / 2;
      setImageViewport(current => ({
        ...current,
        x: Math.max(-maxX, Math.min(maxX, panX + event.clientX - x)),
        y: Math.max(-maxY, Math.min(maxY, panY + event.clientY - y)),
      }));
    }
  };

  const handleImagePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    imagePointers.current.delete(event.pointerId);
    imagePinchStart.current = null;
    imageDragStart.current = null;
    if (imagePointers.current.size === 1 && imageViewport.scale > 1 && imageDragMode) {
      const [remaining] = Array.from(imagePointers.current.values());
      imageDragStart.current = { ...remaining, panX: imageViewport.x, panY: imageViewport.y };
    }
  };

  const handleImageWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const scale = Math.max(1, Math.min(5, imageViewport.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2)));
    zoomImageAtPoint(event.clientX, event.clientY, scale);
  };

  const handleImageDownload = async (button: HTMLButtonElement) => {
    if (!imageViewer || isImageDownloading) return;
    setIsImageDownloading(true);
    setImageDownloadError('');
    try {
      let downloadBlob: Blob;
      if (imageViewer.postId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(imageViewer.postId)) {
        downloadBlob = await api.downloadMarketplaceImage(imageViewer.postId);
      } else {
        const imageResponse = await fetch(imageViewer.src, { mode: 'cors', credentials: 'omit' });
        if (!imageResponse.ok) throw new Error(`Image download failed with HTTP ${imageResponse.status}.`);
        downloadBlob = await imageResponse.blob();
      }
      let extension = downloadBlob.type === 'image/webp' ? 'webp' : downloadBlob.type === 'image/jpeg' ? 'jpg' : 'png';

      if (imageViewer.isPost) {
        const [imageBitmap, logoResponse] = await Promise.all([
          createImageBitmap(downloadBlob),
          fetch('/logo.png', { cache: 'force-cache' }),
        ]);
        if (!logoResponse.ok) throw new Error(`Fabsattire logo download failed with HTTP ${logoResponse.status}.`);
        const logoBitmap = await createImageBitmap(await logoResponse.blob());
        const canvas = document.createElement('canvas');
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Your browser could not prepare the watermarked image.');
        context.drawImage(imageBitmap, 0, 0);
        const logoSize = Math.max(48, Math.round(Math.min(canvas.width, canvas.height) * 0.12));
        const inset = Math.max(16, Math.round(logoSize * 0.18));
        const logoX = canvas.width - logoSize - inset;
        const logoY = canvas.height - logoSize - inset;
        context.fillStyle = 'rgba(0, 0, 0, 0.58)';
        context.beginPath();
        context.roundRect(logoX - inset / 2, logoY - inset / 2, logoSize + inset, logoSize + inset, Math.max(8, logoSize * 0.18));
        context.fill();
        context.drawImage(logoBitmap, logoX, logoY, logoSize, logoSize);
        imageBitmap.close();
        logoBitmap.close();
        downloadBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The watermarked image could not be created.')), 'image/png');
        });
        extension = 'png';
      }

      const objectUrl = URL.createObjectURL(downloadBlob);
      const filename = imageViewer.alt.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '').slice(0, 64) || 'fabsattire-image';
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${filename}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      animateActionFeedback(button, 'download');
    } catch (error) {
      console.error('The selected image could not be downloaded.', error);
      setImageDownloadError('Could not download this image. Please check your connection and try again.');
    } finally {
      setIsImageDownloading(false);
    }
  };

  useEffect(() => {
    if (isAppInstalled || !navigator.getInstalledRelatedApps) return;
    let isActive = true;
    void navigator.getInstalledRelatedApps()
      .then(apps => {
        if (isActive && apps.some(app => app.id === 'com.fabsattire.app')) {
          setIsAppInstalled(true);
        }
      })
      .catch(error => {
        console.warn('The installed Fabsattire app could not be detected.', error);
      });
    return () => {
      isActive = false;
    };
  }, [isAppInstalled]);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const updateMobileState = () => setIsMobileInstallDevice(mobileQuery.matches);
    updateMobileState();
    mobileQuery.addEventListener('change', updateMobileState);
    return () => mobileQuery.removeEventListener('change', updateMobileState);
  }, []);

  useEffect(() => {
    const pageMeta: Record<string, { title: string; description: string }> = {
      landing: { title: 'Fabsattire | Tailors, Fabrics & Bespoke Fashion', description: 'Find skilled tailors, quality fabrics, and distinctive bespoke fashion. Explore merchant collections, discover artisans by location, and connect directly.' },
      marketplace: { title: 'Tailors, Fabrics & Bespoke Pieces | Fabsattire', description: 'Explore garments and fabrics from independent tailors and fabric sellers. Search merchant collections and contact artisans directly.' },
      artisan: { title: 'Find Tailors & Fabric Sellers | Fabsattire', description: 'Discover tailors and fabric merchants by location, explore their work, and visit their seller collections.' },
      lumina: { title: 'Lumina | Fabsattire Super Admin', description: 'Private Super Admin workspace for live Fabsattire operations and marketplace intelligence.' },
      about: { title: 'About Fabsattire', description: 'Learn how Fabsattire connects people with independent tailors and fabric sellers.' },
      privacy: { title: 'Privacy Policy | Fabsattire', description: 'Read how Fabsattire handles account information and marketplace data.' },
      terms: { title: 'Terms of Service | Fabsattire', description: 'Review the terms for using the Fabsattire marketplace.' },
      contact: { title: 'Contact Fabsattire', description: 'Contact Fabsattire for account help, seller questions, partnerships, and marketplace support.' },
      collections: { title: 'Saved Collection | Fabsattire', description: 'Review your saved fashion and fabric inspiration on Fabsattire.' },
    };
    const sellerTitle = sharedSeller ? `${sharedSeller.shopName || sharedSeller.name} | Fabsattire` : null;
    const meta = pageMeta[currentView] || pageMeta.landing;
    const description = sharedSeller?.bio?.trim() || meta.description;
    const isPrivateView = ['admin', 'lumina', 'dashboard', 'messages', 'profile', 'collections'].includes(currentView);
    document.title = sellerTitle || meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', sellerTitle || meta.title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', `${window.location.origin}${window.location.pathname}`);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', sellerTitle || meta.title);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', description);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `${window.location.origin}${window.location.pathname}`);
    document.querySelector('meta[name="robots"]')?.setAttribute('content', isPrivateView ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
  }, [currentView, sharedSeller]);

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [passwordRecoveryOpen, setPasswordRecoveryOpen] = useState(false);
  const [authDefaultRole, setAuthDefaultRole] = useState<UserRole>('buyer');

  const [directMessageOpen, setDirectMessageOpen] = useState(false);
  const [directMessageRecipient, setDirectMessageRecipient] = useState<User | null>(null);
  const [directMessagePost, setDirectMessagePost] = useState<ClothPost | null>(null);

  // Social Share Modal
  const [socialShareOpen, setSocialShareOpen] = useState(false);
  const [socialShareHandle, setSocialShareHandle] = useState('');
  const [socialShareName, setSocialShareName] = useState('');
  const [socialShareUrl, setSocialShareUrl] = useState('');

  // Save Picture / Full-Res Modal
  const [savePictureOpen, setSavePictureOpen] = useState(false);
  const [savePictureUrl, setSavePictureUrl] = useState<string | null>(null);
  const [savePictureTitle, setSavePictureTitle] = useState<string | null>(null);

  // Only fetch market data when the user is actually on a live marketplace view.
  const marketplaceViews = ['marketplace', 'artisan', 'seller', 'post', 'dashboard', 'profile', 'collections', 'messages', 'admin'];
  const canRefreshMarketplaceData = document.visibilityState === 'visible' && marketplaceViews.includes(currentView);

  const navigateToView = (view: string) => {
    const nextPath = view === 'lumina' ? `${PATH_BY_VIEW.admin}?lumina=1` : PATH_BY_VIEW[view] || '/';
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl !== nextPath) window.history.pushState({ view }, '', nextPath);
    setSharedSeller(null);
    setSharedPostId(null);
    setSelectedPostId(null);
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const pathMatch = window.location.pathname.match(/^\/@([^/]+)(?:\/post\/([^/]+))?$/i);
      const handle = (pathMatch?.[1] || params.get('seller') || '').replace(/^@/, '').toLowerCase();
      if (handle) {
        const seller = users.find(user => getHandleSlug(user.handle) === getHandleSlug(handle));
        if (!seller) return;
        setSharedSeller(seller);
        const postId = pathMatch?.[2] || params.get('post');
        setSharedPostId(postId || null);
        setSelectedPostId(postId || null);
        setCurrentView(postId ? 'post' : 'seller');
        return;
      }
      setSharedSeller(null);
      setSharedPostId(null);
      setSelectedPostId(null);
      const path = window.location.pathname.replace(/\/$/, '') || '/';
      setCurrentView(PUBLIC_VIEW_BY_PATH[path] || sessionStorage.getItem('fabsattire_active_view') || sessionStorage.getItem('fabrilux_active_view') || 'landing');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [users]);

  useEffect(() => {
    if (hasPasswordResetQuery()) {
      setPasswordRecoveryOpen(true);
      setAuthModalOpen(false);
    }

    storageService.init();
    if (canRefreshMarketplaceData) {
      void refreshAllData(true);
    } else {
      setIsDataLoading(false);
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleInstallPrompt = (event: Event) => {
      const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
      if (!isMobile) return;
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsAppInstalled(true);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    let lastTouchY: number | null = null;
    const handleTouchStart = (event: TouchEvent) => {
      pullStartY.current = window.scrollY <= 2 ? event.touches[0]?.clientY ?? null : null;
      lastTouchY = pullStartY.current;
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (pullStartY.current !== null) lastTouchY = event.touches[0]?.clientY ?? null;
    };
    const handlePullRefresh = async () => {
      if (pullStartY.current === null || lastTouchY === null || lastTouchY - pullStartY.current < 80 || window.scrollY > 2) return;
      pullStartY.current = null;
      lastTouchY = null;
      setIsRefreshing(true);
      await refreshAllData();
      setIsRefreshing(false);
    };
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handlePullRefresh, { passive: true });

    let unsubscribeAuth: (() => void) | undefined;
    import('./services/auth').then(({ configureAuth, isSupabaseAuthReady, subscribeToAuth }) => {
      if (!isSupabaseAuthReady) return;
      unsubscribeAuth = subscribeToAuth(async (authUser, event) => {
        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecoveryOpen(true);
          setAuthModalOpen(false);
        }
        if (!authUser) {
          lastAuthEventUserId.current = null;
          setCurrentUser(null);
          return;
        }
        if (
          lastAuthEventUserId.current === authUser.id
          && (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')
        ) return;
        lastAuthEventUserId.current = authUser.id;
        const cachedProfile = storageService.getUsers().find(user => user.id === authUser.id);
        const mergeProfile = (savedProfile?: Partial<User>): User => {
          const profileValue = <T,>(key: keyof User, fallback: T): T => {
            const remoteValue = savedProfile?.[key] as T | undefined;
            const cachedValue = cachedProfile?.[key] as T | undefined;
            if (remoteValue !== undefined && remoteValue !== null && remoteValue !== '') return remoteValue;
            if (cachedValue !== undefined && cachedValue !== null && cachedValue !== '') return cachedValue;
            return fallback;
          };
          const savedRole = savedProfile?.role;
          return {
            id: authUser.id,
            email: authUser.email,
            name: savedProfile?.name || cachedProfile?.name || authUser.name,
            role: authUser.isAdmin ? 'admin' : (savedRole || cachedProfile?.role || authUser.role),
            phone: savedProfile?.phone || cachedProfile?.phone || '',
            countryCode: savedProfile?.countryCode || cachedProfile?.countryCode || '',
            location: savedProfile?.location || cachedProfile?.location || { country: '', state: '', city: '' },
            whatsappNumber: savedProfile?.whatsappNumber || cachedProfile?.whatsappNumber,
            shopName: savedProfile?.shopName || cachedProfile?.shopName,
            bio: savedProfile?.bio || cachedProfile?.bio || '',
            handle: profileValue('handle', `@${authUser.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`),
            avatarUrl: profileValue('avatarUrl', authUser.avatarUrl),
            isPromoted: profileValue('isPromoted', false),
            isBlocked: profileValue('isBlocked', false),
            followers: profileValue('followers', []),
            createdAt: authUser.createdAt,
            isSuperAdmin: authUser.isSuperAdmin,
            isWarned: savedProfile?.isWarned ?? cachedProfile?.isWarned,
            warningNote: savedProfile?.warningNote ?? cachedProfile?.warningNote,
          };
        };
        const user = storageService.upsertUser(mergeProfile());
        setCurrentUser(user);
        if (publicSellerRoute) {
          setCurrentView(publicPostRoute ? 'post' : 'seller');
        } else if (user.role === 'admin') {
          setCurrentView('admin');
        } else if (user.role === 'tailor' || user.role === 'fabric_seller') {
          setCurrentView('dashboard');
        } else {
          setCurrentView('marketplace');
        }
        void api.getProfile().then((savedProfile: Partial<User>) => {
          const syncedUser = storageService.upsertUser(mergeProfile(savedProfile));
          setCurrentUser(syncedUser);
          if (!savedProfile.avatarUrl && authUser.avatarUrl) {
            void api.saveProfile({ avatarUrl: authUser.avatarUrl }).catch((error: unknown) => {
              console.warn('Google profile photo could not be saved.', error);
            });
          }
        }).catch((error: unknown) => {
          console.warn('Profile could not be synchronized; continuing with available account details.', error);
        });
        void refreshAllData();
      });
      return configureAuth();
    }).catch((error) => {
      console.error('Authentication initialization failed', error);
      setIsDataLoading(false);
    });

    // Listen to reactive update events
    const handleUsersUpdate = () => setUsers(storageService.getUsers());
    const handlePostsUpdate = () => setPosts(storageService.getPosts());
    const handlePlansUpdate = () => setPromoPlans(storageService.getPromoPlans());
    const handleAuthChange = (e: any) => setCurrentUser(e.detail);
    const handleBroadcastsUpdate = () => setBroadcasts(storageService.getBroadcasts());
    const handleNavigateTab = (e: any) => navigateToView(e.detail);
    const handleNotificationsUpdate = () => {
      if (!currentUser) {
        setNotifications([]);
        return;
      }
      setNotifications(storageService.getNotifications(currentUser.id).slice(0, 4));
    };

    window.addEventListener('atelier_users_updated', handleUsersUpdate);
    window.addEventListener('atelier_posts_updated', handlePostsUpdate);
    window.addEventListener('atelier_plans_updated', handlePlansUpdate);
    window.addEventListener('atelier_auth_changed', handleAuthChange);
    window.addEventListener('atelier_broadcast_received', handleBroadcastsUpdate);
    window.addEventListener('navigate_to_tab', handleNavigateTab);
    window.addEventListener('atelier_notifications_updated', handleNotificationsUpdate);

    return () => {
      unsubscribeAuth?.();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handlePullRefresh);
      window.removeEventListener('atelier_users_updated', handleUsersUpdate);
      window.removeEventListener('atelier_posts_updated', handlePostsUpdate);
      window.removeEventListener('atelier_plans_updated', handlePlansUpdate);
      window.removeEventListener('atelier_auth_changed', handleAuthChange);
      window.removeEventListener('atelier_broadcast_received', handleBroadcastsUpdate);
      window.removeEventListener('navigate_to_tab', handleNavigateTab);
      window.removeEventListener('atelier_notifications_updated', handleNotificationsUpdate);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > 420);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const legacyHandle = params.get('seller')?.trim().toLowerCase();
    const pathMatch = window.location.pathname.match(/^\/@([^/]+)(?:\/post\/([^/]+))?$/i);
    const handle = (pathMatch?.[1] || legacyHandle || '').replace(/^@/, '').toLowerCase();
    const pathPostId = pathMatch?.[2] || params.get('post');
    if (!handle || users.length === 0) return;
    const seller = users.find(user => getHandleSlug(user.handle) === getHandleSlug(handle));
    if (seller && (seller.role === 'tailor' || seller.role === 'fabric_seller')) {
      setSharedSeller(seller);
      if (pathPostId) {
        let postId = pathPostId;
        try { postId = decodeURIComponent(pathPostId); } catch { /* Keep malformed IDs unchanged for the unavailable state. */ }
        setSelectedPostId(postId);
        setSharedPostId(postId);
        setCurrentView('post');
      } else {
        setSharedPostId(null);
        setCurrentView('seller');
      }
    }
  }, [users]);

  useEffect(() => {
    if (!currentUser || (currentView !== 'messages' && !directMessageOpen)) {
      setUnreadCount(0);
      return;
    }
    const refreshUnreadCount = async () => {
      try {
        const messages = await api.getMessages();
        setUnreadCount(messages.filter((message: DirectMessage) => message.recipientId === currentUser.id && !message.isRead).length);
      } catch {
        setUnreadCount(storageService.getMessages(currentUser.id).filter(message => message.recipientId === currentUser.id && !message.isRead).length);
      }
    };
    void refreshUnreadCount();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshUnreadCount();
    }, 120_000);
    const handleMessageUpdate = () => void refreshUnreadCount();
    window.addEventListener('atelier_message_received', handleMessageUpdate);
    window.addEventListener('atelier_messages_read', handleMessageUpdate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('atelier_message_received', handleMessageUpdate);
      window.removeEventListener('atelier_messages_read', handleMessageUpdate);
    };
  }, [currentUser?.id, currentView, directMessageOpen]);

  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    let cancelled = false;
    void api.getAdminUsers().then((adminUsers: User[]) => {
      if (cancelled) return;
      setUsers(adminUsers);
      storageService.saveUsers(adminUsers.map((user: User) => ({
        ...user,
        email: '',
        phone: '',
        countryCode: '',
        isWarned: undefined,
        warningNote: undefined,
        isSuperAdmin: undefined,
        addedByEmail: undefined,
      })));
    }).catch((error: unknown) => {
      console.warn('Administrator user data could not be refreshed.', error);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currentUser?.role]);

  const handleInstallApp = async () => {
    if (isAndroidDevice) {
      setInstallHelpOpen(true);
      window.location.assign('https://github.com/fountainsdata234-dotcom/atelier-marketplace/releases/latest/download/app-release.apk');
      return;
    }
    if (installPrompt) {
      const promptEvent = installPrompt;
      setInstallPrompt(null);
      try {
        await promptEvent.prompt();
        const result = await promptEvent.userChoice;
        if (result.outcome === 'accepted') return;
      } catch (error) {
        console.warn('The browser install prompt could not be completed.', error);
      }
    }
    setInstallHelpOpen(true);
  };

  const isMobileDevice = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
  const canShowInstallPrompt = !isAppInstalled && isMobileDevice && isMobileInstallDevice;
  const installInstructions = /iphone|ipad|ipod/i.test(navigator.userAgent)
    ? 'In Safari, tap Share, then choose Add to Home Screen.'
    : /android/i.test(navigator.userAgent)
      ? 'In your browser menu, choose Install app or Add to Home screen. If your browser offers an Install app prompt, use the button again to open it.'
      : 'Open this site in your browser menu and choose Install app or Add to Home screen.';

  const handleShareApp = async () => {
    const shareData = {
      title: 'Fabsattire',
      text: 'Discover skilled tailors, quality fabrics, and bespoke fashion on Fabsattire.',
      url: window.location.origin,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(shareData.url);
      setShareNotice('Fabsattire link copied.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.warn('Fabsattire could not be shared.', error);
      setShareNotice(`Could not share automatically. Copy this link: ${shareData.url}`);
    }
  };

  const handlePageRefresh = () => {
    setIsRefreshing(true);
    void refreshAllData(false, true).finally(() => setIsRefreshing(false));
  };

  const refreshAllData = async (showLoader = true, forceNetworkRefresh = false) => {
    const isEligibleView = document.visibilityState === 'visible'
      && (marketplaceViews.includes(currentView) || (forceNetworkRefresh && currentView === 'landing'));
    if (!isEligibleView) {
      setIsDataLoading(false);
      return;
    }

    const now = Date.now();
    if (now - lastDataRefreshStartedAt.current < 2_000) return;
    lastDataRefreshStartedAt.current = now;
    if (inFlightDataRefresh.current) return;

    const refreshTask = async () => {
      if (showLoader) setIsDataLoading(true);
      setPostsLoadError(false);
      const localUsers = storageService.getUsers();
      const localPosts = storageService.getPosts();
      const availablePosts = localPosts.length > 0 ? localPosts : posts;
      setCurrentUser(storageService.getCurrentUser());

      if (localUsers.length > 0) {
        setUsers(localUsers);
      }
      if (availablePosts.length > 0) {
        setPosts(availablePosts);
        if (showLoader) setIsDataLoading(false);
      }

      setPromoPlans(storageService.getPromoPlans());
      setBroadcasts(storageService.getBroadcasts());
      if (showLoader) setIsDataLoading(false);
      try {
        const usersRequest = currentUser?.role === 'admin'
          ? forceNetworkRefresh ? api.refreshAdminUsers() : api.getAdminUsers()
          : forceNetworkRefresh ? api.refreshUsers() : api.getUsers();
        const postsRequest = forceNetworkRefresh ? api.refreshPosts() : api.getPosts();
        const plansRequest = forceNetworkRefresh ? api.refreshPromoPlans() : api.getPromoPlans();
        const [postsResult, usersResult, plansResult] = await Promise.allSettled([postsRequest, usersRequest, plansRequest]);
        let remotePosts: ClothPost[] | null = postsResult.status === 'fulfilled' ? postsResult.value : null;
        if (postsResult.status === 'rejected') {
          console.warn('Marketplace listings could not be refreshed.', postsResult.reason);
          setPostsLoadError(availablePosts.length === 0);
        }

        if (remotePosts !== null) {
          const normalizedPosts = normalizeMarketplacePosts(remotePosts);
          const postsToDisplay = normalizedPosts;
          storageService.savePosts(postsToDisplay);
          setPosts(postsToDisplay);

          
          setPostsLoadError(false);
        }
        if (showLoader) setIsDataLoading(false);

        const remoteUsers = usersResult.status === 'fulfilled' ? usersResult.value : null;
        const remotePlans = plansResult.status === 'fulfilled' ? plansResult.value : null;
        if (remoteUsers !== null) {
          const localUsers = storageService.getUsers();
          const uniqueRemoteUsers: User[] = Array.from(new Map<string, User>(remoteUsers.map((remoteUser: User) => [remoteUser.id, remoteUser])).values());
          const mergedUsers = uniqueRemoteUsers.map((remoteUser: User) => {
            const localUser = localUsers.find(user => user.id === remoteUser.id);
            if (!localUser) return { ...remoteUser, followers: Array.isArray(remoteUser.followers) ? remoteUser.followers : [] };
            return {
              ...localUser,
              ...remoteUser,
              name: remoteUser.name || localUser.name,
              handle: remoteUser.handle || localUser.handle,
              bio: remoteUser.bio || localUser.bio || '',
              avatarUrl: remoteUser.avatarUrl || localUser.avatarUrl,
              shopName: remoteUser.shopName || localUser.shopName,
              phone: remoteUser.phone || localUser.phone,
              location: remoteUser.location?.country || remoteUser.location?.city ? remoteUser.location : localUser.location,
              followers: Array.isArray(remoteUser.followers) && remoteUser.followers.length > 0 ? remoteUser.followers : localUser.followers,
            };
          });
          const usersToPersist = currentUser?.role === 'admin'
            ? mergedUsers.map(user => ({
              ...user,
              email: '',
              phone: '',
              countryCode: '',
              isWarned: undefined,
              warningNote: undefined,
              isSuperAdmin: undefined,
              addedByEmail: undefined,
            }))
            : mergedUsers;
          storageService.saveUsers(usersToPersist);
          setUsers(mergedUsers);
          setSellerDirectoryDataStatus('ready');
        } else {
          console.error(
            'Seller directory accounts could not be refreshed.',
            usersResult.status === 'rejected' ? usersResult.reason : new Error('The seller directory returned no account data.'),
          );
          setSellerDirectoryDataStatus('error');
        }

        if (remotePlans !== null) {
          landingPromoPlansRequestStarted.current = true;
          storageService.savePromoPlans(remotePlans);
          setPromoPlans(remotePlans);
        }
      } catch (error) {
        console.error('Remote marketplace data unavailable', error);
      } finally {
        inFlightDataRefresh.current = null;
        if (showLoader) setIsDataLoading(false);
      }
    };

    inFlightDataRefresh.current = refreshTask();
    await inFlightDataRefresh.current;
  };

  useEffect(() => {
    if (currentView !== 'landing' || posts.length > 0 || landingPostsRequestStarted.current) return;
    const cachedPosts = storageService.getPosts();
    if (cachedPosts.length > 0) {
      setPosts(cachedPosts);
      return;
    }

    landingPostsRequestStarted.current = true;
    void api.getPosts().then((remotePosts: ClothPost[]) => {
      if (remotePosts.length === 0) return;
      const normalizedPosts = normalizeMarketplacePosts(remotePosts);
      storageService.savePosts(normalizedPosts);
      setPosts(normalizedPosts);
    }).catch((error: unknown) => {
      console.warn('Landing page listings could not be refreshed.', error);
    });
  }, [currentView, posts.length]);

  useEffect(() => {
    if (currentView !== 'landing' || landingPromoPlansRequestStarted.current) return;
    landingPromoPlansRequestStarted.current = true;
    if (promoPlans.length === 0) setIsPromoPlansLoading(true);
    void api.getPromoPlans().then((remotePlans: AdminPromoPlan[]) => {
      storageService.savePromoPlans(remotePlans);
      setPromoPlans(remotePlans);
    }).catch((error: unknown) => {
      console.warn('Landing promotion plans could not be refreshed.', error);
    }).finally(() => {
      setIsPromoPlansLoading(false);
    });
  }, [currentView]);

  useEffect(() => {
    if (!marketplaceViews.includes(currentView)) return;
    const hasCachedPosts = storageService.getPosts().length > 0;
    void refreshAllData(!hasCachedPosts && posts.length === 0);
  }, [currentView]);

  // Toggle Theme
  const handleToggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem('atelier_theme_mode', next ? 'dark' : 'light');
    if (next) {
      document.body.classList.add('bg-[#0c0d10]', 'text-[#f4f4f6]');
      document.body.classList.remove('bg-[#fbf9f5]', 'text-[#16171a]');
    } else {
      document.body.classList.add('bg-[#fbf9f5]', 'text-[#16171a]');
      document.body.classList.remove('bg-[#0c0d10]', 'text-[#f4f4f6]');
    }
  };

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }
    setNotifications(storageService.getNotifications(currentUser.id).slice(0, 4));
    void api.getNotifications().then((remoteNotifications: AppNotification[]) => {
      storageService.mergeNotifications(remoteNotifications);
      setNotifications(storageService.getNotifications(currentUser.id).slice(0, 4));
    }).catch((error: unknown) => console.warn('Remote notifications could not be loaded.', error));
    const markAsRead = () => {
      storageService.markNotificationsRead(currentUser.id);
      void api.markNotificationsRead().catch(() => undefined);
    };
    markAsRead();
    const timer = window.setTimeout(markAsRead, 1500);
    return () => window.clearTimeout(timer);
  }, [currentUser?.id]);

  useEffect(() => {
    sessionStorage.setItem('fabsattire_active_view', currentView);
  }, [currentView]);

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('bg-[#0c0d10]', 'text-[#f4f4f6]');
      document.body.classList.remove('bg-[#fbf9f5]', 'text-[#16171a]');
    } else {
      document.body.classList.add('bg-[#fbf9f5]', 'text-[#16171a]');
      document.body.classList.remove('bg-[#0c0d10]', 'text-[#f4f4f6]');
    }
  }, [isDarkMode]);

  // Auth triggers
  const handleOpenAuthWithRole = (role: UserRole) => {
    setAuthDefaultRole(role);
    setAuthModalOpen(true);
  };

  const handleAuthSuccess = (user: User) => {
    setCurrentUser(user);
    if (user.role === 'admin') {
      setCurrentView('admin');
    } else if (user.role === 'tailor' || user.role === 'fabric_seller') {
      setCurrentView('dashboard');
    } else {
      setCurrentView('marketplace');
    }
  };

  const handleLogout = () => {
    import('./services/auth').then(({ signOutAuth }) => signOutAuth()).catch((error) => console.error('Authentication logout failed', error));
    storageService.setCurrentUser(null);
    setCurrentUser(null);
    setCurrentView('landing');
  };

  const handleContactSeller = (post: ClothPost) => {
    const seller = users.find(user => user.id === post.authorId);
    const contactUrl = buildWhatsAppUrl(
      post.authorWhatsapp || seller?.whatsappNumber || seller?.phone,
      `Hello ${post.authorName}, I saw "${post.title}" on FABSATTIRE and would like to discuss it.`,
    );
    if (!contactUrl) return;
    storageService.recordDiscoveryEvent(post.id, 'ENQUIRY', currentUser?.id);
    storageService.recordRecommendationEvent(post.id, 'ENQUIRY', storageService.getRecommendationScope(currentUser?.id), post);
    window.open(contactUrl, '_blank', 'noopener,noreferrer');
  };

  // Trigger Save Image
  const handleSaveImageToViewer = (url: string, title: string) => {
    setSavePictureUrl(url);
    setSavePictureTitle(title);
    setSavePictureOpen(true);
  };

  const handleSelectPost = (post: ClothPost) => {
    setSelectedPostId(post.id);
    window.history.pushState({ view: 'post' }, '', buildPostShareUrl(window.location.origin, post.authorHandle, post.id));
    setCurrentView('post');
  };

  const handleSelectSeller = (seller: User) => {
    setSharedSeller(seller);
    setSharedPostId(null);
    window.history.pushState({ view: 'seller' }, '', buildSellerShareUrl(window.location.origin, seller.handle));
    setCurrentView('seller');
  };

  const handleRecordPostView = (post: ClothPost) => {
    storageService.recordDiscoveryEvent(post.id, 'VIEW', currentUser?.id);
    storageService.recordRecommendationEvent(post.id, 'VIEW', storageService.getRecommendationScope(currentUser?.id), post);
  };

  // Trigger Social Share Modal
  const handleShareTailorProfile = (tailor: User) => {
    setSocialShareHandle(tailor.handle);
    setSocialShareName(tailor.name);
    setSharedPostId(null);
    setSocialShareUrl(buildSellerShareUrl(window.location.origin, tailor.handle));
    setSocialShareOpen(true);
  };

  const handleToggleFollow = async (seller: User) => {
    if (!currentUser) {
      handleOpenAuthWithRole('buyer');
      return;
    }
    const previousFollowers = Array.isArray(seller.followers) ? [...seller.followers] : [];
    storageService.toggleFollowUser(seller.id, currentUser.id);
    const locallyUpdated = storageService.getUsers().find(user => user.id === seller.id);
    if (locallyUpdated) {
      setUsers(storageService.getUsers());
      setSharedSeller(locallyUpdated);
    }
    const result = await api.toggleFollow(seller.id).catch(() => null);
    if (!result) {
      const reverted = storageService.updateUser(seller.id, { followers: previousFollowers });
      if (reverted) {
        setUsers(storageService.getUsers());
        setSharedSeller(reverted);
      }
      return;
    }
    const updated = storageService.updateUser(seller.id, { followers: result.followers });
    if (updated) {
      setUsers(storageService.getUsers());
      setSharedSeller(updated);
    }
  };

  const sharedProfileUrl = socialShareUrl || (socialShareHandle
    ? buildSellerShareUrl(window.location.origin, socialShareHandle)
    : window.location.origin);

  const handleSharePost = (post: ClothPost) => {
    storageService.recordDiscoveryEvent(post.id, 'SHARE', currentUser?.id);
    storageService.recordRecommendationEvent(post.id, 'SHARE', storageService.getRecommendationScope(currentUser?.id), post);
    setSocialShareHandle(post.authorHandle);
    setSocialShareName(`${post.title} by ${post.authorName}`);
    setSocialShareUrl(buildPostShareUrl(window.location.origin, post.authorHandle, post.id));
    setSocialShareOpen(true);
  };

  return (
    <div className={`min-h-screen relative flex flex-col font-sans transition-colors duration-300 ${
      isDarkMode ? 'bg-[#0c0d10] text-[#f4f4f6]' : 'bg-[#fbf9f5] text-[#16171a]'
    }`}>
      {/* 1. Cool Modern Intro Loading Animation Effect */}
      <AnimatePresence>
        {showIntro && (
          <IntroLoader
            onComplete={() => setShowIntro(false)}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>

      {/* 2. Interactive Needle & Thread Background Animation */}
      <NeedleThreadBackground isDarkMode={isDarkMode} />

      {/* 3. Top Broadcast Announcement Banner */}
      <BroadcastBanner
        broadcasts={broadcasts}
        currentUser={currentUser}
        isDarkMode={isDarkMode}
      />

      <AnimatePresence>
        {notifications.filter(item => !item.isRead).slice(0, 3).map(item => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -20, x: 30 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -10, x: 18 }}
            className="fixed right-3 top-20 z-[60] w-[min(90vw,320px)] rounded-2xl border border-amber-500/30 bg-[#111317]/95 p-3 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
                {item.type === 'follow' ? '☆' : item.type === 'like' ? '♥' : item.type === 'message' ? '✉' : '•'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">{item.type}</p>
                <p className="mt-1 text-sm font-semibold text-white">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-neutral-300">{item.body}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* 4. Top Navigation Bar */}
      <Navbar
        currentUser={currentUser}
        currentView={currentView}
        onNavigate={navigateToView}
        onOpenAuth={() => handleOpenAuthWithRole('buyer')}
        onLogout={handleLogout}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
        isOnline={isOnline}
        canInstall={canShowInstallPrompt}
        onInstall={handleInstallApp}
        onShare={handleShareApp}
        onRefresh={handlePageRefresh}
        isRefreshing={isRefreshing}
      />

      <button
        type="button"
        onClick={scrollToTop}
        aria-label="Back to top"
        className={`fixed bottom-20 right-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/40 bg-[#111316]/90 text-amber-300 shadow-[0_20px_40px_rgba(251,146,60,0.35)] backdrop-blur-xl transition-all duration-300 ${showBackToTop ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}
      >
        <ArrowUp className="h-5 w-5" />
      </button>
      {currentUser?.isSuperAdmin && (
        <LuminaFloatingShortcut isDarkMode={isDarkMode} onOpen={() => {
          setSharedSeller(null);
          setSharedPostId(null);
          setSelectedPostId(null);
          navigateToView('lumina');
        }} />
      )}

      {!isOnline && (
        <div className="sticky top-16 z-30 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-200" role="status">
          You are offline. Showing saved Fabsattire content; new data will sync when connection returns.
        </div>
      )}
      {isRefreshing && <div className="sticky top-16 z-30 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-200">Refreshing marketplace...</div>}

      {/* 5. Main View Content */}
      <main className={`view-content-stage min-w-0 flex-1 ${!currentUser && currentView === 'landing' ? 'pb-8' : 'pb-24'} lg:pb-8`}>
        {isDataLoading ? <ContentSkeleton isDarkMode={isDarkMode} /> : <Suspense fallback={<ContentSkeleton isDarkMode={isDarkMode} />}>
          <AnimatePresence mode="wait" initial={false}>
          {currentView === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, x: '7%', rotateY: 2 }}
              animate={{ opacity: 1, x: 0, rotateY: 0 }}
              exit={{ opacity: 0, x: '-7%', rotateY: -2 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: 'left center', perspective: 1200 }}
            >
              <LandingPage
                onOpenAuth={handleOpenAuthWithRole}
                isDarkMode={isDarkMode}
              />
            </motion.div>
          )}

          {currentView === 'marketplace' && (
            <motion.div
              key="marketplace"
              initial={{ opacity: 0, x: '7%', rotateY: 2 }}
              animate={{ opacity: 1, x: 0, rotateY: 0 }}
              exit={{ opacity: 0, x: '-7%', rotateY: -2 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: 'left center', perspective: 1200 }}
            >
              <Marketplace
                posts={posts}
                postsLoadError={postsLoadError}
                onRetryLoad={() => void refreshAllData(true)}
                users={users}
                currentUser={currentUser}
                onOpenAuth={() => handleOpenAuthWithRole('buyer')}
                onSelectPost={handleSelectPost}
                onSaveImageToViewer={handleSaveImageToViewer}
                onSharePost={handleSharePost}
                onShareTailorProfile={handleShareTailorProfile}
                onToggleFollow={handleToggleFollow}
                onSelectSeller={handleSelectSeller}
                isDarkMode={isDarkMode}
                enableGreetingTyping={!isDataLoading && !showIntro}
              />
            </motion.div>
          )}

          {currentView === 'post' && (
            <motion.div className="mobile-detail-sheet" key="post" initial={{ opacity: 0, x: isMobileInstallDevice ? 0 : '7%', y: isMobileInstallDevice ? '8%' : 0, scale: isMobileInstallDevice ? 0.985 : 1, rotateY: isMobileInstallDevice ? 0 : 2 }} animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotateY: 0 }} exit={{ opacity: 0, x: isMobileInstallDevice ? 0 : '-7%', y: isMobileInstallDevice ? '4%' : 0, scale: isMobileInstallDevice ? 0.985 : 1, rotateY: isMobileInstallDevice ? 0 : -2 }} transition={{ type: 'spring', stiffness: 280, damping: 28, mass: 0.72 }} style={{ transformOrigin: 'left center', perspective: 1200 }}>
              <PostDetailPage
                post={posts.find(post => post.id === selectedPostId) || null}
                posts={posts}
                users={users}
                currentUser={currentUser}
                onOpenAuth={() => handleOpenAuthWithRole('buyer')}
                isDarkMode={isDarkMode}
                onBack={() => {
                  navigateToView('marketplace');
                }}
                onSelectPost={handleSelectPost}
                onSelectSeller={handleSelectSeller}
                onInquire={handleContactSeller}
                onShare={handleSharePost}
                onView={handleRecordPostView}
              />
            </motion.div>
          )}

          {currentView === 'artisan' && (
            <motion.div
              key="artisan"
              initial={{ opacity: 0, x: '7%', rotateY: 2 }}
              animate={{ opacity: 1, x: 0, rotateY: 0 }}
              exit={{ opacity: 0, x: '-7%', rotateY: -2 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: 'left center', perspective: 1200 }}
            >
              <ArtisanDirectory
                users={users}
                sellerDirectoryDataStatus={sellerDirectoryDataStatus}
                posts={posts}
                currentUser={currentUser}
                onSelectArtisan={handleSelectSeller}
                isDarkMode={isDarkMode}
              />
            </motion.div>
          )}

          {currentView === 'collections' && (
            <motion.div
              key="collections"
              initial={{ opacity: 0, x: '7%', rotateY: 2 }}
              animate={{ opacity: 1, x: 0, rotateY: 0 }}
              exit={{ opacity: 0, x: '-7%', rotateY: -2 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: 'left center', perspective: 1200 }}
            >
              <CollectionPage
                currentUser={currentUser}
                isDarkMode={isDarkMode}
              />
            </motion.div>
          )}

          {currentView === 'profile' && currentUser && (
            <motion.div key="profile" initial={{ opacity: 0, x: '7%', rotateY: 2 }} animate={{ opacity: 1, x: 0, rotateY: 0 }} exit={{ opacity: 0, x: '-7%', rotateY: -2 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} style={{ transformOrigin: 'left center', perspective: 1200 }}>
              <ProfilePage currentUser={currentUser} isDarkMode={isDarkMode} onNavigate={setCurrentView} onLogout={handleLogout} />
            </motion.div>
          )}

          {currentView === 'seller' && sharedSeller && (
            <motion.div className="mobile-detail-sheet" key="seller" initial={{ opacity: 0, x: isMobileInstallDevice ? 0 : '7%', y: isMobileInstallDevice ? '8%' : 0, scale: isMobileInstallDevice ? 0.985 : 1, rotateY: isMobileInstallDevice ? 0 : 2 }} animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotateY: 0 }} exit={{ opacity: 0, x: isMobileInstallDevice ? 0 : '-7%', y: isMobileInstallDevice ? '4%' : 0, scale: isMobileInstallDevice ? 0.985 : 1, rotateY: isMobileInstallDevice ? 0 : -2 }} transition={{ type: 'spring', stiffness: 280, damping: 28, mass: 0.72 }} style={{ transformOrigin: 'left center', perspective: 1200 }}>
              <SellerProfilePage seller={sharedSeller} posts={posts} featuredPostId={sharedPostId} currentUser={currentUser} onOpenAuth={() => handleOpenAuthWithRole('buyer')} isDarkMode={isDarkMode} onBack={() => navigateToView('marketplace')} onShare={handleShareTailorProfile} onToggleFollow={handleToggleFollow} onSelectPost={handleSelectPost} />
            </motion.div>
          )}

          {currentView === 'dashboard' && currentUser && (currentUser.role === 'tailor' || currentUser.role === 'fabric_seller') && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: '7%', rotateY: 2 }}
              animate={{ opacity: 1, x: 0, rotateY: 0 }}
              exit={{ opacity: 0, x: '-7%', rotateY: -2 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: 'left center', perspective: 1200 }}
            >
              <TailorDashboard
                currentUser={currentUser}
                posts={posts}
                promoPlans={promoPlans}
                onOpenImage={(src, alt) => openImageViewer(src, alt, true)}
                onOpenSocialShare={(handle, name) => {
                  setSocialShareHandle(handle);
                  setSocialShareName(name);
                  setSocialShareUrl(buildSellerShareUrl(window.location.origin, handle));
                  setSocialShareOpen(true);
                }}
                isDarkMode={isDarkMode}
              />
            </motion.div>
          )}

          {currentView === 'admin'
            && currentUser?.role === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, x: '7%', rotateY: 2 }}
              animate={{ opacity: 1, x: 0, rotateY: 0 }}
              exit={{ opacity: 0, x: '-7%', rotateY: -2 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: 'left center', perspective: 1200 }}
            >
              <AdminDashboard
                currentUser={currentUser}
                users={users}
                posts={posts}
                promoPlans={promoPlans}
                broadcasts={broadcasts}
                isDarkMode={isDarkMode}
                onOpenSeller={handleSelectSeller}
                onNavigate={navigateToView}
                onCloseLumina={() => navigateToView('admin')}
                isLuminaPage={false}
              />
            </motion.div>
          )}

          {(currentView === 'about' || currentView === 'privacy' || currentView === 'terms' || currentView === 'contact') && (
            <LegalPage page={currentView === 'contact' ? 'contact' : currentView} isDarkMode={isDarkMode} onBack={() => setCurrentView(currentUser ? 'marketplace' : 'landing')} />
          )}
          </AnimatePresence>
        </Suspense>}
      </main>

      {currentView === 'lumina' && currentUser?.isSuperAdmin && (
        <Suspense fallback={<ContentSkeleton isDarkMode={isDarkMode} />}>
          <AdminDashboard
            currentUser={currentUser}
            users={users}
            posts={posts}
            promoPlans={promoPlans}
            broadcasts={broadcasts}
            isDarkMode={isDarkMode}
            onOpenSeller={handleSelectSeller}
            onNavigate={navigateToView}
            onCloseLumina={() => navigateToView('admin')}
            isLuminaPage
            initialTab="ai"
          />
        </Suspense>
      )}

      <Footer isDarkMode={isDarkMode} onNavigate={navigateToView} />

      <AnimatePresence>
        {currentUser && (
          <MobileBottomNav
            key="authenticated-mobile-bottom-nav"
            currentUser={currentUser}
            currentView={currentView}
            onNavigate={navigateToView}
            onOpenAuth={() => handleOpenAuthWithRole('buyer')}
            onLogout={handleLogout}
            isDarkMode={isDarkMode}
            canInstall={canShowInstallPrompt}
            onInstall={handleInstallApp}
          />
        )}
      </AnimatePresence>

      {shareNotice && (
        <div className="fixed bottom-24 left-1/2 z-[95] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-amber-500/30 bg-[#121316] px-4 py-3 text-sm text-white shadow-xl" role="status">
          <span className="break-all">{shareNotice}</span>
          <button type="button" onClick={() => setShareNotice('')} aria-label="Dismiss share message" className="shrink-0 text-neutral-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      )}

      {installHelpOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setInstallHelpOpen(false);
        }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-help-title"
            className={`w-full max-w-md rounded-3xl border p-5 shadow-2xl ${isDarkMode ? 'border-neutral-700 bg-[#121316] text-white' : 'border-neutral-200 bg-white text-neutral-900'}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Download className="h-5 w-5 text-amber-400" aria-hidden="true" />
                <h2 id="install-help-title" className="text-lg font-serif font-bold">Install Fabsattire</h2>
              </div>
              <button type="button" onClick={() => setInstallHelpOpen(false)} aria-label="Close install instructions" className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            {isAndroidDevice ? (
              <>
                <p className={`mt-4 text-sm leading-relaxed ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
                  The Fabsattire Android app is downloading. When Chrome finishes, open the APK from Downloads and confirm the Android install prompt. Android may ask you to allow Chrome to install apps from this source.
                </p>
                <a
                  href="https://github.com/fountainsdata234-dotcom/atelier-marketplace/releases/latest/download/app-release.apk"
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-neutral-950 transition hover:bg-amber-300"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download APK again
                </a>
              </>
            ) : (
              <>
                <p className={`mt-4 text-sm leading-relaxed ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>{installInstructions}</p>
                <p className={`mt-3 text-xs leading-relaxed ${isDarkMode ? 'text-neutral-500' : 'text-neutral-600'}`}>
                  On Android, the website can download the signed Fabsattire APK, but Android always requires you to confirm the install on your device.
                </p>
              </>
            )}
          </section>
        </div>
      )}

      {/* 8. Authentication & Registration Modal */}
      {authModalOpen && <Suspense fallback={null}>
        <AuthModal
          isOpen
          onClose={() => setAuthModalOpen(false)}
          defaultRole={authDefaultRole}
          onSuccess={handleAuthSuccess}
          isDarkMode={isDarkMode}
          onNavigate={setCurrentView}
        />
      </Suspense>}
      {passwordRecoveryOpen && <Suspense fallback={null}>
        <PasswordRecoveryModal
          isDarkMode={isDarkMode}
          onComplete={() => setPasswordRecoveryOpen(false)}
        />
      </Suspense>}

      {/* 9. Social Share Handle Modal */}
      <SocialShareModal
        isOpen={socialShareOpen}
        onClose={() => setSocialShareOpen(false)}
        handle={socialShareHandle}
        name={socialShareName}
        isDarkMode={isDarkMode}
        profileUrl={sharedProfileUrl}
      />

      {/* 10. Save High-Res Picture Modal */}
      <SavePictureModal
        isOpen={savePictureOpen}
        onClose={() => {
          setSavePictureOpen(false);
          setSavePictureUrl(null);
          setSavePictureTitle(null);
        }}
        imageUrl={savePictureUrl}
        imageTitle={savePictureTitle}
        isDarkMode={isDarkMode}
      />

      {imageViewer && (
        <div
          data-image-viewer
          className="fixed inset-0 z-[120] flex flex-col bg-black/95 p-3 backdrop-blur-xl sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Full-screen image viewer"
          onClick={event => {
            if (event.target === event.currentTarget) setImageViewer(null);
          }}
        >
          <div className="flex shrink-0 items-center justify-between gap-4">
            <p className="min-w-0 truncate text-xs font-medium text-white/75">{imageViewer.alt}</p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={event => void handleImageDownload(event.currentTarget)}
                disabled={isImageDownloading}
                aria-label={imageViewer.isPost ? 'Download watermarked post image' : 'Download image'}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 text-xs font-semibold text-white transition hover:bg-white/20 disabled:cursor-wait disabled:opacity-60"
              >
                <Download className="h-4 w-4" />{isImageDownloading ? 'Preparing…' : 'Download'}
              </button>
              <button
                type="button"
                onClick={() => setImageViewer(null)}
                aria-label="Close image viewer"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div
            ref={imageStageRef}
            className="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden py-3"
            onPointerDown={handleImagePointerDown}
            onPointerMove={handleImagePointerMove}
            onPointerUp={handleImagePointerUp}
            onPointerCancel={handleImagePointerUp}
            onWheel={handleImageWheel}
            onContextMenu={event => event.preventDefault()}
            onClick={event => {
              if (event.target === event.currentTarget) setImageViewer(null);
            }}
          >
            <img
              src={imageViewer.src}
              alt={imageViewer.alt}
              draggable={false}
              className={`max-h-full max-w-full select-none object-contain ${imageViewport.scale > 1 && imageDragMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
              style={{
                transform: `translate(${imageViewport.x}px, ${imageViewport.y}px) scale(${imageViewport.scale})`,
                transformOrigin: 'center',
                willChange: 'transform',
              }}
            />
            <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-center text-[10px] text-white/65 backdrop-blur-sm">
              Double-tap after zooming to drag · pinch or wheel to zoom
            </span>
          </div>
          {imageDownloadError && <p className="shrink-0 text-center text-xs text-red-300" role="alert">{imageDownloadError}</p>}
          <div className="flex shrink-0 items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                const stage = imageStageRef.current?.getBoundingClientRect();
                if (stage) zoomImageAtPoint(stage.left + stage.width / 2, stage.top + stage.height / 2, Math.max(1, imageViewport.scale / 1.25));
              }}
              disabled={imageViewport.scale <= 1}
              aria-label="Zoom out"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
            >
              <ZoomOut className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setImageViewport({ scale: 1, x: 0, y: 0 })}
              aria-label="Reset image zoom"
              className="flex h-11 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              <RotateCcw className="h-4 w-4" />{Math.round(imageViewport.scale * 100)}%
            </button>
            <button
              type="button"
              onClick={() => {
                const stage = imageStageRef.current?.getBoundingClientRect();
                if (stage) zoomImageAtPoint(stage.left + stage.width / 2, stage.top + stage.height / 2, Math.min(5, imageViewport.scale * 1.25));
              }}
              disabled={imageViewport.scale >= 5}
              aria-label="Zoom in"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
            >
              <ZoomIn className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
