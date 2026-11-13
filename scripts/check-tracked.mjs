import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const forbidden = [
  /(^|\/)(skills|\.agents|\.claude|\.codex|\.impeccable|\.superpowers)(\/|$)/,
  /(^|\/)(AGENTS(?:\.local)?|SKILL|CLAUDE|GEMINI)\.md$/,
  /^(PRODUCT|DESIGN)\.md$/,
  /^docs\/(superpowers|design)(\/|$)/,
  /^(main\.go|go\.mod|go\.sum)$/,
  /(^|\/)\.env(?:\.(?!example$).*)?$/,
];
const invalid = files.filter((file) => forbidden.some((pattern) => pattern.test(file)));
if (invalid.length) {
  console.error(`Archivos que deben permanecer locales:\n${invalid.join('\n')}`);
  process.exitCode = 1;
} else console.log('Archivos versionados verificados.');
