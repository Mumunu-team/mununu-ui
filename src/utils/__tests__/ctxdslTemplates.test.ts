import { describe, it, expect } from "vitest";
import {
  defaultOverTarget,
  insertTemplateFormula,
  templateClause,
  templateFormulaName,
} from "../ctxdslTemplates";

const ref = { template: "reachable", args: { TARGET: "Lof" } };

describe("templateFormulaName", () => {
  it("names the instance as the backend does: the id and its bindings", () => {
    expect(templateFormulaName(ref)).toBe("reachable_TARGET_Lof");
    expect(templateFormulaName({ template: "no_deadlock", args: {} })).toBe(
      "no_deadlock",
    );
  });
  it("keeps the name an identifier", () => {
    expect(
      templateFormulaName({
        template: "reachable",
        args: { TARGET: "n == 2" },
      }),
    ).toBe("reachable_TARGET_n____2");
  });
});

describe("templateClause", () => {
  it("renders the formula block with the clause in place of a body", () => {
    expect(templateClause(ref, "trip_exists", "protection", "")).toBe(
      "formula trip_exists {\n    over protection;\n    template reachable { TARGET = Lof; }\n}\n",
    );
  });
  it("quotes a value that is not an identifier or an integer, and renders an empty block", () => {
    expect(
      templateClause(
        { template: "bounded", args: { OVERFLOW: "x y", UNDERFLOW: "3" } },
        "b",
        "A",
        "",
      ),
    ).toContain('template bounded { OVERFLOW = "x y"; UNDERFLOW = 3; }');
    expect(
      templateClause({ template: "no_deadlock", args: {} }, "nd", "A", ""),
    ).toContain("template no_deadlock { }");
  });
});

describe("defaultOverTarget", () => {
  it("prefers the first composition, then the first automaton", () => {
    expect(
      defaultOverTarget(
        "context c { automata { automaton A { } } composition { asynchronous sys { members [A]; } } }",
      ),
    ).toBe("sys");
    expect(
      defaultOverTarget("context c { automata { automaton A { } } }"),
    ).toBe("A");
    expect(defaultOverTarget("context c { }")).toBeNull();
  });
});

describe("insertTemplateFormula", () => {
  const clause = templateClause(ref, "trip_exists", "sys", "        ");

  it("appends to an existing mu_formulas block, before its closing brace", () => {
    const doc =
      "context c {\n    mu_formulas {\n        formula a { over sys; body = true; }\n    }\n}\n";
    const out = insertTemplateFormula(doc, clause);
    expect(out).toBe(
      "context c {\n    mu_formulas {\n        formula a { over sys; body = true; }\n" +
        clause +
        "    }\n}\n",
    );
  });

  it("ignores braces inside comments and strings when finding the block's end", () => {
    const doc =
      'context c {\n    mu_formulas {\n        // a } in a comment\n        formula a { meta { comment = "}"; } over sys; body = true; }\n    }\n}\n';
    const out = insertTemplateFormula(doc, clause);
    expect(out.indexOf(clause)).toBeGreaterThan(out.indexOf("body = true;"));
    expect(out.endsWith("    }\n}\n")).toBe(true);
  });

  it("adds a mu_formulas block before the context's closing brace when there is none", () => {
    const doc = "context c {\n    automata { automaton A { } }\n}\n";
    expect(insertTemplateFormula(doc, clause)).toBe(
      "context c {\n    automata { automaton A { } }\n    mu_formulas {\n" +
        clause +
        "    }\n}\n",
    );
  });

  it("appends a block to a document with no braces at all", () => {
    expect(insertTemplateFormula("", clause)).toBe(
      "\n    mu_formulas {\n" + clause + "    }\n",
    );
  });
});
