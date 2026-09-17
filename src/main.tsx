import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Fabrilux interface error', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0c0d10] px-6 text-center text-white">
        <section className="max-w-md rounded-3xl border border-amber-500/30 bg-neutral-900/80 p-8 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Atelier temporarily paused</p>
          <h1 className="mt-3 font-serif text-3xl font-bold">The page needs a quick refresh</h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">Your account session is still protected. Reload the page to restore the interface.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300"
          >
            Reload Fabrilux
          </button>
          {import.meta.env.DEV && this.state.message && <p className="mt-4 break-words text-left text-[11px] text-red-300">{this.state.message}</p>}
        </section>
      </main>
    );
  }
}

const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (error) {
      console.warn('Service worker registration failed', error);
    }
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

void registerServiceWorker();
