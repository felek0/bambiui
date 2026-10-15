import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { spawnDisposableBrowser, stopDisposableBrowser } from './disposable-browser-process.mjs';

async function ready(child) {
  let text = '', timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Fixture did not become ready')), 5000);
      child.once('error', reject);
      child.stderr.on('data', chunk => { text += chunk; if (text.includes('ready\n')) resolve(); });
      child.once('exit', () => { if (!text.includes('ready\n')) reject(new Error('Fixture exited before ready')); });
    });
  } finally { clearTimeout(timer); }
  return text;
}

test('cleanup waits for stdio close and is safe to repeat', async () => {
  const child = spawnDisposableBrowser(process.execPath, ['-e', 'process.stderr.write("ready\\n"); setInterval(()=>{},1000);']);
  let closed = false;
  child.once('close', () => { closed = true; });
  try {
    await ready(child);
    await stopDisposableBrowser(child, 1000);
    assert.equal(closed, true);
    await stopDisposableBrowser(child, 1000);
  } finally { await stopDisposableBrowser(child, 1000); }
});

test('kills a TERM-resistant descendant that retains stderr after its parent exits', { skip: process.platform === 'win32' }, async () => {
  const descendant = 'process.on("SIGTERM",()=>{}); process.stderr.write("ready\\n"); setInterval(()=>{},1000);';
  const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore','ignore','inherit']}); setInterval(()=>{},1000);`;
  const child = spawnDisposableBrowser(process.execPath, ['-e', parent]);
  let exited = false, closed = false;
  child.once('exit', () => { exited = true; });
  child.once('close', () => { closed = true; });
  try {
    await ready(child);
    await stopDisposableBrowser(child, 250);
    assert.equal(exited, true);
    assert.equal(closed, true, 'Inherited pipe must close, not only the parent process');
  } finally { await stopDisposableBrowser(child, 1000); }
});

test('releases stderr even when a detached helper keeps its inherited writer open', { skip: process.platform === 'win32' }, async () => {
  const descendant = 'process.on("SIGTERM",()=>{}); process.stderr.write(process.pid+"\\nready\\n"); setInterval(()=>{},1000);';
  const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:['ignore','ignore','inherit']}); setInterval(()=>{},1000);`;
  const child = spawnDisposableBrowser(process.execPath, ['-e', parent]);
  let detachedPid;
  try {
    detachedPid = Number((await ready(child)).split('\n')[0]);
    assert.ok(Number.isSafeInteger(detachedPid) && detachedPid > 1);
    await stopDisposableBrowser(child, 1000);
    assert.equal(child.stderr.destroyed, true);
    assert.equal(process.kill(detachedPid, 0), true, 'Do not signal helpers outside the owned process group');
  } finally {
    if (detachedPid) { try { process.kill(-detachedPid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    await stopDisposableBrowser(child, 1000);
  }
});

test('cleanup handles launch failure', async () => {
  const child = spawnDisposableBrowser('/bambiui-missing-browser-executable', []);
  child.once('error', () => {});
  await stopDisposableBrowser(child, 1000);
});

test('cleanup refuses to signal processes it does not own', async () => {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  const closed = new Promise(resolve => child.once('close', resolve));
  try { await assert.rejects(stopDisposableBrowser(child), /not launched by this helper/); }
  finally { child.kill(); await closed; }
});
