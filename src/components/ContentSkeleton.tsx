import React from 'react';

interface ContentSkeletonProps {
  isDarkMode: boolean;
}

export const ContentSkeleton: React.FC<ContentSkeletonProps> = ({ isDarkMode }) => (
  <div className={`content-loading branded-loader flex min-h-[calc(100vh-4rem)] w-full items-center justify-center px-4 ${isDarkMode ? 'text-neutral-300' : 'text-slate-700'}`} aria-busy="true" aria-label="Loading Fabsattire">
    <div className="branded-loader-content" role="status">
      <div className="branded-loader-mark" aria-hidden="true">
        <span className="branded-loader-orbit" />
        <img src="/logo-loader.webp" alt="" className="branded-loader-logo" />
        <span className="branded-loader-spark">✦</span>
      </div>
      <p className="branded-loader-title">Loading<span className="branded-loader-dots">...</span></p>
      <div className="branded-loader-progress" aria-hidden="true"><span /></div>
      <p className="branded-loader-caption"><span /> Just a moment... <span /></p>
    </div>
  </div>
);
