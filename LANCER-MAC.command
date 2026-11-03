#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
trap 'code=$?; if [ "$code" -ne 0 ]; then echo; echo "Lancement impossible. Consultez les messages ci-dessus ou relancez INSTALLER-MAC.command."; read -r -p "Appuyez sur Entrée pour fermer."; fi' EXIT
if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then eval "$(/usr/local/bin/brew shellenv)"; fi
if command -v brew >/dev/null 2>&1; then
  export PATH="$(brew --prefix node@22)/bin:$(brew --prefix postgresql@16)/bin:$PATH"
  brew services start postgresql@16
fi
npm run dev:local
