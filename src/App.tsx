import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp } from 'lucide-react';
import { User, ClothPost, AdminPromoPlan, BroadcastMessage, UserRole, AppNotification } from './types';
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
import { api } from './services/api';
import { buildPostShareUrl, buildSellerShareUrl, getHandleSlug } from './utils/profile';
import { buildWhatsAppUrl } from './utils/whatsapp';

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
const MARKETPLACE_AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

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
  return PUBLIC_VIEW_BY_PATH[path] || sessionStorage.getItem('fabrilux_active_view') || 'landing';
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
  const [showIntro, setShowIntro] = useState<boolean>(() => sessionStorage.getItem('fabrilux_intro_seen') !== '1');
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartY = useRef<number | null>(null);
  const LAST_INSTALLED_EMAIL_KEY = 'atelier_last_installed_email';

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
  const [posts, setPosts] = useState<ClothPost[]>(() => storageService.getPosts());
  const [postsLoadError, setPostsLoadError] = useState(false);
  const [promoPlans, setPromoPlans] = useState<AdminPromoPlan[]>([]);
  const [isPromoPlansLoading, setIsPromoPlansLoading] = useState(false);
  const [broadcasts, setBroadcasts] = useState<BroadcastMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastAuthEventUserId = useRef<string | null>(null);

  useEffect(() => {
    const pageMeta: Record<string, { title: string; description: string }> = {
      landing: { title: 'FABSATTIRE | Tailor & Fabric Marketplace', description: 'Discover tailors, fabric sellers, and bespoke fashion specialists. Browse real collections, compare makers, and connect directly.' },
      marketplace: { title: 'Tailors, Fabrics & Bespoke Pieces | FABSATTIRE', description: 'Explore garments and fabrics from independent tailors and fabric sellers. Search by seller tags, compare pieces, and contact makers directly.' },
      artisan: { title: 'Find Tailors & Fabric Sellers | FABSATTIRE', description: 'Discover tailors and fabric merchants by location, explore their work, and visit their seller collections.' },
      about: { title: 'About FABSATTIRE', description: 'Learn about FABSATTIRE, a marketplace connecting buyers with independent tailors and fabric sellers.' },
      privacy: { title: 'Privacy Policy | FABSATTIRE', description: 'Read how FABSATTIRE handles account information and marketplace data.' },
      terms: { title: 'Terms of Service | FABSATTIRE', description: 'Review the terms for using the FABSATTIRE marketplace.' },
      contact: { title: 'Contact FABSATTIRE', description: 'Contact FABSATTIRE for account help, seller questions, partnerships, and marketplace support.' },
      collections: { title: 'Saved Collection | FABSATTIRE', description: 'Review your saved fashion and fabric inspiration on FABSATTIRE.' },
    };
    const sellerTitle = sharedSeller ? `${sharedSeller.shopName || sharedSeller.name} | FABSATTIRE` : null;
    const meta = pageMeta[currentView] || pageMeta.landing;
    const description = sharedSeller?.bio?.trim() || meta.description;
    const isPrivateView = ['admin', 'dashboard', 'messages', 'profile', 'collections'].includes(currentView);
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
    const nextPath = PATH_BY_VIEW[view] || '/';
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl !== nextPath) window.history.pushState({ view }, '', nextPath);
    setSharedSeller(null);
    setSharedPostId(null);
    setSelectedPostId(null);
    setCurrentView(view);
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
      setCurrentView(PUBLIC_VIEW_BY_PATH[path] || sessionStorage.getItem('fabrilux_active_view') || 'landing');
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
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      if (currentUser?.email) {
        localStorage.setItem(LAST_INSTALLED_EMAIL_KEY, currentUser.email);
      }
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
        void api.getProfile().then(savedProfile => {
          const syncedUser = storageService.upsertUser(mergeProfile(savedProfile));
          setCurrentUser(syncedUser);
          if (!savedProfile.avatarUrl && authUser.avatarUrl) {
            void api.saveProfile({ avatarUrl: authUser.avatarUrl }).catch(error => {
              console.warn('Google profile photo could not be saved.', error);
            });
          }
        }).catch(error => {
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
        setUnreadCount(messages.filter(message => message.recipientId === currentUser.id && !message.isRead).length);
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
    void api.getAdminUsers().then(adminUsers => {
      if (cancelled) return;
      setUsers(adminUsers);
      storageService.saveUsers(adminUsers.map(user => ({
        ...user,
        email: '',
        phone: '',
        countryCode: '',
        isWarned: undefined,
        warningNote: undefined,
        isSuperAdmin: undefined,
        addedByEmail: undefined,
      })));
    }).catch(error => {
      console.warn('Administrator user data could not be refreshed.', error);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currentUser?.role]);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') {
      const email = currentUser?.email || 'guest';
      localStorage.setItem(LAST_INSTALLED_EMAIL_KEY, email);
      setInstallPrompt(null);
    }
  };

  const canShowInstallPrompt = Boolean(installPrompt) && (!currentUser || localStorage.getItem(LAST_INSTALLED_EMAIL_KEY) !== currentUser.email);

  const handlePageRefresh = () => {
    setIsRefreshing(true);
    void refreshAllData(false).finally(() => setIsRefreshing(false));
  };

  const refreshAllData = async (showLoader = true) => {
    const isEligibleView = document.visibilityState === 'visible' && marketplaceViews.includes(currentView);
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
        const usersRequest = currentUser?.role === 'admin' ? api.getAdminUsers() : api.getUsers();
        const postsRequest = api.getPosts();
        const plansRequest = api.getPromoPlans();
        let remotePosts: ClothPost[] | null = null;
        try {
          remotePosts = await postsRequest;
        } catch (error) {
          console.warn('Marketplace listings could not be refreshed.', error);
          setPostsLoadError(availablePosts.length === 0);
        }

        if (remotePosts !== null) {
          const normalizedPosts = normalizeMarketplacePosts(remotePosts);
          const postsToDisplay = normalizedPosts.length === 0 && availablePosts.length > 0
            ? availablePosts
            : normalizedPosts;
          storageService.savePosts(postsToDisplay);
          setPosts(postsToDisplay);
          setPostsLoadError(false);
        }
        if (showLoader) setIsDataLoading(false);

        const [usersResult, plansResult] = await Promise.allSettled([usersRequest, plansRequest]);
        const remoteUsers = usersResult.status === 'fulfilled' ? usersResult.value : null;
        const remotePlans = plansResult.status === 'fulfilled' ? plansResult.value : null;
        if (remoteUsers !== null) {
          const localUsers = storageService.getUsers();
          const uniqueRemoteUsers: User[] = Array.from(new Map<string, User>(remoteUsers.map(remoteUser => [remoteUser.id, remoteUser])).values());
          const mergedUsers = uniqueRemoteUsers.map(remoteUser => {
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
    void api.getPosts().then(remotePosts => {
      if (remotePosts.length === 0) return;
      const normalizedPosts = normalizeMarketplacePosts(remotePosts);
      storageService.savePosts(normalizedPosts);
      setPosts(normalizedPosts);
    }).catch(error => {
      console.warn('Landing page listings could not be refreshed.', error);
    });
  }, [currentView, posts.length]);

  useEffect(() => {
    if (currentView !== 'landing' || landingPromoPlansRequestStarted.current) return;
    landingPromoPlansRequestStarted.current = true;
    if (promoPlans.length === 0) setIsPromoPlansLoading(true);
    void api.getPromoPlans().then(remotePlans => {
      storageService.savePromoPlans(remotePlans);
      setPromoPlans(remotePlans);
    }).catch(error => {
      console.warn('Landing promotion plans could not be refreshed.', error);
    }).finally(() => {
      setIsPromoPlansLoading(false);
    });
  }, [currentView]);

  useEffect(() => {
    if (!marketplaceViews.includes(currentView)) return;
    const hasCachedPosts = storageService.getPosts().length > 0;
    void refreshAllData(!hasCachedPosts && posts.length === 0);
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible'
        && marketplaceViews.includes(currentView)
        && Date.now() - lastDataRefreshStartedAt.current >= MARKETPLACE_AUTO_REFRESH_INTERVAL_MS) {
        void refreshAllData(false);
      }
    }, MARKETPLACE_AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(refreshTimer);
  }, [currentView]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastDataRefreshStartedAt.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

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
    void api.getNotifications().then(remoteNotifications => {
      storageService.mergeNotifications(remoteNotifications);
      setNotifications(storageService.getNotifications(currentUser.id).slice(0, 4));
    }).catch(error => console.warn('Remote notifications could not be loaded.', error));
    const markAsRead = () => {
      storageService.markNotificationsRead(currentUser.id);
      void api.markNotificationsRead().catch(() => undefined);
    };
    markAsRead();
    const timer = window.setTimeout(markAsRead, 1500);
    return () => window.clearTimeout(timer);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    let unsubscribe: (() => void) | undefined;
    void import('./services/firebase').then(async ({ listenForForegroundPush }) => {
      unsubscribe = await listenForForegroundPush(notification => {
        storageService.addNotification(currentUser.id, notification.title, notification.body, 'system', notification.url);
      });
    }).catch(error => console.warn('Foreground push listener could not start.', error));
    return () => unsubscribe?.();
  }, [currentUser?.id]);

  useEffect(() => {
    sessionStorage.setItem('fabrilux_active_view', currentView);
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

      {!isOnline && (
        <div className="sticky top-16 z-30 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-200" role="status">
          You are offline. Showing saved Fabrilux content; new data will sync when connection returns.
        </div>
      )}
      {isRefreshing && <div className="sticky top-16 z-30 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-200">Refreshing marketplace...</div>}

      {/* 5. Main View Content */}
      <main className="min-w-0 flex-1 pb-24 lg:pb-8">
        {isDataLoading ? <ContentSkeleton isDarkMode={isDarkMode} /> : <Suspense fallback={<ContentSkeleton isDarkMode={isDarkMode} />}>
          <AnimatePresence mode="wait">
          {currentView === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35 }}
            >
              <LandingPage
                onOpenAuth={handleOpenAuthWithRole}
                onExploreMarketplace={() => navigateToView('marketplace')}
                onExploreArtisans={() => navigateToView('artisan')}
                onSelectPost={handleSelectPost}
                onSelectSeller={handleSelectSeller}
                isDarkMode={isDarkMode}
                currentUser={currentUser}
                users={users}
                posts={posts}
                promoPlans={promoPlans}
                promoPlansLoading={isPromoPlansLoading}
              />
            </motion.div>
          )}

          {currentView === 'marketplace' && (
            <motion.div
              key="marketplace"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35 }}
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
              />
            </motion.div>
          )}

          {currentView === 'post' && (
            <motion.div key="post" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
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
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35 }}
            >
              <ArtisanDirectory
                users={users}
                posts={posts}
                currentUser={currentUser}
                onSelectArtisan={handleSelectSeller}
                onToggleFollow={handleToggleFollow}
                isDarkMode={isDarkMode}
              />
            </motion.div>
          )}

          {currentView === 'collections' && (
            <motion.div
              key="collections"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35 }}
            >
              <CollectionPage
                currentUser={currentUser}
                isDarkMode={isDarkMode}
              />
            </motion.div>
          )}

          {currentView === 'profile' && currentUser && (
            <motion.div key="profile" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.35 }}>
              <ProfilePage currentUser={currentUser} isDarkMode={isDarkMode} onNavigate={setCurrentView} onLogout={handleLogout} />
            </motion.div>
          )}

          {currentView === 'seller' && sharedSeller && (
            <motion.div key="seller" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
              <SellerProfilePage seller={sharedSeller} posts={posts} featuredPostId={sharedPostId} currentUser={currentUser} onOpenAuth={() => handleOpenAuthWithRole('buyer')} isDarkMode={isDarkMode} onBack={() => navigateToView('marketplace')} onShare={handleShareTailorProfile} onToggleFollow={handleToggleFollow} onSelectPost={handleSelectPost} />
            </motion.div>
          )}

          {currentView === 'dashboard' && currentUser && (currentUser.role === 'tailor' || currentUser.role === 'fabric_seller') && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35 }}
            >
              <TailorDashboard
                currentUser={currentUser}
                posts={posts}
                promoPlans={promoPlans}
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

          {currentView === 'admin' && currentUser?.role === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35 }}
            >
              <AdminDashboard
                currentUser={currentUser}
                users={users}
                posts={posts}
                promoPlans={promoPlans}
                broadcasts={broadcasts}
                isDarkMode={isDarkMode}
              />
            </motion.div>
          )}

          {(currentView === 'about' || currentView === 'privacy' || currentView === 'terms' || currentView === 'contact') && (
            <LegalPage page={currentView === 'contact' ? 'contact' : currentView} isDarkMode={isDarkMode} onBack={() => setCurrentView(currentUser ? 'marketplace' : 'landing')} />
          )}
          </AnimatePresence>
        </Suspense>}
      </main>

      <Footer isDarkMode={isDarkMode} onNavigate={navigateToView} />

      <MobileBottomNav
        currentUser={currentUser}
        currentView={currentView}
        onNavigate={navigateToView}
        onOpenAuth={() => handleOpenAuthWithRole('buyer')}
        onLogout={handleLogout}
        isDarkMode={isDarkMode}
        canInstall={canShowInstallPrompt}
        onInstall={handleInstallApp}
      />

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

    </div>
  );
}
