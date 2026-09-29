import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, 'schema.prisma');

/** Soft-delete models that must not use Prisma @@unique (use partial SQL indexes). */
const SOFT_DELETE_MODELS = ['Institution'];

function extractModelBlock(schema: string, model: string): string | null {
  const match = schema.match(
    new RegExp(`model\\s+${model}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  return match ? match[1] : null;
}

function hasPrismaUnique(block: string): boolean {
  return /@@unique\s*\(/.test(block) || /@unique\b/.test(block);
}

export function findSoftDeleteUniques(
  schema: string,
  models: string[] = SOFT_DELETE_MODELS,
): string[] {
  const violations: string[] = [];
  for (const model of models) {
    const block = extractModelBlock(schema, model);
    if (!block) {
      violations.push(`${model}: model not found in schema`);
      continue;
    }
    if (hasPrismaUnique(block)) {
      violations.push(
        `${model}: has @@unique or @unique (use partial SQL index)`,
      );
    }
  }
  return violations;
}

function main(): void {
  const schema = readFileSync(schemaPath, 'utf8');
  const violations = findSoftDeleteUniques(schema);
  if (violations.length > 0) {
    console.error('Soft-delete unique check failed:');
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }
  console.log('OK: no Prisma @@unique on soft-delete models');
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main();
}
