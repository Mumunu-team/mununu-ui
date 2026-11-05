# Phase B Local Testing Guide

End-to-end recipe for exercising the **Suggest from source (Phase B)** auto-detection feature in `mununu-ui` against a locally-built `mununu` backend.

The feature pipeline is:

```
source code
   │
   │  (1) tree-sitter cursor walk
   ▼
concurrency_detect  ──►  DetectedConcurrency[]   (Rust)
   │                                  ▲
   │  (2) JSON over HTTP              │
   ▼                                  │
POST /extraction/propose-composition  │   ── shared serde::Serialize ──
   │                                  │
   │  (3) React hook                  │
   ▼                                  │
CompositionEditor "Suggest" button   ─┘
```

You can test each layer in isolation or run the full UI flow.

---

## 1. Prerequisites

- Rust 1.91+ with the workspace toolchain (`rust-toolchain.toml` pins `stable`).
- Node.js 20+ and npm.
- Both repos checked out side-by-side. The instructions below assume:
  - `../mununu` (Rust backend, a sibling of this checkout)
  - `.` (this repo)

## 2. Start the backend with the Phase B endpoint

```bash
cd ../mununu   # the Rust backend, a sibling of this checkout
cargo run --release -p mununu-cli -- server --addr 127.0.0.1:8080
```

Verify the endpoint is wired:

```bash
curl -sf http://127.0.0.1:8080/api/v1/health
# → {"status":"ok",...}

curl -X POST http://127.0.0.1:8080/api/v1/extraction/propose-composition \
  -H 'Content-Type: application/json' \
  -d '{"source":"import asyncio\nawait asyncio.gather(a(), b())","language":"python"}'
# → {"findings":[{"detector_id":"python_asyncio_gather","description":"asyncio.gather over 2 coroutine(s)","line":2,"branch_count":2,"suggested_instance_names":["task_0","task_1"],"suggested_class_hint":null}]}
```

If `findings` is `[]` for that input, the backend you're running is **older than Phase B**. Rebuild from `main` (Phase B landed in commits `61750ac` … `4475fb9`).

## 3. Start the UI

```bash
cd ../mununu-ui   # this repo
npm install     # first run only
npm run dev
# → http://localhost:5173
```

The UI defaults to `http://localhost:8080/api/v1` (set in `src/api/client.ts`). To point at a different backend, set `VITE_API_URL` in `.env.local` before `npm run dev`.

## 4. Smoke tests

### 4.1 CLI direct (skips the UI entirely)

The fastest way to verify the detector is correct:

```bash
cat > /tmp/gather.py <<'PY'
import asyncio

class Worker:
    async def run(self, x):
        return x

async def main():
    w1 = Worker()
    w2 = Worker()
    return await asyncio.gather(w1.run(1), w2.run(2))
PY

cd ../mununu   # the Rust backend, a sibling of this checkout
cargo run -q -p mununu-extract -- ast \
    --source /tmp/gather.py \
    --language python \
    --propose-composition \
    /dev/null
```

Expected stderr:

```
Detected 1 concurrency idiom(s)
  line 10: python_asyncio_gather — asyncio.gather over 2 coroutine(s)
```

Expected stdout: a JSON array with one `DetectedConcurrency` record (line 10, `branch_count: 2`, `suggested_instance_names: ["task_0", "task_1"]`).

The `/dev/null` placeholder is the config argument — it's required by the subcommand but **not consumed** in `--propose-composition` mode (the source is the only input the detector reads).

### 4.2 HTTP curl (covers the API serializer)

```bash
curl -X POST http://127.0.0.1:8080/api/v1/extraction/propose-composition \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "source": "const tasks = await Promise.all([w1.run(), w2.run()]);",
  "language": "typescript"
}
JSON
```

Expected: `{"findings":[{"detector_id":"typescript_promise_all", ...}]}` with `branch_count: 2`.

### 4.3 UI flow (the user-facing surface)

1. Open `http://localhost:5173`.
2. Sidebar → **Extraction** → **Software Extraction** workflow.
3. **Load Source**: drop the `/tmp/gather.py` file from §4.1 (or paste its content). The file extension `.py` resolves to the `python` language; the **Suggest from source** button is gated on this resolution succeeding.
4. **Extract Model**: click through with default settings — the compose step doesn't need extraction to have produced anything; it reads `state.sourceContent` directly.
5. **Compose Instances**: you should see two action buttons under the help text:
   - `Start from template (2-instance race)`
   - `Suggest from source (Phase B)`
6. Click **Suggest from source (Phase B)**. After ~50ms a blue "1 concurrency idiom(s) detected" panel appears with one card:
   ```
   python_asyncio_gather @ line 10
   asyncio.gather over 2 coroutine(s)
   Suggests: task_0, task_1
   [ Apply ]
   ```
