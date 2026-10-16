#!/bin/sh
# Yargram bootstrap for Raven Host (Pterodactyl).
# При каждом старте:
#   1. ставит зависимости, если их ещё нет (node_modules отсутствует);
#   2. запускает собранный сервер.
# Это нужно, потому что веб-консоль Pterodactyl не принимает ввод с
# клавиатуры — команды можно задать только через Start command.
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "[bootstrap] node_modules нет — ставлю зависимости (разово)…"
  npm install --workspaces --include-workspace-root --omit=dev
  echo "[bootstrap] npm install готов."
else
  echo "[bootstrap] node_modules уже есть — пропускаю установку."
fi

echo "[bootstrap] Запускаю Yargram…"
exec node apps/server/dist/index.js