#!/usr/bin/env node
/**
 * Regenerates supabase/database.types.ts from the local database.
 *
 * This exists instead of a one-line npm script because CI regenerates the file
 * and fails if it differs from the committed one. That check is only meaningful
 * if generation is reproducible byte for byte, which means the banner has to be
 * added here rather than by hand, and the result must not be reformatted
 * afterwards — hence the entry in .prettierignore.
 *
 * The first version of this was a shell redirect, the banner was added by hand,
 * and Prettier reformatted the result. The drift check could never pass. CI
 * caught it on the first run.
 */

import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';

const OUTPUT = 'supabase/database.types.ts';

const BANNER = `/* eslint-disable */
/**
 * GENERATED FILE -- DO NOT EDIT.
 *
 * Regenerate with \`npm run db:types\` after every migration, and commit the
 * result. CI regenerates it and fails on any difference, so a schema change
 * that was never reflected here shows up in review rather than at runtime
 * (docs/code-standards.md).
 */

`;

let generated;
try {
  generated = execFileSync('supabase', ['gen', 'types', 'typescript'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
} catch (error) {
  console.error(
    '\nCould not generate types. The local database must be running:\n' +
      '  npm run db:start\n' +
      'See docs/development.md.\n',
  );
  throw error;
}

writeFileSync(OUTPUT, BANNER + generated);
console.log(
  `Wrote ${OUTPUT} (${String(BANNER.split('\n').length + generated.split('\n').length - 1)} lines).`,
);
