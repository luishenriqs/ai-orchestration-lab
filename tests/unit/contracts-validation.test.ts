import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  APPROVAL_SCOPES,
  CANONICALIZATION_VERSION,
  CONTRACT_SCHEMA_FILES,
  CONTRACT_TYPES,
  DATA_CLASSIFICATIONS,
  EXECUTION_ATTEMPT_STATES,
  EXECUTOR_TYPES,
  IAS_NORMATIVE_STATUSES,
  OBSERVED_TEST_OUTCOMES,
  REVIEW_CATEGORIES,
  REVIEW_VERDICTS,
  RISK_LEVELS,
  SANITIZATION_STATUSES,
  SCOPE_VALIDATION_RESULTS,
  TERMINATION_REASONS,
  VALIDATION_STRATEGIES,
  createContractValidator,
  loadAllContractSchemas,
  loadContractSchema,
  parseAndValidateContract,
  resolveSchemasDir,
  resolveWorkspaceRoot,
  validateApprovalRecord,
  validateContract,
  validateEvidenceManifest,
  validateExecutionAttempt,
  validateExecutionResult,
  validateReviewHandoffPackage,
  validateReviewReport,
  validateTaskContract,
  type ApprovalRecord,
  type ContractType,
  type ContractValidationResult,
  type EvidenceManifest,
  type ExecutionAttempt,
  type ExecutionResult,
  type IasNormativeCard,
  type ReviewHandoffPackage,
  type ReviewReport,
  type TaskContract,
  type TestRunRecord,
} from '../../src/index.js';

const VALID_SHA1 = 'a'.repeat(40);
const VALID_SHA1_ALT = 'b'.repeat(40);
const VALID_SHA256 = 'c'.repeat(64);
const VALID_SHA256_ALT = 'd'.repeat(64);
const VALID_ISO_DATETIME = '2026-11-03T18:00:00.000Z';

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

function assertValid<T>(
  result: ContractValidationResult<T>,
  expectedType: ContractType
): asserts result is Extract<ContractValidationResult<T>, { valid: true }> {
  assert.strictEqual(
    result.valid,
    true,
    `Expected contract "${expectedType}" to be valid, but got errors: ${JSON.stringify(result.errors)}`
  );
  assert.strictEqual(result.contractType, expectedType);
  assert.strictEqual(result.schemaVersion, '0.3-p0');
  assert.strictEqual(result.errors.length, 0);
}

function assertInvalid(
  result: ContractValidationResult<unknown>,
  expectedType: ContractType,
  expectedKeywordOrKeywords?: string | readonly string[],
  expectedInstancePathIncludes?: string
): void {
  assert.strictEqual(
    result.valid,
    false,
    `Expected contract "${expectedType}" to be rejected as invalid, but it was accepted.`
  );
  assert.strictEqual(result.contractType, expectedType);
  assert.ok(
    result.errors.length > 0,
    `Expected at least one diagnostic error for invalid "${expectedType}".`
  );

  if (expectedKeywordOrKeywords !== undefined) {
    const keywords = Array.isArray(expectedKeywordOrKeywords)
      ? expectedKeywordOrKeywords
      : [expectedKeywordOrKeywords];
    const matchedKeyword = result.errors.some((err) =>
      keywords.includes(err.keyword)
    );
    assert.ok(
      matchedKeyword,
      `Expected error keyword in ${JSON.stringify(keywords)}, but got: ${JSON.stringify(
        result.errors.map((e) => ({
          keyword: e.keyword,
          instancePath: e.instancePath,
          params: e.params,
        }))
      )}`
    );
  }

  if (expectedInstancePathIncludes !== undefined) {
    const matchedPath = result.errors.some(
      (err) =>
        err.instancePath.includes(expectedInstancePathIncludes) ||
        JSON.stringify(err.params).includes(expectedInstancePathIncludes)
    );
    assert.ok(
      matchedPath,
      `Expected error instancePath/params to reference "${expectedInstancePathIncludes}", but got: ${JSON.stringify(
        result.errors.map((e) => ({
          keyword: e.keyword,
          instancePath: e.instancePath,
          params: e.params,
        }))
      )}`
    );
  }
}

function makeValidIasCard(): IasNormativeCard {
  return {
    execution_id: 'IAS-EX-F00-002',
    backlog_id: 'IAS-BL-F00-002',
    status: 'planned',
    objective: 'Validar contrato sintético no laboratório',
    source_sections: ['15 §4.2', 'P0 §9.3'],
    predecessors: ['P1-001'],
    files_or_packages_expected: ['src/contracts/validator.ts'],
    invariants: ['Nenhum contrato inválido alcança execução'],
    api_contracts: ['validateContract'],
    database_tables_and_locks: [],
    security_controls: ['additionalProperties: false'],
    audit_and_observability: [' HOST_OBSERVED logs '],
    test_plan: {
      positive: ['Contrato válido aceito'],
      negative: ['Campo obrigatório ausente rejeitado'],
      concurrency: [],
      integration: ['Integração com Ajv2020'],
    },
    evidence_expected: ['docs/evidence/P1-002-evidencia-validacao-contratos.md'],
    rollback_plan: 'Reverter arquivos da tarefa P1-002',
    acceptance_checks: ['npm test com exit code 0'],
    review_required: true,
    human_authorization: 'REQUIRED',
  };
}

function makeValidTaskContract(): TaskContract {
  return {
    schema_version: '0.3-p0',
    contract_revision: 1,
    identity: {
      execution_id: 'LAB-EX-P1-002',
      backlog_id: 'P1-002',
      repository: 'ai-orchestration-lab',
      workspace_context_id: 'ias-lab-synthetic',
      workspace_root: '/home/luishenriqs/projects/ai-orchestration-lab',
      base_commit: VALID_SHA1,
    },
    governance: {
      risk_level: 'LOW',
      approval_required: true,
    },
    scope: {
      objective: 'Implementar validação estrutural dos sete contratos da P0',
      allowed_impl_paths: ['src/contracts/validator.ts'],
      allowed_test_paths: ['tests/unit/contracts-validation.test.ts'],
      forbidden_changes: ['package.json', 'tsconfig.json'],
      protected_existing_tests: true,
    },
    validation: {
      strategy: 'RED_GREEN',
      positive_tests: ['Aceita contratos válidos'],
      negative_tests: ['Rejeita contratos inválidos'],
      boundary_tests: ['Rejeita globs e path traversal'],
      acceptance_checks: ['Todos os 7 schemas validados'],
      validation_commands: ['npm test'],
    },
    execution: {
      selected_executor: 'synthetic',
      mode: 'CONTROLLED',
      timeout_seconds: 10,
      retry_limit: 0,
    },
    rollback: {
      procedure: 'Remover arquivos criados e restaurar src/index.ts e README.md',
    },
    ias_normative_card: null,
  };
}

