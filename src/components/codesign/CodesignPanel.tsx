/**
 * HW/SW codesign verification panel — Document C task C4.
 *
 * The user pastes a register-map sidecar (JSON) + a firmware CTXDSL
 * document + a formula name, clicks Verify, and sees the verdict +
 * the spliced composed CTXDSL. Mirrors the `mununu codesign verify`
 * CLI subcommand and the `POST /api/v1/codesign/verify` HTTP endpoint
 * for three-surface parity (CLAUDE.md).
 */

import { useState } from "react";
import {
  verifyCodesign,
  type CodesignVerifyResponse,
  type RegisterMap,
} from "../../api/endpoints";

// Realistic example payload modelled after
// `examples/industrial/codesign_uart/`. Keep small but exercise
// every field shape the user is likely to author.
const EXAMPLE_REGISTER_MAP: RegisterMap = {
  peripheral: "UART_LITE",
  base_address: "0x40010000",
  description: "Illustrative UART register map (Document C §C.4).",
  registers: [
    {
      name: "CTRL",
      offset: 0,
      width_bits: 32,
      direction: "RW",
      visibility_class: "control",
      access_path: "mmio_direct",
      fields: [
        {
          name: "tx_start",
          bits: [0, 0],
          sv_signal: "uart_inst.ctrl_reg[0]",
          c_accessor: "UART->CTRL.bit.tx_start",
        },
      ],
    },
    {
      name: "STATUS",
      offset: 4,
      width_bits: 32,
      direction: "RO",
      visibility_class: "status",
      fields: [
        {
          name: "tx_busy",
          bits: [0, 0],
          sv_signal: "uart_inst.tx_busy",
          c_accessor: "UART->STATUS.bit.tx_busy",
        },
      ],
    },
    {
      name: "DATA",
      offset: 8,
      width_bits: 32,
      direction: "RW",
      visibility_class: "data",
      fields: [
        {
          name: "byte",
          bits: [0, 7],
          sv_signal: "uart_inst.data_reg",
          c_accessor: "UART->DATA",
        },
      ],
    },
  ],
};

const EXAMPLE_FIRMWARE = `context CoupledUart {
    alphabet { label tick; label reset; }
    automata {
        automaton UartDriver {
            controllable {
                label wr_data_byte;
                label wr_ctrl_tx_start;
                label rd_status_tx_busy;
                label tick;
                label reset;
            }
            states {
                state Init initial;
                state Polling;
                state Ready;
                state Sending;
            }
            transitions {
                transition Init -> Polling on label rd_status_tx_busy;
                transition Polling -> Polling on label rd_status_tx_busy;
                transition Polling -> Polling on label tick;
                transition Polling -> Ready on label rd_status_tx_busy;
                transition Ready -> Sending on label wr_data_byte;
                transition Sending -> Init on label wr_ctrl_tx_start;
                transition Polling -> Init on label reset;
                transition Ready -> Init on label reset;
                transition Sending -> Init on label reset;
                transition Init -> Init on label reset;
            }
        }
    }
    mu_formulas {
        formula init_reachable {
            over UartDriver;
            body = mu X. (Init || <> X);
        }
        formula sending_reachable {
            over UartDriver;
            body = mu X. (Sending || <> X);
        }
        formula safety_protocol_respected {
            over UART_LITESystem;
            body = nu X. ([] X);
        }
    }
}
`;

