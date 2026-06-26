import { create } from 'zustand'

interface UIStore {
  sidebarCollapsed: boolean
  selectedDriverId: string | null
  selectedRouteId: string | null
  commandOpen: boolean
  toggleSidebar: () => void
  setSelectedDriver: (id: string | null) => void
  setSelectedRoute: (id: string | null) => void
  setCommandOpen: (open: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  selectedDriverId: null,
  selectedRouteId: null,
  commandOpen: false,
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSelectedDriver: (id) => set({ selectedDriverId: id }),
  setSelectedRoute: (id) => set({ selectedRouteId: id }),
  setCommandOpen: (open) => set({ commandOpen: open }),
}))
