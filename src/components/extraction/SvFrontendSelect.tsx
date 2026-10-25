/**
 * SvFrontendSelect — the RTL front end of an SV lift (`lift.frontend` on every
 * `sv/*` request since mununu 0.5; the CLI's `--frontend`). Replaces the former
 * `use_sv2v` / `use_slang` booleans, which the API no longer accepts.
 */

import type { SvFrontend } from "../../api/endpoints";

export const SvFrontendSelect = ({
  value,
  onChange,
}: {
  value: SvFrontend;
  onChange: (frontend: SvFrontend) => void;
}) => (
  <label style={{ fontSize: "0.9rem" }}>
    RTL front end
    <select
      aria-label="RTL front end"
      value={value}
      onChange={(e) => onChange(e.target.value as SvFrontend)}
      style={{ width: "100%", marginTop: "0.25rem", padding: "0.3rem" }}
    >
      <option value="sv2v">sv2v, then Yosys (modern SV; slang fallback)</option>
      <option value="auto">auto (the server's default order)</option>
      <option value="verilog">verilog (Yosys read_verilog only)</option>
      <option value="slang">
        slang (while loops, package imports; needs yosys-slang)
      </option>
    </select>
  </label>
);
