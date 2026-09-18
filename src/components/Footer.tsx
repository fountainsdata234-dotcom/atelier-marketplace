import React from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';

interface FooterProps {
  isDarkMode: boolean;
  onNavigate?: (view: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ isDarkMode, onNavigate }) => {
  return (
    <footer
      className={`mt-8 border-t transition-colors ${
        isDarkMode
          ? 'border-neutral-800 bg-[#0c0d10]/80 text-neutral-300'
          : 'border-neutral-200 bg-white/90 text-neutral-700 shadow-sm'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 items-start gap-5 md:grid-cols-[1.2fr_0.8fr_0.8fr_1.2fr] md:gap-8">
          <div className="col-span-2 w-full md:col-span-1 md:w-auto">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Fabrilux Atelier logo" className="h-11 w-11 rounded-2xl object-cover shadow-lg shadow-amber-500/20" />
              <div><p className="font-display text-xl font-black tracking-[0.14em] text-amber-400">FABRILUX</p><p className="text-[10px] uppercase tracking-[0.25em] text-amber-500/80">Atelier</p></div>
            </div>
            <p className={`mt-3 max-w-sm text-sm leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              A global network for fine tailors, fabric merchants, and clients seeking premium bespoke craftsmanship.
            </p>
          </div>

          <div className="min-w-0 md:flex-none">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Explore</p>
            <ul className="space-y-1.5 text-sm">
              <li><button type="button" onClick={() => onNavigate?.('marketplace')} className="transition hover:text-amber-400">Marketplace</button></li>
              <li><button type="button" onClick={() => onNavigate?.('dashboard')} className="transition hover:text-amber-400">Tailor Studio</button></li>
              <li><button type="button" onClick={() => onNavigate?.('about')} className="transition hover:text-amber-400">About us</button></li>
            </ul>
          </div>

          <div className="min-w-0 md:flex-none">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Support</p>
            <ul className="space-y-1.5 text-sm">
              <li><button type="button" onClick={() => onNavigate?.('privacy')} className="transition hover:text-amber-400">Privacy</button></li>
              <li><button type="button" onClick={() => onNavigate?.('terms')} className="transition hover:text-amber-400">Terms</button></li>
            </ul>
          </div>

          <div className="min-w-0 md:flex-none">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Connect</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-amber-500" />
                <span>In-app messaging</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span>Promoted atelier visibility</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`mt-6 border-t pt-4 text-center text-xs ${isDarkMode ? 'border-neutral-800 text-neutral-500' : 'border-neutral-200 text-neutral-500'}`}>
          © 2026 Fabrilux Atelier. Crafted for bespoke fashion and premium fabric discovery.
        </div>
      </div>
    </footer>
  );
};
