import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, relative, sep } from "node:path";
import ts from "typescript";

// Test-only: Node >=22.15 (registerHooks). No package type/config changes.
export function installParityLoader() {
  const root = resolve(import.meta.dirname, "../../..");
  const virtual = new Map();
  let serial = 0;
  const scoped = (url) => {
    if (!url?.startsWith("file:")) return false;
    const path = relative(root, fileURLToPath(url));
    return path !== ".." && !path.startsWith(`..${sep}`) && !path.split(sep).includes("node_modules");
  };
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (virtual.has(specifier)) return { url: specifier, shortCircuit: true };
      if (scoped(context.parentURL) && specifier.startsWith(".")) {
        const base = fileURLToPath(new URL(specifier, context.parentURL));
        for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts"), resolve(base, "index.tsx")]) {
          const url = pathToFileURL(candidate).href;
          if (scoped(url) && /(?:\.tsx?|\.module\.css)$/.test(candidate) && existsSync(candidate)) {
            return { url, shortCircuit: true };
          }
        }
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (!scoped(url)) return nextLoad(url, context);
      if (url.endsWith(".module.css")) {
        // Deterministic class-name map, NOT CSS parsing, browser or visual acceptance.
        const prefix = relative(root, fileURLToPath(url)).replace(/[^a-zA-Z0-9]/g, "_");
        return { format: "module", shortCircuit: true, source: `export default new Proxy(Object.create(null), { get: (_, key) => typeof key === "string" ? ${JSON.stringify(prefix)} + "__" + key : undefined });` };
      }
      if (/\.tsx?$/.test(url)) {
        const source = virtual.get(url) ?? readFileSync(fileURLToPath(url), "utf8");
        const result = ts.transpileModule(source, {
          fileName: fileURLToPath(url),
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
        });
        return { format: "module", shortCircuit: true, source: result.outputText };
      }
      return nextLoad(url, context);
    },
  });
  return {
    async generated(source) {
      const url = new URL(`./__parity_virtual_${serial++}.tsx`, import.meta.url).href;
      virtual.set(url, source);
      try { return await import(url); }
      finally { virtual.delete(url); }
    },
    cleanup() { virtual.clear(); hooks.deregister(); },
  };
}
