import { brand } from "./brand";

const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  sliders: "M4 7h7m4 0h5M4 17h3m4 0h9M11 4v6M7 14v6",
  box: "m12 3 9 5-9 5-9-5 9-5z M3 8v9l9 5 9-5V8 M12 13v9",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  chevron: "m9 5 7 7-7 7",
  download: "M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5",
  upload: "M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5",
  reset: "M3 11a9 9 0 1 1 2.5 7M3 4v7h7",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6",
  check: "m5 12 4 4L19 6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18",
  desktop: "M3 3h18v13H3z M8 21h8m-4-5v5",
  mobile: "M7 2h10v20H7z M11 18h2",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1",
  moon: "M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2",
  redo: "m15 14 5-5-5-5m5 5H10a6 6 0 0 0 0 12h2",
  button: "M3 6h18v12H3z M8 12h8",
  input: "M3 6h18v12H3z M8 9v6",
  card: "M3 4h18v16H3z M3 9h18",
  badge: "m12 3 3 3 4 1 1 5-1 5-4 1-3 3-3-3-4-1-1-5 1-5 4-1 3-3z",
  switch:
    "M8 6h8a6 6 0 0 1 0 12H8A6 6 0 0 1 8 6z M8 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  checkbox: "M4 4h16v16H4z m4 8 3 3 5-6",
  text: "M3 6h18M12 6v13m-4 0h8",
  colors: "M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4 6 6 0 0 0-6-6H12z",
  link: "m9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z",
  close: "m6 6 12 12M6 18 18 6",
  copy: "M9 9h11v11H9z M5 15H4V4h11v1",
} as const;

export type IconName = keyof typeof paths;

/**
 * bambiui logo mark, drawn in `currentColor`. Both variants share the outline;
 * `filled` also fills the upper head (head minus face) and the eye.
 */
export function BrandMark({
  size = 22,
  variant = "filled",
}: {
  size?: number | string;
  variant?: "filled" | "outline";
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-24 -24 624 608"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {variant === "filled" && (
        <path
          d={`${brand.head} ${brand.face} ${brand.eye}`}
          fill="currentColor"
          fillRule="evenodd"
          stroke="none"
        />
      )}
      {[brand.head, brand.faceCurve, brand.eye].map((d) => (
        // Keep the stroke at 0.8px regardless of the 576-unit artwork scale.
        <path key={d} d={d} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/** Decorative icon. `size` accepts pixels or any CSS length, e.g. "1.15em". */
export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number | string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
