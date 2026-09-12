import React from 'react';
import { Sun, Moon, MessageSquare, Shield, LogOut, Compass, Bookmark } from 'lucide-react';
import { User } from '../types';

interface NavbarProps {
  currentUser: User | null;
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  unreadCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  currentView,
  onNavigate,
  onOpenAuth,
  onLogout,
  isDarkMode,
  onToggleTheme,
  unreadCount = 0
}) => {
  const isSeller = currentUser && (currentUser.role === 'tailor' || currentUser.role === 'fabric_seller');

  return (
    <header
      className={`sticky top-0 z-40 w-full border-b backdrop-blur-md transition-colors ${
        isDarkMode
          ? 'bg-[#0c0d10]/90 border-neutral-800/80 text-neutral-100'
          : 'bg-white/90 border-neutral-200/80 text-neutral-900 shadow-xs'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div
          onClick={() => onNavigate(currentUser ? 'marketplace' : 'landing')}
          className="flex items-center gap-2.5 cursor-pointer group select-none"
        >
          <img
            src="/logo.png"
            alt="Fabrilux Atelier logo"
            className="h-10 w-10 rounded-xl object-cover shadow-md shadow-amber-500/20 ring-1 ring-white/40 transition-transform duration-200 group-hover:scale-105"
          />
          <div>
            <span className="font-display text-lg sm:text-xl tracking-[0.14em] block leading-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-600 via-orange-500 to-yellow-400 font-black">
              FABRILUX
            </span>
            <span className="text-[9px] uppercase tracking-[0.28em] text-amber-600/80 font-medium block">
              Atelier
            </span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1.5 text-xs font-medium">
          {!currentUser && (
            <button
              onClick={() => onNavigate('landing')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                currentView === 'landing'
                  ? 'text-amber-400 bg-amber-500/10'
                  : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              Overview
            </button>
          )}

          <button
            onClick={() => onNavigate('marketplace')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              currentView === 'marketplace'
                ? 'text-amber-400 bg-amber-500/10 font-semibold'
                : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-amber-500" />
            <span>Marketplace</span>
          </button>

          {currentUser && !isSeller && (
            <button
              onClick={() => onNavigate('collections')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                currentView === 'collections'
                  ? 'text-amber-400 bg-amber-500/10 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5 text-amber-500" />
              <span>Saved</span>
            </button>
          )}

          {currentUser && isSeller && (
            <button
              onClick={() => onNavigate('collections')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                currentView === 'collections'
                  ? 'text-amber-400 bg-amber-500/10 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5 text-amber-500" />
              <span>Collection</span>
            </button>
          )}

          {currentUser && (currentUser.role === 'tailor' || currentUser.role === 'fabric_seller') && (
            <button
              onClick={() => onNavigate('dashboard')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                currentView === 'dashboard'
                  ? 'text-amber-400 bg-amber-500/10 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              <Scissors className="w-3.5 h-3.5 text-amber-500" />
              <span>Seller Studio</span>
            </button>
          )}

          {(currentUser?.role === 'admin' || currentUser?.isSuperAdmin) && (
            <button
              onClick={() => onNavigate('admin')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                currentView === 'admin'
                  ? 'text-amber-400 bg-amber-500/10 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Admin Portal {currentUser.isSuperAdmin && '(Super)'}</span>
            </button>
          )}

          {currentUser && (
            <button
              onClick={() => onNavigate('messages')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer relative flex items-center gap-1.5 ${
                currentView === 'messages'
                  ? 'text-amber-400 bg-amber-500/10 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Messages</span>
              {unreadCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-neutral-950 font-bold text-[9px] flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          )}
        </nav>

        {/* Right Utility Buttons */}
        <div className="flex items-center gap-3">
          {/* Dark/Light Mode Toggle */}
          <button
            onClick={onToggleTheme}
            aria-label="Toggle dark/light mode"
            className="p-2 rounded-xl border border-neutral-700/50 hover:border-amber-500/40 text-neutral-400 hover:text-amber-400 transition-all cursor-pointer"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* User Auth or Profile */}
          {currentUser ? (
            <div className="flex items-center gap-2">
              <div
                onClick={() => {
                  if (currentUser.role === 'admin') onNavigate('admin');
                  else if (currentUser.role === 'tailor' || currentUser.role === 'fabric_seller') onNavigate('dashboard');
                  else onNavigate('marketplace');
                }}
                className="flex items-center gap-2 py-1 px-2.5 rounded-xl border border-neutral-700/60 bg-neutral-800/40 hover:border-amber-500/40 cursor-pointer transition-colors"
              >
                {currentUser.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover border border-amber-500/60" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-bold text-xs">
                    {currentUser.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()}
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <span className="block text-xs font-semibold leading-tight line-clamp-1">
                    {currentUser.name}
                  </span>
                  <span className="text-[10px] text-amber-400 capitalize block font-mono">
                    {currentUser.isSuperAdmin ? 'Super Admin' : currentUser.role.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:shadow-md hover:shadow-amber-500/20 transition-all cursor-pointer"
            >
              Sign In / Register
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
