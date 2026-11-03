import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTRACT_SCHEMA_FILES,
  CONTRACT_TYPES,
  type ContractType,
} from './types.js';

const EXPECTED_PACKAGE_NAME = 'ai-orchestration-lab';

export function resolveWorkspaceRoot(startDir?: string): string {
  const initialDir =
    startDir ?? path.dirname(fileURLToPath(import.meta.url));
  let currentDir = path.resolve(initialDir);

  while (true) {
    const pkgPath = path.join(currentDir, 'package.json');
    const schemasPath = path.join(currentDir, 'schemas');

    if (fs.existsSync(pkgPath) && fs.existsSync(schemasPath)) {
      try {
        const rawPkg = fs.readFileSync(pkgPath, 'utf8');
        const parsedPkg = JSON.parse(rawPkg) as { name?: unknown };
        if (
          parsedPkg.name === EXPECTED_PACKAGE_NAME &&
          fs.statSync(schemasPath).isDirectory()
        ) {
          return currentDir;
        }
      } catch {
        // Continue climbing if package.json cannot be parsed at this level.
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(
        `Unable to resolve workspaceRoot for "${EXPECTED_PACKAGE_NAME}" starting from "${initialDir}".`
      );
    }
    currentDir = parentDir;
  }
}

export function resolveSchemasDir(customSchemasDir?: string): string {
  if (customSchemasDir !== undefined) {
    return path.resolve(customSchemasDir);
  }
  return path.join(resolveWorkspaceRoot(), 'schemas');
}

export function loadContractSchema(
  contractType: ContractType,
  customSchemasDir?: string
): Record<string, unknown> {
  if (!Object.prototype.hasOwnProperty.call(CONTRACT_SCHEMA_FILES, contractType)) {
    throw new Error(`Unknown contract type: "${String(contractType)}".`);
  }

  const schemasDir = resolveSchemasDir(customSchemasDir);
  const fileName = CONTRACT_SCHEMA_FILES[contractType];
  const filePath = path.join(schemasDir, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Schema file not found for contract "${contractType}" at "${filePath}".`
    );
  }

  const rawContent = fs.readFileSync(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid JSON in schema file "${filePath}" for contract "${contractType}": ${message}`
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `Schema for contract "${contractType}" at "${filePath}" must be a JSON object.`
    );
  }

  const schemaObj = parsed as Record<string, unknown>;
  if (
    schemaObj.$schema !== 'https://json-schema.org/draft/2020-12/schema'
  ) {
    throw new Error(
      `Schema for contract "${contractType}" at "${filePath}" must declare Draft 2020-12 "$schema".`
    );
  }

  return schemaObj;
}

export function loadAllContractSchemas(
  customSchemasDir?: string
): Readonly<Record<ContractType, Record<string, unknown>>> {
  const loaded = {} as Record<ContractType, Record<string, unknown>>;
  for (const contractType of CONTRACT_TYPES) {
    loaded[contractType] = loadContractSchema(contractType, customSchemasDir);
  }
  return Object.freeze(loaded);
}
