import React from 'react';
import { MessageSquare, Scissors, Sparkles } from 'lucide-react';

interface FooterProps {
  isDarkMode: boolean;
}

export const Footer: React.FC<FooterProps> = ({ isDarkMode }) => {
  return (
    <footer
      className={`mt-8 border-t transition-colors ${
        isDarkMode
          ? 'border-neutral-800 bg-[#0c0d10]/80 text-neutral-300'
          : 'border-neutral-200 bg-white/90 text-neutral-700 shadow-sm'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr_0.8fr_1.2fr]">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-neutral-950 shadow-lg shadow-amber-500/20">
                <Scissors className="h-5 w-5 stroke-[2.2]" />
              </div>
              <div>
                <p className="font-serif text-xl font-bold tracking-tight text-amber-400">ATELIER</p>
                <p className="text-[10px] uppercase tracking-[0.25em] text-amber-500/80">Bespoke Marketplace</p>
              </div>
            </div>
            <p className={`mt-4 max-w-sm text-sm leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              A global network for fine tailors, fabric merchants, and clients seeking premium bespoke craftsmanship.
            </p>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Explore</p>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="transition hover:text-amber-400">Marketplace</a></li>
              <li><a href="#" className="transition hover:text-amber-400">Tailor Studio</a></li>
              <li><a href="#" className="transition hover:text-amber-400">Fabric Sellers</a></li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Support</p>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="transition hover:text-amber-400">Help Center</a></li>
              <li><a href="#" className="transition hover:text-amber-400">Privacy</a></li>
              <li><a href="#" className="transition hover:text-amber-400">Terms</a></li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Connect</p>
            <div className="space-y-3 text-sm">
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

        <div className={`mt-8 border-t pt-5 text-center text-xs ${isDarkMode ? 'border-neutral-800 text-neutral-500' : 'border-neutral-200 text-neutral-500'}`}>
          © 2026 Atelier Marketplace. Crafted for bespoke fashion and premium fabric discovery.
        </div>
      </div>
    </footer>
  );
};
