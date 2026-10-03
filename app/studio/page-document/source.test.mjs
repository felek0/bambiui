import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPageSourceFiles } from "../../../scripts/page-source-files.mjs";
import { createPageBundle, parsePageBundle } from "./bundle.ts";
import { defaultSystem } from "../tokens.ts";

const page = JSON.parse(await readFile(new URL("./account-settings.json", import.meta.url), "utf8"));

test("source delivery includes the used components, local dependencies, CSS and snapshot", async () => {
  const bundle = createPageBundle(page, defaultSystem);
  const files = await createPageSourceFiles(bundle);
  for (const name of ["Page.tsx", "PageContent.tsx", "theme.css", "page.css", "page.bambiui.json", "package.json", "README.md", "components/button.tsx", "components/card.tsx", "components/input.tsx", "components/switch.tsx", "components/text.tsx", "components/field.tsx", "components/spinner.tsx", "components/types.ts", "components/components.module.css", "layout/index.tsx", "layout/layout.module.css", "cx.ts"]) assert.ok(files.has(name), `Missing ${name}`);
  assert.equal(files.has("components/checkbox.tsx"), false);
  assert.equal(files.has("components/badge.tsx"), false);
  assert.deepEqual(parsePageBundle(files.get("page.bambiui.json")), bundle);
  assert.match(files.get("theme.css"), /data-ds-theme="light"/);
  assert.match(files.get("theme.css"), /data-ds-theme="dark"/);
  assert.match(files.get("page.css"), /\.sr-only/);
  const manifest = JSON.parse(files.get("package.json"));
  assert.ok(manifest.dependencies["@base-ui/react"]);
  assert.ok(manifest.peerDependencies.react);
  assert.ok(manifest.peerDependencies["react-dom"]);
  assert.equal(manifest.dependencies.next, undefined);
  assert.equal(files.get("components/button.tsx"), await readFile(new URL("../components/button.tsx", import.meta.url), "utf8"));
});

test("minimal text delivery does not include unused interactive component sources", async () => {
  const minimal = { version: 1, id: "minimal", name: "Minimal", root: { id: "root", kind: "container", children: [{ id: "text", kind: "text", text: "Hello" }] } };
  const files = await createPageSourceFiles(createPageBundle(minimal, defaultSystem));
  assert.match(files.get("components/index.ts"), /export \{ Text \}/);
  assert.equal(files.has("components/button.tsx"), false);
  assert.equal(files.has("components/field.tsx"), false);
  assert.deepEqual(JSON.parse(files.get("package.json")).dependencies, {});
});

test("seven-component source collects Checkbox client boundary, icons and Base UI dependencies", async () => {
  const sample = JSON.parse(await readFile(new URL("./design-safe.json", import.meta.url), "utf8"));
  const files = await createPageSourceFiles(createPageBundle(sample, defaultSystem));
  for (const name of ["badge", "button", "card", "checkbox", "input", "switch", "text"]) {
    assert.ok(files.has(`components/${name}.tsx`));
    assert.match(files.get("components/index.ts"), new RegExp(`from "./${name}"`));
  }
  assert.ok(files.has("icons.tsx"));
  assert.match(files.get("components/checkbox.tsx"), /^"use client";/);
  assert.match(files.get("components/checkbox.tsx"), /@base-ui\/react\/checkbox/);
  assert.match(files.get("PageContent.tsx"), /Checkbox/);
  assert.match(files.get("PageContent.tsx"), /maxWidth=\{"full"\}/);
  assert.ok(JSON.parse(files.get("package.json")).dependencies["@base-ui/react"]);
  for (const [name, source] of files) {
    if (/\.tsx?$/.test(name)) assert.doesNotMatch(source, /from ["'](?:next|.*examples\/)/);
  }
});

test("source delivery revalidates its bundle rather than trusting the caller", async () => {
  const bundle = createPageBundle(page, defaultSystem);
  bundle.page.root.props.onClick = "alert(1)";
  await assert.rejects(createPageSourceFiles(bundle), /unknown key onClick/);
});
