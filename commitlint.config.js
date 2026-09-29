const HEADER_PATTERN =
  /^\[:[a-z0-9_]+:\] ([a-z0-9-]+) - (add|update|fix|remove|test|docs) - .{8,}$/;

/** @type {import('@commitlint/types').UserConfig} */
export default {
  plugins: [
    {
      rules: {
        'incubapp-header': (parsed) => {
          const header = parsed.header ?? '';
          const valid = HEADER_PATTERN.test(header);
          return [
            valid,
            valid
              ? ''
              : [
                  'Commit header must match:',
                  '  [:emoji_name:] scope - (add|update|fix|remove|test|docs) - short description (min 8 chars)',
                  'Example:',
                  '  [:memo:] backend - add - implementation plan for the api',
                ].join('\n'),
          ];
        },
      },
    },
  ],
  rules: {
    'incubapp-header': [2, 'always'],
  },
};
