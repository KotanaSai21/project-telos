import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import consentProfileSchema from '../schemas/consent-profile.schema.json' with { type: 'json' };
import segmentMapSchema from '../schemas/segment-map.schema.json' with { type: 'json' };
import decisionSchema from '../schemas/decision.schema.json' with { type: 'json' };
import receiptEventSchema from '../schemas/receipt-event.schema.json' with { type: 'json' };

export const SCHEMAS = {
  ConsentProfile: consentProfileSchema,
  SegmentMap: segmentMapSchema,
  Decision: decisionSchema,
  ReceiptEvent: receiptEventSchema,
} as const;

export type SchemaName = keyof typeof SCHEMAS;

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const validators = new Map<SchemaName, ValidateFunction>();
for (const [name, schema] of Object.entries(SCHEMAS)) {
  validators.set(name as SchemaName, ajv.compile(schema));
}

export class ContractValidationError extends Error {
  constructor(
    readonly schemaName: SchemaName,
    readonly issues: string[],
  ) {
    super(`${schemaName} failed validation: ${issues.join('; ')}`);
    this.name = 'ContractValidationError';
  }
}

/** Throws ContractValidationError when the payload does not match the contract. */
export function assertValid<T>(schemaName: SchemaName, payload: unknown): T {
  const validate = validators.get(schemaName);
  if (!validate) throw new Error(`Unknown schema: ${schemaName}`);

  if (!validate(payload)) {
    const issues = (validate.errors ?? []).map(
      (e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`,
    );
    throw new ContractValidationError(schemaName, issues);
  }
  return payload as T;
}

export function isValid(schemaName: SchemaName, payload: unknown): boolean {
  const validate = validators.get(schemaName);
  if (!validate) throw new Error(`Unknown schema: ${schemaName}`);
  return validate(payload) as boolean;
}
