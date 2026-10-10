/** Minimal JSON Schema validator (draft-07 subset) so the import adapter needs no extra dependency. */
export type JsonSchema = {
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null' | Array<string>;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: unknown[];
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  format?: 'date-time' | 'date';
};

export interface SchemaError {
  path: string;
  message: string;
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function typeMatches(expected: string, actual: string): boolean {
  return expected === actual || (expected === 'number' && actual === 'integer');
}

function resolveRef(root: JsonSchema, ref: string): JsonSchema {
  const match = /^#\/\$defs\/(.+)$/.exec(ref);
  const target = match === null ? undefined : root.$defs?.[match[1] as string];
  if (target === undefined) throw new Error(`unsupported or unknown $ref ${ref}`);
  return target;
}

function checkString(schema: JsonSchema, value: string, path: string, errors: SchemaError[]): void {
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push({ path, message: `shorter than ${schema.minLength}` });
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push({ path, message: `longer than ${schema.maxLength}` });
  }
  if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
    errors.push({ path, message: `does not match ${schema.pattern}` });
  }
  if (schema.format !== undefined && Number.isNaN(Date.parse(value))) {
    errors.push({ path, message: `not a valid ${schema.format}` });
  }
}

function checkObject(
  schema: JsonSchema, root: JsonSchema, value: Record<string, unknown>, path: string, errors: SchemaError[],
): void {
  for (const key of schema.required ?? []) {
    if (!(key in value)) errors.push({ path: `${path}/${key}`, message: 'is required' });
  }
  const props = schema.properties ?? {};
  for (const [key, child] of Object.entries(value)) {
    const childSchema = props[key];
    if (childSchema !== undefined) walk(childSchema, root, child, `${path}/${key}`, errors);
    else if (schema.additionalProperties === false) errors.push({ path: `${path}/${key}`, message: 'is not allowed' });
    else if (typeof schema.additionalProperties === 'object') {
      walk(schema.additionalProperties, root, child, `${path}/${key}`, errors);
    }
  }
}

function walk(schema: JsonSchema, root: JsonSchema, value: unknown, path: string, errors: SchemaError[]): void {
  if (schema.$ref !== undefined) return walk(resolveRef(root, schema.$ref), root, value, path, errors);
  const actual = typeOf(value);
  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((t) => typeMatches(t, actual))) {
      errors.push({ path, message: `expected ${allowed.join('|')}, got ${actual}` });
      return;
    }
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push({ path, message: `must be one of ${schema.enum.map(String).join(', ')}` });
  }
  if (typeof value === 'string') checkString(schema, value, path, errors);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path, message: `below ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ path, message: `above ${schema.maximum}` });
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: 'too few items' });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path, message: 'too many items' });
    }
    const itemSchema = schema.items;
    if (itemSchema !== undefined) value.forEach((v, i) => walk(itemSchema, root, v, `${path}/${i}`, errors));
  }
  if (actual === 'object') checkObject(schema, root, value as Record<string, unknown>, path, errors);
}

/** Validates a value against a schema; an empty list means valid. */
export function validateJsonSchema(schema: JsonSchema, value: unknown): SchemaError[] {
  const errors: SchemaError[] = [];
  walk(schema, schema, value, '', errors);
  return errors;
}
