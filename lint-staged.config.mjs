// Pre-commit checks on staged files. The mobile app is linted with its own ESLint 9 + Expo config
// (eslint-plugin-react does not support ESLint 10); everything else uses the root ESLint 10.
import path from 'node:path';

const MOBILE_DIR = path.resolve('apps/mobile') + path.sep;
const quote = (files) => files.map((f) => JSON.stringify(f)).join(' ');
const mobileEslint = JSON.stringify(path.join('apps', 'mobile', 'node_modules', '.bin', 'eslint'));

export default {
  '*.{ts,tsx,js,mjs,cjs}': (files) => {
    const mobile = files.filter((f) => path.resolve(f).startsWith(MOBILE_DIR));
    const other = files.filter((f) => !path.resolve(f).startsWith(MOBILE_DIR));
    const commands = [];
    if (other.length > 0)
      commands.push(`eslint --max-warnings=0 --no-warn-ignored ${quote(other)}`);
    if (mobile.length > 0) {
      commands.push(
        `${mobileEslint} --config apps/mobile/eslint.config.js --max-warnings=0 --no-warn-ignored ${quote(mobile)}`,
      );
    }
    commands.push(`prettier --check ${quote(files)}`);
    return commands;
  },
  '*.{json,md,yml,yaml}': (files) => `prettier --check ${quote(files)}`,
  '*.{ts,tsx,js,mjs,cjs,json,md,yml,yaml,toml,rules}': (files) =>
    `node scripts/check-invisible-chars.mjs ${quote(files)}`,
};
