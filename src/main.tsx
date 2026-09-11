import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";
import "@xterm/xterm/css/xterm.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

// sem StrictMode: o double-mount de dev duplicaria conexões SSH
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <App />
    <Toaster position="bottom-right" theme="dark" />
  </QueryClientProvider>,
);
