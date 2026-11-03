import * as monaco from "monaco-editor";

export const ctxdslLanguageId = "ctxdsl";

export const ctxdslLanguageDefinition: monaco.languages.IMonarchLanguage = {
  tokenizer: {
    root: [
      // Keywords. The list is kept aligned with `Keyword::from_ident` in
      // `crates/mununu-core/src/context_dsl/token.rs`. Added in May 2026:
      // `valuations` (state-valuation block), `predicates`, `predicate`,
      // `meta`, `id`, `comment`, `all`, `bool`, `i64`, `counterexample`,
      // `deadlock_traces`, `max_counter_traces`, `proof_obligations`.
      [
        /(context|alphabet|automata|automaton|states|state|transitions|transition|formulas|formula|controllers|controller|label|initial|accepting|on|with|guard|effects|effect|action|vars|valuations|actions|variables|var|constants|const|ranges|range|enums|enum|composition|synchronous|asynchronous|superset|members|parameters|param|in|state_groups|group|predicates|predicate|wildcard|controllable|internal|over|all|body|template|bool|i64|mu_formulas|source|satisfying|export|minimize|diagnostics|counterexample|deadlock_traces|max_counter_traces|proof_obligations|meta|id|comment|ltl|mu|true|false|epsilon)/,
        "keyword",
      ],
      // Strings
      [/"[^"]*"/, "string"],
      [/[a-zA-Z_][a-zA-Z0-9_]*/, "identifier"],
      // Numbers
      [/\d+/, "number"],
      // Operators
      [/[{}[\](),;:->]/, "delimiter"],
      // Comments
      [/\/\/.*$/, "comment"],
      [/\/\*[\s\S]*?\*\//, "comment"],
      // Whitespace
      [/\s+/, "white"],
    ],
  },
};

export const registerCtxdslLanguage = (monacoInstance: typeof monaco) => {
  // Check if already registered to avoid duplicate registration errors
  const languages = monacoInstance.languages.getLanguages();
  const isRegistered = languages.some((lang) => lang.id === ctxdslLanguageId);

  if (!isRegistered) {
    monacoInstance.languages.register({ id: ctxdslLanguageId });
  }

  monacoInstance.languages.setMonarchTokensProvider(
    ctxdslLanguageId,
    ctxdslLanguageDefinition,
  );

  // Language configuration
  monacoInstance.languages.setLanguageConfiguration(ctxdslLanguageId, {
    comments: {
      lineComment: "//",
      blockComment: ["/*", "*/"],
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
  });
};
