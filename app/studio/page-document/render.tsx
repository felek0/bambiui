import { createElement, type CSSProperties, type ElementType, type ReactNode } from "react";
import { Badge, Button, Card, Checkbox, Input, Switch, Text } from "../components";
import { Container, Grid, Stack } from "../layout";
import type { PageDocument, PageNode } from "./model";
import { nodeAttributes, nodeRegistry, type PageElement } from "./registry";
import type { PageBundle } from "./bundle";
import { toCSSVariables } from "../tokens";

const elements: Record<PageElement, ElementType> = {
  Container, Stack, Grid, "Grid.Item": Grid.Item, form: "form",
  Card, "Card.Header": Card.Header, "Card.Title": Card.Title,
  "Card.Description": Card.Description, "Card.Content": Card.Content, "Card.Footer": Card.Footer,
  Text, Input, Switch, Checkbox, Badge, Button,
};

function RenderNode({ node }: { node: PageNode }): ReactNode {
  const children = node.children?.map((child) => createElement(RenderNode, { key: child.id, node: child }));
  return createElement(elements[nodeRegistry[node.kind].element], nodeAttributes(node), node.text ?? children);
}

/** Accept only the result of parsePageDocument, never unvalidated external JSON. */
export function RenderPage({ page }: { page: PageDocument }) {
  return <RenderNode node={page.root} />;
}

/** Bundle must come from createPageBundle/parsePageBundle; fonts use the consumer's loading policy. */
export function RenderPageBundle({ bundle, mode = "light", className }: {
  bundle: PageBundle;
  mode?: "light" | "dark";
  className?: string;
}) {
  const variables = toCSSVariables(bundle.designSystem.themes[mode], mode);
  return (
    <main data-ds-theme={mode} className={className} style={{ ...variables, colorScheme: mode, backgroundColor: "var(--ds-background)", color: "var(--ds-foreground)", fontFamily: "var(--ds-font-family)" } as CSSProperties}>
      <RenderPage page={bundle.page} />
    </main>
  );
}
