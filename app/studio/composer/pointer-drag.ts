type Point = { x: number; y: number };
type DragEvent = Pick<PointerEvent, "pointerId" | "pointerType" | "button" | "clientX" | "clientY">;
type Options = {
  owner: object; source: HTMLElement; event: DragEvent;
  onMove: (point: Point) => void | boolean;
  onFinish: (commit: boolean, moved: boolean, point: Point) => void;
};
const active = new WeakMap<object, () => void>();
export const pointerDragActive = (owner: object) => active.has(owner);

/** One mouse motor for palette insertion, frame movement and pan. No native drag payloads. */
export function startPointerDrag({ owner, source, event, onMove, onFinish }: Options): (() => void) | null {
  if (active.has(owner) || event.pointerType !== "mouse" || ![0, 1].includes(event.button)) return null;
  const pointerId = event.pointerId, start = { x: event.clientX, y: event.clientY };
  let point = start, moved = false, raf = 0, finished = false;
  const finish = (commit: boolean) => {
    if (finished) return;
    finished = true;
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    window.removeEventListener("contextmenu", abort, true);
        window.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", key); window.removeEventListener("blur", abort);
    source.removeEventListener("lostpointercapture", lost);
    active.delete(owner);
    if (source.hasPointerCapture(pointerId)) source.releasePointerCapture(pointerId);
    onFinish(commit, moved, point);
  };
  const abort = () => finish(false);
  const cancel = (event: PointerEvent) => { if (event.pointerId === pointerId) abort(); };
  const lost = (event: PointerEvent) => { if (event.pointerId === pointerId) abort(); };
  const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); abort(); } };
  const update = (event: PointerEvent) => {
    point = { x: event.clientX, y: event.clientY };
    moved ||= Math.hypot(point.x - start.x, point.y - start.y) >= 4;
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    update(event);
    if (!moved) return;
    event.preventDefault();
    if (!raf) raf = requestAnimationFrame(paint);
  };
  const paint = () => {
    raf = 0;
    if (!finished && onMove(point) === true) raf = requestAnimationFrame(paint);
  };
  const up = (event: PointerEvent) => { if (event.pointerId === pointerId) { update(event); finish(true); } };
  active.set(owner, abort);
  source.setPointerCapture(pointerId);
  window.addEventListener("pointermove", move, { passive: false }); window.addEventListener("pointerup", up);
  window.addEventListener("contextmenu", abort, true);
    window.addEventListener("pointercancel", cancel); window.addEventListener("keydown", key); window.addEventListener("blur", abort);
  source.addEventListener("lostpointercapture", lost);
  return abort;
}
