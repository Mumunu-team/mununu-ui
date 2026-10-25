import { useState, useCallback } from "react";
import {
  verifyContext,
  synthesizeContext,
  type ContextVerifyResponse,
  type FormulaVerificationResult,
  type CounterstrategyResult,
  type Trace,
} from "../api/endpoints";
import { useToast } from "./useToast";
import { useErrorHandler } from "./useErrorHandler";
import { useRetry } from "./useRetry";

export type { FormulaVerificationResult };

export interface VerificationState {
  result: ContextVerifyResponse | null;
  isLoading: boolean;
  error: string | null;
}

/** Diagnostics produced by synthesis for a single formula/automaton pair. */
export interface CountertracesResult {
  realizable: boolean;
  /** The minimal counterexample path (a `finite` trace over state names). */
  counterexample?: Trace;
  counterstrategy_traces: Trace[];
  deadlock_traces: Trace[];
  /** `lasso` traces (`loop_start` marks the cycle). */
  lasso_traces: Trace[];
  violating_initials: string[];
  messages: string[];
  /** Counterstrategy graph (also returned by synthesis for unrealizable). */
  counterstrategy?: CounterstrategyResult;
}

export const useVerification = (initialState?: Partial<VerificationState>) => {
  const [state, setState] = useState<VerificationState>({
    result: initialState?.result ?? null,
    isLoading: initialState?.isLoading ?? false,
    error: initialState?.error ?? null,
  });
  const [counterstrategies, setCounterstrategies] = useState<
    Map<string, FormulaVerificationResult>
  >(new Map());
  const [countertraces, setCountertraces] = useState<
    Map<string, CountertracesResult>
  >(new Map());
  const [csLoadingKeys, setCsLoadingKeys] = useState<Set<string>>(new Set());
  const [ctLoadingKeys, setCtLoadingKeys] = useState<Set<string>>(new Set());
  const toast = useToast();
  const { handleError } = useErrorHandler();
  const { retry } = useRetry();

  const verify = useCallback(
    async (
      content: string,
      contextName?: string,
      formula?: string,
      automaton?: string,
      templateRef?: { template: string; args: Record<string, string> },
    ): Promise<void> => {
      if (!content.trim()) {
        toast.showError("Context content is required for verification");
        return Promise.reject(new Error("Context content is required"));
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      setCounterstrategies(new Map());
      setCountertraces(new Map());
      setCsLoadingKeys(new Set());
      setCtLoadingKeys(new Set());

      try {
        const response = await retry(
          () =>
            verifyContext({
              context: { name: contextName || "editor.ctxdsl", content },
              formula: formula || undefined,
              template_ref: templateRef || undefined,
              automaton: automaton || undefined,
              // Linear in the model; shown above the verdicts.
              sanity: true,
            }),
          {
            maxRetries: 3,
            initialDelay: 1000,
            onRetry: (attempt, error) => {
              console.log(`Retrying verification (attempt ${attempt})`, error);
            },
          },
        );

        setState((prev) => ({
          ...prev,
          result: response,
          isLoading: false,
          error: null,
        }));

        if (response.outcome === "holds") {
          toast.showSuccess("All formulas satisfied");
        } else if (response.outcome === "unknown") {
          toast.showInfo(
            "All formulas satisfied — the model sanity checks found something to review",
          );
        } else {
          const failed = response.results.filter(
            (r) => r.outcome !== "holds",
          ).length;
          toast.showInfo(
            `Verification completed — ${failed} formula(s) not satisfied`,
          );
        }
      } catch (err) {
        const errorMessage = handleError(err);
        setState((prev) => ({
          ...prev,
          result: null,
          isLoading: false,
          error: errorMessage,
        }));
        if (!errorMessage.includes("Rate limit exceeded")) {
          toast.showError(`Verification failed: ${errorMessage}`);
        }
      }
    },
    [toast, handleError, retry],
  );

  const fetchCounterstrategy = useCallback(
    async (
      content: string,
      formulaName: string,
      automatonName: string,
      contextName?: string,
    ): Promise<void> => {
      const key = `${formulaName}:${automatonName}`;
      setCsLoadingKeys((prev) => new Set(prev).add(key));

      try {
        const response = await verifyContext({
          context: { name: contextName || "editor.ctxdsl", content },
          formula: formulaName,
          automaton: automatonName,
          counterstrategy: true,
          minimize_counterstrategy: true,
        });
        const result = response.results[0];
        if (result) {
          setCounterstrategies((prev) => {
            const next = new Map(prev);
            next.set(key, result);
            return next;
          });
        }
      } catch (err) {
        const errorMessage = handleError(err);
        toast.showError(`Counterstrategy failed: ${errorMessage}`);
      } finally {
        setCsLoadingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [handleError, toast],
  );

  /** Fetch countertraces for a failed formula by running synthesis. */
  const fetchCountertraces = useCallback(
    async (
      content: string,
      formulaName: string,
      automatonName: string,
      contextName?: string,
    ): Promise<void> => {
      const key = `${formulaName}:${automatonName}`;
      setCtLoadingKeys((prev) => new Set(prev).add(key));

      try {
        const response = await synthesizeContext({
          context: { name: contextName || "editor.ctxdsl", content },
          formula: formulaName,
          automaton: automatonName,
          options: {
            minimize: true,
            diagnostics: {
              counterexample: true,
              deadlock_traces: true,
              counterstrategy: true,
            },
          },
        });

        const diag = response.diagnostics;
        setCountertraces((prev) => {
          const next = new Map(prev);
          next.set(key, {
            realizable: response.realizable,
            counterexample: diag.counterexample ?? undefined,
            counterstrategy_traces: diag.counterstrategy_traces ?? [],
            deadlock_traces: diag.deadlock_traces ?? [],
            lasso_traces: diag.lasso_traces ?? [],
            violating_initials: diag.violating_initials ?? [],
            messages: diag.messages ?? [],
            counterstrategy: response.counterstrategy,
          });
          return next;
        });
      } catch (err) {
        const errorMessage = handleError(err);
        toast.showError(`Countertraces failed: ${errorMessage}`);
      } finally {
        setCtLoadingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [handleError, toast],
  );

  const getCounterstrategy = useCallback(
    (
      formulaName: string,
      automatonName: string,
    ): FormulaVerificationResult | null => {
      return counterstrategies.get(`${formulaName}:${automatonName}`) ?? null;
    },
    [counterstrategies],
  );

  const getCountertraces = useCallback(
    (
      formulaName: string,
      automatonName: string,
    ): CountertracesResult | null => {
      return countertraces.get(`${formulaName}:${automatonName}`) ?? null;
    },
    [countertraces],
  );

  const isFetchingCounterstrategy = useCallback(
    (formulaName: string, automatonName: string): boolean => {
      return csLoadingKeys.has(`${formulaName}:${automatonName}`);
    },
    [csLoadingKeys],
  );

  const isFetchingCountertraces = useCallback(
    (formulaName: string, automatonName: string): boolean => {
      return ctLoadingKeys.has(`${formulaName}:${automatonName}`);
    },
    [ctLoadingKeys],
  );

  const clearResult = useCallback(() => {
    setState({
      result: null,
      isLoading: false,
      error: null,
    });
    setCounterstrategies(new Map());
    setCountertraces(new Map());
    setCsLoadingKeys(new Set());
    setCtLoadingKeys(new Set());
  }, []);

  return {
    state,
    verify,
    fetchCounterstrategy,
    fetchCountertraces,
    getCounterstrategy,
    getCountertraces,
    isFetchingCounterstrategy,
    isFetchingCountertraces,
    clearResult,
  };
};
