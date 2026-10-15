import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

/** Disposable static-host/browser session for source download and scope acceptance. */
export async function withSourceBrowser({ outDir, downloads, beforeRequest }, task) {
  let server, chrome, socket, profile, sequence = 0, stopped = false;
  const pending = new Map(), errors = [], abort = new AbortController();
  const downloadNames = new Map(), completedDownloads = [];
  const deadline = Date.now() + 115_000;
  function fail(error) { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); } pending.clear(); }
  const watchdog = setTimeout(() => { abort.abort(); fail(new Error("Source browser session timed out")); chrome?.kill("SIGKILL"); }, 115_000);
  function send(method, params = {}) {
    if (abort.signal.aborted || socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Source browser unavailable"));
    return new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 7000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  }
  async function wait(expression) {
    const until = Math.min(deadline, Date.now() + 10_000);
    do { assert.deepEqual(errors, [], "Browser runtime errors"); if (await evaluate(`Boolean(${expression})`)) return; await delay(50); } while (Date.now() < until);
    throw new Error(`Wait timed out: ${expression}`);
  }
  async function waitForDownload() {
    const until = Math.min(deadline, Date.now() + 10_000);
    do {
      if (abort.signal.aborted) throw new Error("Browser download wait aborted");
      const result = completedDownloads.shift();
      if (result) {
        if (result.state !== "completed") throw new Error("Browser canceled the download");
        return result;
      }
      await delay(50);
    } while (Date.now() < until);
    throw new Error("Browser did not confirm download completion");
  }
  async function click(selector) {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
    const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!r.width||!r.height||!e.contains(document.elementFromPoint(x,y)))throw Error('Occluded control');return {x,y}})()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 });
  }
  try {
    const root = await realpath(resolve(outDir));
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".png": "image/png", ".woff2": "font/woff2" };
    server = createServer(async (req, res) => {
      try {
        if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405).end(); return; }
        const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
        if (beforeRequest && await beforeRequest(pathname, res) === false) return;
        let path = resolve(root, `.${pathname}`);
        const inside = (candidate) => candidate === root || candidate.startsWith(root + sep);
        if (!inside(path)) { res.writeHead(403).end(); return; }
        if (!extname(path)) { try { await stat(`${path}.html`); path += ".html"; } catch { path = resolve(path, "index.html"); } }
        path = await realpath(path);
        if (!inside(path)) { res.writeHead(403).end(); return; }
        const bytes = await readFile(path);
        res.writeHead(200, { "Content-Type": mime[extname(path)] || "application/octet-stream", "Cache-Control": "no-store" }); res.end(req.method === "HEAD" ? undefined : bytes);
      } catch { res.writeHead(404).end("Not found"); }
    });
    await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    profile = await mkdtemp(resolve(tmpdir(), "bambiui-source-browser-"));
    chrome = spawn(process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "", spawnError, port;
    chrome.on("error", (error) => { spawnError = error; }); chrome.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    const startup = Date.now() + 12_000;
    while (!port && Date.now() < startup) {
      if (spawnError) throw spawnError;
      assert.equal(chrome.exitCode, null, stderr);
      try { port = Number((await readFile(resolve(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); } catch { await delay(100); }
    }
    assert.ok(port, stderr);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
    socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
    await new Promise((done, reject) => { const timer = setTimeout(() => reject(new Error("CDP connect timeout")), 5000); socket.addEventListener("open", () => { clearTimeout(timer); done(); }, { once: true }); socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP connect failure")); }, { once: true }); });
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) { const item = pending.get(message.id); if (item) { clearTimeout(item.timer); pending.delete(message.id); if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result); } }
      else if (message.method === "Browser.downloadWillBegin") downloadNames.set(message.params.guid, message.params.suggestedFilename);
      else if (message.method === "Browser.downloadProgress" && message.params.state !== "inProgress") completedDownloads.push({ ...message.params, suggestedFilename: downloadNames.get(message.params.guid) });
      else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push(message.params.args.map((arg) => arg.value || arg.description).join(" "));
    });
    socket.addEventListener("close", () => { if (!stopped) fail(new Error("CDP disconnected")); });
    await send("Runtime.enable"); await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    if (downloads) await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: resolve(downloads), eventsEnabled: true });
    await task({ send, evaluate, wait, click, origin, errors, waitForDownload });
    assert.deepEqual(errors, [], "Browser runtime errors");
  } finally {
    stopped = true; clearTimeout(watchdog); abort.abort(); fail(new Error("Source browser cleanup")); socket?.close();
    if (chrome && chrome.exitCode === null) { chrome.kill("SIGKILL"); await Promise.race([new Promise((done) => chrome.once("exit", done)), delay(3000)]); }
    server?.closeAllConnections(); if (server) await new Promise((done) => server.close(done));
    if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
