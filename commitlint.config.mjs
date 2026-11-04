// Conventional Commits, as required by docs/code-standards.md#commits.
// Scopes are package or module names, so a commit says where it landed.

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'refactor',
        'test',
        'chore',
        'perf',
        'build',
        'ci',
        'revert',
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'core',
        'adapters',
        'web',
        'mobile',
        'plugins',
        'supabase',
        'docs',
        'adr',
        'regions',
        'ci',
        'deps',
        'repo',
      ],
    ],
    'scope-empty': [1, 'never'],
    'subject-case': [2, 'always', 'lower-case'],
    'body-max-line-length': [1, 'always', 100],
  },
};
