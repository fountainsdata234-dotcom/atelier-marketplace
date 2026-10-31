import React from 'react';

interface ContentSkeletonProps {
  isDarkMode: boolean;
}

export const ContentSkeleton: React.FC<ContentSkeletonProps> = ({ isDarkMode }) => (
  <div className={`content-loading flex min-h-[calc(100vh-4rem)] w-full items-center justify-center px-4 ${isDarkMode ? 'text-neutral-300' : 'text-slate-700'}`} aria-busy="true" aria-label="Loading Fabsattire">
    <div className="text-center" role="status">
      <div className="flex items-center justify-center" aria-hidden="true">
        {'FABSATTIRE'.split('').map((letter, index) => (
          <span key={`${letter}-${index}`} className="fab-loader-letter font-serif text-[clamp(1.45rem,8vw,3rem)] font-bold text-amber-400" style={{ animationDelay: `${index * 55}ms`, ['--fab-loader-index' as string]: index }}>{letter}</span>
        ))}
      </div>
      <div className="mx-auto mt-3 h-px w-28 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-500">Preparing your marketplace</p>
    </div>
  </div>
);
