import type { ReactNode } from "react";
import { Button, Card, Input, Switch, Text } from "../components";
import { Container, Grid, Stack, type SpacingStep } from "../layout";
import type { PageDocument, PageNode } from "./model";

function RenderNode({ node }: { node: PageNode }): ReactNode {
  const p = node.props ?? {};
  const children = node.children?.map((child) => <RenderNode key={child.id} node={child} />);
  const marker = { "data-page-node": node.id };
  switch (node.kind) {
    case "container": return <Container {...marker} maxWidth={p.maxWidth as "narrow" | "wide" | undefined}>{children}</Container>;
    case "stack": return <Stack {...marker} direction={p.direction as "row" | "column" | undefined} gap={p.gap as SpacingStep | undefined} align={p.align as "start" | "center" | "end" | "stretch" | undefined} justify={p.justify as "start" | "center" | "end" | "between" | undefined} wrap={p.wrap as boolean | undefined}>{children}</Stack>;
    case "grid": return <Grid {...marker} columns={p.columns as 1 | 2 | 3 | undefined} gap={p.gap as SpacingStep | undefined}>{children}</Grid>;
    case "gridItem": return <Grid.Item {...marker} span={p.span as 1 | 2 | 3 | undefined}>{children}</Grid.Item>;
    case "form": return <form {...marker} action={p.action as string} method="get">{children}</form>;
    case "card": return <Card {...marker}>{children}</Card>;
    case "cardHeader": return <Card.Header {...marker}>{children}</Card.Header>;
    case "cardTitle": return <Card.Title {...marker}>{node.text}</Card.Title>;
    case "cardDescription": return <Card.Description {...marker}>{node.text}</Card.Description>;
    case "cardContent": return <Card.Content {...marker}>{children}</Card.Content>;
    case "text": return <Text {...marker} variant={p.variant as "h1" | "h2" | "h3" | "paragraph" | "caption" | undefined}>{node.text}</Text>;
    case "input": return <Input {...marker} label={p.label as string} name={p.name as string} type={p.type as "text" | "email" | undefined} required={p.required as boolean | undefined} />;
    case "switch": return <Switch {...marker} label={p.label as string} name={p.name as string} />;
    case "button": return <Button {...marker} type={p.type as "submit" | "button" | undefined}>{node.text}</Button>;
  }
}

/** Accept only the result of parsePageDocument, never unvalidated external JSON. */
export function RenderPage({ page }: { page: PageDocument }) {
  return <RenderNode node={page.root} />;
}
