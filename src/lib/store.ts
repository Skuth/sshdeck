import { create } from "zustand";

export type TabStatus = "connecting" | "connected" | "closed";
export type TabView = "terminal" | "gui";

export interface Tab {
  serverId: string;
  name: string;
  status: TabStatus;
  view: TabView; // terminal é o padrão; gui = gerenciador de arquivos
}

interface TabsState {
  tabs: Tab[];
  activeId: string | null;
  openTab: (serverId: string, name: string) => boolean; // false se já existia
  setStatus: (serverId: string, status: TabStatus) => void;
  setView: (serverId: string, view: TabView) => void;
  closeTab: (serverId: string) => void;
  setActive: (serverId: string) => void;
}

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [],
  activeId: null,
  openTab: (serverId, name) => {
    const exists = get().tabs.some((t) => t.serverId === serverId);
    if (exists) {
      set({ activeId: serverId });
      return false;
    }
    set((s) => ({
      tabs: [...s.tabs, { serverId, name, status: "connecting", view: "terminal" }],
      activeId: serverId,
    }));
    return true;
  },
  setStatus: (serverId, status) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.serverId === serverId ? { ...t, status } : t)),
    })),
  setView: (serverId, view) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.serverId === serverId ? { ...t, view } : t)),
    })),
  closeTab: (serverId) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.serverId !== serverId);
      return {
        tabs,
        activeId:
          s.activeId === serverId ? (tabs.length ? tabs[tabs.length - 1].serverId : null) : s.activeId,
      };
    }),
  setActive: (serverId) => set({ activeId: serverId }),
}));
