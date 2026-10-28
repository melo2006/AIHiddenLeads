import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import {Button} from '@/components/ui/button';

// An open tab can retain an old chunk URL after a preview update. Recover
// once instead of leaving the route blank, without creating a reload loop.
window.addEventListener("vite:preloadError", (event) => {
  try {
    const key = "page-preload-recovery";
    const previous = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - previous < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
    event.preventDefault();
    window.location.reload();
  } catch {
    // Leave the original error available when browser storage is blocked.
  }
});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Root ErrorBoundary caught:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="min-h-screen bg-background text-foreground p-6 sm:p-10">
          <h1 className="text-xl font-semibold">The page needs to restart</h1>
          <p className="mt-4 text-sm text-muted-foreground">Please reload to continue. Your private account data has not been cleared.</p>
          <Button className="mt-5"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("The page container is missing");
function StartupReady({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove("app-starting");
    document.documentElement.classList.add("app-ready");
    document.getElementById("startup-status")?.remove();
  }, []);
  return children;
}
createRoot(root).render(
  <ErrorBoundary>
    <StartupReady>
    <App />
    </StartupReady>
  </ErrorBoundary>
);
