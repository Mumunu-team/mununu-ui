/**
 * The `template` clause of a CTXDSL formula (mununu 0.5.10): a property-template
 * instantiation persisted in the file in place of a `body`,
 *
 *   formula trip_exists { over protection; template reachable { TARGET = Lof; } }
 *
 * These helpers render the clause from a picker selection and insert it into the
 * document the editor holds. Pure string functions, so they are testable without
 * Monaco.
 */
import type { TemplateRef } from "../types/templates";

/** The name the backend gives a `--template` instance: the id and its bindings. */
export function templateFormulaName(ref: TemplateRef): string {
  const parts = [
    ref.template,
    ...Object.entries(ref.args).flatMap(([key, value]) => [key, value]),
  ];
  return parts.join("_").replace(/[^A-Za-z0-9_]/g, "_");
}

/** A value that is not an identifier or an integer is written as a string literal. */
function formatValue(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$|^-?\d+$/.test(value)
    ? value
    : JSON.stringify(value);
}

/** The formula block carrying the clause, over `automaton`, at `indent`. */
export function templateClause(
  ref: TemplateRef,
  name: string,
  automaton: string,
  indent = "        ",
): string {
  const bindings = Object.entries(ref.args)
    .map(([key, value]) => `${key} = ${formatValue(value)};`)
    .join(" ");
  const block = bindings ? `{ ${bindings} }` : "{ }";
  return (
    `${indent}formula ${name} {\n` +
    `${indent}    over ${automaton};\n` +
    `${indent}    template ${ref.template} ${block}\n` +
    `${indent}}\n`
  );
}

/**
 * The target a property most likely means when none was chosen: the document's
 * first composition, else its first automaton, else nothing.
 */
export function defaultOverTarget(content: string): string | null {
  const composition = content.match(
    /\b(?:synchronous|asynchronous|superset)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/,
  );
  if (composition) return composition[1];
  const automaton = content.match(/\bautomaton\s+([A-Za-z_][A-Za-z0-9_]*)/);
  return automaton ? automaton[1] : null;
}

/** The index of the `}` closing the `{` at `open`, ignoring braces in comments and strings. */
function closingBrace(content: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < content.length) {
    const ch = content[i];
    if (ch === "/" && content[i + 1] === "/") {
      const eol = content.indexOf("\n", i);
      i = eol < 0 ? content.length : eol;
      continue;
    }
    if (ch === "/" && content[i + 1] === "*") {
      const end = content.indexOf("*/", i + 2);
      i = end < 0 ? content.length : end + 2;
      continue;
    }
    if (ch === '"') {
      const end = content.indexOf('"', i + 1);
      i = end < 0 ? content.length : end + 1;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/**
 * Insert a formula block into the document: at the end of its `mu_formulas { … }`
 * block when it has one, else as a new `mu_formulas` block before the context's
 * closing brace, else appended.
 */
export function insertTemplateFormula(content: string, clause: string): string {
  const section = content.search(/\bmu_formulas\s*\{/);
  if (section >= 0) {
    const open = content.indexOf("{", section);
    const close = closingBrace(content, open);
    if (close > open) return insertBeforeLineOf(content, close, clause);
  }
  const last = content.lastIndexOf("}");
  const block = `    mu_formulas {\n${clause}    }\n`;
  if (last < 0) return `${content}\n${block}`;
  return insertBeforeLineOf(content, last, block);
}

/** Insert `text` at the start of the line that holds `at`, so the brace keeps its indentation. */
function insertBeforeLineOf(content: string, at: number, text: string): string {
  const lineStart = content.lastIndexOf("\n", at - 1) + 1;
  const head = content.slice(0, lineStart);
  const separator = head.length > 0 && !head.endsWith("\n") ? "\n" : "";
  return head + separator + text + content.slice(lineStart);
}
