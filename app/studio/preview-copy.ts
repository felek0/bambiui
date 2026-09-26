import type { ComponentId } from "./tokens";
import type { PaletteMode } from "./color-engine";

type PreviewCopy = {
  components: Record<ComponentId, { name: string; description: string }>;
  modes: Record<PaletteMode, string>;
  tones: Record<"neutral" | "primary" | "success" | "warning" | "danger" | "info", string>;
  demo: { getStarted: string; allSet: string; completed: (count: number) => string };
  button: {
    secondary: string; ghost: string; outline: string; delete: string; learnMore: string;
    small: string; medium: string; large: string; addItem: string; download: string;
    saving: string; save: string; saved: string; disabled: string;
  };
  input: {
    email: string; receipts: string; search: string; searchPlaceholder: string;
    url: string; urlError: string; readOnlyEmail: string; unavailable: string;
  };
  card: {
    make: string; makeDescription: string; explore: string; exploreDescription: string;
    start: string; later: string; filled: string; filledDescription: string;
  };
  badge: { published: string; draft: string; live: string };
  switch: { notifications: string; focus: string; autoSave: string; autoSaveDescription: string; compact: string };
  checkbox: { details: string; loop: string; selectAll: string; terms: string; termsError: string; smallPrint: string };

  showcase: { preview: (name: string) => string };
  theme: { preview: (mode: string) => string };
};

export const previewCopy = {
    components: {
      button: { name: "Button", description: "A little nudge to take the next step." },
      input: { name: "Input", description: "Make room for a good idea." },
      card: { name: "Card", description: "A home for things that belong together." },
      badge: { name: "Badge", description: "Small details. Just enough context." },
      switch: { name: "Switch", description: "A simple choice, on or off." },
      checkbox: { name: "Checkbox", description: "Keep the important things in check." },
      text: { name: "Text", description: "Type styles for headings, paragraphs, labels and captions." },
    },
    modes: { light: "Light", dark: "Dark" },
    tones: { neutral: "Neutral", primary: "Primary", success: "Success", warning: "Warning", danger: "Danger", info: "Info" },
    demo: { getStarted: "Get started", allSet: "All set", completed: (count) => `Demo action completed successfully (${count}).` },
    button: { secondary: "Secondary", ghost: "Ghost", outline: "Outline", delete: "Delete", learnMore: "Learn more", small: "Small", medium: "Medium", large: "Large", addItem: "Add item", download: "Download", saving: "Saving", save: "Save changes", saved: "Saved", disabled: "Disabled" },
    input: { email: "Email address", receipts: "We only use it for receipts.", search: "Search", searchPlaceholder: "Search components…", url: "Workspace URL", urlError: "Enter a full URL, including https://", readOnlyEmail: "Read-only workspace email", unavailable: "Unavailable" },
    card: { make: "Make something great", makeDescription: "Good design starts with a few thoughtful details.", explore: "Space to explore", exploreDescription: "Your next idea starts right here.", start: "Start", later: "Later", filled: "Filled, small", filledDescription: "A quieter surface for secondary content." },
    badge: { published: "Published", draft: "Draft", live: "Live" },
    switch: { notifications: "Notifications", focus: "Focus mode", autoSave: "Auto-save", autoSaveDescription: "Saves every change as you go.", compact: "Compact rows" },
    checkbox: { details: "Include the details", loop: "Keep me in the loop", selectAll: "Select all", terms: "I accept the terms", termsError: "Please accept the terms to continue.", smallPrint: "Small print" },
    showcase: { preview: (name) => `${name} preview` },
    theme: { preview: (mode) => `${mode} preview` },
} satisfies PreviewCopy;

export type { PreviewCopy };
