import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X, Shield } from 'lucide-react';
import { BroadcastMessage, User } from '../types';

interface BroadcastBannerProps {
  broadcasts: BroadcastMessage[];
  currentUser: User | null;
  isDarkMode: boolean;
}

export const BroadcastBanner: React.FC<BroadcastBannerProps> = ({
  broadcasts,
  currentUser,
  isDarkMode
}) => {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  // Find latest broadcast relevant to current user
  const relevantBroadcast = broadcasts.find((b) => {
    if (dismissedIds.includes(b.id)) return false;
    if (b.target === 'all') return true;
    if (!currentUser) return b.target === 'buyers';
    if (b.target === 'sellers' && (currentUser.role === 'tailor' || currentUser.role === 'fabric_seller')) return true;
    if (b.target === 'buyers' && currentUser.role === 'buyer') return true;
    return false;
  });

  if (!relevantBroadcast) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="w-full bg-gradient-to-r from-amber-600/90 via-amber-500/90 to-amber-600/90 text-neutral-950 px-4 py-2 text-xs relative z-30 font-medium shadow-md"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <span className="p-1 rounded-md bg-neutral-950/20 text-neutral-950 shrink-0">
              <Bell className="w-3.5 h-3.5" />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2 truncate">
              <strong className="font-bold tracking-tight">
                [Admin Notice] {relevantBroadcast.title}:
              </strong>
              <span className="opacity-90 font-light truncate">
                {relevantBroadcast.body}
              </span>
            </div>
          </div>

          <button
            onClick={() => setDismissedIds(prev => [...prev, relevantBroadcast.id])}
            className="p-1 rounded-md hover:bg-neutral-950/10 text-neutral-950 transition-colors shrink-0"
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
