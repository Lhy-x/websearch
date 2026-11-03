#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
trap 'code=$?; if [ "$code" -ne 0 ]; then echo; echo "Installation interrompue. Consultez les messages ci-dessus."; read -r -p "Appuyez sur Entrée pour fermer."; fi' EXIT
if ! command -v brew >/dev/null 2>&1; then
  # Finder does not always inherit Homebrew's PATH.
  if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then eval "$(/usr/local/bin/brew shellenv)"
  else
    echo "Installez Homebrew depuis https://brew.sh puis relancez INSTALLER-MAC.command."
    exit 1
  fi
fi
brew list node@22 >/dev/null 2>&1 || brew install node@22
brew list postgresql@16 >/dev/null 2>&1 || brew install postgresql@16
export PATH="$(brew --prefix node@22)/bin:$(brew --prefix postgresql@16)/bin:$PATH"
brew services start postgresql@16
# Wait for database readiness rather than assuming service startup is immediate.
for attempt in {1..30}; do
  if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then break; fi
  sleep 1
done
pg_isready -h localhost -p 5432
npm ci
npx playwright install chromium
echo
echo "Pour une installation Homebrew neuve, validez les deux questions PostgreSQL avec Entrée."
npm run setup:local
echo
echo "Installation terminée. Notez votre mot de passe administrateur affiché ci-dessus."
echo "Ensuite, ouvrez LANCER-MAC.command."
read -r -p "Appuyez sur Entrée pour fermer."
