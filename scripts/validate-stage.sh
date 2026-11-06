#!/bin/sh
# Logs completos, status explícito; nunca converter falha em sucesso.
set -u
stage=$1
pattern=$2
phase=$3
log="docs/evidence/p1-execution/$stage-$phase.log"
{
  printf 'stage=%s phase=%s command=node --test --test-isolation=none --test-reporter=spec %s\n' "$stage" "$phase" "$pattern"
  npm run build
  build_code=$?
  printf 'build_exit=%s\n' "$build_code"
  if [ "$build_code" -ne 0 ]; then exit "$build_code"; fi
  node --test --test-isolation=none --test-reporter=spec "$pattern"
  test_code=$?
  printf 'test_exit=%s\n' "$test_code"
  exit "$test_code"
} > "$log" 2>&1
code=$?
tail -n 12 "$log"
exit "$code"
