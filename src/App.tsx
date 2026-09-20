import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { User, ClothPost, AdminPromoPlan, BroadcastMessage, UserRole } from './types';
import { storageService } from './services/storage';
import { NeedleThreadBackground } from './components/NeedleThreadBackground';
import { IntroLoader } from './components/IntroLoader';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
const Marketplace = lazy(() => import('./components/Marketplace').then(module => ({ default: module.Marketplace })));
const TailorDashboard = lazy(() => import('./components/TailorDashboard').then(module => ({ default: module.TailorDashboard })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const DirectMessaging = lazy(() => import('./components/DirectMessaging').then(module => ({ default: module.DirectMessaging })));
const AuthModal = lazy(() => import('./components/AuthModal').then(module => ({ default: module.AuthModal })));
import { SocialShareModal } from './components/SocialShareModal';
import { SavePictureModal } from './components/SavePictureModal';
import { BroadcastBanner } from './components/BroadcastBanner';
import { Footer } from './components/Footer';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ContentSkeleton } from './components/ContentSkeleton';
import { LegalPage } from './components/LegalPage';
import { SellerProfilePage } from './components/SellerProfilePage';
const CollectionPage = lazy(() => import('./components/CollectionPage').then(module => ({ default: module.CollectionPage })));
const ProfilePage = lazy(() => import('./components/ProfilePage').then(module => ({ default: module.ProfilePage })));
const ArtisanDirectory = lazy(() => import('./components/ArtisanDirectory').then(module => ({ default: module.ArtisanDirectory })));
import { api } from './services/api';
import { getHandleSlug } from './utils/profile';

export default function App() {
  const publicSellerRoute = /^\/@[^/]+(?:\/post\/[^/]+)?$/i.test(window.location.pathname) || Boolean(new URLSearchParams(window.location.search).get('seller'));
  // Intro Loading animation state
  const [showIntro, setShowIntro] = useState<boolean>(() => sessionStorage.getItem('fabrilux_intro_seen') !== '1');
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartY = useRef<number | null>(null);

  // Theme state: default to sophisticated dark luxury aesthetic with full light toggle
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('atelier_theme_mode');
    return saved ? saved === 'dark' : true;
  });

  // Navigation View: 'landing' | 'marketplace' | 'collections' | 'profile' | 'dashboard' | 'admin' | 'messages' | 'artisan'
  const [currentView, setCurrentView] = useState<string>(() => sessionStorage.getItem('fabrilux_active_view') || 'landing');
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [sharedSeller, setSharedSeller] = useState<User | null>(null);
  const [sharedPostId, setSharedPostId] = useState<string | null>(null);

  // Application Data States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [posts, setPosts] = useState<ClothPost[]>([]);
  const [promoPlans, setPromoPlans] = useState<AdminPromoPlan[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authDefaultRole, setAuthDefaultRole] = useState<UserRole>('buyer');
  
  // Messaging Modal / Drawer state
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

  // Initialize storage and load initial data
  useEffect(() => {
    storageService.init();
    void refreshAllData();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleInstallPrompt = (event: Event) => {
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => setInstallPrompt(null);
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

    let unsubscribeFirebase: (() => void) | undefined;
    import('./services/firebase').then(({ configureFirebaseAuth, subscribeToFirebaseAuth, toAppUser }) => configureFirebaseAuth().then(() => {
      unsubscribeFirebase = subscribeToFirebaseAuth(async (firebaseUser) => {
        if (!firebaseUser) {
          setCurrentUser(null);
          return;
        }
        const baseUser = await toAppUser(firebaseUser);
        let savedProfile: Partial<User> | undefined;
        try {
          savedProfile = await api.getProfile();
        } catch (error) {
          // A new Firebase account can briefly exist before its profile document is saved.
          // Keep the authenticated user active and let the profile sync below repair it.
          console.warn('Profile not available yet; using Firebase account details.', error);
        }
        const cachedProfile = storageService.getUsers().find(user => user.id === firebaseUser.uid);
        const profileValue = <T,>(key: keyof User, fallback: T): T => {
          const remoteValue = savedProfile?.[key] as T | undefined;
          const cachedValue = cachedProfile?.[key] as T | undefined;
          if (remoteValue !== undefined && remoteValue !== null && remoteValue !== '') return remoteValue;
          if (cachedValue !== undefined && cachedValue !== null && cachedValue !== '') return cachedValue;
          return fallback;
        };
        const savedRole = savedProfile?.role;
        const mergedUser = {
          ...baseUser,
          ...savedProfile,
          name: profileValue('name', baseUser.name),
          handle: profileValue('handle', baseUser.handle),
          phone: profileValue('phone', baseUser.phone),
          bio: profileValue('bio', baseUser.bio || ''),
          avatarUrl: profileValue('avatarUrl', baseUser.avatarUrl),
          shopName: profileValue('shopName', baseUser.shopName || ''),
          location: profileValue('location', baseUser.location),
          followers: profileValue('followers', baseUser.followers),
          id: firebaseUser.uid,
          email: firebaseUser.email || baseUser.email,
          role: baseUser.role === 'admin' ? 'admin' : (savedRole || baseUser.role),
          isSuperAdmin: baseUser.isSuperAdmin,
        };
        const user = storageService.upsertUser(mergedUser);
        setCurrentUser(user);
        if (publicSellerRoute) {
          setCurrentView('seller');
        } else if (user.role === 'admin') {
          setCurrentView('admin');
        } else if (user.role === 'tailor' || user.role === 'fabric_seller') {
          setCurrentView('dashboard');
        } else {
          setCurrentView('marketplace');
        }
        await api.saveProfile(user).catch(error => console.error('Profile sync failed', error));
        void refreshAllData();
      });
    })).catch((error) => console.error('Firebase Auth initialization failed', error));

    // Listen to reactive update events
    const handleUsersUpdate = () => setUsers(storageService.getUsers());
    const handlePostsUpdate = () => setPosts(storageService.getPosts());
    const handlePlansUpdate = () => setPromoPlans(storageService.getPromoPlans());
    const handleAuthChange = (e: any) => setCurrentUser(e.detail);
    const handleBroadcastsUpdate = () => setBroadcasts(storageService.getBroadcasts());
    const handleNavigateTab = (e: any) => setCurrentView(e.detail);

    window.addEventListener('atelier_users_updated', handleUsersUpdate);
    window.addEventListener('atelier_posts_updated', handlePostsUpdate);
    window.addEventListener('atelier_plans_updated', handlePlansUpdate);
    window.addEventListener('atelier_auth_changed', handleAuthChange);
    window.addEventListener('atelier_broadcast_received', handleBroadcastsUpdate);
    window.addEventListener('navigate_to_tab', handleNavigateTab);

    return () => {
      unsubscribeFirebase?.();
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
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const legacyHandle = params.get('seller')?.trim().toLowerCase();
    const pathMatch = window.location.pathname.match(/^\/@([^/]+)(?:\/post\/([^/]+))?$/i);
    const handle = (pathMatch?.[1] || legacyHandle || '').replace(/^@/, '').toLowerCase();
    const pathPostId = pathMatch?.[2] || params.get('post');
    if (!handle || users.length === 0) return;
    const seller = users.find(user => user.handle.replace(/^@/, '').toLowerCase() === handle);
    if (seller && (seller.role === 'tailor' || seller.role === 'fabric_seller')) {
      setSharedSeller(seller);
      setSharedPostId(pathPostId || null);
      setCurrentView('seller');
    }
  }, [users]);

  useEffect(() => {
    if (!currentUser) {
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
    const interval = window.setInterval(() => void refreshUnreadCount(), 20_000);
    const handleMessageUpdate = () => void refreshUnreadCount();
    window.addEventListener('atelier_message_received', handleMessageUpdate);
    window.addEventListener('atelier_messages_read', handleMessageUpdate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('atelier_message_received', handleMessageUpdate);
      window.removeEventListener('atelier_messages_read', handleMessageUpdate);
    };
  }, [currentUser?.id]);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') setInstallPrompt(null);
  };

  const refreshAllData = async (showLoader = true) => {
    if (showLoader) setIsDataLoading(true);
    const localUsers = storageService.getUsers();
    const localPosts = storageService.getPosts();
    setCurrentUser(storageService.getCurrentUser());

    if (localUsers.length > 0) {
      setUsers(localUsers);
    }
    if (localPosts.length > 0 || posts.length > 0) {
      setPosts(localPosts);
    }

    setPromoPlans(storageService.getPromoPlans());
    setBroadcasts(storageService.getBroadcasts());
    if (showLoader) setIsDataLoading(false);

    try {
      const [remoteUsers, remotePosts, remotePlans] = await Promise.all([
        api.getUsers().catch(() => null),
        api.getPosts().catch(() => null),
        api.getPromoPlans().catch(() => null),
      ]);
      if (remoteUsers !== null) {
        const localUsers = storageService.getUsers();
        const mergedUsers = remoteUsers.map(remoteUser => {
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
        storageService.saveUsers(mergedUsers);
        setUsers(mergedUsers);
      }

      // An empty array is a valid authoritative response: it must clear stale local posts.
      if (remotePosts !== null) {
        const normalizedPosts = remotePosts.map(post => ({
          ...post,
          likes: Array.isArray(post.likes) ? post.likes : [],
          saves: Array.isArray(post.saves) ? post.saves : [],
          tags: Array.isArray(post.tags) ? post.tags : [],
          ratingsByUser: post.ratingsByUser || {},
          rating: Number(post.rating) || 0,
          ratingCount: Number(post.ratingCount) || 0,
          authorLocation: post.authorLocation || { country: '', state: '', city: '' },
        }));
        storageService.savePosts(normalizedPosts);
        setPosts(normalizedPosts);
      }

      // Release the main marketplace as soon as its primary content is ready.
      // Secondary plans can finish loading without blocking the first useful view.
      if (showLoader) setIsDataLoading(false);

      if (remotePlans !== null && remotePlans.length > 0) {
        const localPlans = storageService.getPromoPlans();
        const completePlans = [0, 1, 2]
          .map(index => remotePlans[index] || localPlans[index])
          .filter((plan): plan is AdminPromoPlan => Boolean(plan));
        storageService.savePromoPlans(completePlans);
        setPromoPlans(completePlans);
      }
    } catch (error) {
      console.error('Remote marketplace data unavailable', error);
    } finally {
      if (showLoader) setIsDataLoading(false);
    }
  };

  useEffect(() => {
    const refreshTimer = window.setInterval(() => void refreshAllData(false), 60_000);
    return () => window.clearInterval(refreshTimer);
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
    import('./services/firebase').then(({ logoutFromFirebase }) => logoutFromFirebase()).catch((error) => console.error('Firebase logout failed', error));
    storageService.setCurrentUser(null);
    setCurrentUser(null);
    setCurrentView('landing');
  };

  // Initiate In-App Message from a Post
  const handleSelectPostForMessage = (post: ClothPost) => {
    if (!currentUser) {
      handleOpenAuthWithRole('buyer');
      return;
    }
    const tailor = users.find(u => u.id === post.authorId);
    if (!tailor) return;
    storageService.recordDiscoveryEvent(post.id, 'ENQUIRY', currentUser.id);
    void api.recordDiscoveryEvent(post.id, 'ENQUIRY', sessionStorage.getItem('atelier_session_id') || 'app-session');
    setDirectMessageRecipient(tailor);
    setDirectMessagePost(post);
    setDirectMessageOpen(true);
  };

  const handleMessageUser = (user: User) => {
    if (!currentUser) return;
    setDirectMessageRecipient(user);
    setDirectMessagePost(null);
    setCurrentView('messages');
  };

  // Trigger Save Image
  const handleSaveImageToViewer = (url: string, title: string) => {
    setSavePictureUrl(url);
    setSavePictureTitle(title);
    setSavePictureOpen(true);
  };

  // Trigger Social Share Modal
  const handleShareTailorProfile = (tailor: User) => {
    setSocialShareHandle(tailor.handle);
    setSocialShareName(tailor.name);
    setSharedPostId(null);
    setSocialShareUrl(`${window.location.origin}/@${getHandleSlug(tailor.handle)}`);
    setSocialShareOpen(true);
  };

  const handleToggleFollow = async (seller: User) => {
    if (!currentUser) {
      handleOpenAuthWithRole('buyer');
      return;
    }
    storageService.toggleFollowUser(seller.id, currentUser.id);
    const locallyUpdated = storageService.getUsers().find(user => user.id === seller.id);
    if (locallyUpdated) {
      setUsers(storageService.getUsers());
      setSharedSeller(locallyUpdated);
    }
    const result = await api.toggleFollow(seller.id).catch(() => null);
    if (!result) return;
    const updated = storageService.updateUser(seller.id, { followers: result.followers });
    if (updated) {
      setUsers(storageService.getUsers());
      setSharedSeller(updated);
    }
  };

  const sharedProfileUrl = socialShareUrl || (socialShareHandle
    ? `${window.location.origin}/@${getHandleSlug(socialShareHandle)}`
    : window.location.origin);

  const handleSharePost = (post: ClothPost) => {
    storageService.recordDiscoveryEvent(post.id, 'SHARE', currentUser?.id);
    if (currentUser) void api.recordDiscoveryEvent(post.id, 'SHARE', sessionStorage.getItem('atelier_session_id') || 'app-session');
    setSocialShareHandle(post.authorHandle);
    setSocialShareName(`${post.title} by ${post.authorName}`);
    setSocialShareUrl(`${window.location.origin}/@${getHandleSlug(post.authorHandle)}/post/${encodeURIComponent(post.id)}`);
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

      {/* 4. Top Navigation Bar */}
      <Navbar
        currentUser={currentUser}
        currentView={currentView}
        onNavigate={setCurrentView}
        onOpenAuth={() => handleOpenAuthWithRole('buyer')}
        onLogout={handleLogout}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
        isOnline={isOnline}
        canInstall={Boolean(installPrompt)}
        onInstall={handleInstallApp}
        onRefresh={() => { setIsRefreshing(true); void refreshAllData(true).finally(() => setIsRefreshing(false)); }}
        isRefreshing={isRefreshing}
        unreadCount={unreadCount}
      />

      {!isOnline && (
        <div className="sticky top-16 z-30 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-200" role="status">
          You are offline. Showing saved Fabrilux content; new data will sync when connection returns.
        </div>
      )}
      {currentUser?.isWarned && currentUser.warningNote && (
        <button type="button" onClick={() => setCurrentView('profile')} className="sticky top-16 z-30 flex w-full items-center justify-center gap-2 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-center text-xs font-semibold text-red-200 transition hover:bg-red-500/20">
          <span aria-hidden="true">!</span> Urgent account notice: open your account alerts to read it
        </button>
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
                onExploreMarketplace={() => setCurrentView('marketplace')}
                isDarkMode={isDarkMode}
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
                users={users}
                currentUser={currentUser}
                onOpenAuth={() => handleOpenAuthWithRole('buyer')}
                onSelectPostForMessage={handleSelectPostForMessage}
                onSaveImageToViewer={handleSaveImageToViewer}
                onSharePost={handleSharePost}
                onShareTailorProfile={handleShareTailorProfile}
                onToggleFollow={handleToggleFollow}
                onSelectSeller={(seller) => {
                  setSharedSeller(seller);
                  setSharedPostId(null);
                  setCurrentView('seller');
                }}
                isDarkMode={isDarkMode}
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
                onSelectArtisan={(artisan) => {
                  setSharedSeller(artisan);
                  setCurrentView('seller');
                }}
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
            <SellerProfilePage seller={sharedSeller} posts={posts} featuredPostId={sharedPostId} currentUser={currentUser} isDarkMode={isDarkMode} onBack={() => setCurrentView('marketplace')} onShare={handleShareTailorProfile} onToggleFollow={handleToggleFollow} />
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
                  setSocialShareUrl(`${window.location.origin}/@${getHandleSlug(handle)}`);
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
                onMessageUser={handleMessageUser}
                isDarkMode={isDarkMode}
              />
            </motion.div>
          )}

          {currentView === 'messages' && currentUser && (
            <motion.div
              key="messages"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35 }}
              className="py-4"
            >
              <DirectMessaging
                currentUser={currentUser}
                recipientUser={directMessageRecipient}
                selectedPost={directMessagePost}
                onClose={() => setCurrentView('marketplace')}
                isDarkMode={isDarkMode}
              />
            </motion.div>
          )}
          {(currentView === 'about' || currentView === 'privacy' || currentView === 'terms') && (
            <LegalPage page={currentView} isDarkMode={isDarkMode} onBack={() => setCurrentView(currentUser ? 'marketplace' : 'landing')} />
          )}
          </AnimatePresence>
        </Suspense>}
      </main>

      <Footer isDarkMode={isDarkMode} onNavigate={setCurrentView} />

      <MobileBottomNav
        currentUser={currentUser}
        currentView={currentView}
        onNavigate={setCurrentView}
        onOpenAuth={() => handleOpenAuthWithRole('buyer')}
        onLogout={handleLogout}
        isDarkMode={isDarkMode}
        unreadCount={unreadCount}
        canInstall={Boolean(installPrompt)}
        onInstall={handleInstallApp}
      />

      {/* 6. Global Floating / Modal Direct Messaging */}
      {directMessageOpen && currentUser && (
        <DirectMessaging
          currentUser={currentUser}
          recipientUser={directMessageRecipient}
          selectedPost={directMessagePost}
          onClose={() => {
            setDirectMessageOpen(false);
            setDirectMessageRecipient(null);
            setDirectMessagePost(null);
          }}
          isDarkMode={isDarkMode}
        />
      )}

      {/* 8. Authentication & Registration Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultRole={authDefaultRole}
        onSuccess={handleAuthSuccess}
        isDarkMode={isDarkMode}
        onNavigate={setCurrentView}
      />

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
