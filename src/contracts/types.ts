export const CONTRACT_TYPES = Object.freeze([
  'TaskContract',
  'ApprovalRecord',
  'ExecutionAttempt',
  'ExecutionResult',
  'EvidenceManifest',
  'ReviewHandoffPackage',
  'ReviewReport',
] as const);

export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_SCHEMA_FILES: Readonly<Record<ContractType, string>> = Object.freeze({
  TaskContract: 'task-contract.schema.json',
  ApprovalRecord: 'approval-record.schema.json',
  ExecutionAttempt: 'execution-attempt.schema.json',
  ExecutionResult: 'execution-result.schema.json',
  EvidenceManifest: 'evidence-manifest.schema.json',
  ReviewHandoffPackage: 'review-handoff-package.schema.json',
  ReviewReport: 'review-report.schema.json',
});

export const RISK_LEVELS = Object.freeze([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const);
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const VALIDATION_STRATEGIES = Object.freeze([
  'RED_GREEN',
  'RED_GREEN_WHEN_APPLICABLE',
  'REGRESSION_BASELINE',
  'STRUCTURAL_VALIDATION',
  'CONFIGURATION_VALIDATION',
] as const);
export type ValidationStrategy = (typeof VALIDATION_STRATEGIES)[number];

export const EXECUTOR_TYPES = Object.freeze([
  'codex',
  'antigravity',
  'synthetic',
] as const);
export type ExecutorType = (typeof EXECUTOR_TYPES)[number];

export const EXECUTION_MODES = Object.freeze(['CONTROLLED'] as const);
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const IAS_NORMATIVE_STATUSES = Object.freeze([
  'planned',
  'in_progress',
  'implemented',
  'validated',
  'done',
  'blocked',
] as const);
export type IasNormativeStatus = (typeof IAS_NORMATIVE_STATUSES)[number];

export const APPROVAL_SCOPES = Object.freeze([
  'PLAN_ONLY',
  'EXECUTION',
  'MERGE',
] as const);
export type ApprovalScope = (typeof APPROVAL_SCOPES)[number];

export const CANONICALIZATION_VERSION = 'JCS-RFC8785-v1' as const;

export const EXECUTION_ATTEMPT_STATES = Object.freeze([
  'CREATED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'INTERRUPTED',
  'BLOCKED',
] as const);
export type ExecutionAttemptState = (typeof EXECUTION_ATTEMPT_STATES)[number];

export const TERMINATION_REASONS = Object.freeze([
  'NORMAL',
  'TIMEOUT',
  'AUTH_FAILURE',
  'QUOTA_EXCEEDED',
  'PROVIDER_FAILURE',
  'SCOPE_VIOLATION',
  'PROCESS_FAILURE',
  'INTERRUPTED',
  'COLLECTION_FAILURE',
] as const);
export type TerminationReason = (typeof TERMINATION_REASONS)[number];

export const EVIDENCE_ORIGINS = Object.freeze(['HOST_OBSERVED'] as const);
export type EvidenceOrigin = (typeof EVIDENCE_ORIGINS)[number];

export const OBSERVED_TEST_OUTCOMES = Object.freeze([
  'PASS',
  'FAIL',
  'ERROR',
  'TIMEOUT',
] as const);
export type ObservedTestOutcome = (typeof OBSERVED_TEST_OUTCOMES)[number];

export const SCOPE_VALIDATION_RESULTS = Object.freeze([
  'PENDING',
  'PASS',
  'FAIL',
] as const);
export type ScopeValidationResult = (typeof SCOPE_VALIDATION_RESULTS)[number];

export const DATA_CLASSIFICATIONS = Object.freeze([
  'SYNTHETIC_LAB',
  'INTERNAL_NON_SENSITIVE',
  'CLIENT_CONFIDENTIAL',
] as const);
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

export const SANITIZATION_STATUSES = Object.freeze([
  'PENDING',
  'APPROVED',
  'BLOCKED',
] as const);
export type SanitizationStatus = (typeof SANITIZATION_STATUSES)[number];

export const REVIEW_CATEGORIES = Object.freeze([
  'Requisitos',
  'Comportamento',
  'Segurança',
  'Confidencialidade',
  'Concorrência',
  'Integridade',
  'Testes positivos',
  'Testes negativos',
  'Casos de borda',
  'Escopo',
  'Rollback',
  'Compatibilidade normativa',
] as const);
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export const REVIEW_VERDICTS = Object.freeze([
  'APPROVED',
  'APPROVED_WITH_RECOMMENDATIONS',
  'REJECTED',
] as const);
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export interface IasTestPlan {
  readonly positive: readonly string[];
  readonly negative: readonly string[];
  readonly concurrency: readonly string[];
  readonly integration: readonly string[];
}

export interface IasNormativeCard {
  readonly execution_id: string;
  readonly backlog_id: string;
  readonly status: IasNormativeStatus;
  readonly objective: string;
  readonly source_sections: readonly string[];
  readonly predecessors: readonly string[];
  readonly files_or_packages_expected: readonly string[];
  readonly invariants: readonly string[];
  readonly api_contracts: readonly string[];
  readonly database_tables_and_locks: readonly string[];
  readonly security_controls: readonly string[];
  readonly audit_and_observability: readonly string[];
  readonly test_plan: IasTestPlan;
  readonly evidence_expected: readonly string[];
  readonly rollback_plan: string;
  readonly acceptance_checks: readonly string[];
  readonly review_required: boolean;
  readonly human_authorization: string;
}

export interface TaskContract {
  readonly schema_version: '0.3-p0';
  readonly contract_revision: number;
  readonly identity: {
    readonly execution_id: string;
    readonly backlog_id: string;
    readonly repository: string;
    readonly workspace_context_id: string;
    readonly workspace_root: string;
    readonly base_commit: string;
  };
  readonly governance: {
    readonly risk_level: RiskLevel;
    readonly approval_required: boolean;
  };
  readonly scope: {
    readonly objective: string;
    readonly allowed_impl_paths: readonly string[];
    readonly allowed_test_paths: readonly string[];
    readonly forbidden_changes: readonly string[];
    readonly protected_existing_tests: boolean;
  };
  readonly validation: {
    readonly strategy: ValidationStrategy;
    readonly positive_tests: readonly string[];
    readonly negative_tests: readonly string[];
    readonly boundary_tests: readonly string[];
    readonly acceptance_checks: readonly string[];
    readonly validation_commands: readonly string[];
  };
  readonly execution: {
    readonly selected_executor: ExecutorType;
    readonly mode: ExecutionMode;
    readonly timeout_seconds: number;
    readonly retry_limit: number;
  };
  readonly rollback: {
    readonly procedure: string;
  };
  readonly ias_normative_card: IasNormativeCard | null;
}

export interface ApprovalRecord {
  readonly schema_version: '0.3-p0';
  readonly approval_id: string;
  readonly execution_id: string;
  readonly contract_revision: number;
  readonly approved_contract_sha256: string;
  readonly canonicalization_version: typeof CANONICALIZATION_VERSION;
  readonly approval_scope: ApprovalScope;
  readonly authorized_by: string;
  readonly authorized_at: string;
  readonly approval_source: string;
  readonly attempt_id?: string;
  readonly approved_diff_sha256?: string;
  readonly review_id?: string;
}

export interface ProcessIdentity {
  readonly pid: number;
  readonly process_start_token: string;
  readonly executable?: string;
}

export interface ExecutionAttempt {
  readonly schema_version: '0.3-p0';
  readonly execution_id: string;
  readonly attempt_id: string;
  readonly approval_id: string;
  readonly approved_contract_sha256: string;
  readonly executor: ExecutorType;
  readonly state: ExecutionAttemptState;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly base_commit: string;
  readonly workspace_root: string;
  readonly process_identity: ProcessIdentity | null;
  readonly termination_reason: TerminationReason | null;
}

export interface ExecutionResult {
  readonly schema_version: '0.3-p0';
  readonly execution_id: string;
  readonly attempt_id: string;
  readonly executor: ExecutorType;
  readonly agent_declared_outcome: string;
  readonly agent_summary: string;
  readonly agent_reported_blockers: readonly string[];
}

export interface TestRunRecord {
  readonly command: string;
  readonly working_directory: string;
  readonly started_at: string;
  readonly duration_ms: number;
  readonly exit_code: number | null;
  readonly log_path: string;
  readonly log_sha256: string;
  readonly observed_outcome: ObservedTestOutcome;
}

export interface ArtifactHashEntry {
  readonly path: string;
  readonly sha256: string;
}

export interface EvidenceManifest {
  readonly schema_version: '0.3-p0';
  readonly execution_id: string;
  readonly attempt_id: string;
  readonly evidence_origin: EvidenceOrigin;
  readonly git: {
    readonly base_sha: string;
    readonly head_sha: string;
    readonly dirty_worktree_files: readonly string[];
    readonly diff_sha256: string;
  };
  readonly test_evidence: {
    readonly strategy: ValidationStrategy;
    readonly red: TestRunRecord | null;
    readonly green: TestRunRecord | null;
    readonly baseline: TestRunRecord | null;
  };
  readonly independent_test_runs: readonly TestRunRecord[];
  readonly scope_validation: {
    readonly result: ScopeValidationResult;
    readonly unexpected_files: readonly string[];
  };
  readonly evidence_integrity: {
    readonly artifact_hashes: readonly ArtifactHashEntry[];
  };
}

export interface ReviewHandoffPackage {
  readonly schema_version: '0.3-p0';
  readonly handoff_id: string;
  readonly execution_id: string;
  readonly attempt_id: string;
  readonly contract_sha256: string;
  readonly diff_sha256: string;
  readonly workspace_context_id: string;
  readonly data_classification: DataClassification;
  readonly evidence_manifest_path: string;
  readonly included_artifacts: readonly ArtifactHashEntry[];
  readonly review_questions: readonly string[];
  readonly sanitization_status: SanitizationStatus;
  readonly export_authorization_ref: string | null;
}

export interface CategoryEvaluation {
  readonly category: ReviewCategory;
  readonly applicable: boolean;
  readonly justification?: string;
}

export interface ReviewFinding {
  readonly finding_id: string;
  readonly severity: RiskLevel;
  readonly category: ReviewCategory;
  readonly evidence: string;
  readonly source_reference: string;
  readonly recommendation: string;
  readonly blocking: boolean;
}

export interface ReviewReport {
  readonly schema_version: '0.3-p0';
  readonly review_id: string;
  readonly execution_id: string;
  readonly attempt_id: string;
  readonly reviewed_contract_sha256: string;
  readonly reviewed_diff_sha256: string;
  readonly reviewer_model: string;
  readonly review_timestamp: string;
  readonly categories_evaluated: readonly CategoryEvaluation[];
  readonly findings: readonly ReviewFinding[];
  readonly verdict: ReviewVerdict;
  readonly limitations: readonly string[];
}

export interface ContractValidationDiagnostic {
  readonly contractType: ContractType;
  readonly instancePath: string;
  readonly schemaPath: string;
  readonly keyword: string;
  readonly message: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export type ContractValidationResult<T = unknown> =
  | {
      readonly valid: true;
      readonly contractType: ContractType;
      readonly schemaVersion: '0.3-p0';
      readonly value: T;
      readonly errors: readonly [];
    }
  | {
      readonly valid: false;
      readonly contractType: ContractType;
      readonly errors: readonly ContractValidationDiagnostic[];
    };
