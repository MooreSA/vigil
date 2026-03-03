import { type ZodType } from 'zod';

export interface SkillFieldMeta {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'literal';
  description: string;
  required: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  pattern?: string;
  literalValue?: unknown;
}

/**
 * Walk a Zod type's _def chain, unwrapping wrappers like ZodDefault, ZodOptional,
 * and ZodNullable, collecting metadata along the way.
 */
function unwrapField(zodType: ZodType): {
  typeName: string;
  def: Record<string, unknown>;
  hasDefault: boolean;
  defaultValue?: unknown;
  required: boolean;
} {
  let hasDefault = false;
  let defaultValue: unknown;
  let required = true;
  let current = zodType;

  // Peel off wrappers
  for (;;) {
    const def = (current as unknown as { _def: Record<string, unknown> })._def;
    const typeName = def.typeName as string;

    if (typeName === 'ZodDefault') {
      hasDefault = true;
      defaultValue = def.defaultValue;
      if (typeof defaultValue === 'function') defaultValue = (defaultValue as () => unknown)();
      current = def.innerType as ZodType;
      continue;
    }

    if (typeName === 'ZodOptional' || typeName === 'ZodNullable') {
      required = false;
      current = def.innerType as ZodType;
      continue;
    }

    return { typeName, def: def as Record<string, unknown>, hasDefault, defaultValue, required };
  }
}

export function zodSchemaToFields(schema: ZodType): SkillFieldMeta[] {
  const def = (schema as unknown as { _def: Record<string, unknown> })._def;
  if (def.typeName !== 'ZodObject') return [];

  const shape = (schema as unknown as { shape: Record<string, ZodType> }).shape;
  if (!shape) return [];

  const fields: SkillFieldMeta[] = [];

  for (const [key, fieldType] of Object.entries(shape)) {
    const description = fieldType.description ?? '';
    const { typeName, def: innerDef, hasDefault, defaultValue, required } = unwrapField(fieldType);

    if (typeName === 'ZodLiteral') {
      fields.push({
        key,
        type: 'literal',
        description,
        required: true,
        literalValue: innerDef.value as unknown,
        default: innerDef.value as unknown,
      });
      continue;
    }

    const field: SkillFieldMeta = { key, type: 'string', description, required: required && !hasDefault };

    if (hasDefault) field.default = defaultValue;

    if (typeName === 'ZodString') {
      field.type = 'string';
      const checks = innerDef.checks as Array<{ kind: string; regex?: RegExp }> | undefined;
      if (checks) {
        const regex = checks.find((c) => c.kind === 'regex');
        if (regex?.regex) field.pattern = regex.regex.source;
      }
    } else if (typeName === 'ZodNumber') {
      field.type = 'number';
      const checks = innerDef.checks as Array<{ kind: string; value?: number }> | undefined;
      if (checks) {
        const min = checks.find((c) => c.kind === 'min');
        const max = checks.find((c) => c.kind === 'max');
        if (min?.value !== undefined) field.min = min.value;
        if (max?.value !== undefined) field.max = max.value;
      }
    } else if (typeName === 'ZodBoolean') {
      field.type = 'boolean';
    }

    fields.push(field);
  }

  return fields;
}
