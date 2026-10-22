import { useEffect, useState } from 'react';

interface UseTypingTextOptions {
  enabled: boolean;
  repeat?: boolean;
  typeDelayMs?: number;
  deleteDelayMs?: number;
  holdDelayMs?: number;
  messageDelayMs?: number;
}

export const useTypingText = (
  messages: string[],
  {
    enabled,
    repeat = false,
    typeDelayMs = 36,
    deleteDelayMs = 22,
    holdDelayMs = 2600,
    messageDelayMs = 450,
  }: UseTypingTextOptions,
) => {
  const [text, setText] = useState('');
  const [pageLoaded, setPageLoaded] = useState(() => document.readyState === 'complete');
  const messageKey = messages.join('\u0000');

  useEffect(() => {
    if (document.readyState === 'complete') {
      setPageLoaded(true);
      return;
    }

    const handleLoad = () => setPageLoaded(true);
    window.addEventListener('load', handleLoad, { once: true });
    return () => window.removeEventListener('load', handleLoad);
  }, []);

  useEffect(() => {
    const items = messageKey.split('\u0000').filter(Boolean);
    if (!enabled || !pageLoaded || items.length === 0) {
      setText('');
      return;
    }

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setText(items[0]);
      return;
    }

    setText('');
    let messageIndex = 0;
    let characterIndex = 0;
    let deleting = false;
    let timer = 0;

    const tick = () => {
      const message = items[messageIndex];
      const characters = Array.from(message);
      if (!deleting) {
        characterIndex += 1;
        setText(characters.slice(0, characterIndex).join(''));
        if (characterIndex >= characters.length) {
          if (!repeat) return;
          timer = window.setTimeout(() => {
            deleting = true;
            tick();
          }, holdDelayMs);
          return;
        }
        timer = window.setTimeout(tick, typeDelayMs);
        return;
      }

      characterIndex -= 1;
      setText(characters.slice(0, characterIndex).join(''));
      if (characterIndex <= 0) {
        messageIndex = (messageIndex + 1) % items.length;
        deleting = false;
        timer = window.setTimeout(tick, messageDelayMs);
        return;
      }
      timer = window.setTimeout(tick, deleteDelayMs);
    };

    timer = window.setTimeout(tick, typeDelayMs);
    return () => window.clearTimeout(timer);
  }, [deleteDelayMs, enabled, holdDelayMs, messageDelayMs, messageKey, pageLoaded, repeat, typeDelayMs]);

  return text;
};
