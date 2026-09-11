import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Copy, Check, Share2, Phone } from 'lucide-react';

interface SocialShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  handle: string;
  name: string;
  isDarkMode: boolean;
}

export const SocialShareModal: React.FC<SocialShareModalProps> = ({
  isOpen,
  onClose,
  handle,
  name,
  isDarkMode
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const profileUrl = window.location.origin;
  const shareText = `Explore master bespoke designs and couture creations by ${name} (${handle}) on Atelier Marketplace: ${profileUrl}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const shareToWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  };

  const shareToTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, '_blank');
  };

  const shareToFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileUrl)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`relative w-full max-w-md rounded-3xl border shadow-2xl p-6 transition-colors ${
          isDarkMode ? 'bg-[#121316] border-neutral-800 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-neutral-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-3">
            <Share2 className="w-6 h-6" />
          </div>
          <h3 className="font-serif font-bold text-xl">Share Atelier Handle</h3>
          <p className="text-xs text-neutral-400 mt-1 font-mono">{handle}</p>
        </div>

        {/* Copy Link Field */}
        <div className="mb-6">
          <label className="block text-[11px] text-neutral-400 mb-1.5 font-mono">Public Profile Link</label>
          <div className="flex items-center gap-2 p-1.5 rounded-xl border border-neutral-700 bg-neutral-800/40">
            <input
              type="text"
              readOnly
              value={`${profileUrl}/#${handle.replace('@', '')}`}
              className="flex-1 bg-transparent px-2 text-xs text-neutral-300 font-mono focus:outline-none"
            />
            <button
              onClick={handleCopyLink}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-neutral-950 hover:bg-amber-400 flex items-center gap-1.5 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Direct Social Networks Grid */}
        <div className="space-y-2">
          <button
            onClick={shareToWhatsApp}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Phone className="w-4 h-4" />
            <span>Share via WhatsApp Status & Chat</span>
          </button>

          <button
            onClick={shareToTwitter}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Post to X (Twitter)</span>
          </button>

          <button
            onClick={shareToFacebook}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Share to Facebook</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