function makeValidApprovalRecord(): ApprovalRecord {
  return {
    schema_version: '0.3-p0',
    approval_id: 'APV-P1-002-001',
    execution_id: 'LAB-EX-P1-002',
    contract_revision: 1,
    approved_contract_sha256: VALID_SHA256,
    canonicalization_version: CANONICALIZATION_VERSION,
    approval_scope: 'EXECUTION',
    authorized_by: 'Luís Henrique Pereira',
    authorized_at: VALID_ISO_DATETIME,
    approval_source: 'HUMAN-DELIBERATION-2026-11-03',
  };
}

function makeValidExecutionAttempt(): ExecutionAttempt {
  return {
    schema_version: '0.3-p0',
    execution_id: 'LAB-EX-P1-002',
    attempt_id: 'ATT-001',
    approval_id: 'APV-P1-002-001',
    approved_contract_sha256: VALID_SHA256,
    executor: 'synthetic',
    state: 'CREATED',
    started_at: null,
    finished_at: null,
    base_commit: VALID_SHA1,
    workspace_root: '/home/luishenriqs/projects/ai-orchestration-lab/worktrees/ex1/att1/workspace',
    process_identity: null,
    termination_reason: null,
  };
}

function makeValidExecutionResult(): ExecutionResult {
  return {
    schema_version: '0.3-p0',
    execution_id: 'LAB-EX-P1-002',
    attempt_id: 'ATT-001',
    executor: 'synthetic',
    agent_declared_outcome: 'completed',
    agent_summary: 'Validação estrutural concluída em ambiente sintético.',
    agent_reported_blockers: [],
  };
}

function makeValidTestRunRecord(): TestRunRecord {
  return {
    command: 'npm test',
    working_directory: '/home/luishenriqs/projects/ai-orchestration-lab',
    started_at: VALID_ISO_DATETIME,
    duration_ms: 48,
    exit_code: 0,
    log_path: 'runs/LAB-EX-P1-002/attempts/ATT-001/logs/test-green.log',
    log_sha256: VALID_SHA256,
    observed_outcome: 'PASS',
  };
}

function makeValidEvidenceManifest(): EvidenceManifest {
  return {
    schema_version: '0.3-p0',
    execution_id: 'LAB-EX-P1-002',
    attempt_id: 'ATT-001',
    evidence_origin: 'HOST_OBSERVED',
    git: {
      base_sha: VALID_SHA1,
      head_sha: VALID_SHA1_ALT,
      dirty_worktree_files: [],
      diff_sha256: VALID_SHA256,
    },
    test_evidence: {
      strategy: 'RED_GREEN_WHEN_APPLICABLE',
      red: null,
      green: null,
      baseline: null,
    },
    independent_test_runs: [],
    scope_validation: {
      result: 'PENDING',
      unexpected_files: [],
    },
    evidence_integrity: {
      artifact_hashes: [],
    },
  };
}

function makeValidReviewHandoffPackage(): ReviewHandoffPackage {
  return {
    schema_version: '0.3-p0',
    handoff_id: 'HND-001',
    execution_id: 'LAB-EX-P1-002',
    attempt_id: 'ATT-001',
    contract_sha256: VALID_SHA256,
    diff_sha256: VALID_SHA256_ALT,
    workspace_context_id: 'ias-lab-synthetic',
    data_classification: 'SYNTHETIC_LAB',
    evidence_manifest_path: 'runs/LAB-EX-P1-002/attempts/ATT-001/evidence-manifest.json',
    included_artifacts: [],
    review_questions: ['Os sete contratos seguem estritamente a P0 v0.3.0?'],
    sanitization_status: 'PENDING',
    export_authorization_ref: null,
  };
}

function makeValidReviewReport(): ReviewReport {
  return {
    schema_version: '0.3-p0',
    review_id: 'REV-001',
    execution_id: 'LAB-EX-P1-002',
    attempt_id: 'ATT-001',
    reviewed_contract_sha256: VALID_SHA256,
    reviewed_diff_sha256: VALID_SHA256_ALT,
    reviewer_model: 'Gemini 4 Argon',
    review_timestamp: VALID_ISO_DATETIME,
    categories_evaluated: [
      { category: 'Requisitos', applicable: true },
      { category: 'Compatibilidade normativa', applicable: true },
    ],
    findings: [],
    verdict: 'APPROVED',
    limitations: [],
  };
}

describe('P1-002 — Infrastructure, Schema Loader & Fail-Closed Controls', () => {
  it('resolves workspaceRoot and schemasDir deterministically independent of process.cwd()', () => {
    const rootFromDefault = resolveWorkspaceRoot();
    const rootFromDeepSubdir = resolveWorkspaceRoot(
      path.join(rootFromDefault, 'dist', 'tests', 'unit')
    );
    assert.strictEqual(rootFromDefault, rootFromDeepSubdir);
    assert.strictEqual(
      resolveSchemasDir(),
      path.join(rootFromDefault, 'schemas')
    );
  });

  it('loads all 7 normative schemas with Draft 2020-12 "$schema" declaration', () => {
    const schemas = loadAllContractSchemas();
    assert.strictEqual(Object.keys(schemas).length, 7);
    for (const contractType of CONTRACT_TYPES) {
      const schema = loadContractSchema(contractType);
      assert.strictEqual(
        schema.$schema,
        'https://json-schema.org/draft/2020-12/schema'
      );
      assert.strictEqual(schema.type, 'object');
      assert.strictEqual(schema.additionalProperties, false);
      assert.ok(CONTRACT_SCHEMA_FILES[contractType].endsWith('.schema.json'));
    }
  });

  it('fails closed when schemasDir does not exist or contractType is unknown', () => {
    assert.throws(() => {
      loadContractSchema('TaskContract', '/non-existent-directory-p1-002');
    }, /Schema file not found/);

    assert.throws(() => {
      createContractValidator({ schemasDir: '/non-existent-directory-p1-002' });
    }, /Schema file not found/);

    const unknownResult = validateContract(
      'UnknownContract' as unknown as ContractType,
      {}
    );
    assertInvalid(
      unknownResult,
      'UnknownContract' as unknown as ContractType,
      'unknown-contract-type'
    );
  });

  it('rejects non-object roots (null, undefined, primitives, arrays) and malformed JSON without unhandled exceptions', () => {
    for (const invalidRoot of [null, undefined, 42, 'string', true, []]) {
      const res = validateTaskContract(invalidRoot);
      assertInvalid(res, 'TaskContract', 'type');
    }

    const badJsonRes = parseAndValidateContract(
      'TaskContract',
      '{ "schema_version": "0.3-p0", '
    );
    assertInvalid(badJsonRes, 'TaskContract', 'json-parse');

    const validJsonRes = parseAndValidateContract<TaskContract>(
      'TaskContract',
      JSON.stringify(makeValidTaskContract())
    );
    assertValid(validJsonRes, 'TaskContract');
  });

  it('never mutates frozen input objects and never performs silent type coercion', () => {
    const frozenValid = deepFreeze(makeValidTaskContract());
    const validRes = validateTaskContract(frozenValid);
    assertValid(validRes, 'TaskContract');
    assert.strictEqual(validRes.value, frozenValid);

    const coercedRevision = deepFreeze({
      ...makeValidTaskContract(),
      contract_revision: '1',
    });
    assertInvalid(
      validateTaskContract(coercedRevision),
      'TaskContract',
      'type',
      'contract_revision'
    );

    const coercedBoolean = deepFreeze({
      ...makeValidTaskContract(),
      governance: {
        ...makeValidTaskContract().governance,
        approval_required: 'true',
      },
    });
    assertInvalid(
      validateTaskContract(coercedBoolean),
      'TaskContract',
      'type',
      'approval_required'
    );
  });
});

