import { duplicateComposerProject, type ComposerCommand, type ComposerPageIdRemap, type ComposerSystemCatalog } from "./commands.ts";
import { createComposerDocument, createComposerPage, createComposerFrame, type ComposerPreset, type ComposerDocument, type ProjectCollection } from "./model.ts";
import { frameIdRemap, nextFramePosition } from "./frames.ts";
import { createComposerHistory, executeComposerCommands, undoComposer, redoComposer, type ComposerHistory } from "./history.ts";
import { readComposerIndex, readComposerProject, createStoredComposerProject, saveComposerProject, registerComposerProject, selectComposerProject, deserializeComposerIndex, type ComposerStorage, type ExpectedProject, type RegistrationEvidence } from "./storage.ts";

import { flattenNodes, resolveSelection, type NodeSelection } from "./selection.ts";
import { prepareMove, type MoveTarget } from "./movement.ts";
import { proposeInsertion, type InsertKind } from "./insertion.ts";
import { composerFrameToPageDocument } from "./model.ts";
import { prepareNodeAction, type NodeAction } from "./component-actions.ts";

export type ProjectSession = { selection: NodeSelection | null; history: ComposerHistory; expected: ExpectedProject; pageId: string | null; frameId: string | null; status: "saved" | "unsaved"; error: string };
export type ComposerState = {
  mode: "design" | "preview"; ready: boolean; collection: ProjectCollection; indexRaw: string | null; indexBlocked: boolean;
  sessions: Record<string, ProjectSession>; unavailable: Record<string, string>;
  message: string; partial: RegistrationEvidence | null;
};
const dictionary = <T>(): Record<string, T> => Object.create(null);
const withSession = (sessions: ComposerState["sessions"], id: string, value: ProjectSession) => Object.assign(dictionary<ProjectSession>(), sessions, { [id]: value });
const initialState = (): ComposerState => ({ mode: "design", ready: false, collection: { version: 1, activeProjectId: null, projectIds: [] }, indexRaw: null, indexBlocked: false, sessions: dictionary<ProjectSession>(), unavailable: dictionary<string>(), message: "", partial: null });
const errorText = (error: unknown) => error instanceof Error ? error.message : "Project operation failed";
const session = (document: ComposerDocument, expected: ExpectedProject): ProjectSession => ({ selection: null, history: createComposerHistory(document), expected, pageId: document.pages[0]?.id ?? null, frameId: null, status: "saved", error: "" });

