export const LAB_NAME = 'ai-orchestration-lab' as const;
export const LAB_SCHEMA_VERSION = '0.3-p0' as const;
export const LAB_FOUNDATION_TASK = 'P1-001' as const;

export const REQUIRED_LAB_DIRECTORIES: readonly string[] = Object.freeze([
  'docs/specifications',
  'docs/evidence',
  'schemas',
  'contracts',
  'approvals',
  'reviews',
  'runs',
  'worktrees',
  'src/contracts',
  'src/governance',
  'src/execution',
  'src/evidence',
  'src/cli',
  'tests/unit',
  'tests/integration',
  'tests/scenarios',
]);

export const NORMATIVE_SPECIFICATION_FILES: readonly string[] = Object.freeze([
  'docs/specifications/AI-Engineering-Operating-Model-v0.3-P0-Especificacao-Tecnica.md',
  'docs/specifications/P1-Plano-Tecnico-Implementacao-e-Validacao.md',
]);

export * from './contracts/types.js';
export * from './contracts/schema-loader.js';
export * from './contracts/validator.js';
