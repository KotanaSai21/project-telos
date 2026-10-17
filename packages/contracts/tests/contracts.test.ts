import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SCHEMAS, assertValid, isValid, ContractValidationError } from '../src/validate.js';
import type { SchemaName } from '../src/validate.js';
import { INTENSITY_ORDER, ACTION_ORDER } from '../src/scales.js';

const fixtureDir = join(import.meta.dirname, '..', 'fixtures');

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, name), 'utf8'));
}

const CASES: Array<[SchemaName, string]> = [
  ['ConsentProfile', 'consent-profile.valid.json'],
  ['SegmentMap', 'segment-map.valid.json'],
  ['Decision', 'decision.valid.json'],
  ['ReceiptEvent', 'receipt-event.valid.json'],
];

describe('contract fixtures', () => {
  it.each(CASES)('%s fixture matches its schema', (schemaName, file) => {
    expect(() => assertValid(schemaName, fixture(file))).not.toThrow();
  });

  it.each(CASES)('%s survives a JSON round trip', (schemaName, file) => {
    const original = fixture(file);
    const roundTripped = JSON.parse(JSON.stringify(original));
    expect(roundTripped).toEqual(original);
    expect(isValid(schemaName, roundTripped)).toBe(true);
  });
});

describe('contract rejection', () => {
  it('rejects an unknown property', () => {
    const payload = { ...(fixture('receipt-event.valid.json') as object), sneaky: true };
    expect(() => assertValid('ReceiptEvent', payload)).toThrow(ContractValidationError);
  });

  it('rejects a missing required field', () => {
    const { sessionId, ...rest } = fixture('receipt-event.valid.json') as Record<string, unknown>;
    expect(sessionId).toBeDefined();
    expect(() => assertValid('ReceiptEvent', rest)).toThrow(ContractValidationError);
  });

  it('rejects an out-of-range confidence', () => {
    const payload = { ...(fixture('decision.valid.json') as object), confidence: 1.5 };
    expect(() => assertValid('Decision', payload)).toThrow(ContractValidationError);
  });

  it('rejects an action outside the enum', () => {
    const payload = { ...(fixture('decision.valid.json') as object), action: 'delete' };
    expect(() => assertValid('Decision', payload)).toThrow(ContractValidationError);
  });

  it('reports which field failed', () => {
    const payload = { ...(fixture('decision.valid.json') as object), confidence: 9 };
    try {
      assertValid('Decision', payload);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractValidationError);
      expect((error as ContractValidationError).issues.join(' ')).toContain('confidence');
    }
  });
});

describe('ordered scales stay aligned with the schemas', () => {
  it('intensity order matches the schema enum', () => {
    const schemaEnum = SCHEMAS.SegmentMap.$defs.label.properties.intensity.enum;
    expect([...INTENSITY_ORDER]).toEqual(schemaEnum);
  });

  it('action order matches the schema enum', () => {
    const schemaEnum = SCHEMAS.Decision.$defs.action.enum;
    expect([...ACTION_ORDER]).toEqual(schemaEnum);
  });

  it('receipt actions match decision actions', () => {
    expect(SCHEMAS.ReceiptEvent.properties.action.enum).toEqual(SCHEMAS.Decision.$defs.action.enum);
  });
});
