import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  typescript: {
    tsconfigPath: 'tsconfig.json',
  },
  formatters: {
    /**
     * Format CSS, LESS, SCSS files, also the `<style>` blocks in Vue
     * By default uses Prettier
     */
    css: true,
    /**
     * Format HTML files
     * By default uses Prettier
     */
    html: true,
    /**
     * Format Markdown files
     * Supports Prettier and dprint
     * By default uses Prettier
     */
    markdown: 'prettier',
  },
  ignores: [
    'node_modules/',
    'bin/',
    '.history/',
    'docs/',
    '**/*.min.js',
    '**/*-min.js',
    '**/*.bundle.js',
  ],
  isInEditor: true,
  rules: {
    'ts/strict-boolean-expressions': 'off',
    'ts/no-unsafe-argument': 'off',
    'ts/no-unsafe-call': 'off',
    'ts/no-unsafe-assignment': 'off',
    'ts/no-unsafe-member-access': 'off',
    'ts/no-unsafe-return': 'off',
    'ts/no-unsafe-function-type': 'off',
    'no-console': 'off',
  },
})