7. Click **Apply**. The textarea fills with:
   ```json
   {
     "type": "asynchronous",
     "name": "auto_python_asyncio_gather_l10",
     "instances": [
       { "of": "Worker", "as": "task_0" },
       { "of": "Worker", "as": "task_1" }
     ],
     "shared": []
   }
   ```
8. The green **Valid composition** summary should appear below. The `Continue` button becomes enabled.

**Negative path** — paste a source file with no concurrency idioms (e.g., a plain class definition). Click **Suggest from source**. You should see a yellow "No concurrency idioms detected" notice with a Dismiss button. The composition editor falls back to manual / template authoring.

**Error path** — stop the backend (`Ctrl+C` in the cargo terminal) and click **Suggest from source**. You should see a red "Propose-composition failed: …" notice; the rest of the editor remains usable.

## 5. Real-world sources to try

The mununu repo ships staging fixtures under `.claude/reviews/prospector/staging/`. Drop these files into the UI's Load step to see Phase B's behaviour on real MCP-server source:

| Fixture | Path (in the `mununu` repo) | Expected |
|---------|-------------------------------|----------|
| MCP-001 LangGraph parallel-interrupt | `.claude/reviews/prospector/staging/MCP-001/source/tool_node_prefix.py` | 1 finding — `asyncio.gather` at line 254, `branch_count: null` (dynamic args). |
| MCP-002 langgraphjs AsyncLocalStorage | `.claude/reviews/prospector/staging/MCP-002/source/pregel_index.ts` | 2 findings — `Promise.all` at lines 2144 + 2155. |
| MCP-005 mcp-server-memory file race | `.claude/reviews/prospector/staging/MCP-005/source/index.ts` | **0 findings** (correct — the race is implicit). Use this to exercise the empty-findings UI fallback. |

The MCP-005 silence is the most informative result: Phase B does **not** produce false positives. When there is no syntactic concurrency marker, you fall back to manual authoring, and that is by design.

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Suggest button doesn't appear at all | Source filename has an unrecognised extension | Use `.py` / `.ts` / `.tsx` / `.rs` / `.gd`. The button is gated on `inferLanguageFromFileName(state.sourceFileName)`. |
| 404 on `/extraction/propose-composition` | Backend predates Phase B | Rebuild backend from `main`. |
| 400 with `unknown language: …` | UI sent a language string the backend doesn't recognise | The UI maps file extensions → backend names; if you customised the mapping, ensure the backend names match `parser::SourceLanguage::from_name`. |
| 400 with `parse error: …` | tree-sitter rejected the source (heavy syntax errors) | The detector is conservative — pasting a fragment without surrounding scope can fail. Use a complete file. |
| Empty findings on a file you expect to have an idiom | Detector might not cover that idiom yet | Check `crates/mununu-core/src/adapter/extraction/ast_extract/concurrency_detect.rs` in the `mununu` repo. Phase B (B1) covers `asyncio.gather`, `Promise.all`, and `Promise.allSettled`. Other idioms (`asyncio.create_task`, `multiprocessing.Process`, `Worker`, `tokio::spawn`, `std::thread::spawn`) are deferred — see the Phase B plan (private planning notes, kept outside this repo). |

## 7. Manual end-to-end verification (optional)

To confirm the suggested composition actually feeds back into the verification pipeline:

1. Apply a finding in the compose step (§4.3 step 7).
2. Edit the composition JSON to add at least one `shared` label that names a method appearing in the extracted automaton (e.g., `["ev_run"]`).
3. Click **Continue** to advance to the **Translate** step. The merged extract config (single-target + composition block) is sent to `/extraction/extract`.
4. Click **Continue** through **Verify**. The resulting `composition` block in the espec should include both instance automata named `task_0` / `task_1` and the shared label list you set.

If the resulting espec has the per-instance automata but no shared synchronization, you've verified the round-trip: Phase B → Phase A label rewriting → composition engine → mu-calculus evaluator.

## 8. Extending Phase B

Adding a new detector is a single Rust file change plus tests:

1. Add a `match_<lang>_<idiom>(...)` function in `crates/mununu-core/src/adapter/extraction/ast_extract/concurrency_detect.rs` (`mununu` repo).
2. Wire it into `detect_concurrency` for the relevant `SourceLanguage` arm.
3. Unit-test against minimal-form and realistic-form sources (the test methodology lesson from GAP-005h).
4. No UI change is required — new detectors automatically surface as additional cards in the same `FindingsList`.

The Phase B plan document (private planning notes, kept outside this repo) lists the prioritised backlog of follow-up detectors and the academic / technical sources that motivate each.