describe('1. TaskContract validation (P0 §9, DEC-P1-002-01, DEC-P1-002-02)', () => {
  it('(P1) accepts valid minimal TaskContract with ias_normative_card: null and empty arrays', () => {
    const base = makeValidTaskContract();
    const minimal: TaskContract = deepFreeze({
      ...base,
      scope: {
        ...base.scope,
        allowed_impl_paths: [],
        allowed_test_paths: [],
        forbidden_changes: [],
      },
      validation: {
        ...base.validation,
        positive_tests: [],
        negative_tests: [],
        boundary_tests: [],
        acceptance_checks: [],
        validation_commands: [],
      },
      ias_normative_card: null,
    });
    assertValid(validateTaskContract(minimal), 'TaskContract');
  });

  it('(P2) accepts valid complete TaskContract with ias_normative_card (all 18 fields, 6 statuses, and structured test_plan object)', () => {
    for (const status of IAS_NORMATIVE_STATUSES) {
      const card = makeValidIasCard();
      const contractWithPopulatedTestPlan = deepFreeze({
        ...makeValidTaskContract(),
        ias_normative_card: {
          ...card,
          status,
        },
      });
      assertValid(
        validateTaskContract(contractWithPopulatedTestPlan),
        'TaskContract'
      );

      const contractWithEmptyTestPlanLists = deepFreeze({
        ...makeValidTaskContract(),
        ias_normative_card: {
          ...card,
          status,
          test_plan: {
            positive: [],
            negative: [],
            concurrency: [],
            integration: [],
          },
        },
      });
      assertValid(
        validateTaskContract(contractWithEmptyTestPlanLists),
        'TaskContract'
      );
    }
  });

  it('(P3) accepts all 5 validation strategies, 4 risk levels, 3 executors, mode CONTROLLED, and retry_limit >= 0', () => {
    for (const strategy of VALIDATION_STRATEGIES) {
      const c = deepFreeze({
        ...makeValidTaskContract(),
        validation: { ...makeValidTaskContract().validation, strategy },
      });
      assertValid(validateTaskContract(c), 'TaskContract');
    }

    for (const risk_level of RISK_LEVELS) {
      const c = deepFreeze({
        ...makeValidTaskContract(),
        governance: { ...makeValidTaskContract().governance, risk_level },
      });
      assertValid(validateTaskContract(c), 'TaskContract');
    }

    for (const selected_executor of EXECUTOR_TYPES) {
      const c = deepFreeze({
        ...makeValidTaskContract(),
        execution: {
          ...makeValidTaskContract().execution,
          selected_executor,
          mode: 'CONTROLLED' as const,
          retry_limit: 2,
        },
      });
      assertValid(validateTaskContract(c), 'TaskContract');
    }
  });

  it('(N1) rejects omission of each of the 9 required top-level fields', () => {
    const topFields: (keyof TaskContract)[] = [
      'schema_version',
      'contract_revision',
      'identity',
      'governance',
      'scope',
      'validation',
      'execution',
      'rollback',
      'ias_normative_card',
    ];
    for (const field of topFields) {
      const clone = { ...makeValidTaskContract() } as Record<string, unknown>;
      delete clone[field];
      assertInvalid(
        validateTaskContract(deepFreeze(clone)),
        'TaskContract',
        'required',
        field
      );
    }
  });

  it('(N2) rejects omission of required subfields in identity, governance, scope, validation, execution, rollback', () => {
    const subobjects: {
      section: keyof Pick<
        TaskContract,
        'identity' | 'governance' | 'scope' | 'validation' | 'execution' | 'rollback'
      >;
      fields: string[];
    }[] = [
      {
        section: 'identity',
        fields: [
          'execution_id',
          'backlog_id',
          'repository',
          'workspace_context_id',
          'workspace_root',
          'base_commit',
        ],
      },
      { section: 'governance', fields: ['risk_level', 'approval_required'] },
      {
        section: 'scope',
        fields: [
          'objective',
          'allowed_impl_paths',
          'allowed_test_paths',
          'forbidden_changes',
          'protected_existing_tests',
        ],
      },
      {
        section: 'validation',
        fields: [
          'strategy',
          'positive_tests',
          'negative_tests',
          'boundary_tests',
          'acceptance_checks',
          'validation_commands',
        ],
      },
      {
        section: 'execution',
        fields: ['selected_executor', 'mode', 'timeout_seconds', 'retry_limit'],
      },
      { section: 'rollback', fields: ['procedure'] },
    ];

    for (const { section, fields } of subobjects) {
      for (const field of fields) {
        const base = makeValidTaskContract();
        const subClone = {
          ...(base[section] as Record<string, unknown>),
        };
        delete subClone[field];
        const candidate = deepFreeze({
          ...base,
          [section]: subClone,
        });
        assertInvalid(
          validateTaskContract(candidate),
          'TaskContract',
          'required',
          field
        );
      }
    }
  });

  it('(N3) rejects omission of any of the 18 fields of ias_normative_card or any of the 4 fields of test_plan', () => {
    const cardKeys = Object.keys(makeValidIasCard()) as (keyof IasNormativeCard)[];
    assert.strictEqual(cardKeys.length, 18);

    for (const key of cardKeys) {
      const cardClone = { ...makeValidIasCard() } as Record<string, unknown>;
      delete cardClone[key];
      const candidate = deepFreeze({
        ...makeValidTaskContract(),
        ias_normative_card: cardClone,
      });
      assertInvalid(
        validateTaskContract(candidate),
        'TaskContract',
        'required',
        key
      );
    }

    const testPlanKeys = [
      'positive',
      'negative',
      'concurrency',
      'integration',
    ] as const;
    for (const tpKey of testPlanKeys) {
      const tpClone = {
        ...makeValidIasCard().test_plan,
      } as Record<string, unknown>;
      delete tpClone[tpKey];
      const candidate = deepFreeze({
        ...makeValidTaskContract(),
        ias_normative_card: {
          ...makeValidIasCard(),
          test_plan: tpClone,
        },
      });
      assertInvalid(
        validateTaskContract(candidate),
        'TaskContract',
        'required',
        tpKey
      );
    }
  });

  it('(N4, N5, N6) rejects incompatible schema_version, forbidden task_ready field, and additionalProperties at root or subobjects', () => {
    assertInvalid(
      validateTaskContract(
        deepFreeze({ ...makeValidTaskContract(), schema_version: '0.2-p0' })
      ),
      'TaskContract',
      'const',
      'schema_version'
    );

    assertInvalid(
      validateTaskContract(
        deepFreeze({ ...makeValidTaskContract(), task_ready: true })
      ),
      'TaskContract',
      'additionalProperties',
      'task_ready'
    );

    for (const section of [
      'identity',
      'governance',
      'scope',
      'validation',
      'execution',
      'rollback',
    ] as const) {
      const base = makeValidTaskContract();
      const candidate = deepFreeze({
        ...base,
        [section]: {
          ...base[section],
          extra_unexpected_prop: 'forbidden',
        },
      });
      assertInvalid(
        validateTaskContract(candidate),
        'TaskContract',
        'additionalProperties',
        'extra_unexpected_prop'
      );
    }

    assertInvalid(
      validateTaskContract(
        deepFreeze({
          ...makeValidTaskContract(),
          ias_normative_card: {
            ...makeValidIasCard(),
            extra_card_prop: 'forbidden',
          },
        })
      ),
      'TaskContract',
      'additionalProperties',
      'extra_card_prop'
    );

    assertInvalid(
      validateTaskContract(
        deepFreeze({
          ...makeValidTaskContract(),
          ias_normative_card: {
            ...makeValidIasCard(),
            test_plan: {
              ...makeValidIasCard().test_plan,
              extra_test_category: [],
            },
          },
        })
      ),
      'TaskContract',
      'additionalProperties',
      'extra_test_category'
    );
  });

  it('(N7) rejects unknown enum values in strategy, risk_level, selected_executor, mode, and ias_normative_card.status', () => {
    assertInvalid(
      validateTaskContract(
        deepFreeze({
          ...makeValidTaskContract(),
          validation: {
            ...makeValidTaskContract().validation,
            strategy: 'UNKNOWN_STRATEGY',
          },
        })
      ),
      'TaskContract',
      'enum',
      'strategy'
    );

    assertInvalid(
      validateTaskContract(
        deepFreeze({
          ...makeValidTaskContract(),
          governance: {
            ...makeValidTaskContract().governance,
            risk_level: 'EXTREME',
          },
        })
      ),
      'TaskContract',
      'enum',
      'risk_level'
    );

    assertInvalid(
      validateTaskContract(
        deepFreeze({
          ...makeValidTaskContract(),
          execution: {
            ...makeValidTaskContract().execution,
            selected_executor: 'claude',
          },
        })
      ),
      'TaskContract',
      'enum',
      'selected_executor'
    );

    assertInvalid(
      validateTaskContract(
        deepFreeze({
          ...makeValidTaskContract(),
          execution: {
            ...makeValidTaskContract().execution,
            mode: 'UNCONTROLLED',
          },
        })
      ),
      'TaskContract',
      ['const', 'enum'],
      'mode'
    );

    assertInvalid(
      validateTaskContract(
        deepFreeze({
          ...makeValidTaskContract(),
          ias_normative_card: {
            ...makeValidIasCard(),
            status: 'TASK-READY',
          },
        })
      ),
      'TaskContract',
      'enum',
      'status'
    );
  });

  it('(N8, B1, B2, B3, B4) rejects invalid types, globs, absolute/traversal paths, fractional numbers, empty strings, and malformed test_plan', () => {
    assertInvalid(
      validateTaskContract(
        deepFreeze({
          ...makeValidTaskContract(),
          execution: { ...makeValidTaskContract().execution, timeout_seconds: 0 },
        })
      ),
      'TaskContract',
      'minimum',
      'timeout_seconds'
    );

    assertInvalid(
      validateTaskContract(
        deepFreeze({
          ...makeValidTaskContract(),
          execution: { ...makeValidTaskContract().execution, retry_limit: -1 },
        })
      ),
      'TaskContract',
      'minimum',
      'retry_limit'
    );

    for (const invalidTestPlan of [
      ['direct-array-not-allowed'],
      [],
      'string-plan',
      null,
      {
        positive: [''],
        negative: [],
        concurrency: [],
        integration: [],
      },
      {
        positive: [123],
        negative: [],
        concurrency: [],
        integration: [],
      },
    ]) {
      assertInvalid(
        validateTaskContract(
          deepFreeze({
            ...makeValidTaskContract(),
            ias_normative_card: {
              ...makeValidIasCard(),
              test_plan: invalidTestPlan,
            },
          })
        ),
        'TaskContract',
        ['type', 'minLength'],
        'test_plan'
      );
    }

    for (const badPath of [
      'src/**/*.ts',
      'src/*.ts',
      'src/?.ts',
      'src/[a].ts',
      '/etc/passwd',
      '../secret.ts',
      'src/../secret.ts',
      '..',
    ]) {
      assertInvalid(
        validateTaskContract(
          deepFreeze({
            ...makeValidTaskContract(),
            scope: {
              ...makeValidTaskContract().scope,
              allowed_impl_paths: [badPath],
            },
          })
        ),
        'TaskContract',
        'pattern',
        'allowed_impl_paths'
      );

      assertInvalid(
        validateTaskContract(
          deepFreeze({
            ...makeValidTaskContract(),
            scope: {
              ...makeValidTaskContract().scope,
              allowed_test_paths: [badPath],
            },
          })
        ),
        'TaskContract',
        'pattern',
        'allowed_test_paths'
      );
    }

    assertInvalid(
      validateTaskContract(
        deepFreeze({ ...makeValidTaskContract(), contract_revision: 1.5 })
      ),
      'TaskContract',
      'type',
      'contract_revision'
    );

    assertInvalid(
      validateTaskContract(
        deepFreeze({
          ...makeValidTaskContract(),
          execution: {
            ...makeValidTaskContract().execution,
            timeout_seconds: 10.5,
          },
        })
      ),
      'TaskContract',
      'type',
      'timeout_seconds'
    );

    assertInvalid(
      validateTaskContract(
        deepFreeze({
          ...makeValidTaskContract(),
          execution: {
            ...makeValidTaskContract().execution,
            retry_limit: 0.5,
          },
        })
      ),
      'TaskContract',
      'type',
      'retry_limit'
    );

    assertInvalid(
      validateTaskContract(
        deepFreeze({
          ...makeValidTaskContract(),
          identity: {
            ...makeValidTaskContract().identity,
            execution_id: '',
          },
        })
      ),
      'TaskContract',
      'minLength',
      'execution_id'
    );
  });
});

