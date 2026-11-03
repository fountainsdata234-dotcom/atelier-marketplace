import React from 'react';
import { User, ClothPost, UserRole } from '../types';
import { useTypingText } from '../hooks/useTypingText';

interface LandingPageProps {
  onOpenAuth: (defaultRole: UserRole) => void;
  isDarkMode: boolean;
  promotedTailors: User[];
  promotedPosts: ClothPost[];
  onSelectSeller: (seller: User) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth, isDarkMode, promotedTailors, promotedPosts, onSelectSeller }) => {
  const headline = 'Find your fit. Meet your merchant.';
  const typedHeadline = useTypingText([headline], { enabled: true, typeDelayMs: 84 });

  return (
    <div>
    <section className="relative isolate flex min-h-[68vh] items-center overflow-hidden px-5 py-16 sm:min-h-[72vh] sm:px-8 sm:py-20 lg:px-12">
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 top-1/2 -z-10 h-80 w-80 -translate-y-1/2 rounded-full bg-amber-500/10 blur-3xl sm:h-[30rem] sm:w-[30rem]" />
      <div className={`grid w-full items-center gap-10 rounded-[2rem] border px-6 py-12 shadow-2xl sm:px-10 sm:py-16 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16 lg:px-16 ${isDarkMode ? 'border-white/10 bg-white/[0.03] shadow-black/20' : 'border-neutral-200 bg-white/75 shadow-neutral-900/5'}`}>
        <div className="max-w-4xl">
          <p className={`mb-5 text-xs font-semibold uppercase tracking-[0.28em] ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>
            Fabsattire · Tailoring & textiles
          </p>
          <h1 className={`min-h-[2em] overflow-visible text-5xl font-semibold leading-[0.98] tracking-[-0.065em] sm:text-6xl md:text-7xl lg:text-8xl ${isDarkMode ? 'text-white' : 'text-neutral-950'}`}>
            <span aria-hidden="true" className="typing-caret">{typedHeadline}</span>
            <span className="sr-only">{headline}</span>
          </h1>
          <p className={`mt-6 max-w-xl text-base leading-relaxed sm:text-lg ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>
            Discover skilled tailors and distinctive fabrics, all in one place.
          </p>
        </div>
        <div className="flex items-center lg:justify-end">
          <button
            type="button"
            onClick={() => onOpenAuth('buyer')}
            className={`group inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-amber-400 px-7 py-4 text-sm font-semibold text-neutral-950 shadow-lg shadow-amber-500/20 transition hover:-translate-y-0.5 hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 sm:w-auto lg:w-full ${isDarkMode ? 'focus-visible:ring-offset-neutral-950' : 'focus-visible:ring-offset-white'}`}
          >
            Get started
            <span aria-hidden="true" className="text-lg transition-transform group-hover:translate-x-1">→</span>
          </button>
        </div>
      </div>
    </section>

    {promotedTailors.length > 0 && (
      <section className="px-4 pb-12 sm:px-8 lg:px-12" aria-labelledby="featured-tailors-heading">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-500">Promoted studios</p>
            <h2 id="featured-tailors-heading" className={`mt-1 font-serif text-2xl font-bold sm:text-3xl ${isDarkMode ? 'text-white' : 'text-neutral-950'}`}>Featured Tailors</h2>
          </div>
          <span className={`hidden text-xs sm:block ${isDarkMode ? 'text-neutral-500' : 'text-neutral-500'}`}>Swipe to explore</span>
        </div>
        <div className="scrollbar-none grid snap-x snap-mandatory grid-flow-col auto-cols-[82%] gap-4 overflow-x-auto pb-4 sm:auto-cols-[42%] lg:auto-cols-[28%]">
          {promotedTailors.map((tailor) => {
            const project = promotedPosts.find(post => post.authorId === tailor.id && (post.imageUrl || post.imageAssets?.length));
            const image = project?.imageUrl || project?.imageAssets?.[0]?.url || tailor.avatarUrl;
            return (
              <button
                key={tailor.id}
                type="button"
                onClick={() => onSelectSeller(tailor)}
                className={`group snap-start overflow-hidden rounded-[1.75rem] border text-left shadow-lg transition-transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-amber-400 ${isDarkMode ? 'border-amber-500/30 bg-neutral-900' : 'border-amber-300 bg-white'}`}
              >
                <div className="relative m-2.5 overflow-hidden rounded-[1.35rem] border-2 border-amber-300/80 bg-neutral-950 p-1 shadow-[0_0_0_3px_rgba(251,191,36,0.12)]">
                  {image ? <img src={image} alt={`${tailor.shopName || tailor.name} promotion`} className="aspect-[4/3] w-full rounded-[1rem] object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" /> : <div className="aspect-[4/3] bg-gradient-to-br from-amber-400/30 to-neutral-800" />}
                  <span className="absolute right-3 top-3 rounded-full bg-amber-400 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-neutral-950 shadow-md">Promoted</span>
                </div>
                <div className="px-5 pb-5 pt-2">
                  <h3 className={`truncate font-serif text-lg font-bold ${isDarkMode ? 'text-white' : 'text-neutral-950'}`}>{tailor.shopName || tailor.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-500">{tailor.bio || 'Bespoke designer and fashion specialist'}</p>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-amber-500">{tailor.location?.city || tailor.location?.state || 'Featured tailor'}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    )}
    </div>
  );
};
