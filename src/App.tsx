import React, { useState, useEffect } from 'react';
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
import { configureFirebaseAuth, logoutFromFirebase, subscribeToFirebaseAuth, toAppUser } from './services/firebase';
import { api } from './services/api';

export default function App() {
  // Intro Loading animation state
  const [showIntro, setShowIntro] = useState<boolean>(true);

  // Theme state: default to sophisticated dark luxury aesthetic with full light toggle
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('atelier_theme_mode');
    return saved ? saved === 'dark' : true;
  });

  // Navigation View: 'landing' | 'marketplace' | 'dashboard' | 'admin' | 'messages'
  const [currentView, setCurrentView] = useState<string>('landing');

  // Application Data States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
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

    let unsubscribeFirebase: (() => void) | undefined;
    configureFirebaseAuth().then(() => {
      unsubscribeFirebase = subscribeToFirebaseAuth(async (firebaseUser) => {
        if (!firebaseUser) {
          setCurrentUser(null);
          return;
        }
        const baseUser = await toAppUser(firebaseUser);
        const savedProfile = await api.getProfile().catch(() => ({}));
        const mergedUser = {
          ...baseUser,
          ...savedProfile,
          id: firebaseUser.uid,
          email: firebaseUser.email || baseUser.email,
          role: baseUser.role === 'admin' ? 'admin' : (savedProfile.role || baseUser.role),
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

    window.addEventListener('atelier_users_updated', handleUsersUpdate);
    window.addEventListener('atelier_posts_updated', handlePostsUpdate);
    window.addEventListener('atelier_plans_updated', handlePlansUpdate);
    window.addEventListener('atelier_auth_changed', handleAuthChange);
    window.addEventListener('atelier_broadcast_received', handleBroadcastsUpdate);
    window.addEventListener('navigate_to_tab', handleNavigateTab);

    return () => {
      unsubscribeFirebase?.();
      window.removeEventListener('atelier_users_updated', handleUsersUpdate);
      window.removeEventListener('atelier_posts_updated', handlePostsUpdate);
      window.removeEventListener('atelier_plans_updated', handlePlansUpdate);
      window.removeEventListener('atelier_auth_changed', handleAuthChange);
      window.removeEventListener('atelier_broadcast_received', handleBroadcastsUpdate);
      window.removeEventListener('navigate_to_tab', handleNavigateTab);
    };
  }, []);

  const refreshAllData = async () => {
    setCurrentUser(storageService.getCurrentUser());
    try {
      const [remoteUsers, remotePosts] = await Promise.all([api.getUsers(), api.getPosts()]);
      setUsers(remoteUsers);
      setPosts(remotePosts);
    } catch (error) {
      console.error('Remote marketplace data unavailable', error);
      setUsers(storageService.getUsers());
      setPosts(storageService.getPosts());
    }
    setPromoPlans(storageService.getPromoPlans());
    setBroadcasts(storageService.getBroadcasts());
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
      />

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
        isDarkMode={isDarkMode}
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
    </div>
  );
}