describe('2. ApprovalRecord validation (P0 §10, DEC-P1-002-03)', () => {
  it('(P1, P2, P3) accepts valid PLAN_ONLY, EXECUTION (with and without optional fields), and MERGE records', () => {
    for (const scope of ['PLAN_ONLY', 'EXECUTION'] as const) {
      const record = deepFreeze({
        ...makeValidApprovalRecord(),
        approval_scope: scope,
      });
      assertValid(validateApprovalRecord(record), 'ApprovalRecord');
    }

    const executionWithOptional = deepFreeze({
      ...makeValidApprovalRecord(),
      approval_scope: 'EXECUTION' as const,
      attempt_id: 'ATT-001',
      approved_diff_sha256: VALID_SHA256_ALT,
      review_id: 'REV-001',
    });
    assertValid(validateApprovalRecord(executionWithOptional), 'ApprovalRecord');

    const mergeRecord = deepFreeze({
      ...makeValidApprovalRecord(),
      approval_scope: 'MERGE' as const,
      attempt_id: 'ATT-001',
      approved_diff_sha256: VALID_SHA256_ALT,
      review_id: 'REV-001',
    });
    assertValid(validateApprovalRecord(mergeRecord), 'ApprovalRecord');
    assert.strictEqual(APPROVAL_SCOPES.length, 3);
  });

  it('(N1) rejects omission of any of the 10 required base fields', () => {
    const requiredBaseFields = [
      'schema_version',
      'approval_id',
      'execution_id',
      'contract_revision',
      'approved_contract_sha256',
      'canonicalization_version',
      'approval_scope',
      'authorized_by',
      'authorized_at',
      'approval_source',
    ] as const;

    for (const field of requiredBaseFields) {
      const clone = { ...makeValidApprovalRecord() } as Record<string, unknown>;
      delete clone[field];
      assertInvalid(
        validateApprovalRecord(deepFreeze(clone)),
        'ApprovalRecord',
        'required',
        field
      );
    }
  });

  it('(N2, N3, N4, N5, N6) rejects invalid versions, scopes, additionalProperties, hashes, and timestamps', () => {
    assertInvalid(
      validateApprovalRecord(
        deepFreeze({ ...makeValidApprovalRecord(), schema_version: '0.1' })
      ),
      'ApprovalRecord',
      'const',
      'schema_version'
    );

    assertInvalid(
      validateApprovalRecord(
        deepFreeze({
          ...makeValidApprovalRecord(),
          canonicalization_version: 'JSON-STRINGIFY',
        })
      ),
      'ApprovalRecord',
      'const',
      'canonicalization_version'
    );

    assertInvalid(
      validateApprovalRecord(
        deepFreeze({
          ...makeValidApprovalRecord(),
          approval_scope: 'DEPLOY',
        })
      ),
      'ApprovalRecord',
      'enum',
      'approval_scope'
    );

    assertInvalid(
      validateApprovalRecord(
        deepFreeze({
          ...makeValidApprovalRecord(),
          forged_flag: true,
        })
      ),
      'ApprovalRecord',
      'additionalProperties',
      'forged_flag'
    );

    assertInvalid(
      validateApprovalRecord(
        deepFreeze({
          ...makeValidApprovalRecord(),
          approved_contract_sha256: 'short-hash',
        })
      ),
      'ApprovalRecord',
      'pattern',
      'approved_contract_sha256'
    );

    assertInvalid(
      validateApprovalRecord(
        deepFreeze({
          ...makeValidApprovalRecord(),
          authorized_at: 'not-a-date',
        })
      ),
      'ApprovalRecord',
      'format',
      'authorized_at'
    );
  });

  it('(B1, B2, B3) enforces MERGE conditional required fields and forbids null/empty strings in all scopes', () => {
    const mergeRequiredFields = [
      'attempt_id',
      'approved_diff_sha256',
      'review_id',
    ] as const;

    for (const missingField of mergeRequiredFields) {
      const mergeClone: Record<string, unknown> = {
        ...makeValidApprovalRecord(),
        approval_scope: 'MERGE',
        attempt_id: 'ATT-001',
        approved_diff_sha256: VALID_SHA256_ALT,
        review_id: 'REV-001',
      };
      delete mergeClone[missingField];
      assertInvalid(
        validateApprovalRecord(deepFreeze(mergeClone)),
        'ApprovalRecord',
        'required',
        missingField
      );
    }

    for (const scope of APPROVAL_SCOPES) {
      for (const field of mergeRequiredFields) {
        for (const badValue of [null, '']) {
          const candidate: Record<string, unknown> = {
            ...makeValidApprovalRecord(),
            approval_scope: scope,
            attempt_id: 'ATT-001',
            approved_diff_sha256: VALID_SHA256_ALT,
            review_id: 'REV-001',
            [field]: badValue,
          };
          assertInvalid(
            validateApprovalRecord(deepFreeze(candidate)),
            'ApprovalRecord',
            ['type', 'minLength', 'pattern'],
            field
          );
        }
      }
    }

    assertInvalid(
      validateApprovalRecord(
        deepFreeze({ ...makeValidApprovalRecord(), contract_revision: 0 })
      ),
      'ApprovalRecord',
      'minimum',
      'contract_revision'
    );

    assertInvalid(
      validateApprovalRecord(
        deepFreeze({ ...makeValidApprovalRecord(), contract_revision: 1.5 })
      ),
      'ApprovalRecord',
      'type',
      'contract_revision'
    );
  });
});

