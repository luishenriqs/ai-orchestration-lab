import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import addFormatsPlugin from 'ajv-formats';
import { loadAllContractSchemas } from './schema-loader.js';
import {
  CONTRACT_TYPES,
  type ApprovalRecord,
  type ContractType,
  type ContractValidationDiagnostic,
  type ContractValidationResult,
  type EvidenceManifest,
  type ExecutionAttempt,
  type ExecutionResult,
  type ReviewHandoffPackage,
  type ReviewReport,
  type TaskContract,
} from './types.js';

export interface ContractValidatorOptions {
  readonly schemasDir?: string;
}

export interface ContractValidator {
  validate<T = unknown>(
    contractType: ContractType,
    input: unknown
  ): ContractValidationResult<T>;
  parseAndValidate<T = unknown>(
    contractType: ContractType,
    rawJson: string
  ): ContractValidationResult<T>;
}

const KNOWN_CONTRACT_TYPE_SET: ReadonlySet<string> = new Set<string>(
  CONTRACT_TYPES
);

function isKnownContractType(value: unknown): value is ContractType {
  return typeof value === 'string' && KNOWN_CONTRACT_TYPE_SET.has(value);
}

function mapAjvErrors(
  contractType: ContractType,
  errors: readonly ErrorObject[] | null | undefined
): readonly ContractValidationDiagnostic[] {
  if (!errors || errors.length === 0) {
    return Object.freeze([
      Object.freeze({
        contractType,
        instancePath: '',
        schemaPath: '',
        keyword: 'validation-failed',
        message: `Validation failed for contract "${contractType}".`,
        params: Object.freeze({}),
      }),
    ]);
  }

  return Object.freeze(
    errors.map((err) =>
      Object.freeze({
        contractType,
        instancePath: err.instancePath ?? '',
        schemaPath: err.schemaPath ?? '',
        keyword: err.keyword,
        message: err.message ?? 'Schema validation error',
        params: Object.freeze({
          ...(err.params as Record<string, unknown>),
        }),
      })
    )
  );
}

export function createContractValidator(
  options?: ContractValidatorOptions
): ContractValidator {
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
    allowUnionTypes: true,
  });

  const addFormats = addFormatsPlugin.default ?? addFormatsPlugin;
  addFormats(ajv);

  const schemas = loadAllContractSchemas(options?.schemasDir);
  const compiledValidators = {} as Record<ContractType, ValidateFunction>;

  for (const contractType of CONTRACT_TYPES) {
    const schema = schemas[contractType];
    compiledValidators[contractType] = ajv.compile(schema);
  }

  function validate<T = unknown>(
    contractType: ContractType,
    input: unknown
  ): ContractValidationResult<T> {
    if (!isKnownContractType(contractType)) {
      const unknownType = contractType as ContractType;
      return Object.freeze({
        valid: false,
        contractType: unknownType,
        errors: Object.freeze([
          Object.freeze({
            contractType: unknownType,
            instancePath: '',
            schemaPath: '',
            keyword: 'unknown-contract-type',
            message: `Unknown contract type: "${String(contractType)}".`,
            params: Object.freeze({ contractType: String(contractType) }),
          }),
        ]),
      });
    }

    const validateFn = compiledValidators[contractType];
    const isValid = validateFn(input);

    if (isValid) {
      return Object.freeze({
        valid: true,
        contractType,
        schemaVersion: '0.3-p0' as const,
        value: input as T,
        errors: Object.freeze([] as const),
      });
    }

    return Object.freeze({
      valid: false,
      contractType,
      errors: mapAjvErrors(contractType, validateFn.errors),
    });
  }

  function parseAndValidate<T = unknown>(
    contractType: ContractType,
    rawJson: string
  ): ContractValidationResult<T> {
    if (!isKnownContractType(contractType)) {
      return validate<T>(contractType, undefined);
    }

    if (typeof rawJson !== 'string') {
      return Object.freeze({
        valid: false,
        contractType,
        errors: Object.freeze([
          Object.freeze({
            contractType,
            instancePath: '',
            schemaPath: '',
            keyword: 'json-parse',
            message: 'Raw JSON input must be a string.',
            params: Object.freeze({ receivedType: typeof rawJson }),
          }),
        ]),
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid JSON string';
      return Object.freeze({
        valid: false,
        contractType,
        errors: Object.freeze([
          Object.freeze({
            contractType,
            instancePath: '',
            schemaPath: '',
            keyword: 'json-parse',
            message,
            params: Object.freeze({}),
          }),
        ]),
      });
    }

    return validate<T>(contractType, parsed);
  }

  return Object.freeze({
    validate,
    parseAndValidate,
  });
}

let defaultValidatorInstance: ContractValidator | null = null;

function getDefaultValidator(): ContractValidator {
  if (defaultValidatorInstance === null) {
    defaultValidatorInstance = createContractValidator();
  }
  return defaultValidatorInstance;
}

export function validateContract<T = unknown>(
  contractType: ContractType,
  input: unknown
): ContractValidationResult<T> {
  return getDefaultValidator().validate<T>(contractType, input);
}

export function parseAndValidateContract<T = unknown>(
  contractType: ContractType,
  rawJson: string
): ContractValidationResult<T> {
  return getDefaultValidator().parseAndValidate<T>(contractType, rawJson);
}

export function validateTaskContract(
  input: unknown
): ContractValidationResult<TaskContract> {
  return validateContract<TaskContract>('TaskContract', input);
}

export function validateApprovalRecord(
  input: unknown
): ContractValidationResult<ApprovalRecord> {
  return validateContract<ApprovalRecord>('ApprovalRecord', input);
}

export function validateExecutionAttempt(
  input: unknown
): ContractValidationResult<ExecutionAttempt> {
  return validateContract<ExecutionAttempt>('ExecutionAttempt', input);
}

export function validateExecutionResult(
  input: unknown
): ContractValidationResult<ExecutionResult> {
  return validateContract<ExecutionResult>('ExecutionResult', input);
}

export function validateEvidenceManifest(
  input: unknown
): ContractValidationResult<EvidenceManifest> {
  return validateContract<EvidenceManifest>('EvidenceManifest', input);
}

export function validateReviewHandoffPackage(
  input: unknown
): ContractValidationResult<ReviewHandoffPackage> {
  return validateContract<ReviewHandoffPackage>('ReviewHandoffPackage', input);
}

export function validateReviewReport(
  input: unknown
): ContractValidationResult<ReviewReport> {
  return validateContract<ReviewReport>('ReviewReport', input);
}
