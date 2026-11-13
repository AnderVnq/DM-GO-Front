import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('dist/dm48/browser');
if (!existsSync(root)) throw new Error('Primero ejecuta pnpm build.');
const forbidden = /(?:AGENTS\.md|SKILL\.md|\.impeccable|Repository Guidelines|docs\/superpowers)/;
function scan(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = resolve(folder, entry.name);
    if (forbidden.test(entry.name))
      throw new Error(`Archivo local incluido en la distribución: ${entry.name}`);
    if (entry.isDirectory()) scan(path);
    else if (
      /\.(?:html|js|json|css|md)$/.test(entry.name) &&
      forbidden.test(readFileSync(path, 'utf8'))
    )
      throw new Error(`Contexto local incluido en ${path}`);
  }
}
scan(root);
console.log('Distribución sin archivos de contexto local.');
