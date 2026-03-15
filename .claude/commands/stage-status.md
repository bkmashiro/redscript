# stage-status

Show the current state of the refactor pipeline.

Check what exists in src2/ (if the refactor branch is active), run tests,
and summarize which pipeline stages are implemented and passing.

```bash
echo "=== Current branch ===" && git branch --show-current
echo "=== Test status ===" && npm test -- --passWithNoTests 2>&1 | tail -5
echo "=== src2 exists? ===" && ls src2/ 2>/dev/null || echo "not started"
echo "=== Design doc ===" && wc -l docs/compiler-pipeline-redesign.md
```
