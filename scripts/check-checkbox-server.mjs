#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtures = join(root, '.next');
let fixture;

async function build(cwd) {
  const next = join(root, 'node_modules/next/dist/bin/next');
  const child = spawn(process.execPath, [next, 'build'], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'inherit',
    timeout: 180_000,
  });
  const code = await new Promise((done, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Next build terminated by ${signal}`));
      else done(code);
    });
  });
  assert.equal(code, 0, `Next build failed with exit code ${code}`);
}

try {
  await mkdir(fixtures, { recursive: true });
  fixture = await mkdtemp(join(fixtures, 'checkbox-server-'));
  await mkdir(join(fixture, 'app'));
  await symlink(join(root, 'node_modules'), join(fixture, 'node_modules'), 'dir');
  await writeFile(join(fixture, 'package.json'), '{"private":true,"type":"module"}\n');
  // Use the actual component source, not a copy or a client wrapper.
  const checkbox = relative(join(fixture, 'app'), join(root, 'app/studio/components/checkbox'));
  await writeFile(join(fixture, 'app/page.tsx'), `import { Checkbox } from ${JSON.stringify(checkbox)};\n\nexport default function Page() {\n  return <main><h1>Server Component fixture</h1><Checkbox label="Accept terms" /></main>;\n}\n`);
  await writeFile(join(fixture, 'app/layout.tsx'), 'export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }\n');
  await writeFile(join(fixture, 'next.config.mjs'), 'export default { output: "export" };\n');
  console.log(`Building isolated Next App Router fixture: ${relative(root, fixture)}`);
  await build(fixture);

  const html = await readFile(join(fixture, 'out/index.html'), 'utf8');
  assert.match(html, /Server Component fixture/, 'server page heading missing from static HTML');
  assert.match(html, /Accept terms/, 'checkbox label missing from static HTML');
  assert.match(html, /role="checkbox"/, 'Base UI checkbox role missing from static HTML');
  assert.match(html, /aria-checked="false"/, 'unchecked checkbox state missing from static HTML');
  assert.match(html, /<label\b[^>]*>[\s\S]*?role="checkbox"[\s\S]*?Accept terms[\s\S]*?<\/label>/, 'label not associated with checkbox in static HTML');

  // Client references and scripts show that the exported server page ships a hydration boundary.
  assert.match(html, /\/_next\/static\/chunks\/[^" ]+\.js/, 'no client JS referenced in static HTML');
  const manifest = await readFile(join(fixture, '.next/server/app/page_client-reference-manifest.js'), 'utf8');
  assert.match(manifest, /app\/studio\/components\/checkbox\.tsx/, 'Checkbox missing from page client-reference manifest');
  const chunks = join(fixture, 'out/_next/static/chunks');
  const scripts = (await readdir(chunks)).filter((name) => name.endsWith('.js'));
  assert.ok(scripts.length, 'no exported client chunks');
  console.log(`PASS: static HTML contains labelled, unchecked checkbox; page client-reference manifest includes Checkbox and ${scripts.length} client JS chunks are exported.`);
  console.log('Note: client references indicate hydration wiring; this check does not execute hydration in a browser.');
} catch (error) {
  console.error('FAIL: isolated Checkbox Server Component build or output check:', error);
  process.exitCode = 1;
} finally {
  if (fixture) {
    try { await rm(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch (error) { console.error('FAIL: fixture cleanup:', error); process.exitCode = 1; }
  }
}
