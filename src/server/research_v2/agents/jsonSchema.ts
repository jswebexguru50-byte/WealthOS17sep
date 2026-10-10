/** Minimal JSON-Schema subset validator (no external dependency): enough for the agent schemas. */
export type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  minItems?: number;
  minLength?: number;
  minimum?: number;
  [key: string]: unknown;
};

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function typeMatches(actual: string, allowed: string[]): boolean {
  return allowed.some(t => t === actual || (t === 'number' && actual === 'integer'));
}

function checkObject(value: Record<string, unknown>, schema: JsonSchema, path: string, errors: string[]): void {
  for (const key of schema.required ?? []) {
    if (!(key in value)) errors.push(`${path}.${key}: required property missing`);
  }
  const props = schema.properties ?? {};
  for (const [key, child] of Object.entries(value)) {
    if (props[key]) validateAt(child, props[key], `${path}.${key}`, errors);
    else if (schema.additionalProperties === false) errors.push(`${path}.${key}: unexpected property`);
    else if (typeof schema.additionalProperties === 'object') {
      validateAt(child, schema.additionalProperties, `${path}.${key}`, errors);
    }
  }
}

function validateAt(value: unknown, schema: JsonSchema, path: string, errors: string[]): void {
  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!typeMatches(typeOf(value), allowed)) {
      errors.push(`${path}: expected ${allowed.join('|')}, got ${typeOf(value)}`);
      return;
    }
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: value not in enum`);
  if ('const' in schema && schema.const !== value) errors.push(`${path}: value differs from const`);
  if (typeof value === 'string' && schema.minLength !== undefined && value.trim().length < schema.minLength) {
    errors.push(`${path}: shorter than ${schema.minLength}`);
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path}: below minimum ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.items) value.forEach((item, i) => validateAt(item, schema.items as JsonSchema, `${path}[${i}]`, errors));
  } else if (value !== null && typeof value === 'object') {
    checkObject(value as Record<string, unknown>, schema, path, errors);
  }
}

/** Validates a value against the schema subset; returns error strings (empty when valid). */
export function validateJsonSchema(value: unknown, schema: JsonSchema): string[] {
  const errors: string[] = [];
  validateAt(value, schema, '$', errors);
  return errors;
}
