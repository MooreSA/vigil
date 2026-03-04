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

interface Def {
  type: string;
  innerType?: ZodType;
  defaultValue?: unknown;
  values?: unknown[];
  checks?: Array<{ _zod?: { def?: { pattern?: unknown } } }>;
}

/**
 * Walk a Zod v4 type's _def chain, unwrapping wrappers like default, optional,
 * and nullable, collecting metadata along the way.
 */
function unwrapField(zodType: ZodType): {
  typeName: string;
  innerType: ZodType;
  hasDefault: boolean;
  defaultValue?: unknown;
  required: boolean;
} {
  let hasDefault = false;
  let defaultValue: unknown;
  let required = true;
  let current = zodType;

  for (;;) {
    const def = (current as unknown as { _def: Def })._def;
    const type = def.type;

    if (type === 'default') {
      hasDefault = true;
      defaultValue = def.defaultValue;
      if (typeof defaultValue === 'function') defaultValue = (defaultValue as () => unknown)();
      current = def.innerType as ZodType;
      continue;
    }

    if (type === 'optional' || type === 'nullable') {
      required = false;
      current = def.innerType as ZodType;
      continue;
    }

    return { typeName: type, innerType: current, hasDefault, defaultValue, required };
  }
}

export function zodSchemaToFields(schema: ZodType): SkillFieldMeta[] {
  const def = (schema as unknown as { _def: Def })._def;
  if (def.type !== 'object') return [];

  const shape = (schema as unknown as { shape: Record<string, ZodType> }).shape;
  if (!shape) return [];

  const fields: SkillFieldMeta[] = [];

  for (const [key, fieldType] of Object.entries(shape)) {
    const description = fieldType.description ?? '';
    const { typeName, innerType, hasDefault, defaultValue, required } = unwrapField(fieldType);

    if (typeName === 'literal') {
      const values = (innerType as unknown as { _def: Def })._def.values;
      const literalValue = values?.[0];
      fields.push({
        key,
        type: 'literal',
        description,
        required: true,
        literalValue,
        default: literalValue,
      });
      continue;
    }

    const field: SkillFieldMeta = { key, type: 'string', description, required: required && !hasDefault };

    if (hasDefault) field.default = defaultValue;

    if (typeName === 'string') {
      field.type = 'string';
      const checks = (innerType as unknown as { _def: Def })._def.checks;
      if (checks) {
        for (const check of checks) {
          const pattern = check._zod?.def?.pattern;
          if (pattern instanceof RegExp) {
            field.pattern = pattern.source;
            break;
          }
        }
      }
    } else if (typeName === 'number') {
      field.type = 'number';
      const num = innerType as unknown as { minValue?: number | null; maxValue?: number | null };
      if (num.minValue != null) field.min = num.minValue;
      if (num.maxValue != null) field.max = num.maxValue;
    } else if (typeName === 'boolean') {
      field.type = 'boolean';
    }

    fields.push(field);
  }

  return fields;
}
