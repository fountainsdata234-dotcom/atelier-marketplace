import React from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';

interface FooterProps {
  isDarkMode: boolean;
  onNavigate?: (view: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ isDarkMode, onNavigate }) => {
  const mutedText = isDarkMode ? 'text-neutral-400' : 'text-neutral-600';
  const border = isDarkMode ? 'border-neutral-800' : 'border-neutral-200';

  return (
    <footer className={`mt-8 border-t transition-colors ${border} ${isDarkMode ? 'bg-[#0c0d10]/80 text-neutral-300' : 'bg-white/90 text-neutral-700 shadow-sm'}`}>
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Fabsattire logo" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0">
            <p className="font-display text-base font-black tracking-[0.06em] text-amber-400">Fabsattire</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-500/80">Tailor & fabric marketplace</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 sm:gap-6">
          <nav aria-label="Explore">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Explore</p>
            <ul className="space-y-1.5 text-xs">
              <li><button type="button" onClick={() => onNavigate?.('marketplace')} className="transition hover:text-amber-400">Marketplace</button></li>
              <li><button type="button" onClick={() => onNavigate?.('dashboard')} className="transition hover:text-amber-400">Tailor Studio</button></li>
              <li><button type="button" onClick={() => onNavigate?.('about')} className="transition hover:text-amber-400">About us</button></li>
            </ul>
          </nav>

          <nav aria-label="Support">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Support</p>
            <ul className="space-y-1.5 text-xs">
              <li><button type="button" onClick={() => onNavigate?.('contact')} className="transition hover:text-amber-400">Contact us</button></li>
              <li><button type="button" onClick={() => onNavigate?.('privacy')} className="transition hover:text-amber-400">Privacy</button></li>
              <li><button type="button" onClick={() => onNavigate?.('terms')} className="transition hover:text-amber-400">Terms</button></li>
            </ul>
          </nav>

          <div className="col-span-2 sm:col-span-2">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">Connect</p>
            <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 text-xs ${mutedText}`}>
              <span className="inline-flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5 shrink-0 text-amber-500" />In-app messaging</span>
              <a href="mailto:fountainsdsata234@gmail.com" className="inline-flex min-w-0 items-center gap-2 break-all transition hover:text-amber-400">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />fountainsdsata234@gmail.com
              </a>
            </div>
          </div>
        </div>

        <div className={`mt-5 border-t pt-3 text-center text-[10px] leading-relaxed ${border} text-neutral-500`}>
          © 2026 Fabsattire. Crafted for bespoke fashion and premium fabric discovery.
        </div>
      </div>
    </footer>
  );
};
