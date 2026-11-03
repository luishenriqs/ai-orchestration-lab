import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAB_NAME,
  LAB_SCHEMA_VERSION,
  LAB_FOUNDATION_TASK,
  REQUIRED_LAB_DIRECTORIES,
  NORMATIVE_SPECIFICATION_FILES,
} from '../../src/index.js';

const currentFilePath = fileURLToPath(import.meta.url);
const workspaceRoot = path.resolve(path.dirname(currentFilePath), '../../..');

describe('P1-001 foundation infrastructure', () => {
  it('imports compiled foundation constants and validates strict assertions', () => {
    assert.strictEqual(LAB_NAME, 'ai-orchestration-lab');
    assert.strictEqual(LAB_SCHEMA_VERSION, '0.3-p0');
    assert.strictEqual(LAB_FOUNDATION_TASK, 'P1-001');
    assert.strictEqual(REQUIRED_LAB_DIRECTORIES.length, 16);
    assert.strictEqual(NORMATIVE_SPECIFICATION_FILES.length, 2);
  });

  it('verifies all required laboratory directories exist in the workspace', async () => {
    for (const relativeDir of REQUIRED_LAB_DIRECTORIES) {
      const targetPath = path.join(workspaceRoot, relativeDir);
      const stat = await fs.stat(targetPath);
      assert.ok(
        stat.isDirectory(),
        `Expected directory to exist: ${relativeDir}`
      );
    }
  });

  it('verifies normative specification documents are present and non-empty', async () => {
    for (const relativeFile of NORMATIVE_SPECIFICATION_FILES) {
      const targetPath = path.join(workspaceRoot, relativeFile);
      const stat = await fs.stat(targetPath);
      assert.ok(
        stat.isFile(),
        `Expected normative file to exist: ${relativeFile}`
      );
      assert.ok(
        stat.size > 0,
        `Expected normative file to be non-empty: ${relativeFile}`
      );
    }
  });
});
