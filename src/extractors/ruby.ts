import type Parser from "web-tree-sitter";
import type { Symbol } from "../types.ts";
import { fieldText, findParentName, walkTree, type SymbolExtractor } from "./base.ts";

export const rubyExtractor: SymbolExtractor = {
  extract(tree, source, file) {
    return walkTree(tree.rootNode, {
      method(node) {
        const name = fieldText(node, "name");
        if (!name) return null;

        const parent = findParentName(node, ["class", "module", "singleton_class"]);
        const isMethod = !!parent;

        // Extract parameters
        const params = node.childForFieldName("parameters");
        let signature: string | undefined;
        if (params) {
          signature = params.text;
          signature = signature.replace(/\s*\n\s*/g, " ");
          if (signature.length > 120) signature = signature.slice(0, 117) + "...";
        }

        return {
          name,
          kind: isMethod ? "method" : "function",
          file,
          line: node.startPosition.row + 1,
          signature,
          parent,
          // Ruby: top-level methods are effectively exported
          exported: !isMethod,
        };
      },

      singleton_method(node) {
        const name = fieldText(node, "name");
        if (!name) return null;

        const parent = findParentName(node, ["class", "module"]);

        const params = node.childForFieldName("parameters");
        let signature: string | undefined;
        if (params) {
          signature = params.text;
          signature = signature.replace(/\s*\n\s*/g, " ");
          if (signature.length > 120) signature = signature.slice(0, 117) + "...";
        }

        return {
          name,
          kind: "method",
          file,
          line: node.startPosition.row + 1,
          signature,
          parent,
          exported: true, // class methods are public API
        };
      },

      class(node) {
        const name = fieldText(node, "name");
        if (!name) return null;

        const parent = findParentName(node, ["class", "module"]);

        return {
          name,
          kind: "class",
          file,
          line: node.startPosition.row + 1,
          parent,
          exported: true,
        };
      },

      module(node) {
        const name = fieldText(node, "name");
        if (!name) return null;

        const parent = findParentName(node, ["class", "module"]);

        return {
          name,
          kind: "module",
          file,
          line: node.startPosition.row + 1,
          parent,
          exported: true,
        };
      },
    });
  },
};
