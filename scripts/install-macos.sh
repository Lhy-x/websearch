#!/usr/bin/env bash
# ProspectForge — installation locale sur macOS (Homebrew). Ne modifie pas le Python système.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew est requis : https://brew.sh (puis relancez ce script)."; exit 1
fi

say "1/6 Node.js 22 et PostgreSQL 16 (Homebrew)"
command -v node >/dev/null 2>&1 && node -v | grep -q '^v2[2-9]' || brew install node@22
brew list postgresql@16 >/dev/null 2>&1 || brew install postgresql@16
brew services start postgresql@16
export PATH="$(brew --prefix postgresql@16)/bin:$(brew --prefix node@22 2>/dev/null)/bin:$PATH"
sleep 2

say "2/6 Base de données"
psql -d postgres -tc "select 1 from pg_roles where rolname='pf'" | grep -q 1 || psql -d postgres -c "create user pf with password 'pf' createdb"
for db in prospectforge prospectforge_test prospectforge_e2e; do
  psql -d postgres -tc "select 1 from pg_database where datname='$db'" | grep -q 1 || createdb -O pf "$db"
  psql -d "$db" -c "create extension if not exists pg_trgm; create extension if not exists unaccent; create extension if not exists pgcrypto;" >/dev/null
done

say "3/6 Dépendances npm + navigateur Playwright (Chromium)"
npm ci
npx playwright install chromium

say "4/6 Fichier .env"
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i '' "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')|" .env
  sed -i '' "s|^APP_ENCRYPTION_KEY=.*|APP_ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\n')|" .env
  read -r -p "Email administrateur : " ADMIN
  sed -i '' "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=${ADMIN}|" .env
  read -r -s -p "Mot de passe administrateur (10 caractères min.) : " PW; echo
  HASH=$(npx tsx scripts/hash-password.ts "$PW" | sed -n "s/^ADMIN_PASSWORD_HASH=//p")
  sed -i '' "s|^ADMIN_PASSWORD_HASH=.*|ADMIN_PASSWORD_HASH=${HASH}|" .env
else
  echo ".env existe déjà — inchangé."
fi

say "IA par abonnement (optionnel)"
echo "Pour utiliser vos crédits d'abonnement (sans clé API) :"
read -r -p "Installer/connecter Claude Code (abonnement Claude Pro/Max) ? [o/N] " A
if [[ "${A:-n}" =~ ^[oOyY] ]]; then
  command -v claude >/dev/null 2>&1 || npm install -g @anthropic-ai/claude-code
  claude auth status --json 2>/dev/null | grep -q '"loggedIn": true' || claude auth login
fi
read -r -p "Installer/connecter Codex (abonnement ChatGPT) ? [o/N] " B
if [[ "${B:-n}" =~ ^[oOyY] ]]; then
  command -v codex >/dev/null 2>&1 || npm install -g @openai/codex
  codex login status >/dev/null 2>&1 || codex login
fi

say "5/6 Migrations"
set -a; . ./.env; set +a
npm run migrate

say "6/6 Vérification"
npm run typecheck
npm test

cat <<'TXT'

Installation terminée. Dans deux terminaux :
  npm run dev       # dashboard → http://localhost:3000
  npm run worker    # tâches de fond (recherches, générations, envois…)
TXT
