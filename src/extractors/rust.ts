import type Parser from "web-tree-sitter";
import type { Symbol } from "../types.ts";
import { fieldText, findParentName, walkTree, type SymbolExtractor } from "./base.ts";

function isRustPublic(node: Parser.SyntaxNode): boolean {
  // Check if any child is a visibility_modifier (pub)
  for (const child of node.children) {
    if (child.type === "visibility_modifier") return true;
  }
  return false;
}

export const rustExtractor: SymbolExtractor = {
  extract(tree, source, file) {
    return walkTree(tree.rootNode, {
      function_item(node) {
        const name = fieldText(node, "name");
        if (!name) return null;

        const params = node.childForFieldName("parameters");
        const returnType = node.childForFieldName("return_type");
        let signature: string | undefined;
        if (params) {
          signature = params.text;
          if (returnType) signature += " -> " + returnType.text;
          if (signature.length > 120) signature = signature.slice(0, 117) + "...";
        }

        const parent = findParentName(node, ["impl_item"]);
        return {
          name,
          kind: parent ? "method" : "function",
          file,
          line: node.startPosition.row + 1,
          signature,
          parent,
          exported: isRustPublic(node),
        };
      },

      struct_item(node) {
        const name = fieldText(node, "name");
        if (!name) return null;
        return {
          name,
          kind: "class",
          file,
          line: node.startPosition.row + 1,
          exported: isRustPublic(node),
        };
      },

      enum_item(node) {
        const name = fieldText(node, "name");
        if (!name) return null;
        return {
          name,
          kind: "enum",
          file,
          line: node.startPosition.row + 1,
          exported: isRustPublic(node),
        };
      },

      trait_item(node) {
        const name = fieldText(node, "name");
        if (!name) return null;
        return {
          name,
          kind: "interface",
          file,
          line: node.startPosition.row + 1,
          exported: isRustPublic(node),
        };
      },

      type_item(node) {
        const name = fieldText(node, "name");
        if (!name) return null;
        return {
          name,
          kind: "type",
          file,
          line: node.startPosition.row + 1,
          exported: isRustPublic(node),
        };
      },

      mod_item(node) {
        const name = fieldText(node, "name");
        if (!name) return null;
        return {
          name,
          kind: "module",
          file,
          line: node.startPosition.row + 1,
          exported: isRustPublic(node),
        };
      },
    });
  },
};