export const CodesignPanel = () => {
  const [registerMapText, setRegisterMapText] = useState<string>(
    JSON.stringify(EXAMPLE_REGISTER_MAP, null, 2),
  );
  const [firmwareText, setFirmwareText] = useState<string>(EXAMPLE_FIRMWARE);
  const [formula, setFormula] = useState<string>("init_reachable");
  const [automaton, setAutomaton] = useState<string>("");
  const [response, setResponse] = useState<CodesignVerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onVerify = async () => {
    setError(null);
    setResponse(null);
    setPending(true);
    try {
      const registerMap = JSON.parse(registerMapText) as RegisterMap;
      const result = await verifyCodesign({
        register_map: registerMap,
        firmware_ctxdsl: firmwareText,
        formula: formula.trim(),
        ...(automaton.trim() ? { automaton: automaton.trim() } : {}),
      });
      setResponse(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "16px",
        height: "100%",
        overflow: "auto",
      }}
    >
      <div>
        <h3 style={{ margin: 0, marginBottom: "4px" }}>
          HW/SW codesign verify (C §C.4)
        </h3>
        <p style={{ margin: 0, fontSize: "13px", opacity: 0.8 }}>
          Compose a peripheral register-map sidecar with a hand-authored
          firmware CTXDSL and verify a mu-calculus property over the resulting
          codesign composition. Mirrors <code>mununu codesign verify</code> on
          the CLI. The peripheral side is modelled as a chaotic stub (Doc A §2);
          the composition is asynchronous (Doc C §C.5 — bus arbitration is
          non-deterministic).
        </p>
      </div>

      <label
        style={{
          fontSize: "13px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        Register-map sidecar (JSON):
        <textarea
          value={registerMapText}
          onChange={(e) => setRegisterMapText(e.target.value)}
          spellCheck={false}
          style={{
            minHeight: "200px",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "12px",
            padding: "8px",
            resize: "vertical",
          }}
        />
      </label>

      <label
        style={{
          fontSize: "13px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        Firmware CTXDSL:
        <textarea
          value={firmwareText}
          onChange={(e) => setFirmwareText(e.target.value)}
          spellCheck={false}
          style={{
            minHeight: "240px",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "12px",
            padding: "8px",
            resize: "vertical",
          }}
        />
      </label>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <label
          style={{
            fontSize: "13px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            flex: "1 1 200px",
          }}
        >
          Formula to evaluate:
          <input
            type="text"
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            placeholder="init_reachable"
            style={{
              padding: "4px 8px",
              fontSize: "12px",
              fontFamily: "ui-monospace, monospace",
            }}
          />
        </label>
        <label
          style={{
            fontSize: "13px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            flex: "1 1 200px",
          }}
        >
          Automaton / composition (optional):
          <input
            type="text"
            value={automaton}
            onChange={(e) => setAutomaton(e.target.value)}
            placeholder="<PERIPHERAL>System (default)"
            style={{
              padding: "4px 8px",
              fontSize: "12px",
              fontFamily: "ui-monospace, monospace",
            }}
          />
        </label>
      </div>

      <div>
        <button
          type="button"
          onClick={onVerify}
          disabled={pending}
          style={{
            padding: "6px 14px",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {pending ? "Verifying…" : "Run codesign verify"}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: "8px 12px",
            background: "#fde2e2",
            color: "#8a1f1f",
            borderRadius: "4px",
            fontSize: "13px",
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {response && <CodesignVerifyView response={response} />}
    </div>
  );
};

const CodesignVerifyView = ({
  response,
}: {
  response: CodesignVerifyResponse;
}) => {
  const badge =
    response.outcome === "holds"
      ? { bg: "#dff0d8", fg: "#1f5a1f", label: "HOLDS" }
      : { bg: "#f8d7da", fg: "#8a1f1f", label: "VIOLATED" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div
        style={{
          padding: "12px",
          background: badge.bg,
          color: badge.fg,
          borderLeft: `4px solid ${badge.fg}`,
          borderRadius: "2px",
          fontSize: "13px",
        }}
      >
        <strong style={{ fontSize: "14px" }}>
          Verdict: {badge.label} on {response.composition.automaton}
        </strong>
        <div style={{ marginTop: "6px" }}>
          States satisfying: {response.satisfying_states} /{" "}
          {response.total_states}
        </div>
        <div>
          Initial states satisfying: {response.initial_satisfying.length} /{" "}
          {response.initial_states.length}
        </div>
        {response.initial_states.length > 0 && (
          <div
            style={{
              marginTop: "4px",
              fontSize: "12px",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            initials: {response.initial_states.join(", ")}
          </div>
        )}
        {response.initial_satisfying.length > 0 && (
          <div
            style={{
              fontSize: "12px",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            satisfying: {response.initial_satisfying.join(", ")}
          </div>
        )}
      </div>

      <div style={{ fontSize: "13px" }}>
        <em>Composition:</em>
        <ul style={{ margin: "4px 0 0 20px" }}>
          <li>
            peripheral automaton:{" "}
            <code>{response.composition.peripheral_automaton}</code>
          </li>
          <li>
            composition name:{" "}
            <code>{response.composition.composition_name}</code>
          </li>
          <li>
            firmware members:{" "}
            <code>{response.composition.firmware_members.join(", ")}</code>
          </li>
        </ul>
      </div>

      <details>
        <summary style={{ fontSize: "13px", cursor: "pointer" }}>
          Composed CTXDSL ({response.composed_ctxdsl.split("\n").length} lines)
        </summary>
        <pre
          style={{
            marginTop: "8px",
            padding: "10px",
            background: "#f7f7f7",
            borderRadius: "3px",
            fontSize: "11px",
            fontFamily: "ui-monospace, monospace",
            maxHeight: "400px",
            overflow: "auto",
          }}
        >
          {response.composed_ctxdsl}
        </pre>
      </details>
    </div>
  );
};
