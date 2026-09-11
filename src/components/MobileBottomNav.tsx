import React from 'react';
import { Home, Compass, PlusCircle, MessageSquare, User as UserIcon, Shield, Scissors, Bookmark } from 'lucide-react';
import { User } from '../types';

interface MobileBottomNavProps {
  currentUser: User | null;
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenAuth: () => void;
  isDarkMode: boolean;
  unreadCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentUser,
  currentView,
  onNavigate,
  onOpenAuth,
  isDarkMode,
  unreadCount = 0
}) => {
  return (
    <div
      className={`md:hidden fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-xl px-2 py-1.5 transition-colors ${
        isDarkMode
          ? 'bg-[#0c0d10]/95 border-neutral-800 text-neutral-300'
          : 'bg-white/95 border-neutral-200 text-neutral-700 shadow-lg'
      }`}
    >
      <div className="flex items-center justify-around">
        {/* Home */}
        <button
          onClick={() => onNavigate('landing')}
          className={`flex flex-col items-center gap-0.5 p-2 rounded-xl transition-colors ${
            currentView === 'landing' ? 'text-amber-400 font-semibold' : 'text-neutral-400'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px]">Home</span>
        </button>

        {/* Marketplace */}
        <button
          onClick={() => onNavigate('marketplace')}
          className={`flex flex-col items-center gap-0.5 p-2 rounded-xl transition-colors ${
            currentView === 'marketplace' ? 'text-amber-400 font-semibold' : 'text-neutral-400'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span className="text-[10px]">Market</span>
        </button>

        {/* Collection */}
        <button
          onClick={() => onNavigate('collections')}
          className={`flex flex-col items-center gap-0.5 p-2 rounded-xl transition-colors ${
            currentView === 'collections' ? 'text-amber-400 font-semibold' : 'text-neutral-400'
          }`}
        >
          <Bookmark className="w-5 h-5" />
          <span className="text-[10px]">Collection</span>
        </button>

        {/* Post / Studio Action */}
        {currentUser && (currentUser.role === 'tailor' || currentUser.role === 'fabric_seller') ? (
          <button
            onClick={() => onNavigate('dashboard')}
            className="flex flex-col items-center -mt-4"
          >
            <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-neutral-950 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <Scissors className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-[10px] font-semibold text-amber-400 mt-0.5">Studio</span>
          </button>
        ) : currentUser?.role === 'admin' ? (
          <button
            onClick={() => onNavigate('admin')}
            className="flex flex-col items-center -mt-4"
          >
            <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-neutral-950 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <Shield className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-[10px] font-semibold text-amber-400 mt-0.5">Admin</span>
          </button>
        ) : (
          <button
            onClick={() => onNavigate('marketplace')}
            className="flex flex-col items-center gap-0.5 p-2 rounded-xl text-neutral-400"
          >
            <PlusCircle className="w-5 h-5 text-amber-500" />
            <span className="text-[10px]">Explore</span>
          </button>
        )}

        {/* Messages */}
        <button
          onClick={() => {
            if (!currentUser) onOpenAuth();
            else onNavigate('messages');
          }}
          className={`flex flex-col items-center gap-0.5 p-2 rounded-xl relative transition-colors ${
            currentView === 'messages' ? 'text-amber-400 font-semibold' : 'text-neutral-400'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-2 w-3.5 h-3.5 bg-amber-500 text-neutral-950 text-[8px] font-bold rounded-full flex items-center justify-center">
              {unreadCount}
            </span>
          )}
          <span className="text-[10px]">Chat</span>
        </button>

        {/* Profile / Auth */}
        <button
          onClick={() => {
            if (!currentUser) {
              onOpenAuth();
            } else if (currentUser.role === 'admin') {
              onNavigate('admin');
            } else if (currentUser.role === 'tailor' || currentUser.role === 'fabric_seller') {
              onNavigate('dashboard');
            } else {
              onNavigate('marketplace');
            }
          }}
          className={`flex flex-col items-center gap-0.5 p-2 rounded-xl transition-colors ${
            currentView === 'admin' || currentView === 'dashboard' ? 'text-amber-400 font-semibold' : 'text-neutral-400'
          }`}
        >
          <UserIcon className="w-5 h-5" />
          <span className="text-[10px]">{currentUser ? 'Account' : 'Join'}</span>
        </button>
      </div>
    </div>
  );
};
