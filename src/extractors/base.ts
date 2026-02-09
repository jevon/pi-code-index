import type Parser from "web-tree-sitter";
import type { Symbol, SymbolKind } from "../types.ts";

export interface SymbolExtractor {
  extract(tree: Parser.Tree, source: string, file: string): Symbol[];
}

/**
 * Helper: get text of a child node by field name
 */
export function fieldText(node: Parser.SyntaxNode, fieldName: string): string | undefined {
  const child = node.childForFieldName(fieldName);
  return child?.text;
}

/**
 * Helper: extract parameter signature from a node
 */
export function extractSignature(node: Parser.SyntaxNode): string | undefined {
  const params = node.childForFieldName("parameters");
  if (!params) return undefined;
  const returnType = node.childForFieldName("return_type");
  let sig = params.text;
  if (returnType) sig += ": " + returnType.text;
  // Truncate long signatures
  if (sig.length > 120) sig = sig.slice(0, 117) + "...";
  return sig;
}

/**
 * Helper: check if a node is inside an export statement
 */
export function isExported(node: Parser.SyntaxNode): boolean {
  let current = node.parent;
  while (current) {
    if (
      current.type === "export_statement" ||
      current.type === "export_declaration"
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Helper: find enclosing class/module name
 */
export function findParentName(
  node: Parser.SyntaxNode,
  parentTypes: string[]
): string | undefined {
  let current = node.parent;
  while (current) {
    if (parentTypes.includes(current.type)) {
      const name = current.childForFieldName("name");
      return name?.text;
    }
    current = current.parent;
  }
  return undefined;
}

/**
 * Walk the tree and collect symbols from matching node types
 */
export function walkTree(
  node: Parser.SyntaxNode,
  handlers: Record<string, (node: Parser.SyntaxNode) => Symbol | Symbol[] | null>,
): Symbol[] {
  const symbols: Symbol[] = [];
  const cursor = node.walk();
  let reachedRoot = false;

  while (!reachedRoot) {
    const handler = handlers[cursor.nodeType];
    if (handler) {
      const result = handler(cursor.currentNode);
      if (result) {
        if (Array.isArray(result)) {
          symbols.push(...result);
        } else {
          symbols.push(result);
        }
      }
    }

    // Depth-first traversal
    if (cursor.gotoFirstChild()) continue;
    if (cursor.gotoNextSibling()) continue;

    while (true) {
      if (!cursor.gotoParent()) {
        reachedRoot = true;
        break;
      }
      if (cursor.gotoNextSibling()) break;
    }
  }

  return symbols;
}
