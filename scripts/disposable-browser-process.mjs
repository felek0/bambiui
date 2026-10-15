import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const owned = new WeakMap();

/** A dedicated POSIX group limits cleanup signals to this test's browser and descendants. */
export function spawnDisposableBrowser(executable, args) {
  const grouped = process.platform !== 'win32';
  const child = spawn(executable, args, { detached: grouped, stdio: ['ignore', 'ignore', 'pipe'] });
  const state = {
    grouped, disposed: false,
    exited: new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); }),
    closed: new Promise(resolve => child.once('close', resolve)),
  };
  owned.set(child, state);
  return child;
}

async function closesWithin(closed, timeoutMs) {
  let timer;
  try { return await Promise.race([closed.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]); }
  finally { clearTimeout(timer); }
}

export async function stopDisposableBrowser(child, timeoutMs = 2000, graceful = false) {
  if (!child) return;
  const state = owned.get(child);
  assert.ok(state, 'Refusing to signal a browser not launched by this helper');
  if (state.disposed) return;
  function signal(name) {
    if (!child.pid) return;
    try {
      if (state.grouped) process.kill(-child.pid, name);
      else if (child.exitCode === null && child.signalCode === null) child.kill(name);
    } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  try {
    const exitedGracefully = graceful && await closesWithin(state.exited, timeoutMs);
    if (!exitedGracefully) signal('SIGTERM');
    if (!exitedGracefully && !await closesWithin(state.exited, timeoutMs)) {
      signal('SIGKILL');
      assert.ok(await closesWithin(state.exited, timeoutMs), 'Browser did not exit after forced cleanup');
    }
    if (state.grouped) signal('SIGKILL');
    // Chrome helpers can detach from the group and retain inherited stderr after the
    // leader exits. Release our pipe explicitly; never signal unrelated process groups.
    child.stderr?.destroy();
    assert.ok(await closesWithin(state.closed, timeoutMs), 'Browser stdio did not close after cleanup');
    state.disposed = true;
  } catch (error) {
    // Report cleanup failure without allowing an inherited pipe to hide that failure forever.
    child.stderr?.destroy();
    throw error;
  }
}
