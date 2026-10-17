import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFromFile } from 'json-schema-to-typescript';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(here, '..', 'schemas');
const outDir = join(here, '..', 'src', 'generated');

const BANNER = '/* eslint-disable */\n/**\n * GENERATED FILE - do not edit.\n * Source: packages/contracts/schemas\n * Regenerate: npm run generate:types\n */\n';

async function main() {
  await mkdir(outDir, { recursive: true });

  const files = (await readdir(schemaDir)).filter((f) => f.endsWith('.schema.json'));
  if (files.length === 0) {
    throw new Error(`No schemas found in ${schemaDir}`);
  }

  const moduleNames = [];

  for (const file of files) {
    const moduleName = file.replace('.schema.json', '');
    const ts = await compileFromFile(join(schemaDir, file), {
      bannerComment: BANNER,
      additionalProperties: false,
      style: { singleQuote: true },
    });
    await writeFile(join(outDir, `${moduleName}.ts`), ts, 'utf8');
    moduleNames.push(moduleName);
    console.log(`generated src/generated/${moduleName}.ts`);
  }

  const barrel = BANNER + moduleNames.map((m) => `export * from './${m}.js';`).join('\n') + '\n';
  await writeFile(join(outDir, 'index.ts'), barrel, 'utf8');
  console.log(`generated src/generated/index.ts (${moduleNames.length} modules)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
