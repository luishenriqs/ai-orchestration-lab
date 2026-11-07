import { canonicalHash } from '../contracts/integrity.js';
import { validateTaskContract, validateApprovalRecord } from '../contracts/validator.js';
import type { ApprovalRecord, ApprovalScope } from '../contracts/types.js';
export interface TrustedApproval {
    readonly record_sha256: string;
    readonly authorized_by: string;
    readonly approval_source: string;
    readonly revoked: boolean;
}
export interface ApprovalContext {
    readonly scope: ApprovalScope;
    readonly trusted: readonly TrustedApproval[];
    readonly attempt_id?: string;
    readonly diff_sha256?: string;
    readonly review_id?: string;
}
export interface Decision {
    readonly allowed: boolean;
    readonly reasons: readonly string[];
}
export function verifyApproval(contract: unknown, approval: unknown, context: ApprovalContext): Decision {
    const c = validateTaskContract(contract);
    const a = validateApprovalRecord(approval);
    if (!c.valid || !a.valid)
        return { allowed: false, reasons: [!c.valid ? 'INVALID_CONTRACT' : 'INVALID_APPROVAL'] };
    const task = c.value, record = a.value;
    const reasons: string[] = [];
    try {
        const trust = context.trusted.find(t => t.record_sha256 === canonicalHash(record) && t.authorized_by === record.authorized_by && t.approval_source === record.approval_source && !t.revoked);
        if (!trust)
            reasons.push('UNTRUSTED_APPROVAL');
        if (record.execution_id !== task.identity.execution_id)
            reasons.push('EXECUTION_MISMATCH');
        if (record.contract_revision !== task.contract_revision)
            reasons.push('REVISION_MISMATCH');
        if (record.approved_contract_sha256 !== canonicalHash(task))
            reasons.push('CONTRACT_HASH_MISMATCH');
        if (record.approval_scope !== context.scope)
            reasons.push('APPROVAL_SCOPE_MISMATCH');
        if (context.scope === 'MERGE') {
            if (!context.attempt_id || record.attempt_id !== context.attempt_id)
                reasons.push('MERGE_ATTEMPT_MISMATCH');
            if (!context.diff_sha256 || record.approved_diff_sha256 !== context.diff_sha256)
                reasons.push('MERGE_DIFF_MISMATCH');
            if (!context.review_id || record.review_id !== context.review_id)
                reasons.push('MERGE_REVIEW_MISMATCH');
        }
    }
    catch {
        reasons.push('NON_CANONICAL_INPUT');
    }
    return Object.freeze({ allowed: reasons.length === 0, reasons: Object.freeze(reasons) });
}
/** Host-only enrollment. Never call with agent-provided records to establish human trust. */
export function trustApproval(record: ApprovalRecord): TrustedApproval {
    return Object.freeze({ record_sha256: canonicalHash(record), authorized_by: record.authorized_by, approval_source: record.approval_source, revoked: false });
}