/** Synchronous orchestration: no delayed saves or captured project/system IDs. Hydration only reads. */
export class ComposerController {
  private state = initialState();
  private storage: ComposerStorage | null = null;
  private listeners = new Set<() => void>();
  private catalog: () => ComposerSystemCatalog;
  private id: () => string;
  private insertionEpoch = 0;
  insertionSession = () => this.insertionEpoch;
  constructor(catalog: () => ComposerSystemCatalog, id: () => string) { this.catalog = catalog; this.id = id; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<ComposerState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
  setMode = (mode: "design" | "preview") => {
      this.insertionEpoch++;
      const sessions = dictionary<ProjectSession>();
      for (const [id, session] of Object.entries(this.state.sessions)) sessions[id] = { ...session, selection: null };
      this.publish({ mode, sessions });
    };
  report(message: string) { this.publish({ message }); }
  hydrate(storage: ComposerStorage) {
    if (this.state.ready) return;
    this.storage = storage;
    const index = readComposerIndex(storage);
    if (index.kind === "blocked") { this.publish({ ready: true, indexBlocked: true, message: index.message }); return; }
    const sessions = dictionary<ProjectSession>(), unavailable = dictionary<string>();
    for (const id of index.collection.projectIds) {
      const read = readComposerProject(storage, id, index.collection);
      if (read.kind === "blocked") unavailable[id] = read.message;
      else sessions[id] = session(read.envelope.document, { raw: read.raw, revision: read.envelope.revision });
    }
    this.publish({ ready: true, collection: index.collection, indexRaw: index.raw, sessions, unavailable,
      message: index.collection.activeProjectId ? unavailable[index.collection.activeProjectId] ?? "" : "" });
  }
  active() { const id = this.state.collection.activeProjectId; return id ? this.state.sessions[id] ?? null : null; }
  private writable() { return this.storage && this.state.ready && !this.state.indexBlocked && !this.state.partial; }
  private put(id: string, value: ProjectSession) { this.publish({ sessions: withSession(this.state.sessions, id, value) }); }
  save = () => {
    const active = this.active();
    if (!this.writable() || !active) return false;
    const result = saveComposerProject(this.storage!, active.history.present.id, active.history.present, active.expected, this.state.indexRaw);
    if (result.kind === "blocked") { this.put(active.history.present.id, { ...active, status: "unsaved", error: result.message }); return false; }
    this.put(active.history.present.id, { ...active, expected: { raw: result.raw, revision: result.envelope.revision }, status: "saved", error: "" });
    return true;
  };
  open = (id: string) => {
    if (!this.writable()) return false;
    if (this.active()?.status === "unsaved" && !this.save()) { this.report("Project switch stopped: the current project's unsaved edits are retained. Retry saving or download its JSON before reloading."); return false; }
    // Validate bytes again, but never replace an existing session/history with a stale async read.
    const read = readComposerProject(this.storage!, id, this.state.collection);
    if (read.kind === "blocked") { this.report(read.message); return false; }
    const existing = this.state.sessions[id];
    if (existing && read.raw !== existing.expected.raw) { this.report("Project changed outside this editor. Reload only after backing up in-memory edits; no stored bytes were replaced."); return false; }
    const selected = selectComposerProject(this.storage!, id, this.state.collection, this.state.indexRaw);
    if (selected.kind === "blocked") { this.report(selected.message); return false; }
    this.insertionEpoch++;
    this.publish({ collection: selected.collection, indexRaw: selected.raw, message: "", sessions: existing ? this.state.sessions : withSession(this.state.sessions, id, session(read.envelope.document, { raw: read.raw, revision: read.envelope.revision })) });
    return true;
  };
  private registerAndOpen(document: ComposerDocument) {
    if (!this.writable()) return false;
    if (this.active()?.status === "unsaved" && !this.save()) return false;
    const result = createStoredComposerProject(this.storage!, document.id, document, this.state.indexRaw);
    if (result.kind === "blocked") { this.report(result.message); return false; }
    if (result.kind === "partial") { this.publish({ partial: result.evidence, message: result.message }); return false; }
    this.publish({ collection: deserializeComposerIndex(result.indexRaw), indexRaw: result.indexRaw,
      sessions: withSession(this.state.sessions, document.id, session(result.envelope.document, { raw: result.raw, revision: result.envelope.revision })) });
    if (!this.open(document.id)) { this.report(`Project created and registered, but could not be selected. Open it from Projects after resolving the selection error. ${this.state.message}`); return false; }
    return true;
  }
  create = (name: string, systemId: string) => {
    try {
      if (!this.catalog().some((entry) => (typeof entry === "string" ? entry : entry.id) === systemId)) throw new Error("Select an available design system");
      return this.registerAndOpen(createComposerDocument(this.id(), systemId, name));
    } catch (error) { this.report(errorText(error)); return false; }
  };
  duplicate = () => {
    const active = this.active(); if (!active) return false;
    try {
      const source = active.history.present;
      const pages = dictionary<ComposerPageIdRemap>();
      for (const page of source.pages) {
        const frames = dictionary<ComposerPageIdRemap["frames"][string]>();
        for (const frame of page.frames) {
          const nodeIds = dictionary<string>();
          const visit = (node: typeof frame.root) => { nodeIds[node.id] = this.id(); for (const child of node.children ?? []) visit(child); };
          visit(frame.root); frames[frame.id] = { frameId: this.id(), nodeIds };
        }
        pages[page.id] = { pageId: this.id(), frames };
      }
      return this.registerAndOpen(duplicateComposerProject(source, this.id(), `${source.name.slice(0, 115)} copy`, pages));
    } catch (error) { this.report(errorText(error)); return false; }
  };
  retryRegistration = () => {
    const evidence = this.state.partial; if (!this.storage || !evidence) return false;
    const index = readComposerIndex(this.storage);
    if (index.kind === "blocked") { this.report(index.message); return false; }
    const result = registerComposerProject(this.storage, evidence.projectId, { raw: evidence.raw, revision: evidence.revision }, index.raw);
    if (result.kind === "blocked") { this.report(result.message); return false; }
    this.publish({ partial: null, collection: deserializeComposerIndex(result.indexRaw), indexRaw: result.indexRaw,
      sessions: withSession(this.state.sessions, evidence.projectId, session(result.envelope.document, { raw: result.raw, revision: result.envelope.revision })) });
    if (!this.open(evidence.projectId)) { this.report(`Registration recovered, but project selection failed. ${this.state.message}`); return false; }
    return true;
  };
  private commit(next: ComposerHistory, inserted?: NodeSelection) {
    const active = this.active(); if (!active || next === active.history) return true;
    const pageId = next.present.pages.some((page) => page.id === active.pageId) ? active.pageId : next.present.pages[0]?.id ?? null;
    const frameId = inserted?.frameId ?? (next.present.pages.find(page => page.id === pageId)?.frames.some(frame => frame.id === active.frameId) ? active.frameId : null);
    const selection = inserted ?? (active.selection?.pageId === pageId && active.selection.frameId === frameId && resolveSelection(next.present, active.selection) ? active.selection : null);
    this.put(next.present.id, { ...active, history: next, pageId, frameId, selection, status: "unsaved", error: "" });
    this.publish({ message: "" }); this.save();
    return true; // Valid mutation stays in memory even when saving fails; status communicates persistence separately.
  }
  execute = (command: ComposerCommand) => {
    if (!this.writable() || !this.active()) return false;
    try { return this.commit(executeComposerCommands(this.active()!.history, [command], this.catalog())); }
    catch (error) { this.report(errorText(error)); return false; }
  };
  travel = (direction: "undo" | "redo") => {
    if (!this.writable() || !this.active()) return false;
    try { return this.commit((direction === "undo" ? undoComposer : redoComposer)(this.active()!.history, this.catalog())); }
    catch (error) { this.report(errorText(error)); return false; }
  };
  selectPage = (id: string) => {
    const active = this.active(); if (!active || !active.history.present.pages.some((page) => page.id === id)) return false;
    if (active.pageId !== id) this.insertionEpoch++;
    this.put(active.history.present.id, { ...active, pageId: id, frameId: active.pageId === id ? active.frameId : null, selection: active.pageId === id ? active.selection : null }); return true;
  };
  addPage = () => {
    const active = this.active(); if (!active) return false;
    const page = createComposerPage(this.id(), `Page ${active.history.present.pages.length + 1}`);
    if (!this.execute({ type: "insertPage", index: active.history.present.pages.length, page })) return false;
    this.selectPage(page.id); return true;
  };
  selectFrame = (pageId: string, frameId: string | null) => {
    const active = this.active();
    if (!active || active.pageId !== pageId || (frameId !== null && !active.history.present.pages.find(page => page.id === pageId)?.frames.some(frame => frame.id === frameId))) return false;
    this.put(active.history.present.id, { ...active, frameId, selection: null }); return true;
  };
  selectNode = (selection: NodeSelection) => {
    const active = this.active();
    if (this.state.mode !== "design" || !active || active.pageId !== selection.pageId || !resolveSelection(active.history.present, selection)) return false;
    this.put(active.history.present.id, { ...active, frameId: selection.frameId, selection }); return true;
  };
  insert = (scope: { projectId: string; pageId: string; frameId: string; parentId: string; index: number }, kind: InsertKind, expected?: ComposerDocument, session?: number) => {
    const active = this.active();
    if (!this.writable() || this.state.mode !== "design" || !active || active.history.present.id !== scope.projectId || active.pageId !== scope.pageId || (expected && active.history.present !== expected) || (session !== undefined && session !== this.insertionEpoch)) return false;
    const frame = active.history.present.pages.find(page => page.id === scope.pageId)?.frames.find(frame => frame.id === scope.frameId);
    if (!frame) return false;
    const used = new Set(flattenNodes(frame.root).map(({ node }) => node.id));
    const nextId = () => {
      const base = this.id(); let candidate = base, suffix = 0;
      while (used.has(candidate)) candidate = `${base}-${++suffix}`;
      used.add(candidate); return candidate;
    };
    const proposal = proposeInsertion(composerFrameToPageDocument(frame), scope, kind, nextId);
    if (!proposal.ok) { this.report(proposal.hint); return false; }
    try {
      const history = executeComposerCommands(active.history, [{ type: "nodeCommands", pageId: scope.pageId, frameId: scope.frameId, commands: proposal.commands }], this.catalog());
      this.commit(history, { projectId: scope.projectId, pageId: scope.pageId, frameId: scope.frameId, nodeId: proposal.nodeId });
      this.report(proposal.hint); return true;
    } catch (error) { this.report(errorText(error)); return false; }
  };
  move = (scope: MoveTarget & { projectId: string }, expected?: ComposerDocument, session?: number) => {
    const active = this.active();
    if (!this.writable() || this.state.mode !== "design" || !active || active.history.present.id !== scope.projectId || active.pageId !== scope.pageId || (expected && active.history.present !== expected) || (session !== undefined && session !== this.insertionEpoch)) return false;
    try {
      const used = new Set(active.history.present.pages.flatMap(page => page.frames.flatMap(frame => flattenNodes(frame.root).map(({ node }) => node.id))));
      const nextId = () => { const base = this.id(); let id = base, serial = 0; while (used.has(id)) id = `${base}-${++serial}`; used.add(id); return id; };
      const proposal = prepareMove(active.history.present, scope, nextId);
      const { projectId, ...target } = scope;
      const history = executeComposerCommands(active.history, [{ type: "moveNode", ...target, wrapperIds: proposal.wrappers.map(wrapper => wrapper.id) }], this.catalog());
      this.commit(history, { projectId, pageId: scope.pageId, frameId: scope.frameId, nodeId: scope.nodeId });
      this.report(proposal.hint); return true;
    } catch (error) { this.report(errorText(error)); return false; }
  };
  nodeAction = (selection: NodeSelection, action: NodeAction, expected?: ComposerDocument) => {
    const active = this.active();
    if (!this.writable() || this.state.mode !== "design" || !active || active.pageId !== selection.pageId || (expected && expected !== active.history.present)) return false;
    try {
      const used = new Set(active.history.present.pages.flatMap(page => page.frames.flatMap(frame => flattenNodes(frame.root).map(({ node }) => node.id))));
      const nextId = () => { const base = this.id(); let id = base, serial = 0; while (used.has(id)) id = `${base}-${++serial}`; used.add(id); return id; };
      const proposal = prepareNodeAction(active.history.present, selection, action, nextId);
      if (!proposal.command) return this.selectNode(proposal.selection);
      return this.commit(executeComposerCommands(active.history, [proposal.command], this.catalog()), proposal.selection);
    } catch (error) { this.report(errorText(error)); return false; }
  };
  clearNode = () => {
    const active = this.active(); if (active?.selection) this.put(active.history.present.id, { ...active, selection: null });
  };
  selectParent = () => {
    const active = this.active(), selected = active && resolveSelection(active.history.present, active.selection);
    if (!active?.selection || !selected) return false;
    const parent = selected.path.at(-2);
    if (!parent) { this.clearNode(); return true; }
    return this.selectNode({ ...active.selection, nodeId: parent.id });
  };
  addFrame = (preset: ComposerPreset) => {
    const active = this.active(), page = active?.history.present.pages.find(page => page.id === active.pageId);
    if (!page) return false;
    try {
      const frame = createComposerFrame(this.id(), this.id(), preset, `${preset[0].toUpperCase()}${preset.slice(1)} ${page.frames.length + 1}`);
      Object.assign(frame, nextFramePosition(page.frames));
      if (!this.execute({ type: "insertFrame", pageId: page.id, index: page.frames.length, frame })) return false;
      this.selectFrame(page.id, frame.id); return true;
    } catch (error) { this.report(errorText(error)); return false; }
  };
  duplicateFrame = (scope?: { projectId: string; pageId: string; frameId: string }, expected?: ComposerDocument) => {
    const active = this.active(), page = active?.history.present.pages.find(page => page.id === active.pageId), frame = page?.frames.find(frame => frame.id === (scope?.frameId ?? active?.frameId));
    if (!this.writable() || this.state.mode !== "design" || !active || !page || !frame || (scope && (scope.projectId !== active.history.present.id || scope.pageId !== page.id)) || (expected && expected !== active.history.present)) return false;
    try {
      const ids = frameIdRemap(frame, this.id);
      const commands: ComposerCommand[] = [
        { type: "duplicateFrame", pageId: page.id, frameId: frame.id, index: page.frames.length, ids },
        { type: "renameFrame", pageId: page.id, frameId: ids.frameId, name: `${frame.name.slice(0, 115)} copy` },
        { type: "updateFrameGeometry", pageId: page.id, frameId: ids.frameId, geometry: nextFramePosition(page.frames) },
      ];
      if (!this.commit(executeComposerCommands(active.history, commands, this.catalog()))) return false;
      this.selectFrame(page.id, ids.frameId); return true;
    } catch (error) { this.report(errorText(error)); return false; }
  };
  /** Conservative, non-destructive gate: inspect ALL registered records plus session history and partial writes. */
  systemDeletionBlock = (systemId: string): string => {
    if (!this.storage || !this.state.ready) return "Project references are still loading.";
    const index = readComposerIndex(this.storage);
    if (index.kind === "blocked") return "Cannot safely inspect project references. System deletion is unavailable.";
    for (const id of index.collection.projectIds) {
      const read = readComposerProject(this.storage, id, index.collection);
      if (read.kind === "blocked") return "A project record cannot be inspected. System deletion is unavailable.";
      if (read.envelope.document.systemId === systemId) return `Used by project “${read.envelope.document.name}”. Change its system first; deletion policy is not yet approved.`;
    }
    for (const entry of Object.values(this.state.sessions)) {
      if ([entry.history.present, ...entry.history.past, ...entry.history.future].some((document) => document.systemId === systemId)) return "Used by an open project's content or session history. System deletion is unavailable.";
    }
    if (this.state.partial) return "A partially registered project needs recovery before deleting systems.";
    return "";
  };
}