describe('3. ExecutionAttempt validation (P0 §11, DEC-P1-002-04, DEC-P1-002-05)', () => {
  it('(P1, P2, P3) accepts CREATED, RUNNING with process_identity, and finished attempts with all 9 termination reasons', () => {
    assertValid(
      validateExecutionAttempt(deepFreeze(makeValidExecutionAttempt())),
      'ExecutionAttempt'
    );

    const runningMinimalProc = deepFreeze({
      ...makeValidExecutionAttempt(),
      state: 'RUNNING' as const,
      started_at: VALID_ISO_DATETIME,
      process_identity: {
        pid: 1234,
        process_start_token: 'proc-start-token-98765',
      },
    });
    assertValid(validateExecutionAttempt(runningMinimalProc), 'ExecutionAttempt');

    const runningWithExecutable = deepFreeze({
      ...makeValidExecutionAttempt(),
      state: 'RUNNING' as const,
      started_at: VALID_ISO_DATETIME,
      process_identity: {
        pid: 1234,
        process_start_token: 'proc-start-token-98765',
        executable: '/usr/bin/node',
      },
    });
    assertValid(
      validateExecutionAttempt(runningWithExecutable),
      'ExecutionAttempt'
    );

    assert.strictEqual(TERMINATION_REASONS.length, 9);
    for (const reason of TERMINATION_REASONS) {
      const finished = deepFreeze({
        ...makeValidExecutionAttempt(),
        state: 'COMPLETED' as const,
        started_at: VALID_ISO_DATETIME,
        finished_at: VALID_ISO_DATETIME,
        termination_reason: reason,
      });
      assertValid(validateExecutionAttempt(finished), 'ExecutionAttempt');
    }
    assert.strictEqual(EXECUTION_ATTEMPT_STATES.length, 6);
  });

  it('(N1) rejects omission of any of the 13 required fields', () => {
    const requiredFields = Object.keys(
      makeValidExecutionAttempt()
    ) as (keyof ExecutionAttempt)[];
    assert.strictEqual(requiredFields.length, 13);

    for (const field of requiredFields) {
      const clone = {
        ...makeValidExecutionAttempt(),
      } as Record<string, unknown>;
      delete clone[field];
      assertInvalid(
        validateExecutionAttempt(deepFreeze(clone)),
        'ExecutionAttempt',
        'required',
        field
      );
    }
  });

  it('(N2, N3, N4, N5, N6) rejects invalid states, termination_reasons, executors, additionalProperties, and dates', () => {
    for (const badState of ['in_progress', 'TASK-READY', 'DONE']) {
      assertInvalid(
        validateExecutionAttempt(
          deepFreeze({ ...makeValidExecutionAttempt(), state: badState })
        ),
        'ExecutionAttempt',
        'enum',
        'state'
      );
    }

    assertInvalid(
      validateExecutionAttempt(
        deepFreeze({
          ...makeValidExecutionAttempt(),
          finished_at: VALID_ISO_DATETIME,
          termination_reason: 'UNKNOWN_REASON',
        })
      ),
      'ExecutionAttempt',
      'enum',
      'termination_reason'
    );

    assertInvalid(
      validateExecutionAttempt(
        deepFreeze({
          ...makeValidExecutionAttempt(),
          executor: 'unknown-executor',
        })
      ),
      'ExecutionAttempt',
      'enum',
      'executor'
    );

    assertInvalid(
      validateExecutionAttempt(
        deepFreeze({
          ...makeValidExecutionAttempt(),
          extra_attempt_field: 'forbidden',
        })
      ),
      'ExecutionAttempt',
      'additionalProperties',
      'extra_attempt_field'
    );

    assertInvalid(
      validateExecutionAttempt(
        deepFreeze({
          ...makeValidExecutionAttempt(),
          process_identity: {
            pid: 100,
            process_start_token: 'tok',
            extra_proc: true,
          },
        })
      ),
      'ExecutionAttempt',
      'additionalProperties',
      'extra_proc'
    );

    assertInvalid(
      validateExecutionAttempt(
        deepFreeze({
          ...makeValidExecutionAttempt(),
          started_at: 'invalid-date',
        })
      ),
      'ExecutionAttempt',
      'format',
      'started_at'
    );

    assertInvalid(
      validateExecutionAttempt(
        deepFreeze({
          ...makeValidExecutionAttempt(),
          finished_at: 'invalid-date',
          termination_reason: 'NORMAL',
        })
      ),
      'ExecutionAttempt',
      'format',
      'finished_at'
    );
  });

  it('(B1, B2) enforces unidirectional finished_at -> termination_reason rule and strict process_identity constraints', () => {
    assertInvalid(
      validateExecutionAttempt(
        deepFreeze({
          ...makeValidExecutionAttempt(),
          finished_at: VALID_ISO_DATETIME,
          termination_reason: null,
        })
      ),
      'ExecutionAttempt',
      ['type', 'enum'],
      'termination_reason'
    );

    // DEC-P1-002-05: inverse is NOT imposed in JSON Schema (full operational consistency belongs to P1-004)
    const unidirectionalCheck = deepFreeze({
      ...makeValidExecutionAttempt(),
      finished_at: null,
      termination_reason: 'INTERRUPTED' as const,
    });
    assertValid(validateExecutionAttempt(unidirectionalCheck), 'ExecutionAttempt');

    const invalidProcessIdentities: unknown[] = [
      {},
      { pid: 1234 },
      { process_start_token: 'tok-1' },
      { pid: 0, process_start_token: 'tok-1' },
      { pid: -1, process_start_token: 'tok-1' },
      { pid: 1.5, process_start_token: 'tok-1' },
      { pid: 1234, process_start_token: '' },
      { pid: 1234, process_start_token: 'tok-1', executable: '' },
      { pid: 1234, process_start_token: 'tok-1', executable: null },
    ];

    for (const badProc of invalidProcessIdentities) {
      assertInvalid(
        validateExecutionAttempt(
          deepFreeze({
            ...makeValidExecutionAttempt(),
            process_identity: badProc,
          })
        ),
        'ExecutionAttempt',
        ['required', 'minimum', 'type', 'minLength']
      );
    }
  });
});

