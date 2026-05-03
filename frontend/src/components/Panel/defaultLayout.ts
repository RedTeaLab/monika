import { Orientation, type SerializedDockview } from 'dockview'

/**
 * Default layout used when no saved layout exists in localStorage.
 * A minimal single-group layout that displays a watermark/empty state.
 */
export const DEFAULT_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [],
    },
    height: 100,
    width: 100,
    orientation: Orientation.HORIZONTAL,
  },
  panels: {},
}
