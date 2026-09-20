import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Download, ZoomIn, ZoomOut, RotateCcw, Check } from 'lucide-react';

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
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number; position: { x: number; y: number } } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [isOpen, imageUrl]);

  if (!isOpen || !imageUrl) return null;

  const updateScale = (nextScale: number) => {
    const boundedScale = Math.min(4, Math.max(1, nextScale));
    setScale(boundedScale);
    if (boundedScale === 1) setPosition({ x: 0, y: 0 });
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    updateScale(scale + (event.deltaY < 0 ? 0.25 : -0.25));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (scale === 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, y: event.clientY, position };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    setPosition({
      x: dragStart.current.position.x + event.clientX - dragStart.current.x,
      y: dragStart.current.position.y + event.clientY - dragStart.current.y,
    });
  };

  const handlePointerUp = () => {
    dragStart.current = null;
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `${(imageTitle || 'atelier_garment').toLowerCase().replace(/\s+/g, '_')}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2 backdrop-blur-md sm:p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 shadow-2xl"
      >
        {/* Header */}
        <div className="p-4 border-b border-neutral-800/80 flex items-center justify-between bg-neutral-900/60 text-white">
          <div>
            <h3 className="font-serif font-bold text-base line-clamp-1">{imageTitle || 'Bespoke Garment Inspiration'}</h3>
            <span className="text-[10px] text-amber-400 font-mono">High Resolution Couture Asset</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close image viewer" title="Close image viewer" className="rounded-full p-2 text-neutral-400 transition-colors hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className={`relative flex min-h-[55vh] flex-1 items-center justify-center overflow-hidden bg-neutral-900 p-2 sm:min-h-[65vh] sm:p-4 ${scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={() => updateScale(scale === 1 ? 2 : 1)}
          role="application"
          aria-label="Zoomable image viewer"
        >
          <img
            src={imageUrl}
            alt={imageTitle || 'Garment'}
            className="max-h-full max-w-full select-none rounded-xl object-contain shadow-lg transition-transform duration-150"
            style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
            referrerPolicy="no-referrer"
            draggable={false}
          />
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/65 p-1 text-white backdrop-blur-md">
            <button type="button" onClick={() => updateScale(scale - 0.25)} aria-label="Zoom out" title="Zoom out" className="rounded-full p-2 transition hover:bg-white/15 disabled:opacity-40" disabled={scale === 1}><ZoomOut className="h-4 w-4" /></button>
            <span className="min-w-12 text-center text-[10px] font-semibold">{Math.round(scale * 100)}%</span>
            <button type="button" onClick={() => updateScale(scale + 0.25)} aria-label="Zoom in" title="Zoom in" className="rounded-full p-2 transition hover:bg-white/15 disabled:opacity-40" disabled={scale === 4}><ZoomIn className="h-4 w-4" /></button>
            <button type="button" onClick={() => updateScale(1)} aria-label="Reset image view" title="Reset image view" className="rounded-full p-2 transition hover:bg-white/15"><RotateCcw className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-900/60 flex items-center justify-between gap-3 text-xs">
          <div className="hidden items-center gap-2 text-emerald-400 sm:flex">
            <Check className="w-4 h-4" />
            <span>Saved to your personal inspiration collection</span>
          </div>

          <button type="button"
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
