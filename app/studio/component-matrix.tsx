import { useEffect, useMemo, useRef } from "react";
import { Badge, Button, Card, Checkbox, Input, Switch, Text } from "./components";
import { Icon } from "./icons";
import { resolveComponentDefaults, type ComponentDefaults } from "./component-defaults";
import {
  componentRecipeOptions, componentRecipeParts, componentRecipeSelectionFromElement,
  type ComponentRecipeOption, type ComponentRecipeSelection, type SharedComponentId,
} from "./component-recipes";
import styles from "./component-matrix.module.css";

const title = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, letter => letter.toUpperCase());
const sizes = { sm: "Small", md: "Medium", lg: "Large" } as const;

/** Use the public components, not specimen-only styles, so Project and exported code agree. */
function RecipeExample({ component, option, defaults, showError = false }: {
  component: SharedComponentId; option: ComponentRecipeOption; defaults?: ComponentDefaults; showError?: boolean;
}) {
  const resolved = resolveComponentDefaults(component, defaults);
  const props = { ...resolved.props, ...option.props };
  // Content is useful here; insertion-only state choices must not hide another recipe's anatomy.
  delete props.radius;
  const label = String(props.label ?? "Label");
  const description = String(props.description ?? "Helpful context for this field.");
  const error = option.variant.startsWith("invalid") || component === "input" && option.variant === "readonly" && showError ? String(resolved.props.error || "Please check this field.") : undefined;
  switch (component) {
    case "button": return <Button {...props} disabled={false} loading={false}>{resolved.text}</Button>;
    case "badge": return <Badge {...props}>{resolved.text}</Badge>;
    case "text": return <Text {...props} as="span">{resolved.text}</Text>;
    case "input": return <Input {...props} label={label} description={description} error={error} hideLabel={false} disabled={false} readOnly={option.variant === "readonly"} />;
    case "switch": return <Switch {...props} label={label} description={description} error={error} hideLabel={false} disabled={false} readOnly={false} defaultChecked={undefined} checked={!!option.props.defaultChecked} />;
    case "checkbox": return <Checkbox {...props} label={label} description={description} error={error} hideLabel={false} disabled={false} readOnly={false} indeterminate={false} defaultChecked={undefined} checked={!!option.props.defaultChecked} />;
    case "card": {
      const text = resolveComponentDefaults("text", defaults);
      const button = resolveComponentDefaults("button", defaults);
      return <Card {...props}>
        <Card.Icon><Icon name="check" /></Card.Icon>
        <Card.Header><Card.Title>{resolved.slots?.title}</Card.Title><Card.Description>{resolved.slots?.description}</Card.Description></Card.Header>
        <Card.Content><Text {...text.props}>{resolved.slots?.content}</Text></Card.Content>
        <Card.Footer><Button {...button.props} disabled={false} loading={false}>{resolved.slots?.action}</Button></Card.Footer>
      </Card>;
    }
  }
}

function rootSelection(component: SharedComponentId, recipe: string): ComponentRecipeSelection {
  return { component, recipe, part: "root", target: componentRecipeParts(component)[0].target };
}

export function ComponentMatrix({ component, defaults, selection, onSelect }: {
  component: SharedComponentId; defaults?: ComponentDefaults; selection: ComponentRecipeSelection | null;
  onSelect: (selection: ComponentRecipeSelection) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const options = componentRecipeOptions(component);
  const rows = useMemo(() => options.filter(option => option.size === "sm").map(option => ({
    key: [option.variant, option.tone].filter(Boolean).join("."),
    label: [title(option.variant), option.tone && title(option.tone)].filter(Boolean).join(" / "),
    options: options.filter(candidate => candidate.variant === option.variant && candidate.tone === option.tone),
  })), [options]);

  useEffect(() => {
    const region = root.current;
    if (!region) return;
    // Examples are design hit targets. Keyboard users select their frame button, then a layer in the inspector.
    for (const element of region.querySelectorAll<HTMLElement>("[data-recipe-body] :is(a, button, input, select, textarea, [tabindex])")) element.tabIndex = -1;
  }, [component, defaults]);

  useEffect(() => {
    const region = root.current;
    if (!region || selection?.component !== component) return;
    const example = Array.from(region.querySelectorAll<HTMLElement>("[data-recipe-example]")).find(element => element.dataset.recipeExample === selection.recipe);
    if (!example) return;
    const parts = Array.from(example.querySelectorAll<HTMLElement>(`[data-ds-component="${component}"][data-component-part="${selection.part}"]`));
    let element = parts.find(part => part.dataset.componentTarget === selection.target) ?? parts[0];
    if (component === "card" && selection.target === "text" && ["content", "footer"].includes(selection.part)) {
      element = element?.querySelector<HTMLElement>('[data-component-target="text"]') ?? element;
    }
    element?.setAttribute("data-system-selected-part", selection.target);
    return () => element?.removeAttribute("data-system-selected-part");
  }, [component, selection, defaults]);

  return <div ref={root} className={styles.matrix} data-component-matrix={component}>
    <header className={styles.heading}>
      <div><h2>{title(component)}</h2><p>Select a frame or a text layer to edit that exact combination.</p></div>
      <span>{options.length} combinations</span>
    </header>
    <div className={styles.columns} aria-hidden="true"><span>Variant{component === "text" || component === "badge" ? " / tone" : " / state"}</span>{Object.values(sizes).map(size => <span key={size}>{size}</span>)}</div>
    <div className={styles.rows}>
      {rows.map(row => <section key={row.key} className={styles.row} aria-label={`${title(component)} ${row.label}`}>
        <h3>{row.label}</h3>
        {row.options.map(option => {
          const selected = selection?.component === component && selection.recipe === option.key;
          return <div className={styles.example} key={option.key} data-recipe-example={option.key} data-selected={selected || undefined}>
            <button type="button" className={styles.exampleLabel} aria-label={`Select ${title(component)} ${row.label} ${sizes[option.size]} ${component === "text" ? "text" : "frame"}`} aria-pressed={selected && selection.part === "root"}
              onClick={() => onSelect(rootSelection(component, option.key))}>{sizes[option.size]}<span aria-hidden="true">↗</span></button>
            <div className={styles.body} data-recipe-body aria-hidden="true"
              onPointerDownCapture={event => { if (event.button === 0) event.preventDefault(); }}
              onClickCapture={event => {
                event.preventDefault(); event.stopPropagation();
                const hit = event.target instanceof Element ? componentRecipeSelectionFromElement(event.target, component) : null;
                onSelect(hit && hit.recipe === option.key ? hit : rootSelection(component, option.key));
              }}>
              <RecipeExample component={component} option={option} defaults={defaults} showError={selected && selection.part === "error"} />
            </div>
          </div>;
        })}
      </section>)}
    </div>
  </div>;
}
