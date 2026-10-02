import { parsePageDocument, type PageDocument, type PageNode, type PageProp } from "./model.ts";
import { nodeRegistry } from "./registry.ts";

export type PageCommand =
  | { type: "insert"; parentId: string; index: number; node: PageNode }
  | { type: "delete"; nodeId: string }
  | { type: "move"; nodeId: string; parentId: string; index: number }
  | { type: "update"; nodeId: string; props?: Record<string, PageProp | null>; text?: string }
  | { type: "rename"; name: string };

const commandKeys: Record<PageCommand["type"], readonly string[]> = {
  insert: ["type", "parentId", "index", "node"], delete: ["type", "nodeId"],
  move: ["type", "nodeId", "parentId", "index"], update: ["type", "nodeId", "props", "text"],
  rename: ["type", "name"],
};

function locate(node: PageNode, id: string, parent?: PageNode, index = 0): { node: PageNode; parent?: PageNode; index: number } | undefined {
  if (node.id === id) return { node, parent, index };
  for (const [position, child] of (node.children ?? []).entries()) {
    const found = locate(child, id, node, position);
    if (found) return found;
  }
}
function requiredNode(page: PageDocument, id: string) {
  const result = locate(page.root, id);
  if (!result) throw new Error(`command: unknown node ${id}`);
  return result;
}
function targetChildren(page: PageDocument, id: string) {
  const { node } = requiredNode(page, id);
  if (!node.children) throw new Error(`command: ${id} has no child slot`);
  return node.children;
}
function validIndex(index: number, length: number) {
  if (!Number.isInteger(index) || index < 0 || index > length) throw new Error("command: index out of range");
}
function checkInsertedIds(page: PageDocument, node: PageNode) {
  const ids = new Set<string>();
  function visit(child: PageNode, depth: number) {
    if (!child || typeof child !== "object" || Array.isArray(child)) throw new Error("command: invalid inserted node");
    if (depth > 12 || ids.size >= 100) throw new Error("command: inserted subtree limit exceeded");
    if (ids.has(child.id) || locate(page.root, child.id)) throw new Error(`command: duplicate node ${child.id}`);
    ids.add(child.id);
    if (child.children !== undefined) {
      if (!Array.isArray(child.children)) throw new Error("command: invalid inserted children");
      for (const nested of child.children) visit(nested, depth + 1);
    }
  }
  visit(node, 0);
}

/** Indexes address the destination list AFTER removal. Only the final batch tree is committed. */
export function applyPageCommands(input: unknown, commands: readonly PageCommand[]): PageDocument {
  const page = parsePageDocument(input);
  if (!Array.isArray(commands) || commands.length > 100) throw new Error("command: invalid batch or batch limit exceeded");
  for (const command of commands as readonly PageCommand[]) {
    if (!command || typeof command !== "object" || Array.isArray(command) || !Object.hasOwn(commandKeys, command.type)) throw new Error("command: unknown command");
    for (const key of Object.keys(command)) if (!commandKeys[command.type].includes(key)) throw new Error(`command: unknown key ${key}`);
    switch (command.type) {
      case "insert": {
        const children = targetChildren(page, command.parentId);
        validIndex(command.index, children.length);
        const node = structuredClone(command.node);
        checkInsertedIds(page, node);
        children.splice(command.index, 0, node);
        break;
      }
      case "delete": {
        const found = requiredNode(page, command.nodeId);
        if (!found.parent) throw new Error("command: cannot delete root");
        found.parent.children!.splice(found.index, 1);
        break;
      }
      case "move": {
        const found = requiredNode(page, command.nodeId);
        if (!found.parent) throw new Error("command: cannot move root");
        if (locate(found.node, command.parentId)) throw new Error("command: cannot move into self or descendant");
        const children = targetChildren(page, command.parentId);
        found.parent.children!.splice(found.index, 1);
        validIndex(command.index, children.length);
        children.splice(command.index, 0, found.node);
        break;
      }
      case "update": {
        const { node } = requiredNode(page, command.nodeId);
        if (command.text !== undefined) node.text = command.text;
        if (command.props !== undefined) {
          if (!command.props || typeof command.props !== "object" || Array.isArray(command.props)) throw new Error("command: invalid prop patch");
          const props = { ...node.props };
          for (const [key, value] of Object.entries(command.props)) {
            if (!Object.hasOwn(nodeRegistry[node.kind].props, key)) throw new Error(`command: unknown prop ${key}`);
            if (value === null) delete props[key];
            else props[key] = value;
          }
          if (Object.keys(props).length) node.props = props;
          else if (node.props && Object.keys(node.props).length) delete node.props;
        }
        break;
      }
      case "rename": page.name = command.name; break;
    }
  }
  return parsePageDocument(page);
}

export function applyPageCommand(input: unknown, command: PageCommand): PageDocument {
  return applyPageCommands(input, [command]);
}