describe('4. ExecutionResult validation (P0 §12, DEC-P1-002-01)', () => {
  it('(P1, P2) accepts valid ExecutionResult with empty or populated blockers and non-empty outcome strings', () => {
    assertValid(
      validateExecutionResult(deepFreeze(makeValidExecutionResult())),
      'ExecutionResult'
    );

    const withBlockers = deepFreeze({
      ...makeValidExecutionResult(),
      executor: 'codex' as const,
      agent_declared_outcome: 'blocked_by_scope',
      agent_reported_blockers: ['Necessita permissão adicional'],
    });
    assertValid(validateExecutionResult(withBlockers), 'ExecutionResult');
  });

  it('(N1, N2, N3, N4, B1, B2) rejects missing fields, injected properties, empty strings, and nulls', () => {
    const requiredFields = Object.keys(
      makeValidExecutionResult()
    ) as (keyof ExecutionResult)[];
    assert.strictEqual(requiredFields.length, 7);

    for (const field of requiredFields) {
      const clone = {
        ...makeValidExecutionResult(),
      } as Record<string, unknown>;
      delete clone[field];
      assertInvalid(
        validateExecutionResult(deepFreeze(clone)),
        'ExecutionResult',
        'required',
        field
      );
    }

    assertInvalid(
      validateExecutionResult(
        deepFreeze({
          ...makeValidExecutionResult(),
          verified: true,
        })
      ),
      'ExecutionResult',
      'additionalProperties',
      'verified'
    );

    assertInvalid(
      validateExecutionResult(
        deepFreeze({
          ...makeValidExecutionResult(),
          agent_reported_blockers: [''],
        })
      ),
      'ExecutionResult',
      'minLength',
      'agent_reported_blockers'
    );

    assertInvalid(
      validateExecutionResult(
        deepFreeze({
          ...makeValidExecutionResult(),
          agent_reported_blockers: [null],
        })
      ),
      'ExecutionResult',
      'type',
      'agent_reported_blockers'
    );

    for (const strField of [
      'execution_id',
      'attempt_id',
      'agent_declared_outcome',
      'agent_summary',
    ] as const) {
      assertInvalid(
        validateExecutionResult(
          deepFreeze({
            ...makeValidExecutionResult(),
            [strField]: '',
          })
        ),
        'ExecutionResult',
        'minLength',
        strField
      );
    }

    for (const field of requiredFields) {
      assertInvalid(
        validateExecutionResult(
          deepFreeze({
            ...makeValidExecutionResult(),
            [field]: null,
          })
        ),
        'ExecutionResult',
        ['type', 'const', 'enum'],
        field
      );
    }
  });
});

