import type { ComponentId } from "./tokens";

/*
 * React source shown in the component spotlight's "React" tab. Each entry
 * illustrates representative supported props; interactive client-only demos live in preview.tsx.
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

      {/* Local instance values, not shared theme tokens. */}
      <Button appearance={{ paddingTop: 12, paddingRight: 24, paddingBottom: 8, paddingLeft: 16, borderTopLeftRadius: 20 }}>
        Local spacing
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
        required
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
        endIcon={<Icon name="link" />}
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

      {/* appearance targets the painted shell; parts styles the field pieces. */}
      <Input
        label="Locally styled email"
        name="localEmail"
        description="Shared tokens remain unchanged."
        error="Enter a valid email."
        errorPosition="above"
        errorIcon="warning"
        appearance={{ paddingTop: 12, paddingRight: 18, paddingBottom: 8, paddingLeft: 14, borderTopLeftRadius: 16 }}
        parts={{ root: { gap: 8 }, label: { fontWeight: 700 }, description: { fontSize: 12 }, error: { fontSize: 13, gap: 6 } }}
      />
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

      <Card variant="elevated" size="lg">
        <Card.Icon>
          <Icon name="plus" />
        </Card.Icon>
        <Card.Header>
          <Card.Title>Space to explore</Card.Title>
          <Card.Description>Your next idea starts right here.</Card.Description>
        </Card.Header>
        <Card.Content>Give your next idea a place to grow.</Card.Content>
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

      {/* Card slots each accept appearance; Card has no parts object. */}
      <Card appearance={{ paddingTop: 20, paddingRight: 24, paddingBottom: 16, paddingLeft: 12, borderTopLeftRadius: 24, shadow: "md" }}>
        <Card.Header appearance={{ gap: 12, paddingBottom: 4 }}>
          <Card.Title appearance={{ fontSize: 22, fontWeight: 650 }}>Independent slots</Card.Title>
          <Card.Description appearance={{ lineHeight: 1.8 }}>Instance values leave shared tokens unchanged.</Card.Description>
        </Card.Header>
        <Card.Content appearance={{ gap: 20, paddingTop: 8 }}>Local content spacing.</Card.Content>
        <Card.Footer appearance={{ gap: 16, marginTop: 4 }}><Button>Continue</Button></Card.Footer>
      </Card>
    </>
  );
}
`,
  badge: `${imports("Badge")}
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

      <Badge variant="outline" tone="info" startIcon={<Icon name="spark" />}>Info</Badge>

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
      {/* Local instance geometry; tone and variant still supply the colors. */}
      <Badge appearance={{ paddingTop: 6, paddingBottom: 8, borderTopLeftRadius: 12, borderBottomRightRadius: 4 }}>Local draft</Badge>
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
      <Switch label="Read-only setting" readOnly defaultChecked />
      <Switch label="Needs attention" error="Turn this setting on to continue." />
      <Switch label="Unavailable" disabled defaultChecked />
      {/* appearance targets the track, not the field's label. */}
      <Switch
        label="Local notification setting"
        description="Shared tokens remain unchanged."
        error="Review this setting."
        errorPosition="below"
        errorIcon="info"
        appearance={{ width: 64, height: 30 }}
        parts={{ root: { gap: 8 }, row: { gap: 16 }, label: { fontSize: 15, fontWeight: 600 }, error: { fontSize: 13, gap: 6 } }}
      />
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
      <Text tone="danger" size="lg">An important warning.</Text>
      {/* Local instance typography, not a new typography token. */}
      <Text appearance={{ width: "fill", fontSize: 18, fontWeight: 500, lineHeight: 1.8, letterSpacing: 0.3, textAlign: "right" }}>
        Locally aligned text; shared typography is unchanged.
      </Text>
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
      <Checkbox label="Select all" size="lg" description="Includes every item in this list." indeterminate />
      <Checkbox
        label="I accept the terms"
        required
        error="Please accept the terms to continue."
      />
      <Checkbox label="Small print" size="sm" />
      <Checkbox label="Read-only selection" readOnly defaultChecked />
      <Checkbox label="Unavailable" disabled defaultChecked />
      {/* Control part values merge over primary appearance. */}
      <Checkbox
        label="Local terms acceptance"
        description="Shared tokens remain unchanged."
        error="Review the terms."
        errorPosition="above"
        errorIcon="info"
        appearance={{ width: 26, height: 26, borderTopLeftRadius: 8 }}
        parts={{ row: { gap: 14 }, control: { borderBottomRightRadius: 4 }, label: { fontWeight: 600 }, description: { fontSize: 12 }, error: { fontSize: 13 } }}
      />
    </>
  );
}
`,
};
