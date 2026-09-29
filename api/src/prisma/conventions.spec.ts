import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma } from '../generated/prisma/client.js';

const BUSINESS_MODELS = [
  'Institution',
  'Membership',
  'Incubator',
  'Startup',
] as const;

const BUSINESS_FIELDS = [
  'id',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'createdById',
  'updatedById',
  'deletedById',
  'version',
] as const;

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, '../../prisma/schema.prisma');

/**
 * Reads the generated Prisma DMMF-derived field enums and the schema source
 * to assert business-model conventions.
 */
function fieldEnumsFor(model: string): Record<string, string> {
  const enumName = `${model}ScalarFieldEnum` as keyof typeof Prisma;
  const value = Prisma[enumName];
  if (!value || typeof value !== 'object') {
    throw new Error(`Missing generated ScalarFieldEnum for ${model}`);
  }
  return value as Record<string, string>;
}

function modelBlock(schema: string, model: string): string {
  const match = schema.match(
    new RegExp(`model\\s+${model}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!match) {
    throw new Error(`Model ${model} not found in schema`);
  }
  return match[1];
}

describe('prisma conventions', () => {
  const schema = readFileSync(schemaPath, 'utf8');

  it('modelo de negocio completo', () => {
    for (const model of BUSINESS_MODELS) {
      const fields = fieldEnumsFor(model);
      for (const field of BUSINESS_FIELDS) {
        expect(fields[field]).toBe(field);
      }

      const block = modelBlock(schema, model);
      expect(block).toMatch(/@@map\("([a-z][a-z0-9_]*)"\)/);
      expect(schema).toMatch(
        new RegExp(`model\\s+${model}[\\s\\S]*?@@map\\("[a-z]`),
      );
    }

    expect(Prisma.ModelName.Institution).toBe('Institution');
    expect(Prisma.ModelName.Membership).toBe('Membership');
    expect(Prisma.ModelName.Startup).toBe('Startup');
  });

  it('auth sin mixin', () => {
    const fields = fieldEnumsFor('Session');
    expect(fields.deletedAt).toBeUndefined();
    expect(fields.version).toBeUndefined();
  });

  it('createdBy es string', () => {
    const block = modelBlock(schema, 'Institution');
    const createdByLine = block
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('createdById'));

    expect(createdByLine).toBeDefined();
    expect(createdByLine).toMatch(/^createdById\s+String\?/);
    expect(createdByLine).not.toMatch(/@db\.Uuid/);
  });
});
