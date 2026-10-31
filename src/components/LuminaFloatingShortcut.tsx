import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot } from 'lucide-react';

interface LuminaFloatingShortcutProps {
  onOpen: () => void;
  isDarkMode: boolean;
}

const STORAGE_KEY = 'atelier-lumina-shortcut-position';

export const LuminaFloatingShortcut: React.FC<LuminaFloatingShortcutProps> = ({ onOpen, isDarkMode }) => {
  const [position, setPosition] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as { right?: number; bottom?: number } | null;
      if (saved && typeof saved.right === 'number' && typeof saved.bottom === 'number') {
        return { right: Math.max(8, saved.right), bottom: Math.max(144, saved.bottom) };
      }
    } catch {
      // Use the default position when stored device UI state is invalid.
    }
    return { right: 20, bottom: 144 };
  });
  const dragStart = useRef<{ x: number; y: number; right: number; bottom: number } | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  }, [position]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers reject capture when the pointer leaves during a fast tap.
    }
    dragStart.current = { x: event.clientX, y: event.clientY, right: position.right, bottom: position.bottom };
    moved.current = false;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
    setPosition({
      right: Math.max(8, Math.min(window.innerWidth - 64, start.right - dx)),
      bottom: Math.max(144, Math.min(window.innerHeight - 64, start.bottom - dy)),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!moved.current) {
      event.preventDefault();
      onOpen();
    }
    dragStart.current = null;
  };

  const handlePointerCancel = () => {
    dragStart.current = null;
    moved.current = false;
  };

  return createPortal((
    <button
      type="button"
      aria-label="Open Lumina assistant"
      title="Open Lumina"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className={`lumina-floating-button fixed z-[2147483000] flex h-13 w-13 touch-none items-center justify-center rounded-full border shadow-2xl transition-transform hover:scale-105 ${
        isDarkMode
          ? 'border-amber-300/50 bg-amber-400 text-neutral-950 shadow-amber-500/30'
          : 'border-amber-600/40 bg-amber-500 text-white shadow-amber-500/30'
      }`}
      style={{ right: position.right, bottom: position.bottom }}
    >
      <span className="lumina-floating-halo" aria-hidden="true" />
      <Bot className="lumina-floating-icon relative z-10 h-6 w-6" aria-hidden="true" />
      <svg className="lumina-floating-label" viewBox="0 0 96 62" aria-hidden="true">
        <path id="lumina-label-path" d="M 11 31 A 37 37 0 0 0 85 31" />
        <text>
          <textPath href="#lumina-label-path" startOffset="50%" textAnchor="middle">LUMINA</textPath>
        </text>
      </svg>
    </button>
  ), document.body);
};
