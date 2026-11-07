import { it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { REQUIRED_SCENARIOS, runScenario } from '../../src/scenarios/p1.js';
import { resolveWorkspaceRoot } from '../../src/contracts/schema-loader.js';
const root = path.join(resolveWorkspaceRoot(), 'runs', 'scenario-tests-' + randomUUID());
fs.mkdirSync(root);
for (let number = 1; number <= 16; number++)
    it(`P1-008 #${number} ${REQUIRED_SCENARIOS[number - 1]}`, async () => {
        const result = await runScenario(number, root);
        assert.equal(result.status, 'PASS', JSON.stringify(result.observed));
        assert.equal(result.official_number, number);
        assert.equal(result.objective, REQUIRED_SCENARIOS[number - 1]);
        assert.ok(result.artifacts.length > 0);
        assert.ok(fs.existsSync(path.join(result.evidence_directory, 'scenario-result.json')));
    });
