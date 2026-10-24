import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVerification } from "../useVerification";

// Mock API endpoints
const mockVerifyContext = vi.fn();
const mockSynthesizeContext = vi.fn();
vi.mock("../../api/endpoints", () => ({
  verifyContext: (...args: unknown[]) => mockVerifyContext(...args),
  synthesizeContext: (...args: unknown[]) => mockSynthesizeContext(...args),
}));

// Mock toast
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
const mockShowInfo = vi.fn();
vi.mock("../useToast", () => ({
  useToast: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showInfo: mockShowInfo,
    showCustom: vi.fn(),
    showWarning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

// Mock error handler
const mockHandleError = vi.fn().mockReturnValue("Something went wrong");
vi.mock("../useErrorHandler", () => ({
  useErrorHandler: () => ({
    handleError: mockHandleError,
    isRateLimitError: vi.fn(),
  }),
}));

// Mock retry — pass through immediately (no actual retrying in tests)
vi.mock("../useRetry", () => ({
  useRetry: () => ({
    retry: (fn: () => Promise<unknown>) => fn(),
    cancelRetry: vi.fn(),
    cancelAllRetries: vi.fn(),
  }),
}));

const ALL_SATISFIED_RESPONSE = {
  outcome: "holds",
  results: [
    {
      formula: "safety",
      automaton: "Main",
      outcome: "holds",
      states: 4,
      labels: 3,
    },
  ],
};

const PARTIAL_FAILURE_RESPONSE = {
  outcome: "violated",
  results: [
    { formula: "safety", automaton: "Main", outcome: "holds" },
    { formula: "liveness", automaton: "Main", outcome: "violated" },
  ],
};

describe("useVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with idle state", () => {
    const { result } = renderHook(() => useVerification());
    expect(result.current.state).toEqual({
      result: null,
      isLoading: false,
      error: null,
    });
  });

  it("accepts initial state", () => {
    const { result } = renderHook(() =>
      useVerification({ error: "previous error" }),
    );
    expect(result.current.state.error).toBe("previous error");
  });

  it("verify: sets loading, calls API, updates result on success", async () => {
    mockVerifyContext.mockResolvedValueOnce(ALL_SATISFIED_RESPONSE);
    const { result } = renderHook(() => useVerification());

    await act(async () => {
      await result.current.verify("context content", "test.ctxdsl");
    });

    expect(mockVerifyContext).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { name: "test.ctxdsl", content: "context content" },
      }),
    );
    expect(result.current.state.isLoading).toBe(false);
    expect(result.current.state.result).toEqual(ALL_SATISFIED_RESPONSE);
    expect(result.current.state.error).toBeNull();
    expect(mockShowSuccess).toHaveBeenCalledWith("All formulas satisfied");
  });

  it("verify: shows info toast when some formulas fail", async () => {
    mockVerifyContext.mockResolvedValueOnce(PARTIAL_FAILURE_RESPONSE);
    const { result } = renderHook(() => useVerification());

    await act(async () => {
      await result.current.verify("content");
    });

    expect(mockShowInfo).toHaveBeenCalledWith(
      "Verification completed — 1 formula(s) not satisfied",
    );
  });

  it("verify: reports a sanity finding when every formula holds but the outcome is unknown", async () => {
    mockVerifyContext.mockResolvedValueOnce({
      ...ALL_SATISFIED_RESPONSE,
      outcome: "unknown",
    });
    const { result } = renderHook(() => useVerification());

    await act(async () => {
      await result.current.verify("content");
    });

    expect(mockShowSuccess).not.toHaveBeenCalled();
    expect(mockShowInfo).toHaveBeenCalledWith(
      "All formulas satisfied — the model sanity checks found something to review",
    );
  });

  it("verify: handles API error", async () => {
    mockVerifyContext.mockRejectedValueOnce(new Error("server error"));
    const { result } = renderHook(() => useVerification());

    await act(async () => {
      await result.current.verify("content");
    });

    expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error));
    expect(result.current.state.isLoading).toBe(false);
    expect(result.current.state.error).toBe("Something went wrong");
    expect(result.current.state.result).toBeNull();
  });

  it("verify: rejects empty content", async () => {
    const { result } = renderHook(() => useVerification());

    await act(async () => {
      try {
        await result.current.verify("   ");
      } catch {
        // expected
      }
    });

    expect(mockShowError).toHaveBeenCalledWith(
      "Context content is required for verification",
    );
    expect(mockVerifyContext).not.toHaveBeenCalled();
  });

  it("clearResult resets state", async () => {
    mockVerifyContext.mockResolvedValueOnce(ALL_SATISFIED_RESPONSE);
    const { result } = renderHook(() => useVerification());

    await act(async () => {
      await result.current.verify("content");
    });
    expect(result.current.state.result).not.toBeNull();

    act(() => {
      result.current.clearResult();
    });

    expect(result.current.state).toEqual({
      result: null,
      isLoading: false,
      error: null,
    });
  });

  it("getCounterstrategy returns null when not fetched", () => {
    const { result } = renderHook(() => useVerification());
    expect(result.current.getCounterstrategy("f", "a")).toBeNull();
  });

  it("isFetchingCounterstrategy returns false by default", () => {
    const { result } = renderHook(() => useVerification());
    expect(result.current.isFetchingCounterstrategy("f", "a")).toBe(false);
  });

  it("getCountertraces returns null when not fetched", () => {
    const { result } = renderHook(() => useVerification());
    expect(result.current.getCountertraces("f", "a")).toBeNull();
  });
});
