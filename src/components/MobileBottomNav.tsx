import React from 'react';
import { Compass, MessageSquare, User as UserIcon, Shield, Scissors, LogIn, Users, Info } from 'lucide-react';
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
  const primaryActionIsActive = (targetView: string) => currentView === targetView;

  const studioLabel = currentUser?.role === 'admin' ? 'Admin' : 'Studio';
  const studioView = currentUser?.role === 'admin' ? 'admin' : 'dashboard';
  const handleNavigate = (view: string) => onNavigate(view);

  return (
    <>
      <div
          className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-xl px-2 py-1.5 transition-colors ${
          isDarkMode
            ? 'bg-[#0c0d10]/95 border-neutral-800 text-neutral-300'
            : 'bg-white/95 border-neutral-200 text-neutral-700 shadow-lg'
        }`}
      >
        <div className="mx-auto max-w-md">
          <div className="grid grid-cols-4 gap-1.5">
            <button
              onClick={() => handleNavigate(currentUser ? 'marketplace' : 'landing')}
              className={`flex flex-col items-center gap-0.5 rounded-xl p-2 transition-all ${
                primaryActionIsActive(currentUser ? 'marketplace' : 'landing') ? 'text-amber-400 bg-amber-500/10' : 'text-neutral-400'
              }`}
            >
              <Compass className="w-5 h-5" />
              <span className="text-[10px] font-medium">{currentUser ? 'Explore' : 'Home'}</span>
            </button>

            {currentUser && (currentUser.role === 'tailor' || currentUser.role === 'fabric_seller' || currentUser.role === 'admin') ? (
              <button
                onClick={() => handleNavigate(studioView)}
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
              onClick={() => handleNavigate(currentUser ? 'messages' : 'artisan')}
              className={`flex flex-col items-center gap-0.5 rounded-xl p-2 transition-all ${
                primaryActionIsActive(currentUser ? 'messages' : 'artisan') ? 'text-amber-400 bg-amber-500/10' : 'text-neutral-400'
              }`}
            >
              {currentUser ? <MessageSquare className="w-5 h-5" /> : <Users className="w-5 h-5" />}
              <span className="text-[10px] font-medium">{currentUser ? 'Messages' : 'Artisans'}</span>
            </button>

            <button
              onClick={() => handleNavigate(currentUser ? 'profile' : 'about')}
              className={`flex flex-col items-center gap-0.5 rounded-xl p-2 transition-all ${
                primaryActionIsActive(currentUser ? 'profile' : 'about') ? 'text-amber-400 bg-amber-500/10' : 'text-neutral-400'
              }`}
            >
              {currentUser ? <UserIcon className="w-5 h-5" /> : <Info className="w-5 h-5" />}
              <span className="text-[10px] font-medium">{currentUser ? 'Profile' : 'About'}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
