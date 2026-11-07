#!/bin/sh
set -eu
npm run typecheck > docs/evidence/p1-execution/final-typecheck.log 2>&1
npm run build > docs/evidence/p1-execution/final-build.log 2>&1
npm run test:coverage > docs/evidence/p1-execution/final-coverage.log 2>&1
npm run simulate > docs/evidence/p1-execution/final-simulation.log 2>&1
node scripts/verify-evidence.mjs > docs/evidence/p1-execution/final-evidence-verification.log 2>&1
cat docs/evidence/p1-execution/final-simulation.log docs/evidence/p1-execution/final-evidence-verification.log
tail -n 30 docs/evidence/p1-execution/final-coverage.log
