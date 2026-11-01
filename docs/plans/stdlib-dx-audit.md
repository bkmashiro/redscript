# Stdlib and syntax developer-experience audit

Baseline: public npm `redscript-mc@4.0.0`, installed in a disposable consumer
outside the checkout. These are compile/CLI/link-shape observations, not live
Minecraft semantic or performance measurements. Invalid-input probes are
intentional; the rejected-case count is not a defect rate.

## Findings and priority

1. **Unknown bare calls can silently produce broken output.** With `import math;`,
   `sni_fixed(30)` compiles but references a missing `probe:sni_fixed` function.
   Prioritize strict unresolved-call diagnostics, preserving explicit declared
   external contracts and auditing compiler intrinsics before changing the gate.
2. **Project and single-file stdlib resolution disagree.** Bare math/cooldown
   imports work in single files but strict init-project compilation rejects them.
   Quoted `stdlib/math` also fails as an undeclared project dependency.
3. **Module-qualified stdlib calls advertised in README do not work.**
   `math::sin_fixed` is diagnosed as an absent type static method; `math::sin`
   is additionally not the documented degree/fx1000 helper name.
4. **Option pattern binding needs an end-to-end fix.** The valid statement form
   below parses but compilation reports `Variable 'v' used before declaration`.
   A Rust-style `return match ...` expression is separately unsupported; do not
   confuse that syntax limitation with the statement-binding failure.

## Immediate documentation correction

README's checkout-relative import was replaced with `import math;`. Both locale
module-table examples now use the verified unqualified `sin_fixed(45)` call.
The source-only full-demo command is explicitly labelled as requiring a checkout.
Three README regressions were first observed failing, then passed against the
corrected snippets with source files located outside the checkout. These fixes
are workspace documentation changes, not a new npm version or a resolver fix.

Current working single-file spelling:

```rs
import math;
fn main(): int { return sin_fixed(30); }
```

`sin_fixed` takes degrees and returns an integer scaled by 1000. Do not present
this as a general floating-point `sin` API.

Broken-call reproduction (expected strict rejection, actual dangling function):

```rs
import math;
fn main(): int { return sni_fixed(30); }
```

Project reproduction after `redscript init demo`, replacing `src/main.mcrs`:

```rs
package demo;
import math;
export fn main(): int { return sin_fixed(30); }
```

Compile with `redscript compile demo/src/main.mcrs`. The current project loader
rejects the import before call resolution, irrespective of qualified/bare use.

Option statement reproduction:

```rs
fn main(): int {
    let x: Option<int> = Some(4);
    let out: int = 0;
    match x {
        Some(v) => { out = v; }
        None => { out = 0; }
    }
    return out;
}
```

## Proposed follow-up, not implemented

Keep the existing import grammar and make compiler-shipped stdlib available to
both project and single-file resolution without user checkout paths or an ad hoc
manifest dependency. Decide module binding/qualification and name-conflict rules
before modifying the package resolver. Retain compatibility for current bare
calls. Add installed CLI project+stdlib tests and explicit negative/link-completeness
checks, rather than validating project init and stdlib separately.

## Probe matrix

Observed: 26 probes, 11 accepted and 15 rejected; 1 accepted case has a dangling own-namespace function reference.

- **bare-qualified** — rejected: Type 'math' has no static method 'sin_fixed'
- **bare-unqualified** — accepted: No missing direct own-namespace function references
- **readme-module-table** — rejected: Type 'math' has no static method 'sin'
- **quoted-stdlib** — accepted: No missing direct own-namespace function references
- **readme-relative** — rejected: Cannot import '../src/stdlib/math.mcrs'
- **qualified-typo** — rejected: Type 'math' has no static method 'sni_fixed'
- **unqualified-typo** — ACCEPTED, DANGLING CALL: probe:sni_fixed
- **wrong-argument** — rejected: Type 'math' has no static method 'sin_fixed'
- **missing-module** — rejected: Module 'maths' not found. Make sure 'maths.mcrs' exists relative to this file or in the stdlib.
- **cooldown** — rejected: Type 'cooldown' has no static method 'cooldown_start'
- **fixed-inference** — accepted: No missing direct own-namespace function references
- **option-match** — rejected: Unexpected token 'match'. Expected an expression (identifier, literal, '(', '[', or '{')
- **list-basic** — accepted: No missing direct own-namespace function references
- **math-boundaries** — rejected: Type 'math' has no static method 'clamp'
- **math-global-boundaries** — accepted: No missing direct own-namespace function references
- **wrong-argument-global** — rejected: Argument 1 of 'sin_fixed' expects int, got string
- **wrong-arity** — rejected: Function 'sin_fixed' expects 1 arguments, got 0
- **cooldown-global** — accepted: No missing direct own-namespace function references
- **list-used** — accepted: No missing direct own-namespace function references
- **vec-used** — accepted: No missing direct own-namespace function references
- **multiple-imports** — accepted: No missing direct own-namespace function references
- **map-used** — accepted: No missing direct own-namespace function references
- **option-match-statement** — rejected: Variable 'v' used before declaration
- **project-bare** — rejected: <consumer>/project-bare/src/main.mcrs:2:8: error: Import 'math' must use a canonical package path in strict project mode
- **project-quoted** — rejected: <consumer>/project-quoted/src/main.mcrs:2:8: error: Import 'stdlib/math' requires an undeclared module dependency in 'local/project_quoted'
- **project-cooldown** — rejected: <consumer>/project-cooldown/src/main.mcrs:2:8: error: Import 'cooldown' must use a canonical package path in strict project mode
