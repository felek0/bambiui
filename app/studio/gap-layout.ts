export type GapBox = { left: number; top: number; width: number; height: number };
export type GapStyle = { display: string; flexDirection: string; flexWrap: string };
export type GapLayout = { axis: "x" | "y"; slot: GapBox } | { axis: null; reason: string };

/**
 * The draggable slot is the visible space between the first two flex items along the main axis.
 * Its measured size is not the gap (margins and justify-content also add space); only its position is used.
 */
export function gapLayout(style: GapStyle, children: readonly GapBox[]): GapLayout {
  if (/grid/.test(style.display)) return { axis: null, reason: "Grid layout: enter the gap value." };
  if (!/flex/.test(style.display)) return { axis: null, reason: "No flex layout: enter the gap value." };
  if (style.flexWrap !== "nowrap") return { axis: null, reason: "Wrapping layout: enter the gap value." };
  const axis = style.flexDirection.startsWith("column") ? "y" : "x";
  const visible = children.filter(box => box.width > 0 || box.height > 0);
  if (visible.length < 2) return { axis: null, reason: "Only one visible child, so there is no gap to drag. Enter the gap value." };
  const [a, b] = [...visible].sort((left, right) => axis === "x" ? left.left - right.left : left.top - right.top);
  if (axis === "x") {
    const top = Math.min(a.top, b.top), bottom = Math.max(a.top + a.height, b.top + b.height);
    return { axis, slot: { left: a.left + a.width, top, width: Math.max(0, b.left - a.left - a.width), height: bottom - top } };
  }
  const left = Math.min(a.left, b.left), right = Math.max(a.left + a.width, b.left + b.width);
  return { axis, slot: { left, top: a.top + a.height, width: right - left, height: Math.max(0, b.top - a.top - a.height) } };
}

const inFlow = (style: CSSStyleDeclaration) => style.display !== "none" && style.position !== "absolute" && style.position !== "fixed";

/** Flex items of a rendered element, relative to `origin`; includes non-empty anonymous text items. */
export function gapItems(element: Element, origin: DOMRect): GapBox[] {
  const boxes: GapBox[] = [];
  for (const node of element.childNodes) {
    let rect: DOMRect | null = null;
    if (node instanceof Element) {
      const style = getComputedStyle(node);
      if (style.display === "contents") { boxes.push(...gapItems(node, origin)); continue; }
      if (inFlow(style)) rect = node.getBoundingClientRect();
    } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      const range = document.createRange(); range.selectNodeContents(node); rect = range.getBoundingClientRect();
    }
    if (rect) boxes.push({ left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height });
  }
  return boxes;
}

/**
 * Button/Badge content wrappers (`gap: inherit`) belong to the same component; follow a single such flex child to
 * the visible items. A nested component (e.g. a Button inside Card footer) is an item, never a wrapper.
 */
export function measureGapLayout(element: HTMLElement): GapLayout {
  const origin = element.getBoundingClientRect();
  let container = element;
  for (;;) {
    const style = getComputedStyle(container);
    const items = gapItems(container, origin);
    const only = items.length === 1 ? [...container.children].find(child => inFlow(getComputedStyle(child))) : undefined;
    const wrapper = only instanceof HTMLElement && only.dataset.dsComponent === element.dataset.dsComponent && only.dataset.componentPart !== element.dataset.componentPart
      && /flex/.test(getComputedStyle(only).display) && getComputedStyle(only).gap === style.gap;
    if (!wrapper) return gapLayout(style, items);
    container = only;
  }
}
