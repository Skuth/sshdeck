import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";

/** Se algo quebrar, mostra o erro em vez de tela preta. */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 bg-background text-foreground p-8">
        <p className="font-semibold">Algo quebrou na interface 😵</p>
        <pre className="text-xs text-destructive bg-destructive/10 border border-destructive/25 rounded-md p-3 max-w-xl overflow-auto">
          {String(this.state.error)}
        </pre>
        <button
          className="text-sm underline text-muted-foreground hover:text-foreground"
          onClick={() => location.reload()}
        >
          Recarregar app
        </button>
      </div>
    );
  }
}
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./index.css";
import "@xterm/xterm/css/xterm.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

// sem StrictMode: o double-mount de dev duplicaria conexões SSH
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <App />
      </TooltipProvider>
      <Toaster position="bottom-right" theme="dark" />
    </QueryClientProvider>
  </ErrorBoundary>,
);