describe('5. EvidenceManifest validation (P0 §13, DEC-P1-002-06)', () => {
  it('(P1, P2) accepts initial manifest and complete manifest with TestRunRecords and artifact_hashes', () => {
    assertValid(
      validateEvidenceManifest(deepFreeze(makeValidEvidenceManifest())),
      'EvidenceManifest'
    );

    const completeManifest: EvidenceManifest = deepFreeze({
      ...makeValidEvidenceManifest(),
      git: {
        base_sha: VALID_SHA1,
        head_sha: VALID_SHA1_ALT,
        dirty_worktree_files: ['src/contracts/validator.ts'],
        diff_sha256: VALID_SHA256,
      },
      test_evidence: {
        strategy: 'RED_GREEN',
        red: {
          ...makeValidTestRunRecord(),
          exit_code: 1,
          observed_outcome: 'FAIL',
        },
        green: makeValidTestRunRecord(),
        baseline: {
          ...makeValidTestRunRecord(),
          exit_code: null,
          observed_outcome: 'TIMEOUT',
        },
      },
      independent_test_runs: [
        makeValidTestRunRecord(),
        {
          ...makeValidTestRunRecord(),
          exit_code: 2,
          observed_outcome: 'ERROR',
        },
      ],
      scope_validation: {
        result: 'PASS',
        unexpected_files: [],
      },
      evidence_integrity: {
        artifact_hashes: [
          {
            path: 'runs/LAB-EX-P1-002/attempts/ATT-001/attempt.json',
            sha256: VALID_SHA256,
          },
        ],
      },
    });
    assertValid(validateEvidenceManifest(completeManifest), 'EvidenceManifest');
    assert.strictEqual(OBSERVED_TEST_OUTCOMES.length, 4);
    assert.strictEqual(SCOPE_VALIDATION_RESULTS.length, 3);
  });

  it('(N1, N2, N3, N4) rejects missing fields, non-HOST_OBSERVED origin, additionalProperties, and invalid enums', () => {
    const topFields = Object.keys(
      makeValidEvidenceManifest()
    ) as (keyof EvidenceManifest)[];
    assert.strictEqual(topFields.length, 9);

    for (const field of topFields) {
      const clone = {
        ...makeValidEvidenceManifest(),
      } as Record<string, unknown>;
      delete clone[field];
      assertInvalid(
        validateEvidenceManifest(deepFreeze(clone)),
        'EvidenceManifest',
        'required',
        field
      );
    }

    assertInvalid(
      validateEvidenceManifest(
        deepFreeze({
          ...makeValidEvidenceManifest(),
          evidence_origin: 'UNTRUSTED_AGENT_OUTPUT',
        })
      ),
      'EvidenceManifest',
      'const',
      'evidence_origin'
    );

    assertInvalid(
      validateEvidenceManifest(
        deepFreeze({
          ...makeValidEvidenceManifest(),
          test_evidence: {
            ...makeValidEvidenceManifest().test_evidence,
            red: {
              ...makeValidTestRunRecord(),
              extra_run_prop: true,
            },
          },
        })
      ),
      'EvidenceManifest',
      'additionalProperties',
      'extra_run_prop'
    );

    assertInvalid(
      validateEvidenceManifest(
        deepFreeze({
          ...makeValidEvidenceManifest(),
          scope_validation: {
            result: 'UNKNOWN',
            unexpected_files: [],
          },
        })
      ),
      'EvidenceManifest',
      'enum',
      'result'
    );
  });

  it('(B1, B2, B3) rejects malformed TestRunRecord, invalid artifact_hashes items, and empty strings in file lists', () => {
    const testRunKeys = Object.keys(
      makeValidTestRunRecord()
    ) as (keyof TestRunRecord)[];
    assert.strictEqual(testRunKeys.length, 8);

    for (const key of testRunKeys) {
      const runClone = { ...makeValidTestRunRecord() } as Record<string, unknown>;
      delete runClone[key];
      assertInvalid(
        validateEvidenceManifest(
          deepFreeze({
            ...makeValidEvidenceManifest(),
            independent_test_runs: [runClone],
          })
        ),
        'EvidenceManifest',
        'required',
        key
      );
    }

    for (const badRun of [
      { ...makeValidTestRunRecord(), duration_ms: -1 },
      { ...makeValidTestRunRecord(), duration_ms: 1.5 },
      { ...makeValidTestRunRecord(), exit_code: 1.5 },
      { ...makeValidTestRunRecord(), exit_code: '0' },
      { ...makeValidTestRunRecord(), log_sha256: 'bad-sha' },
      { ...makeValidTestRunRecord(), started_at: 'bad-date' },
    ]) {
      assertInvalid(
        validateEvidenceManifest(
          deepFreeze({
            ...makeValidEvidenceManifest(),
            independent_test_runs: [badRun],
          })
        ),
        'EvidenceManifest',
        ['minimum', 'type', 'pattern', 'format']
      );
    }

    for (const badArtifact of [
      { sha256: VALID_SHA256 },
      { path: '', sha256: VALID_SHA256 },
      { path: 'a.json', sha256: 'invalid-hash' },
      { path: 'a.json', sha256: VALID_SHA256, extra: 1 },
    ]) {
      assertInvalid(
        validateEvidenceManifest(
          deepFreeze({
            ...makeValidEvidenceManifest(),
            evidence_integrity: {
              artifact_hashes: [badArtifact],
            },
          })
        ),
        'EvidenceManifest',
        ['required', 'minLength', 'pattern', 'additionalProperties']
      );
    }

    assertInvalid(
      validateEvidenceManifest(
        deepFreeze({
          ...makeValidEvidenceManifest(),
          git: {
            ...makeValidEvidenceManifest().git,
            dirty_worktree_files: [''],
          },
        })
      ),
      'EvidenceManifest',
      'minLength',
      'dirty_worktree_files'
    );

    assertInvalid(
      validateEvidenceManifest(
        deepFreeze({
          ...makeValidEvidenceManifest(),
          scope_validation: {
            result: 'FAIL',
            unexpected_files: [''],
          },
        })
      ),
      'EvidenceManifest',
      'minLength',
      'unexpected_files'
    );
  });
});

