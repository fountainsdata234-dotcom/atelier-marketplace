import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { User, ClothPost, AdminPromoPlan, BroadcastMessage, UserRole } from './types';
import { storageService } from './services/storage';
import { NeedleThreadBackground } from './components/NeedleThreadBackground';
import { IntroLoader } from './components/IntroLoader';
import { Navbar } from './components/Navbar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { LandingPage } from './components/LandingPage';
import { Marketplace } from './components/Marketplace';
import { TailorDashboard } from './components/TailorDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { DirectMessaging } from './components/DirectMessaging';
import { AuthModal } from './components/AuthModal';
import { SocialShareModal } from './components/SocialShareModal';
import { SavePictureModal } from './components/SavePictureModal';
import { BroadcastBanner } from './components/BroadcastBanner';
import { Footer } from './components/Footer';
import { CollectionPage } from './components/CollectionPage';
import { ProfilePage } from './components/ProfilePage';
import { ArtisanDirectory } from './components/ArtisanDirectory';
import { configureFirebaseAuth, logoutFromFirebase, subscribeToFirebaseAuth, toAppUser } from './services/firebase';
import { api } from './services/api';

export default function App() {
  // Intro Loading animation state
  const [showIntro, setShowIntro] = useState<boolean>(true);
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
  const [currentView, setCurrentView] = useState<string>('landing');

  // Application Data States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [warningModal, setWarningModal] = useState<{ open: boolean; title: string; content: string }>({
    open: false,
    title: 'Account warning',
    content: '',
  });
  const [users, setUsers] = useState<User[]>([]);
  const [posts, setPosts] = useState<ClothPost[]>([]);
  const [promoPlans, setPromoPlans] = useState<AdminPromoPlan[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastMessage[]>([]);

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
      event.preventDefault();
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
    configureFirebaseAuth().then(() => {
      unsubscribeFirebase = subscribeToFirebaseAuth(async (firebaseUser) => {
        if (!firebaseUser) {
          setCurrentUser(null);
          return;
        }
        const baseUser = await toAppUser(firebaseUser);
        const savedProfile = await api.getProfile().catch(() => undefined);
        const savedRole = savedProfile?.role;
        const mergedUser = {
          ...baseUser,
          ...savedProfile,
          id: firebaseUser.uid,
          email: firebaseUser.email || baseUser.email,
          role: baseUser.role === 'admin' ? 'admin' : (savedRole || baseUser.role),
          isSuperAdmin: baseUser.isSuperAdmin,
        };
        const user = storageService.upsertUser(mergedUser);
        setCurrentUser(user);
        if (user.role === 'admin') {
          setCurrentView('admin');
        } else if (user.role === 'tailor' || user.role === 'fabric_seller') {
          setCurrentView('dashboard');
        } else if (currentView === 'landing' || currentView === 'messages') {
          setCurrentView('marketplace');
        }
        await api.saveProfile(user).catch(error => console.error('Profile sync failed', error));
        void refreshAllData();
      });
    }).catch((error) => console.error('Firebase Auth initialization failed', error));

    // Listen to reactive update events
    const handleUsersUpdate = () => setUsers(storageService.getUsers());
    const handlePostsUpdate = () => setPosts(storageService.getPosts());
    const handlePlansUpdate = () => setPromoPlans(storageService.getPromoPlans());
    const handleAuthChange = (e: any) => setCurrentUser(e.detail);
    const handleBroadcastsUpdate = () => setBroadcasts(storageService.getBroadcasts());
    const handleNavigateTab = (e: any) => setCurrentView(e.detail);
    const handleWarningMessage = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: string; content: string }>).detail;
      if (!detail?.content) return;
      setWarningModal({
        open: true,
        title: detail.title || 'Account warning',
        content: detail.content,
      });
    };

    window.addEventListener('atelier_users_updated', handleUsersUpdate);
    window.addEventListener('atelier_posts_updated', handlePostsUpdate);
    window.addEventListener('atelier_plans_updated', handlePlansUpdate);
    window.addEventListener('atelier_auth_changed', handleAuthChange);
    window.addEventListener('atelier_broadcast_received', handleBroadcastsUpdate);
    window.addEventListener('atelier_warning_message', handleWarningMessage);
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
      window.removeEventListener('atelier_warning_message', handleWarningMessage);
      window.removeEventListener('navigate_to_tab', handleNavigateTab);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') setInstallPrompt(null);
  };

  useEffect(() => {
    if (!currentUser) {
      setWarningModal((prev) => ({ ...prev, open: false, content: '' }));
      return;
    }

    if (currentUser.isWarned && currentUser.warningNote) {
      setWarningModal({
        open: true,
        title: `Warning for ${currentUser.name}`,
        content: currentUser.warningNote,
      });
    } else {
      setWarningModal((prev) => ({ ...prev, open: false, content: '' }));
    }
  }, [currentUser]);

  const refreshAllData = async () => {
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

    try {
      const results = await Promise.allSettled([api.getUsers(), api.getPosts()]);

      const remoteUsers = results[0].status === 'fulfilled' ? results[0].value : null;
      const remotePosts = results[1].status === 'fulfilled' ? results[1].value : null;

      if (remoteUsers) {
        storageService.saveUsers(remoteUsers);
        setUsers(remoteUsers);
      }

      if (remotePosts) {
        storageService.savePosts(remotePosts);
        setPosts(remotePosts);
      }
    } catch (error) {
      console.error('Remote marketplace data unavailable', error);
    }
  };

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
    logoutFromFirebase().catch((error) => console.error('Firebase logout failed', error));
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
    setDirectMessageRecipient(tailor);
    setDirectMessagePost(post);
    setDirectMessageOpen(true);
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
    setSocialShareName(tailor.shopName || tailor.name);
    setSocialShareOpen(true);
  };

  const handleSharePost = (post: ClothPost) => {
    setSocialShareHandle(post.authorHandle);
    setSocialShareName(`${post.title} by ${post.authorName}`);
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
      />

      {!isOnline && (
        <div className="sticky top-16 z-30 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-200" role="status">
          You are offline. Showing saved Fabrilux content; new data will sync when connection returns.
        </div>
      )}
      {isRefreshing && <div className="sticky top-16 z-30 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-200">Refreshing marketplace...</div>}

      {/* 5. Main View Content */}
      <main className="flex-1 pb-20 md:pb-8">
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
        </AnimatePresence>
      </main>

      <Footer isDarkMode={isDarkMode} />

      {/* 6. Mobile Bottom App Navigation Dock */}
      <MobileBottomNav
        currentUser={currentUser}
        currentView={currentView}
        onNavigate={setCurrentView}
        onOpenAuth={() => handleOpenAuthWithRole('buyer')}
        onLogout={handleLogout}
        isDarkMode={isDarkMode}
        canInstall={Boolean(installPrompt)}
        onInstall={handleInstallApp}
      />

      {/* 7. Global Floating / Modal Direct Messaging */}
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
      />

      {/* 9. Social Share Handle Modal */}
      <SocialShareModal
        isOpen={socialShareOpen}
        onClose={() => setSocialShareOpen(false)}
        handle={socialShareHandle}
        name={socialShareName}
        isDarkMode={isDarkMode}
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

      <AnimatePresence>
        {warningModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-amber-500/30 bg-gradient-to-br from-[#17130d] via-[#101216] to-[#0f1116] text-white shadow-2xl shadow-amber-500/10"
            >
              <div className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/40">
                    <span className="text-xl">⚠</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80">Official notice</p>
                    <h3 className="text-base font-serif font-bold text-amber-100">{warningModal.title}</h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setWarningModal((prev) => ({ ...prev, open: false }))}
                  className="rounded-full border border-amber-500/25 px-2 py-1 text-xs text-neutral-300 hover:bg-amber-500/10"
                >
                  Close
                </button>
              </div>

              <div className="space-y-4 p-5">
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm leading-relaxed text-neutral-200">
                  {warningModal.content}
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                  <span>Action required</span>
                  <span className="font-semibold text-amber-300">Read & comply</span>
                </div>
                <button
                  type="button"
                  onClick={() => setWarningModal((prev) => ({ ...prev, open: false }))}
                  className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-bold text-neutral-950 shadow-lg shadow-amber-500/20 transition hover:brightness-110"
                >
                  I understand the warning
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
