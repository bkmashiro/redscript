# P16 Storage/NBT/Raw-Boundary Typed Sidecar Spike

Date: 2026-06-30
Status: Done — exploratory spike, no production parser

## Scope

Explore whether typed sidecar metadata could make storage/NBT/raw boundaries safer for future optimizer and validator work.

This spike deliberately does **not** build a production raw Minecraft command parser and does not change compiler behavior.

## Current boundary model

The current LIR already separates many typed operations from opaque text:

- Typed scoreboard operations: `score_set`, `score_delta`, `score_copy`, arithmetic ops, comparisons.
- Typed storage/NBT operations: `store_score_to_nbt`, `store_nbt_to_score`, `nbt_set_literal`, `nbt_copy`.
- Typed calls: `call`, `call_macro`, `call_context`, conditional calls.
- Opaque boundaries: `raw`, `macro_line`, nested `store_cmd_to_score` commands that contain raw/macro/call shapes.

`src/optimizer/lir/effects.ts` provides the current effect side of this model:

- `semanticReads`
- `sourceOperands`
- `writes`
- `opaqueReads`
- `opaqueWrites`
- `barrier`

This is already a minimal typed sidecar, but it is computed on demand and is not currently attached to LIR instructions as durable metadata.

## Candidate sidecar shape

A future non-production prototype could attach or derive metadata like:

```ts
type BoundarySidecar = {
  reads: Slot[]
  writes: Slot[]
  storageReads: StorageRef[]
  storageWrites: StorageRef[]
  opaqueScoreboardRead: boolean
  opaqueScoreboardWrite: boolean
  opaqueStorageRead: boolean
  opaqueStorageWrite: boolean
  macroSubstitution: boolean
  rawText: boolean
  provenance: 'typed-lir' | 'macro-helper' | 'raw-user-command' | 'lowering-compat'
  confidence: 'exact' | 'conservative' | 'opaque'
}
```

Important rule: sidecar metadata may make typed instructions more explicit, but raw/macro text remains opaque unless it came from a typed compiler-owned emitter path. Regex extraction may be kept only as a conservative safety/debug hint.

## Safe uses

Typed sidecar metadata would be useful for:

1. Making optimizer barriers auditable without re-deriving effects in every pass.
2. Distinguishing exact typed storage writes from unknown raw storage effects.
3. Reporting why a rewrite candidate was blocked (`opaque raw`, `macro substitution`, `storage write`, `ABI slot`).
4. Building more stable diagnostics for `gate:lir-local-copy` residuals.
5. Letting future validators assert “this command came from typed LIR” vs “this command is raw text”.

## Non-goals

Do not use the sidecar to:

- Parse arbitrary raw Minecraft commands as semantic proof.
- Weaken existing `raw`/`macro_line` opacity.
- Reclassify user raw text as exact typed storage/scoreboard effects.
- Default-enable local-copy/RMW.
- Replace `verifyLIR` strict checks.

## Recommended next action

Do not implement production sidecar metadata in this tranche.

Recommended future tranche:

1. Add a pure helper that maps each typed `LIRInstr` to a `BoundarySidecar` without storing it on the instruction.
2. Unit-test the helper against all LIR instruction kinds.
3. Use it only in diagnostics first, especially the local-copy/RMW residual reports.
4. Keep `raw` and `macro_line` sidecars `confidence: 'opaque'` with only optional conservative mention hints.
5. After diagnostics stabilize, consider threading sidecar summaries into validators or gate JSON.

## Risks

- If sidecar data is stored directly on instructions, optimization passes may accidentally stale it when cloning/rewriting instructions.
- If sidecar confidence is too coarse, future passes may over-trust conservative hints.
- If raw/macro text gets parsed opportunistically, this reintroduces the exact unsafe pattern P4/P13 were designed to avoid.

## Decision

P16 closes as a spike/documentation result. The next safe implementation is a derived diagnostic helper, not a production raw parser and not a behavior-changing optimizer pass.

## Gates run

- `npm run build`
- `git diff --check`