describe('6. ReviewHandoffPackage validation (P0 §15, DEC-P1-002-07, DEC-P1-002-08)', () => {
  it('(P1, P2) accepts initial and populated ReviewHandoffPackage across all data classifications and sanitization statuses', () => {
    assertValid(
      validateReviewHandoffPackage(deepFreeze(makeValidReviewHandoffPackage())),
      'ReviewHandoffPackage'
    );

    for (const data_classification of DATA_CLASSIFICATIONS) {
      for (const sanitization_status of SANITIZATION_STATUSES) {
        const pkg = deepFreeze({
          ...makeValidReviewHandoffPackage(),
          data_classification,
          sanitization_status,
          included_artifacts: [
            {
              path: 'runs/LAB-EX-P1-002/attempts/ATT-001/evidence-manifest.json',
              sha256: VALID_SHA256,
            },
          ],
          export_authorization_ref: 'AUTH-EXP-001',
        });
        assertValid(validateReviewHandoffPackage(pkg), 'ReviewHandoffPackage');
      }
    }
  });

  it('(N1, N2, N3, N4, N5, B1, B2) rejects missing fields, invalid enums, invalid included_artifacts, and empty/null violations', () => {
    const requiredFields = Object.keys(
      makeValidReviewHandoffPackage()
    ) as (keyof ReviewHandoffPackage)[];
    assert.strictEqual(requiredFields.length, 13);

    for (const field of requiredFields) {
      const clone = {
        ...makeValidReviewHandoffPackage(),
      } as Record<string, unknown>;
      delete clone[field];
      assertInvalid(
        validateReviewHandoffPackage(deepFreeze(clone)),
        'ReviewHandoffPackage',
        'required',
        field
      );
    }

    assertInvalid(
      validateReviewHandoffPackage(
        deepFreeze({
          ...makeValidReviewHandoffPackage(),
          data_classification: 'PUBLIC',
        })
      ),
      'ReviewHandoffPackage',
      'enum',
      'data_classification'
    );

    assertInvalid(
      validateReviewHandoffPackage(
        deepFreeze({
          ...makeValidReviewHandoffPackage(),
          sanitization_status: 'CLEAN',
        })
      ),
      'ReviewHandoffPackage',
      'enum',
      'sanitization_status'
    );

    for (const badArtifactItem of [
      'file.ts',
      { path: 'file.ts' },
      { sha256: VALID_SHA256 },
      { path: '', sha256: VALID_SHA256 },
      { path: 'file.ts', sha256: 'not-64-hex' },
      { path: 'file.ts', sha256: VALID_SHA256, extra: true },
    ]) {
      assertInvalid(
        validateReviewHandoffPackage(
          deepFreeze({
            ...makeValidReviewHandoffPackage(),
            included_artifacts: [badArtifactItem],
          })
        ),
        'ReviewHandoffPackage',
        ['type', 'required', 'minLength', 'pattern', 'additionalProperties']
      );
    }

    assertInvalid(
      validateReviewHandoffPackage(
        deepFreeze({
          ...makeValidReviewHandoffPackage(),
          export_authorization_ref: '',
        })
      ),
      'ReviewHandoffPackage',
      'minLength',
      'export_authorization_ref'
    );
  });
});

describe('7. ReviewReport validation (P0 §16, DEC-P1-002-09)', () => {
  it('(P1, P2, P3) accepts valid reports with/without findings, all 12 categories, all 4 severities, all 3 verdicts, and applicable: false with justification', () => {
    assertValid(
      validateReviewReport(deepFreeze(makeValidReviewReport())),
      'ReviewReport'
    );

    assert.strictEqual(REVIEW_CATEGORIES.length, 12);
    assert.strictEqual(REVIEW_VERDICTS.length, 3);

    for (const verdict of REVIEW_VERDICTS) {
      for (const severity of RISK_LEVELS) {
        const fullReport: ReviewReport = deepFreeze({
          ...makeValidReviewReport(),
          categories_evaluated: REVIEW_CATEGORIES.map((category, idx) =>
            idx % 2 === 0
              ? { category, applicable: true }
              : {
                  category,
                  applicable: false,
                  justification:
                    'Categoria não aplicável à validação estática de schemas na P1-002.',
                }
          ),
          findings: [
            {
              finding_id: 'P1-002-REV-001',
              severity,
              category: REVIEW_CATEGORIES[0],
              evidence: 'Inspeção direta de schemas/task-contract.schema.json',
              source_reference: 'P0 §9.3',
              recommendation: 'Manter os 18 campos obrigatórios.',
              blocking: severity === 'HIGH' || severity === 'CRITICAL',
            },
          ],
          verdict,
          limitations: ['Sem execução de processo real na P1-002'],
        });
        assertValid(validateReviewReport(fullReport), 'ReviewReport');
      }
    }
  });

  it('(N1, N2, N3, N4, N5, N6) rejects missing top/finding fields, invalid verdicts/severities/categories, and additionalProperties', () => {
    const topFields = Object.keys(
      makeValidReviewReport()
    ) as (keyof ReviewReport)[];
    assert.strictEqual(topFields.length, 12);

    for (const field of topFields) {
      const clone = { ...makeValidReviewReport() } as Record<string, unknown>;
      delete clone[field];
      assertInvalid(
        validateReviewReport(deepFreeze(clone)),
        'ReviewReport',
        'required',
        field
      );
    }

    const baseFinding = {
      finding_id: 'F-001',
      severity: 'HIGH',
      category: 'Segurança',
      evidence: 'Evidência observada',
      source_reference: 'P0 §6.3',
      recommendation: 'Corrigir permissão',
      blocking: true,
    };
    const findingKeys = Object.keys(baseFinding);
    assert.strictEqual(findingKeys.length, 7);

    for (const fKey of findingKeys) {
      const fClone = { ...baseFinding } as Record<string, unknown>;
      delete fClone[fKey];
      assertInvalid(
        validateReviewReport(
          deepFreeze({
            ...makeValidReviewReport(),
            findings: [fClone],
          })
        ),
        'ReviewReport',
        'required',
        fKey
      );
    }

    assertInvalid(
      validateReviewReport(
        deepFreeze({
          ...makeValidReviewReport(),
          verdict: 'CONDITIONAL',
        })
      ),
      'ReviewReport',
      'enum',
      'verdict'
    );

    assertInvalid(
      validateReviewReport(
        deepFreeze({
          ...makeValidReviewReport(),
          findings: [{ ...baseFinding, severity: 'INFO' }],
        })
      ),
      'ReviewReport',
      'enum',
      'severity'
    );

    assertInvalid(
      validateReviewReport(
        deepFreeze({
          ...makeValidReviewReport(),
          categories_evaluated: [{ category: 'Performance', applicable: true }],
        })
      ),
      'ReviewReport',
      'enum',
      'category'
    );

    assertInvalid(
      validateReviewReport(
        deepFreeze({
          ...makeValidReviewReport(),
          findings: [{ ...baseFinding, category: 'Performance' }],
        })
      ),
      'ReviewReport',
      'enum',
      'category'
    );

    assertInvalid(
      validateReviewReport(
        deepFreeze({
          ...makeValidReviewReport(),
          findings: [{ ...baseFinding, extra_finding_field: 1 }],
        })
      ),
      'ReviewReport',
      'additionalProperties',
      'extra_finding_field'
    );
  });

  it('(B1, B2, B3) enforces conditional justification when applicable === false and rejects string categories or coerced booleans', () => {
    for (const badCatItem of [
      { category: 'Concorrência', applicable: false },
      { category: 'Concorrência', applicable: false, justification: '' },
      { category: 'Concorrência', applicable: false, justification: null },
      { category: 'Concorrência', applicable: true, justification: '' },
      { category: 'Concorrência', applicable: true, justification: null },
      'Requisitos',
      { category: 'Requisitos', applicable: 'true' },
    ]) {
      assertInvalid(
        validateReviewReport(
          deepFreeze({
            ...makeValidReviewReport(),
            categories_evaluated: [badCatItem],
          })
        ),
        'ReviewReport',
        ['required', 'minLength', 'type']
      );
    }

    assertInvalid(
      validateReviewReport(
        deepFreeze({
          ...makeValidReviewReport(),
          findings: [
            {
              finding_id: 'F-001',
              severity: 'LOW',
              category: 'Escopo',
              evidence: 'Evidência',
              source_reference: 'P0 §9.4',
              recommendation: 'Recomendação',
              blocking: 'false',
            },
          ],
        })
      ),
      'ReviewReport',
      'type',
      'blocking'
    );
  });
});
