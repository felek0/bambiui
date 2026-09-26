import type { ComponentId } from "./tokens";

/*
 * React source shown in the component spotlight's "React" tab. Each entry
 * mirrors the expanded `Specimen` case in preview.tsx; update both together.
 */

const imports = (names: string, icon = true) =>
  `import { ${names} } from "@/app/studio/components";\n` +
  (icon ? `import { Icon } from "@/app/studio/icons";\n` : "");

export const snippets: Record<ComponentId, string> = {
  button: `${imports("Button")}
export function Example() {
  return (
    <>
      {/* Variants */}
      <Button endIcon={<Icon name="arrow" />}>Get started</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Delete</Button>
      <Button variant="link">Learn more</Button>

      {/* Sizes */}
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
      <Button variant="outline" iconOnly aria-label="Add item">
        <Icon name="plus" />
      </Button>

      {/* Content and states */}
      <Button startIcon={<Icon name="download" />}>Download</Button>
      <Button loading>Saving</Button>
      <Button disabled endIcon={<Icon name="arrow" />}>
        Disabled
      </Button>
    </>
  );
}
`,
  input: `${imports("Input")}
export function Example() {
  return (
    <>
      <Input
        label="Email address"
        type="email"
        placeholder="you@example.com"
        description="We only use it for receipts."
      />
      <Input
        label="Search"
        hideLabel
        type="search"
        size="sm"
        placeholder="Search components…"
        startIcon={<Icon name="search" />}
      />
      <Input
        label="Workspace URL"
        type="url"
        defaultValue="studio"
        error="Enter a full URL, including https://"
      />
      <Input
        label="Read-only workspace email"
        defaultValue="hello@studio.design"
        readOnly
      />
      <Input label="Unavailable" size="lg" disabled defaultValue="—" />

      {/* Sizes */}
      <Input label="Small" size="sm" placeholder='size="sm"' />
      <Input label="Medium" size="md" placeholder='size="md"' />
      <Input label="Large" size="lg" placeholder='size="lg"' />
    </>
  );
}
`,
  card: `${imports("Button, Card")}
export function Example() {
  return (
    <>
      <Card>
        <Card.Icon>
          <Icon name="spark" />
        </Card.Icon>
        <Card.Header>
          <Card.Title>Make something great</Card.Title>
          <Card.Description>
            Good design starts with a few thoughtful details.
          </Card.Description>
        </Card.Header>
      </Card>

      <Card variant="elevated">
        <Card.Icon>
          <Icon name="plus" />
        </Card.Icon>
        <Card.Header>
          <Card.Title>Space to explore</Card.Title>
          <Card.Description>Your next idea starts right here.</Card.Description>
        </Card.Header>
        <Card.Footer>
          <Button size="sm">Start</Button>
          <Button size="sm" variant="ghost">
            Later
          </Button>
        </Card.Footer>
      </Card>

      <Card variant="filled" size="sm">
        <Card.Header>
          <Card.Title>Filled, small</Card.Title>
          <Card.Description>
            A quieter surface for secondary content.
          </Card.Description>
        </Card.Header>
      </Card>
    </>
  );
}
`,
  badge: `${imports("Badge", false)}
const title = (value: string) => value[0].toUpperCase() + value.slice(1);
const variants = ["solid", "subtle", "outline"] as const;
const tones = ["neutral", "primary", "success", "warning", "danger", "info"] as const;

export function Example() {
  return (
    <>
      {variants.map((variant) =>
        tones.map((tone) => (
          <Badge key={variant + tone} variant={variant} tone={tone}>
            {title(tone)}
          </Badge>
        )),
      )}

      {/* Sizes */}
      <Badge size="sm" dot tone="success">
        Small
      </Badge>
      <Badge dot tone="success">
        Medium
      </Badge>
      <Badge size="lg" dot tone="success">
        Large
      </Badge>
    </>
  );
}
`,
  switch: `${imports("Switch", false)}
export function Example() {
  return (
    <>
      <Switch label="Notifications" defaultChecked />
      <Switch label="Focus mode" />
      <Switch
        label="Auto-save"
        description="Saves every change as you go."
        size="lg"
        defaultChecked
      />
      <Switch label="Compact rows" size="sm" labelPosition="start" />
      <Switch label="Unavailable" disabled />
    </>
  );
}
`,
  text: `${imports("Text", false)}
export function Example() {
  return (
    <>
      {/* Variant sets appearance; as sets document semantics. */}
      <Text variant="h1">Page title</Text>
      <Text variant="h2">Section title</Text>
      <Text variant="h3">Subsection title</Text>
      <Text variant="h4">Detail title</Text>
      <Text variant="h5">Small heading</Text>
      <Text variant="h6">Compact heading</Text>
      <Text variant="heading" as="span">Legacy heading style</Text>
      <Text>Paragraph text uses the default variant and size.</Text>
      <Text variant="paragraph" tone="info">An informative note.</Text>
      <Text variant="label" as="span">Visual label, not a form label</Text>
      <Text variant="caption" as="span" tone="primary">Updated today</Text>
    </>
  );
}
`,
  checkbox: `${imports("Checkbox", false)}
export function Example() {
  return (
    <>
      <Checkbox label="Include the details" defaultChecked />
      <Checkbox label="Keep me in the loop" />
      <Checkbox label="Select all" indeterminate />
      <Checkbox
        label="I accept the terms"
        required
        error="Please accept the terms to continue."
      />
      <Checkbox label="Small print" size="sm" />
      <Checkbox label="Unavailable" disabled defaultChecked />
    </>
  );
}
`,
};
