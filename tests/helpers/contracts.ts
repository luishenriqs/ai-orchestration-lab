import type { TaskContract, ApprovalRecord } from '../../src/contracts/types.js';
export function task(workspace = '/synthetic/workspace', base = 'a'.repeat(40)): TaskContract {
  return { schema_version: '0.3-p0', contract_revision: 1,
    identity: { execution_id: 'LAB-P1', backlog_id: 'P1', repository: 'synthetic-fixture', workspace_context_id: 'SYNTHETIC_LAB', workspace_root: workspace, base_commit: base },
    governance: { risk_level: 'LOW', approval_required: true },
    scope: { objective: 'Synthetic sum returns 3', allowed_impl_paths: ['src/sum.cjs'], allowed_test_paths: ['tests/sum.cjs'], forbidden_changes: ['protected.txt'], protected_existing_tests: true },
    validation: { strategy: 'RED_GREEN', positive_tests: ['sum(1,2)=3'], negative_tests: ['wrong sum rejected'], boundary_tests: ['zero'], acceptance_checks: ['host RED and GREEN'], validation_commands: ['node tests/sum.cjs'] },
    execution: { selected_executor: 'synthetic', mode: 'CONTROLLED', timeout_seconds: 10, retry_limit: 0 }, rollback: { procedure: 'Restore registered synthetic fixture after preserving evidence' }, ias_normative_card: null };
}
export function approval(hash: string, extra: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return { schema_version: '0.3-p0', approval_id: 'SYN-APPROVAL', execution_id: 'LAB-P1', contract_revision: 1,
    approved_contract_sha256: hash, canonicalization_version: 'JCS-RFC8785-v1', approval_scope: 'EXECUTION', authorized_by: 'SYNTHETIC_OWNER', authorized_at: '2026-11-06T12:00:00Z', approval_source: 'SYNTHETIC_LAB_ONLY', ...extra };
}
