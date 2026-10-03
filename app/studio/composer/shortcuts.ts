export type Shortcut = "undo" | "redo" | "delete" | "duplicate";
/** Native editing/composition always wins; callers additionally bound this to their canvas. */
export function composerShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; isComposing: boolean; defaultPrevented: boolean }, editing: boolean): Shortcut | null {
  if (editing || event.isComposing || event.defaultPrevented || event.altKey) return null;
  const modified = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
  if (modified && key === "z") return event.shiftKey ? "redo" : "undo";
  if (modified && key === "d" && !event.shiftKey) return "duplicate";
  if (!modified && !event.shiftKey && (key === "delete" || key === "backspace")) return "delete";
  return null;
}
