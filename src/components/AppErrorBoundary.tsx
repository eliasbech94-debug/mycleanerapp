import React from "react";
import { captureError } from "@/lib/monitoring";
import { Button } from "@/components/ui/button";

interface State { hasError: boolean; message?: string; }
interface Props { children: React.ReactNode; fallback?: React.ReactNode; }

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureError({
      message: error.message,
      stack: error.stack,
      category: "react_error_boundary",
      metadata: { componentStack: info.componentStack },
    });
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center p-8 text-center gap-4">
        <h2 className="text-xl font-semibold">Noget gik galt</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Der opstod en uventet fejl. Vores team er blevet notificeret.
        </p>
        <Button onClick={() => window.location.reload()}>Genindlæs siden</Button>
      </div>
    );
  }
}
