import React from "react";
import { captureError } from "@/lib/monitoring";
import { Button } from "@/components/ui/button";

interface State {
  hasError: boolean;
  message?: string;
  stack?: string;
  componentStack?: string;
  errorId?: string;
}

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

function createErrorId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

function debugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

async function resetLocalAppState() {
  if (typeof window === "undefined") return;

  const preservedKeys = new Set([
    "sb-access-token",
    "supabase.auth.token",
  ]);

  try {
    for (const key of Object.keys(localStorage)) {
      if (!preservedKeys.has(key)) localStorage.removeItem(key);
    }
    sessionStorage.clear();
  } catch {
    // Storage may be blocked; continue with cache/service-worker cleanup.
  }

  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch {
    // Best effort only.
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // Best effort only.
  }

  window.location.replace(`${window.location.origin}${window.location.pathname}`);
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message,
      stack: error.stack,
      errorId: createErrorId(),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack });
    captureError({
      message: error.message,
      stack: error.stack,
      category: "react_error_boundary",
      metadata: {
        componentStack: info.componentStack,
        errorId: this.state.errorId,
      },
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const showDebug = debugEnabled();

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center gap-4 bg-background text-foreground">
        <h2 className="text-xl font-semibold">Noget gik galt</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Der opstod en uventet fejl. Fejlen er registreret med ID {this.state.errorId ?? "ukendt"}.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Genindlæs siden</Button>
          <Button variant="outline" onClick={() => void resetLocalAppState()}>
            Nulstil lokal appdata
          </Button>
        </div>

        {showDebug && (
          <details className="mt-4 w-full max-w-3xl rounded-lg border p-4 text-left">
            <summary className="cursor-pointer text-sm font-medium">Tekniske fejldetaljer</summary>
            <pre className="mt-3 max-h-[45vh] overflow-auto whitespace-pre-wrap break-words text-xs">
              {[
                `Error ID: ${this.state.errorId ?? "unknown"}`,
                `Message: ${this.state.message ?? "Unknown error"}`,
                this.state.stack ? `Stack:\n${this.state.stack}` : "",
                this.state.componentStack ? `Component stack:\n${this.state.componentStack}` : "",
              ].filter(Boolean).join("\n\n")}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
