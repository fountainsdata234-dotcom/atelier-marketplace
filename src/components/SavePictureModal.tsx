import React from 'react';
import { motion } from 'motion/react';
import { X, Download, Bookmark, Check } from 'lucide-react';

interface SavePictureModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  imageTitle: string | null;
  isDarkMode: boolean;
}

export const SavePictureModal: React.FC<SavePictureModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  imageTitle,
  isDarkMode
}) => {
  if (!isOpen || !imageUrl) return null;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `${(imageTitle || 'atelier_garment').toLowerCase().replace(/\s+/g, '_')}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative max-w-3xl w-full max-h-[90vh] flex flex-col rounded-3xl overflow-hidden bg-neutral-950 border border-neutral-800 shadow-2xl"
      >
        {/* Header */}
        <div className="p-4 border-b border-neutral-800/80 flex items-center justify-between bg-neutral-900/60 text-white">
          <div>
            <h3 className="font-serif font-bold text-base line-clamp-1">{imageTitle || 'Bespoke Garment Inspiration'}</h3>
            <span className="text-[10px] text-amber-400 font-mono">High Resolution Couture Asset</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* High-Res Image View */}
        <div className="flex-1 overflow-auto bg-neutral-900 flex items-center justify-center p-2 sm:p-4">
          <img
            src={imageUrl}
            alt={imageTitle || 'Garment'}
            className="max-h-[65vh] w-auto object-contain rounded-xl shadow-lg"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-900/60 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-emerald-400">
            <Check className="w-4 h-4" />
            <span>Saved to your personal inspiration collection</span>
          </div>

          <button
            onClick={handleDownload}
            className="px-5 py-2.5 rounded-xl font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:shadow-lg hover:shadow-amber-500/20 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download Picture to Device</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
