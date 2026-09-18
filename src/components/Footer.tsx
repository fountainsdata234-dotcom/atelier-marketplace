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
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="grid grid-cols-3 items-start gap-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_1.2fr] md:gap-8">
          <div className="col-span-3 flex min-w-0 items-center gap-3 md:col-span-1 md:block">
            <div className="flex shrink-0 items-center gap-2.5">
              <img src="/logo.png" alt="Fabrilux Atelier logo" className="h-9 w-9 rounded-xl object-cover shadow-lg shadow-amber-500/20 md:h-11 md:w-11 md:rounded-2xl" />
              <div><p className="font-display text-xl font-black tracking-[0.14em] text-amber-400">FABRILUX</p><p className="text-[10px] uppercase tracking-[0.25em] text-amber-500/80">Atelier</p></div>
            </div>
            <p className={`hidden max-w-sm text-sm leading-relaxed md:mt-3 md:block ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              A global network for fine tailors, fabric merchants, and clients seeking premium bespoke craftsmanship.
            </p>
          </div>

          <div className="min-w-0 md:flex-none">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400 md:mb-2 md:text-xs md:tracking-[0.2em]">Explore</p>
            <ul className="space-y-1 text-[11px] md:space-y-1.5 md:text-sm">
              <li><button type="button" onClick={() => onNavigate?.('marketplace')} className="transition hover:text-amber-400">Marketplace</button></li>
              <li><button type="button" onClick={() => onNavigate?.('dashboard')} className="transition hover:text-amber-400">Tailor Studio</button></li>
              <li><button type="button" onClick={() => onNavigate?.('about')} className="transition hover:text-amber-400">About us</button></li>
            </ul>
          </div>

          <div className="min-w-0 md:flex-none">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400 md:mb-2 md:text-xs md:tracking-[0.2em]">Support</p>
            <ul className="space-y-1 text-[11px] md:space-y-1.5 md:text-sm">
              <li><button type="button" onClick={() => onNavigate?.('privacy')} className="transition hover:text-amber-400">Privacy</button></li>
              <li><button type="button" onClick={() => onNavigate?.('terms')} className="transition hover:text-amber-400">Terms</button></li>
            </ul>
          </div>

          <div className="min-w-0 md:flex-none">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400 md:mb-2 md:text-xs md:tracking-[0.2em]">Connect</p>
            <div className="space-y-1 text-[10px] md:space-y-2 md:text-sm">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-amber-500 md:h-4 md:w-4" />
                <span>In-app messaging</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500 md:h-4 md:w-4" />
                <span>Promoted atelier visibility</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`mt-4 border-t pt-3 text-center text-[10px] leading-relaxed md:mt-6 md:pt-4 md:text-xs ${isDarkMode ? 'border-neutral-800 text-neutral-500' : 'border-neutral-200 text-neutral-500'}`}>
          © 2026 Fabrilux Atelier. Crafted for bespoke fashion and premium fabric discovery.
        </div>
      </div>
    </footer>
  );
};
