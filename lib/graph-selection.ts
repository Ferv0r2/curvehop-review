/**
 * Which point the /about graph highlights (components/graph-explorer.tsx).
 * Pointing at or focusing a point selects it; a source button or Enter on a
 * hub pins one. Leaving the drawing does not clear the selection at once: the
 * component waits LEAVE_DELAY_MS and cancels when the pointer or focus reaches
 * the panel, so the company link in the info box stays reachable.
 */
export const LEAVE_DELAY_MS = 400;

export type Selection = {
  hovered: string | null;
  pinned: string | null;
  /** How the shown point was chosen; a focused point already speaks its own name, so the info box stays quiet. */
  via: "pointer" | "focus" | "pin" | null;
};
export type SelectionEvent =
  | { type: "point"; id: string; via: "pointer" | "focus" }
  /** The delay after leaving the drawing ran out (or focus left drawing and panel). */
  | { type: "release" }
  | { type: "toggle"; id: string }
  | { type: "clear" };

export const emptySelection: Selection = { hovered: null, pinned: null, via: null };
export const activePoint = (state: Selection) => state.hovered ?? state.pinned;

export function nextSelection(state: Selection, event: SelectionEvent): Selection {
  switch (event.type) {
    case "point": return { ...state, hovered: event.id, via: event.via };
    case "release": return { ...state, hovered: null, via: state.pinned ? "pin" : null };
    // A pin replaces whatever was pointed at, so the chosen source is what shows.
    case "toggle": {
      const pinned = state.pinned === event.id ? null : event.id;
      return { hovered: null, pinned, via: pinned ? "pin" : null };
    }
    case "clear": return emptySelection;
  }
}
