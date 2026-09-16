import React, { useState } from 'react';
import { Home, Compass, MessageSquare, User as UserIcon, Shield, Scissors, Bookmark, Menu, X, LogIn, LogOut, Download } from 'lucide-react';
import { User } from '../types';

interface MobileBottomNavProps {
  currentUser: User | null;
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenAuth: () => void;
  onLogout?: () => void;
  isDarkMode: boolean;
  unreadCount?: number;
  canInstall?: boolean;
  onInstall?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentUser,
  currentView,
  onNavigate,
  onOpenAuth,
  onLogout,
  isDarkMode,
  unreadCount = 0,
  canInstall = false,
  onInstall
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const primaryActionIsActive = (targetView: string) => currentView === targetView;

  const studioLabel = currentUser?.role === 'admin' ? 'Admin' : 'Studio';
  const studioView = currentUser?.role === 'admin' ? 'admin' : 'dashboard';

  const handlePrimaryNavigate = (view: string) => {
    setMenuOpen(false);
    onNavigate(view);
  };

  return (
    <>
      <div
        className={`md:hidden fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-xl px-2 py-1.5 transition-colors ${
          isDarkMode
            ? 'bg-[#0c0d10]/95 border-neutral-800 text-neutral-300'
            : 'bg-white/95 border-neutral-200 text-neutral-700 shadow-lg'
        }`}
      >
        <div className="mx-auto max-w-md">
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => handlePrimaryNavigate(currentUser ? 'marketplace' : 'landing')}
              className={`flex flex-col items-center gap-0.5 rounded-xl p-2 transition-all ${
                primaryActionIsActive(currentUser ? 'marketplace' : 'landing') ? 'text-amber-400 bg-amber-500/10' : 'text-neutral-400'
              }`}
            >
              <Compass className="w-5 h-5" />
              <span className="text-[10px] font-medium">{currentUser ? 'Explore' : 'Home'}</span>
            </button>

            {currentUser && (currentUser.role === 'tailor' || currentUser.role === 'fabric_seller' || currentUser.role === 'admin') ? (
              <button
                onClick={() => handlePrimaryNavigate(studioView)}
                className={`flex flex-col items-center gap-0.5 rounded-xl p-2 transition-all ${
                  primaryActionIsActive(studioView) ? 'text-amber-400 bg-amber-500/10' : 'text-neutral-400'
                }`}
              >
                {currentUser.role === 'admin' ? <Shield className="w-5 h-5" /> : <Scissors className="w-5 h-5" />}
                <span className="text-[10px] font-medium">{studioLabel}</span>
              </button>
            ) : (
              <button
                onClick={() => onOpenAuth()}
                className="flex flex-col items-center gap-0.5 rounded-xl p-2 text-neutral-400 transition-all"
              >
                <LogIn className="w-5 h-5 text-amber-500" />
                <span className="text-[10px] font-medium">Join</span>
              </button>
            )}

            <button
              onClick={() => setMenuOpen(prev => !prev)}
              className={`flex flex-col items-center gap-0.5 rounded-xl p-2 transition-all ${
                menuOpen ? 'text-amber-400 bg-amber-500/10' : 'text-neutral-400'
              }`}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              <span className="text-[10px] font-medium">More</span>
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden fixed inset-x-0 bottom-16 z-50 px-4">
          <div
            className={`mx-auto max-w-md rounded-2xl border p-2 shadow-2xl backdrop-blur-xl ${
              isDarkMode
                ? 'bg-[#111316]/95 border-neutral-700 text-neutral-100'
                : 'bg-white/95 border-neutral-200 text-neutral-900'
            }`}
          >
            <div className="space-y-1.5">
              {canInstall && onInstall && (
                <button onClick={() => { setMenuOpen(false); onInstall(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-amber-400 hover:bg-amber-500/10">
                  <Download className="h-4 w-4" /> Install Fabrilux app
                </button>
              )}
              {currentUser ? (
                <>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate('messages');
                    }}
                    className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                      currentView === 'messages' ? 'bg-amber-500/10 text-amber-400' : 'text-neutral-300 hover:bg-neutral-800/60'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Messages
                    </span>
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-neutral-950">
                        {unreadCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate('collections');
                    }}
                    className={`w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                      currentView === 'collections' ? 'bg-amber-500/10 text-amber-400' : 'text-neutral-300 hover:bg-neutral-800/60'
                    }`}
                  >
                    <Bookmark className="w-4 h-4" />
                    {currentUser.role === 'tailor' || currentUser.role === 'fabric_seller' ? 'Collection' : 'Saved'}
                  </button>

                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate('profile');
                    }}
                    className={`w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                      currentView === 'profile'
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'text-neutral-300 hover:bg-neutral-800/60'
                    }`}
                  >
                    <UserIcon className="w-4 h-4" />
                    Profile
                  </button>

                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate('marketplace');
                      onLogout?.();
                    }}
                    className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-red-300 hover:bg-red-500/10"
                  >
                    <LogOut className="w-4 h-4" />
                    Log out
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenAuth();
                  }}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-neutral-300 hover:bg-neutral-800/60"
                >
                  <LogIn className="w-4 h-4 text-amber-400" />
                  Sign In / Register
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
