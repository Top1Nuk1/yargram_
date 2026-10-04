import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Копирует `apps/server/assets` в `apps/server/dist/assets`.
 *
 * `tsc` компилирует только `.ts` и про картинки ничего не знает, поэтому
 * значок Yargram для письма нужно переносить руками — иначе в собранном сервере
 * письмо уйдёт без картинки.
 *
 * Запуск: `npm run build` (шаг после `tsc`) либо вручную.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'apps', 'server', 'assets');
const to = join(root, 'apps', 'server', 'dist', 'assets');

if (!existsSync(from)) {
  // Ассетов может не быть — сборка из-за этого падать не должна.
  console.log('assets: нечего копировать, папка отсутствует');
  process.exit(0);
}

mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log(`assets: скопировано в ${to}`);
