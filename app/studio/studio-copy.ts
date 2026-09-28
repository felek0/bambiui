import type { ComponentId, ComponentTokens } from "./tokens";

const tokenImpacts: Partial<Record<ComponentId, Partial<Record<keyof ComponentTokens, string>>>> = {
    button: {
        background: "Primary fill and derived hover/pressed fills; other variants use global roles.",
        foreground: "Primary text; other variants use global roles.",
        border: "Primary stroke; outline uses the global border.",
        paddingX: "Link and icon-only variants replace horizontal padding.",
        paddingY: "Icon-only buttons replace vertical padding.",
    },
    input: { border: "Normal and read-only borders; invalid uses the global danger color." },
    switch: {
        background: "Checked track only; unchecked uses global muted.",
        foreground: "Checked thumb only; unchecked uses global foreground.",
        border: "Checked track only; unchecked and invalid use global colors.",
    },
    checkbox: {
        background: "Checked box only; unchecked uses global muted.",
        foreground: "Checked mark only; unchecked uses global foreground.",
        border: "Checked box only; unchecked and invalid use global colors.",
    },
    badge: {
        background: "Neutral solid ink and outline surface; subtle colors are derived from it.",
        foreground: "Neutral tone fill and derived text; semantic tones use global roles.",
        border: "An explicit override changes neutral outline; semantic outlines are derived from global roles.",
    },
    card: {
        background: "Outlined and elevated; filled uses global muted.",
        foreground: "Outlined and elevated; filled uses global foreground.",
        border: "Outlined only; elevated and filled borders are transparent.",
    },
    text: { foreground: "Neutral tone only; semantic tones use derived global text colors." },
};

export function tokenImpact(component: ComponentId, key: keyof ComponentTokens): string | undefined {
    return tokenImpacts[component]?.[key];
}

export const copy = {
    loading: "Loading local draft…", saved: "Saved locally", draft: "Local draft", unsaved: "Not saved",
    loadError: "Your saved draft could not be loaded. A fresh workspace is ready; export a backup before leaving.",
    storageError: "Browser storage is unavailable. Export your design system to keep a copy.",
    copied: "Copied to clipboard", clipboardError: "Clipboard unavailable. Use Download instead.",
    skip: "Skip to workspace", home: "bambiui home", name: "Design system name", selectSystem: "Select design system", yourSystems: "Design systems", untitled: "Untitled system", newSystem: "New design system", duplicateSystem: "Duplicate current system", deleteSystem: "Delete current system", deleteSystemConfirm: (name: string) => `Delete ${name}? This cannot be undone. Export a JSON backup first if you want to keep it.`, importAsNew: "Import as new system", rename: "Rename", beta: "BETA",
    import: "Import", importAria: "Import design system", importJson: "Import design system JSON",
    fileSize: "The file must be smaller than 100 KB.", replace: "Replace the current design system with this file?",
    imported: "Design system imported successfully. Both themes are ready.", importFailed: "Import failed", invalidJson: "Invalid JSON file.",
    export: "Export tokens", exportTitle: "Take your system with you.", closeExport: "Close export dialog",
    exportDescription: "Export both themes as CSS variables (including derived states), or JSON with theme sources and overrides. Component markup and styles are not included.",
    exportFormat: "Export format", exported: "Exported tokens", copy: "Copy", download: "Download",
    library: "Design system navigation", feel: "Make it feel like you.", workspace: "Workspace", sidebarFoundations: "Foundations", overview: "Overview",
    globalTokens: "Global tokens", components: "Components", search: "Search components", find: "Find a component…",
    customTitle: "Has custom tokens", custom: ", has custom tokens", noComponents: "No components found.",
    tip: "Small tokens. Big possibilities.", tipDetail: "Start with your foundations, then make every component your own.", builtWith: "Built with Base UI",
    overviewTitle: "Your design system", componentTitle: (name: string) => name,
    overviewIntro: "One place to shape your foundations and see them in action.", componentIntro: "Fine-tune the details. Every change is reflected in real time.", live: "Live preview",
    workspaceView: "Workspace view", design: "Design", develop: "Develop", responsive: "Responsive", width: "Preview width", desktop: "Desktop preview", mobile: "Mobile preview",
    theme: "Design theme", light: "Light", dark: "Dark", undo: "Undo change", redo: "Redo change",
    themeOnly: (mode: string) => `${mode.toUpperCase()} ONLY`, sharedThemes: "SHARED · BOTH THEMES", mixedScope: "Colors affect this theme; dimensions affect both themes.",
    dismiss: "Dismiss notification", collection: "COMPONENT COLLECTION", explorer: (name: string) => `${name.toUpperCase()} EXPLORER`, interactive: "INTERACTIVE",
    jumpToTokens: "Edit tokens", backToPreview: "Back to preview", backToCode: "Back to code",
    editor: "Design token editor", inspector: "Token inspector", scope: "Token scope", component: "Component", editTokens: (mode: string) => `Edit ${mode} theme tokens`,
    foundations: "The foundations", componentTokens: (name: string) => `${name} tokens`, foundationsHint: "Shared across every component.",
    inheritComponent: "Most values inherit global tokens; derived colors use component roles. Reset an override to reconnect.",
    colors: "Colors", shape: "Shape & spacing", resetGlobal: "Reset global tokens", resetComponent: "Reset component overrides", changes: "Changes apply instantly",
    confirmGlobal: (mode: string) => `Reset ${mode} global colors, shared font family, shape and spacing? Color scale and component overrides will be kept; the other theme’s colors will not change.`,
    confirmComponent: (mode: string, name: string) => `Reset ${mode} ${name} color overrides and shared sizing overrides to global tokens?`,
    override: "Override", inherited: "Global", derivedOutline: "Neutral outline (derived)", resetOverride: (name: string) => `Reset ${name.toLowerCase()} override`, resetTip: "Reset to global token", inheritedTip: "Inherited from global tokens",
    colorPicker: (name: string) => `${name} color picker`, slider: (name: string) => `${name} slider`, invalidColor: "Use a six-digit hex color.", invalidNumber: (min: number, max: number) => `Use a value from ${min} to ${max}.`,
    tokenLabels: {
      background: "Background", foreground: "Foreground", muted: "Muted", mutedForeground: "Muted foreground", border: "Border", primary: "Primary", onPrimary: "On primary", secondary: "Secondary", onSecondary: "On secondary", success: "Success", onSuccess: "On success", warning: "Warning", onWarning: "On warning", danger: "Danger", onDanger: "On danger", info: "Info", onInfo: "On info", radius: "Radius", paddingX: "Horizontal padding", paddingY: "Vertical padding", gap: "Gap", margin: "Margin", spacingSm: "Spacing sm", spacingMd: "Spacing md", spacingLg: "Spacing lg", fontSize: "Font size", borderWidth: "Border width", controlHeightSm: "Control height sm", controlHeightMd: "Control height md", controlHeightLg: "Control height lg",
    },
    componentNames: { button: "Button", input: "Input", card: "Card", badge: "Badge", switch: "Switch", checkbox: "Checkbox", text: "Text" },
};
