#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import manifest from "../package.json" with { type: "json" };

const help = `bambiui — editable React sources from a static registry

  bambiui init --registry <url> [--system <json>] [--dir <path>]
  bambiui add button [card input ...]
  bambiui add --all
  bambiui theme --system <json>

  --dry-run     Validate and show changes without writing files
  --overwrite   Explicitly replace conflicting planned files (add/theme/init)
  --help        Show this help
  --version     Show CLI version

Registry is explicit during this unpublished preview. HTTPS is required except
loopback development servers. No npm install, host-entry edits or publishing
runs automatically. Software is MIT licensed; Studio and user designs are separate.
`;
try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") console.log(help);
  else if (command === "--version") console.log(manifest.version);
  else {
    if (!["init", "add", "theme"].includes(command)) throw new Error(`Unknown command: ${command}. Use --help.`);
    if (args.includes("--help")) console.log(help);
    else {
      const options = {}, names = [], seen = new Set();
      const flags = { "--dry-run": "dryRun", "--overwrite": "overwrite", "--all": "all" };
      const values = { "--registry": "registry", "--system": "system", "--dir": "dir" };
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith("-")) { names.push(arg); continue; }
        if (seen.has(arg)) throw new Error(`Duplicate option: ${arg}`); seen.add(arg);
        if (flags[arg]) options[flags[arg]] = true;
        else if (values[arg] && args[i + 1] && !args[i + 1].startsWith("-")) options[values[arg]] = args[++i];
        else throw new Error(`Unknown option or missing value: ${arg}`);
      }
      const allowed = command === "init" ? ["dryRun", "overwrite", "registry", "system", "dir"] : command === "add" ? ["dryRun", "overwrite", "all"] : ["dryRun", "overwrite", "system"];
      if (Object.keys(options).some((key) => !allowed.includes(key)) || command !== "add" && names.length) throw new Error(`Unsupported argument for ${command}. Use --help.`);
      if (command === "init" && !options.registry && process.stdin.isTTY && process.stdout.isTTY) {
        const prompt = createInterface({ input: process.stdin, output: process.stdout });
        try { options.registry = (await prompt.question("Static registry index URL: ")).trim(); } finally { prompt.close(); }
      }
      const commands = await import("../lib/commands.mjs");
      if (command === "add") await commands.add(names, options); else await commands[command](options);
    }
  }
} catch (error) {
  console.error(`bambiui: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
