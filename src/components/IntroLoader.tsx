import React, { useEffect } from 'react';
import { motion } from 'motion/react';

interface IntroLoaderProps {
  onComplete: () => void;
  isDarkMode: boolean;
}

export const IntroLoader: React.FC<IntroLoaderProps> = ({ onComplete, isDarkMode }) => {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      sessionStorage.setItem('fabsattire_intro_seen', '1');
      onComplete();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="branded-loader fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      role="status"
      aria-label="Opening Fabsattire"
    >
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
    </motion.div>
  );
};
