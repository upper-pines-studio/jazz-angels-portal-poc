// ESLint flat config. Its main job is to keep the boundaries in src/modules/README.md
// ("The rules") and src/core/README.md, which used to be kept by hand.
// Run with `npm run lint`, which also runs `prettier --check`.
import { readdirSync } from 'node:fs';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

// Every module folder under src/modules, so a new module is covered without editing this file.
const MODULES = readdirSync(new URL('./src/modules', import.meta.url), { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

const others = name => MODULES.filter(m => m !== name);

/** Import zones for import/no-restricted-paths: `target` may not import from `from`, bar `except`. */
const zones = [
  // A module reaches another module only through that module's index.ts.
  ...MODULES.flatMap(m =>
    others(m).map(o => ({
      target: `./src/modules/${m}`,
      from: `./src/modules/${o}`,
      except: ['./index.ts'],
      message: `A module imports another module only through its index.ts: import from 'modules/${o}', not deeper.`,
    })),
  ),
  // The registry lists modules by their public index.ts, nothing deeper.
  ...MODULES.map(m => ({
    target: './src/modules/index.ts',
    from: `./src/modules/${m}`,
    except: ['./index.ts'],
    message: 'The registry imports each module through its index.ts only.',
  })),
  // Core never imports from modules.
  {
    target: './src/core',
    from: './src/modules',
    message: 'Core never imports from src/modules. See src/core/README.md.',
  },
  // App reads the registry and the modules' public index.ts files, never a module's insides.
  {
    target: './src/app',
    from: './src/modules',
    except: ['./index.ts', ...MODULES.map(m => `./${m}/index.ts`)],
    message:
      'src/app reads the registry (src/modules/index.ts) or a module index.ts, nothing deeper.',
  },
];

// no-restricted-syntax does not merge between config blocks, so the selectors are built here
// and each block lists every one that applies to it.
const NO_LOCAL_STORAGE = {
  selector: "Identifier[name='localStorage']",
  message:
    'Only src/core/repository.ts and src/core/auth.ts touch localStorage. Use the repository.',
};
const NO_BARE_NEW_DATE = {
  selector: "NewExpression[callee.name='Date'][arguments.length=0]",
  message:
    'Screens use `today` from useStore() rather than `new Date()`. `new Date(value)` is fine.',
};
const SCREENS = ['src/app/**/*.{ts,tsx}', 'src/modules/*/screens/**/*.{ts,tsx}'];
const STORAGE_OWNERS = ['src/core/repository.ts', 'src/core/auth.ts'];
// Tests stand up a fake localStorage to exercise the two owners.
const TESTS = ['src/**/__tests__/**'];

export default tseslint.config(
  // Shared with the staff-portal POC and never edited here.
  { ignores: ['dist/**', 'src/design-system/**'] },

  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, import: importPlugin },
    settings: {
      'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js', '.jsx'] } },
    },
    rules: {
      'import/no-restricted-paths': ['error', { zones }],
      'no-restricted-syntax': ['error', NO_LOCAL_STORAGE],
      'react-hooks/rules-of-hooks': 'error',

      // Left out: each would need real code changes today, not just formatting.
      // (The newer React Compiler rules in react-hooks are left out for the same reason.)
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
    // A few existing eslint-disable comments name the rules left out above; keep them quiet.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },

  {
    files: SCREENS,
    rules: { 'no-restricted-syntax': ['error', NO_LOCAL_STORAGE, NO_BARE_NEW_DATE] },
  },

  {
    files: [...STORAGE_OWNERS, ...TESTS],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
