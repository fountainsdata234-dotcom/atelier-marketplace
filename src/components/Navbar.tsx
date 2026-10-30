import React, { useState } from 'react';
import { Sun, Moon, Shield, LogOut, Compass, Bookmark, Download, WifiOff, Scissors, Users, Menu, X, RefreshCw, Share2, Info, Mail, House, UserRound, Sparkles } from 'lucide-react';
import { User } from '../types';

interface NavbarProps {
  currentUser: User | null;
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  isOnline: boolean;
  canInstall: boolean;
  onInstall: () => void;
  onShare: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  currentView,
  onNavigate,
  onOpenAuth,
  onLogout,
  isDarkMode,
  onToggleTheme,
  isOnline,
  canInstall,
  onInstall,
  onShare,
  onRefresh,
  isRefreshing = false
}) => {
  const isSeller = currentUser && (currentUser.role === 'tailor' || currentUser.role === 'fabric_seller');
  const isPublicLanding = !currentUser && currentView === 'landing';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const avatarUrl = currentUser?.avatarUrl && failedAvatarUrl !== currentUser.avatarUrl ? currentUser.avatarUrl : null;
  const navigate = (view: string) => {
    onNavigate(view);
    setMobileMenuOpen(false);
  };

  return (
    <header
      className={`relative sticky top-0 z-40 w-full border-b backdrop-blur-md transition-colors ${
        isDarkMode
          ? 'bg-[#0c0d10]/90 border-neutral-800/80 text-neutral-100'
          : 'bg-white/90 border-neutral-200/80 text-neutral-900 shadow-xs'
      }`}
    >
      <div className="navbar-sunset-rays" aria-hidden="true"><span className="navbar-sunset-particles" /></div>
      <div className="relative z-10 mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-6 lg:px-8">
        {/* Brand lockup */}
        <div
          onClick={() => navigate(currentUser ? 'marketplace' : 'landing')}
          className="group flex cursor-pointer select-none items-center gap-3"
        >
          <img
            src="/logo.png"
            alt="Fabsattire logo"
            className="h-9 w-9 rounded-lg object-cover shadow-md shadow-amber-500/20 ring-1 ring-amber-500/30 transition-transform duration-200 group-hover:scale-105 sm:h-10 sm:w-10"
          />
          <div className="brand-lockup relative border-l border-amber-500/30 pl-3">
            <span className="brand-thread brand-thread-one" aria-hidden="true" />
            <span className="brand-thread brand-thread-two" aria-hidden="true" />
            <span className="brand-wordmark block whitespace-nowrap text-[14px] font-black leading-none text-amber-400 sm:text-lg">
              Fabsattire
            </span>
            <span className="mt-1 block text-[7px] font-semibold uppercase tracking-[0.12em] text-amber-600/80 sm:text-[8px]">
              TAILOR & FABRIC MARKETPLACE
            </span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1.5 text-xs font-medium">
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

          <button
            onClick={() => onNavigate('artisan')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              currentView === 'artisan'
                ? 'text-amber-400 bg-amber-500/10 font-semibold'
                : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-amber-500" />
            <span>Artisan</span>
          </button>

          {currentUser?.isSuperAdmin && <button
            onClick={() => onNavigate('lumina')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              currentView === 'lumina'
                ? 'text-amber-400 bg-amber-500/10 font-semibold'
                : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Lumina</span>
          </button>}

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

        </nav>

        {/* Right Utility Buttons */}
        <div className="hidden items-center gap-3 lg:flex">
          {!isOnline && (
            <span className="hidden items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-300 sm:flex" role="status">
              <WifiOff className="h-3 w-3" /> Offline mode
            </span>
          )}
          {canInstall && (
            <button
              onClick={onInstall}
              aria-label="Install Fabsattire app"
              title="Install app"
              className="hidden items-center gap-1.5 rounded-xl border border-amber-500/40 px-2.5 py-2 text-xs font-semibold text-amber-400 transition hover:bg-amber-500/10 sm:flex"
            >
              <Download className="h-3.5 w-3.5" /> Install
            </button>
          )}
          <button
            type="button"
            onClick={onShare}
            aria-label="Share Fabsattire"
            title="Share Fabsattire"
            className="hidden items-center gap-1.5 rounded-xl border border-neutral-700/50 px-2.5 py-2 text-xs font-semibold text-neutral-300 transition hover:border-amber-500/40 hover:text-amber-300 sm:flex"
          >
            <Share2 className="h-3.5 w-3.5" /> Share
          </button>
          <button type="button" onClick={onRefresh} disabled={isRefreshing} aria-label="Refresh marketplace" title="Refresh marketplace" className="rounded-xl border border-neutral-700/50 p-2 text-neutral-400 transition hover:border-amber-500/40 hover:text-amber-400 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
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
                  onNavigate('profile');
                }}
                className="flex items-center gap-2 py-1 px-2.5 rounded-xl border border-neutral-700/60 bg-neutral-800/40 hover:border-amber-500/40 cursor-pointer transition-colors"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" onError={() => setFailedAvatarUrl(avatarUrl)} className="w-7 h-7 rounded-full object-cover border border-amber-500/60" />
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

              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[10px] font-semibold text-red-300 transition hover:bg-red-500/20"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
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

        <button
          type="button"
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(open => !open)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-700/60 text-neutral-300 transition hover:border-amber-500/50 hover:text-amber-300 lg:hidden"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {mobileMenuOpen && (
          <div className={`absolute left-3 right-3 top-[calc(100%-1px)] z-50 rounded-2xl border p-3 shadow-2xl lg:hidden ${
            isDarkMode ? 'border-neutral-800 bg-[#111317]' : 'border-neutral-200 bg-white'
          }`}>
            {currentUser && (
              <button type="button" onClick={() => navigate('profile')} className="mb-2 flex w-full items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-left">
                {avatarUrl ? <img src={avatarUrl} alt="" onError={() => setFailedAvatarUrl(avatarUrl)} className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-300">{currentUser.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span>}
                <span className="min-w-0"><strong className="block truncate text-sm">{currentUser.name}</strong><small className="block text-[10px] capitalize text-amber-400">{currentUser.isSuperAdmin ? 'Super Admin' : currentUser.role.replace('_', ' ')}</small></span>
              </button>
            )}
            {isPublicLanding ? (
              <div className="mobile-nav-grid grid grid-cols-2 gap-2 text-xs">
                <button type="button" onClick={() => navigate('landing')} className="mobile-nav-item"><House className="h-4 w-4" />Overview</button>
                <button type="button" onClick={() => navigate('marketplace')} className="mobile-nav-item"><Compass className="h-4 w-4" />Marketplace</button>
                <button type="button" onClick={() => navigate('artisan')} className="mobile-nav-item"><Users className="h-4 w-4" />Artisans</button>
                {currentUser?.isSuperAdmin && <button type="button" onClick={() => navigate('lumina')} className="mobile-nav-item"><Sparkles className="h-4 w-4" />Lumina</button>}
                <button type="button" onClick={() => navigate('about')} className="mobile-nav-item"><Info className="h-4 w-4" />About</button>
                <button type="button" onClick={() => navigate('contact')} className="mobile-nav-item"><Mail className="h-4 w-4" />Contact</button>
                <button type="button" onClick={() => { setMobileMenuOpen(false); onOpenAuth(); }} className="mobile-nav-item text-amber-300"><UserRound className="h-4 w-4" />Sign in</button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="mobile-nav-grid grid grid-cols-2 gap-2 text-xs">
                  {!currentUser && <button type="button" onClick={() => navigate('landing')} className="mobile-nav-item"><House className="h-4 w-4" />Overview</button>}
                  <button type="button" onClick={() => navigate('marketplace')} className="mobile-nav-item"><Compass className="h-4 w-4" />Marketplace</button>
                  <button type="button" onClick={() => navigate('artisan')} className="mobile-nav-item"><Users className="h-4 w-4" />Artisans</button>
                  {currentUser?.isSuperAdmin && <button type="button" onClick={() => navigate('lumina')} className="mobile-nav-item"><Sparkles className="h-4 w-4" />Lumina</button>}
                  {currentUser && <button type="button" onClick={() => navigate('collections')} className="mobile-nav-item"><Bookmark className="h-4 w-4" />{isSeller ? 'Collection' : 'Saved'}</button>}
                  {isSeller && <button type="button" onClick={() => navigate('dashboard')} className="mobile-nav-item"><Scissors className="h-4 w-4" />Studio</button>}
                  {(currentUser?.role === 'admin' || currentUser?.isSuperAdmin) && <button type="button" onClick={() => navigate('admin')} className="mobile-nav-item"><Shield className="h-4 w-4" />Admin</button>}
                </div>
                <div className="mobile-nav-actions grid grid-cols-2 gap-2 border-t border-neutral-800 pt-2">
                  <button type="button" onClick={() => { setMobileMenuOpen(false); onRefresh(); }} disabled={isRefreshing} className="mobile-nav-item"><RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />Refresh</button>
                  <button type="button" onClick={onToggleTheme} className="mobile-nav-item">{isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}Theme</button>
                  <button type="button" onClick={() => { setMobileMenuOpen(false); onShare(); }} className="mobile-nav-item"><Share2 className="h-4 w-4" />Share</button>
                  {currentUser ? <button type="button" onClick={() => { setMobileMenuOpen(false); onLogout(); }} className="mobile-nav-item text-red-300"><LogOut className="h-4 w-4" />Logout</button> : <button type="button" onClick={() => { setMobileMenuOpen(false); onOpenAuth(); }} className="mobile-nav-item text-amber-300"><UserRound className="h-4 w-4" />Sign in</button>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
