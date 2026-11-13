import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

const root = resolve('src/app');
const violations = [];
function scan(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = resolve(folder, entry.name);
    if (entry.isDirectory()) {
      scan(path);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    const source = readFileSync(path, 'utf8');
    const owner = relative(root, path).split(sep);
    for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const target = relative(root, resolve(dirname(path), specifier)).split(sep);
      if (['core', 'shared'].includes(owner[0]) && target[0] === 'modules') {
        violations.push(
          `${relative(root, path)}: la infraestructura no puede depender de módulos.`,
        );
      }
      if (
        owner[0] === 'modules' &&
        target[0] === 'modules' &&
        owner[1] !== target[1] &&
        target.length > 2 &&
        target[2] !== 'index'
      ) {
        violations.push(`${relative(root, path)}: usa el contrato público de ${target[1]}.`);
      }
      if (specifier.includes('skills') || specifier.includes('.impeccable'))
        violations.push(`${path}: recurso local importado por el producto.`);
    }
  }
}
scan(root);
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else console.log('Límites del monolito modular verificados.');
