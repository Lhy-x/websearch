#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then eval "$(/usr/local/bin/brew shellenv)"; fi
if command -v brew >/dev/null 2>&1; then
  export PATH="$(brew --prefix node@22)/bin:$(brew --prefix postgresql@16)/bin:$PATH"
fi
npm run reset:local
read -r -p "Tapez REINITIALISER pour effacer les données de cette base après sauvegarde : " answer
if [ "$answer" != "REINITIALISER" ]; then exit 0; fi
npm run reset:local -- --confirm
read -r -p "Terminé. Appuyez sur Entrée pour fermer."
