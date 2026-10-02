import { parsePageDocument, type PageDocument, type PageKind, type PageNode } from "./model.ts";

const names: Record<PageKind, string> = {
  container: "Container", stack: "Stack", grid: "Grid", gridItem: "Grid.Item", form: "form",
  card: "Card", cardHeader: "Card.Header", cardTitle: "Card.Title",
  cardDescription: "Card.Description", cardContent: "Card.Content",
  text: "Text", input: "Input", switch: "Switch", button: "Button",
};

/** Paths are explicitly supplied by the consuming project; no installed package is assumed. */
export function exportPageTSX(input: unknown, componentImport = "./components", layoutImport = "./layout"): string {
  const page: PageDocument = parsePageDocument(input);
  if (!/^\.{1,2}\/[a-zA-Z0-9/_-]+$/.test(componentImport) || !/^\.{1,2}\/[a-zA-Z0-9/_-]+$/.test(layoutImport)) throw new Error("Invalid relative import path");
  const used = new Set<PageKind>();
  function emit(node: PageNode, depth: number): string {
    used.add(node.kind);
    const tag = names[node.kind];
    const attributes: Record<string, string | boolean | number> = { "data-page-node": node.id };
    for (const [key, value] of Object.entries(node.props ?? {})) attributes[key === "buttonType" ? "type" : key] = value;
    if (node.kind === "form") attributes.method = "get";
    const attrs = Object.entries(attributes).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => ` ${key}={${JSON.stringify(value)}}`).join("");
    const pad = "  ".repeat(depth);
    if (!node.children && node.text === undefined) return `${pad}<${tag}${attrs} />`;
    if (node.text !== undefined) return `${pad}<${tag}${attrs}>{${JSON.stringify(node.text)}}</${tag}>`;
    return `${pad}<${tag}${attrs}>\n${node.children!.map((child) => emit(child, depth + 1)).join("\n")}\n${pad}</${tag}>`;
  }
  const body = emit(page.root, 1);
  const components = ["Button", "Card", "Input", "Switch", "Text"].filter((name) => [...used].some((kind) => names[kind].split(".")[0] === name));
  const layouts = ["Container", "Grid", "Stack"].filter((name) => [...used].some((kind) => names[kind].split(".")[0] === name));
  // Import collection happens after walking the tree.
  return `${components.length ? `import { ${components.join(", ")} } from ${JSON.stringify(componentImport)};\n` : ""}${layouts.length ? `import { ${layouts.join(", ")} } from ${JSON.stringify(layoutImport)};\n` : ""}\nexport default function PageContent() {\n  return (\n${body}\n  );\n}\n`;
}
