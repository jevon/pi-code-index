import type Parser from "web-tree-sitter";
import type { Symbol } from "../types.ts";
import { extractSignature, fieldText, findParentName, type SymbolExtractor } from "./base.ts";

const CLASS_PARENT_TYPES = ["class_declaration", "class", "abstract_class_declaration"];

/**
 * Check if a node is at the top level of a file (or directly inside an export_statement
 * at the top level). Returns false for nodes nested inside function bodies, if blocks, etc.
 */
function isTopLevel(node: Parser.SyntaxNode): boolean {
  let current = node.parent;
  while (current) {
    const type = current.type;
    // These are structural containers that are OK to be inside
    if (
      type === "program" ||
      type === "export_statement" ||
      type === "export_declaration"
    ) {
      return true;
    }
    // Class body is OK (for methods — but those are handled separately)
    if (type === "class_body") return false;
    // Inside a function body, block, etc. — not top level
    if (
      type === "statement_block" ||
      type === "function_body" ||
      type === "arrow_function" ||
      type === "function_expression" ||
      type === "function_declaration" ||
      type === "method_definition" ||
      type === "if_statement" ||
      type === "for_statement" ||
      type === "for_in_statement" ||
      type === "while_statement" ||
      type === "try_statement"
    ) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Check if a node's direct parent is an export_statement
 */
function isDirectlyExported(node: Parser.SyntaxNode): boolean {
  return (
    node.parent?.type === "export_statement" ||
    node.parent?.type === "export_declaration"
  );
}

export const typescriptExtractor: SymbolExtractor = {
  extract(tree, source, file) {
    const symbols: Symbol[] = [];
    const cursor = tree.rootNode.walk();
    let reachedRoot = false;

    while (!reachedRoot) {
      const node = cursor.currentNode;
      const type = node.type;

      let handled = false;

      if (type === "function_declaration" && isTopLevel(node)) {
        const name = fieldText(node, "name");
        if (name) {
          symbols.push({
            name,
            kind: "function",
            file,
            line: node.startPosition.row + 1,
            signature: extractSignature(node),
            exported: isDirectlyExported(node),
          });
        }
        handled = true; // don't descend into function bodies
      }

      if (type === "lexical_declaration" && isTopLevel(node)) {
        for (const child of node.namedChildren) {
          if (child.type !== "variable_declarator") continue;
          const name = fieldText(child, "name");
          if (!name) continue;

          const value = child.childForFieldName("value");
          const isFunc =
            value?.type === "arrow_function" ||
            value?.type === "function_expression" ||
            value?.type === "function";

          symbols.push({
            name,
            kind: isFunc ? "function" : "variable",
            file,
            line: node.startPosition.row + 1,
            signature: isFunc && value ? extractSignature(value) : undefined,
            exported: isDirectlyExported(node),
          });
        }
        handled = true; // don't descend
      }

      if (type === "class_declaration" || type === "abstract_class_declaration") {
        const name = fieldText(node, "name");
        if (name && isTopLevel(node)) {
          symbols.push({
            name,
            kind: "class",
            file,
            line: node.startPosition.row + 1,
            exported: isDirectlyExported(node),
          });
        }
        // DO descend to find methods
        handled = false;
      }

      if (type === "method_definition") {
        const name = fieldText(node, "name");
        if (name) {
          const parent = findParentName(node, CLASS_PARENT_TYPES);
          symbols.push({
            name,
            kind: "method",
            file,
            line: node.startPosition.row + 1,
            signature: extractSignature(node),
            parent,
            exported: false,
          });
        }
        handled = true; // don't descend into method bodies
      }

      if (type === "interface_declaration" && isTopLevel(node)) {
        const name = fieldText(node, "name");
        if (name) {
          symbols.push({
            name,
            kind: "interface",
            file,
            line: node.startPosition.row + 1,
            exported: isDirectlyExported(node),
          });
        }
        handled = true;
      }

      if (type === "type_alias_declaration" && isTopLevel(node)) {
        const name = fieldText(node, "name");
        if (name) {
          symbols.push({
            name,
            kind: "type",
            file,
            line: node.startPosition.row + 1,
            exported: isDirectlyExported(node),
          });
        }
        handled = true;
      }

      if (type === "enum_declaration" && isTopLevel(node)) {
        const name = fieldText(node, "name");
        if (name) {
          symbols.push({
            name,
            kind: "enum",
            file,
            line: node.startPosition.row + 1,
            exported: isDirectlyExported(node),
          });
        }
        handled = true;
      }

      // Traversal: skip children of handled nodes (function bodies, etc.)
      if (!handled && cursor.gotoFirstChild()) continue;
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
  },
};
