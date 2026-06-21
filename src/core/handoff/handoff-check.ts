import * as fs from 'node:fs';
import { HANDOFF_SCHEMAS, isHandoffId, type HandoffId } from './schemas.js';

// Validate a worker-output JSON file (or object) against a named handoff schema.

export interface HandoffCheckResult {
  ok: boolean;
  schemaId: string;
  errors: string[];
  data?: unknown;
}

export function checkHandoffObject(schemaId: string, value: unknown): HandoffCheckResult {
  if (!isHandoffId(schemaId)) {
    return {
      ok: false,
      schemaId,
      errors: [`unknown handoff schema "${schemaId}". Known: ${Object.keys(HANDOFF_SCHEMAS).join(', ')}`],
    };
  }
  const schema = HANDOFF_SCHEMAS[schemaId as HandoffId];
  const result = schema.safeParse(value);
  if (!result.success) {
    return {
      ok: false,
      schemaId,
      errors: result.error.issues.map((e) => `${e.path.join('.') || '(root)'}: ${e.message}`),
    };
  }
  return { ok: true, schemaId, errors: [], data: result.data };
}

export function checkHandoffFile(schemaId: string, filePath: string): HandoffCheckResult {
  if (!fs.existsSync(filePath)) {
    return { ok: false, schemaId, errors: [`handoff file not found: ${filePath}`] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return { ok: false, schemaId, errors: [`handoff file is not valid JSON: ${filePath}`] };
  }
  return checkHandoffObject(schemaId, parsed);
}
