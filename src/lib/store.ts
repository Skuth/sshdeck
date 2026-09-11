import { create } from "zustand";

export type TabStatus = "connecting" | "connected" | "closed";

export interface Tab {
  serverId: string;
  name: string;
  status: TabStatus;
}

interface TabsState {
  tabs: Tab[];
  activeId: string | null;
  sftpOpen: boolean;
  openTab: (serverId: string, name: string) => boolean; // false se já existia
  setStatus: (serverId: string, status: TabStatus) => void;
  closeTab: (serverId: string) => void;
  setActive: (serverId: string) => void;
  toggleSftp: () => void;
}

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [],
  activeId: null,
  sftpOpen: false,
  openTab: (serverId, name) => {
    const exists = get().tabs.some((t) => t.serverId === serverId);
    if (exists) {
      set({ activeId: serverId });
      return false;
    }
    set((s) => ({
      tabs: [...s.tabs, { serverId, name, status: "connecting" }],
      activeId: serverId,
    }));
    return true;
  },
  setStatus: (serverId, status) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.serverId === serverId ? { ...t, status } : t)),
    })),
  closeTab: (serverId) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.serverId !== serverId);
      return {
        tabs,
        activeId:
          s.activeId === serverId ? (tabs.length ? tabs[tabs.length - 1].serverId : null) : s.activeId,
        sftpOpen: tabs.length ? s.sftpOpen : false,
      };
    }),
  setActive: (serverId) => set({ activeId: serverId }),
  toggleSftp: () => set((s) => ({ sftpOpen: !s.sftpOpen })),
}));
