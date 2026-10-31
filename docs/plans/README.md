# Planning and design documents

The current work queue is [ROADMAP.md](../../ROADMAP.md). Update its status when
a slice is verified. Files below supply design constraints or historical evidence;
their old priority lists and completed checkboxes do not supersede that queue.

## Current design references

- [4.0 integer/runtime contract decisions](integer-and-runtime-contracts.md):
  native rounding mismatch and the failing documented throttle regression.
- [Project/package/target architecture](project-package-target-compiler-architecture.md)
  and [implemented architecture track](generic-datapack-language-roadmap.md).
- [Event runtime boundary](event-runtime-boundary.md).
- [External scoreboard objective ABI](redscript-external-scoreboard-objective-abi.md).
- [Numeric scale policy](numeric-scale-policy.md).
- [Timer intrinsic design](timer-v2-intrinsic-plan.md).
- [Minecraft mechanism optimization](mc-mechanism-optimization/README.md).

## Existing optimization and release evidence

- [Production optimization inspection](../optimization.md).
- [Isolated VIR region comparison](../../spikes/001-vir-region/README.md):
  static comparisons include calling-convention copies; no default integration.
- [Typed optimizer opportunities](redscript-typed-optimizer-opportunity-report.md):
  bounded offline/static evidence and experimental rollout limits.
- [Arithmetic exploration](arithmetic-optimization-exploration.md).
- [Release evidence checklist](redscript-release-evidence-checklist.md).
- [Runtime coverage candidate map](redscript-live-oracle-candidate-map.md).

## Historical roadmaps and audits

Keep these documents for design rationale, previous scope and dated verification.
Their past gate results are not proof for a new source revision.

- [vNext release-hardening baseline](redscript-vnext-roadmap.md).
- [Compiler/Minecraft hardening](compiler-mc-hardening-roadmap.md).
- [June autonomous goal](2026-06-30-redscript-autonomous-megagoal.md).
- [July product/DX goal](2026-07-01-redscript-product-dx-autonomous-megagoal.md).
- [July editor/DX roadmap](2026-07-01-redscript-vscode-editor-dx-roadmap.md).
- [Release-readiness follow-up audit](redscript-release-readiness-followup-audit.md).

Generated coverage inventories and individual implementation notes remain beside
these references. Avoid deleting evidence or moving linked files merely to make
this directory shorter.
