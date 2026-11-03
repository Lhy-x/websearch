# Lancer ProspectForge 3D sur Mac, sans Docker

## Première installation

### 1. Récupérer le projet depuis GitHub

Dans Terminal :

```sh
cd ~/Documents
git clone --branch claude/elegant-einstein-2aqprx https://github.com/Lhy-x/websearch.git
cd websearch
```

Si macOS propose d’installer les outils de développement nécessaires à Git, acceptez,
puis relancez les commandes. Si le dépôt est privé, GitHub demandera une authentification.
Conservez ce même dossier pour vos prochains lancements.

### 2. Installer Homebrew si nécessaire

Homebrew installe Node.js et PostgreSQL pour vous. Allez sur **https://brew.sh**,
ouvrez **Terminal** (Applications → Utilitaires → Terminal), puis copiez la commande
d’installation affichée sur le site officiel. Suivez ses instructions et attendez la fin.
Si Homebrew est déjà installé, passez directement à l’étape suivante.

### 3. Ouvrir INSTALLER-MAC.command

Dans le dossier du projet, double-cliquez sur **INSTALLER-MAC.command**.
Il installe Node.js 22, PostgreSQL 16, les dépendances et Chromium, puis prépare
votre configuration et votre base locale.

Deux questions apparaissent :

- **Utilisateur PostgreSQL** : avec une nouvelle installation Homebrew, appuyez simplement sur Entrée.
- **Mot de passe PostgreSQL** : avec cette même installation Homebrew, appuyez à nouveau sur Entrée.
  Si vous utilisiez déjà PostgreSQL avec un mot de passe, saisissez votre mot de passe PostgreSQL.
  Ce n’est pas le mot de passe de session de votre Mac.

Le script affiche ensuite les identifiants de l’application :

- Email : **admin@local.test**
- Mot de passe : généré automatiquement et affiché dans votre terminal.

**Notez ce mot de passe avant de fermer la fenêtre.** Le fichier `.env` contient
la configuration locale : gardez-le privé. Une configuration existante n’est pas remplacée.
Le premier téléchargement peut prendre plusieurs minutes.

## À chaque utilisation

1. Double-cliquez sur **LANCER-MAC.command**.
2. Attendez le message Next.js **Ready** dans le terminal.
3. Ouvrez **http://localhost:3000** dans Safari, Chrome ou Firefox.
4. Connectez-vous avec les identifiants notés pendant l’installation.

Gardez la fenêtre du terminal ouverte : elle fait tourner l’application et le worker.
Pour arrêter l’application, appuyez sur **Ctrl+C** dans cette fenêtre. Il s’agit de la
touche Control, pas Command. PostgreSQL reste un service local démarré par Homebrew.

Si le double-clic ne lance pas le fichier, ouvrez Terminal, tapez `cd ` avec un espace,
glissez le dossier du projet dans la fenêtre et appuyez sur Entrée. Puis lancez :

```sh
bash INSTALLER-MAC.command
```

Pour les lancements suivants, utilisez :

```sh
bash LANCER-MAC.command
```

## Créer votre site 3D

1. Recherchez des prospects ou importez une liste dans la base de prospects.
2. Ouvrez **Générateur de sites** et sélectionnez un prospect.
3. Connectez votre IA une première fois dans **Paramètres → IA** (Claude, Codex ou API).
4. Cliquez sur **Créer le site sur mesure**, puis ouvrez le site créé.
5. Dans l’éditeur sur mesure, demandez vos corrections par texte : la page et sa sculpture sont personnalisées.
6. Utilisez **Démo publique** pour voir le résultat ou **Export ZIP** pour récupérer le site.

La génération personnalisée nécessite une IA connectée ; un abonnement Claude/Codex peut être utilisé sans clé API. Les recherches réelles nécessitent Internet.
Les emails restent en mode sandbox : aucun vrai email n’est envoyé.
La démo `localhost` est accessible sur votre Mac ; l’export permet ensuite d’héberger le
site. Le mode de réduction des animations du Mac peut afficher la version sans animation.
Voir [3D Glass](3D-GLASS.md) pour les fonctions et limites.

## Si cela bloque

- **Homebrew introuvable** : installez-le depuis brew.sh, puis relancez l’installateur.
- **Connexion PostgreSQL refusée** : vérifiez le message de `brew services start postgresql@16`.
  Si une autre version occupe déjà le port 5432, utilisez ses identifiants dans `.env`
  plutôt que de lancer une seconde base sur le même port.
- **Authentification PostgreSQL échouée** : corrigez `DATABASE_URL` dans `.env` avec vos
  identifiants PostgreSQL existants, puis relancez l’installateur. Les caractères spéciaux
  du mot de passe doivent être encodés dans cette URL.
- **Port 3000 déjà utilisé** : arrêtez l’autre application ou la précédente fenêtre de lancement.
- **Génération en attente** : gardez le terminal de lancement ouvert ; les erreurs du worker
  apparaissent dans la même fenêtre.

Pour une installation manuelle avec Node.js et PostgreSQL déjà disponibles :

```sh
npm ci
npx playwright install chromium
npm run setup:local
npm run dev:local
```

`dev:local` charge `.env`, applique les migrations et lance le dashboard et le worker ensemble.
Les scripts Node sont contrôlés dans le cloud. L’installation Homebrew et le double-clic
Finder restent à vérifier sur votre Mac.

## Mettre le projet à jour depuis GitHub

Arrêtez l’application avec Ctrl+C dans son terminal. Puis :

```sh
cd ~/Documents/websearch
git switch claude/elegant-einstein-2aqprx
git pull --ff-only origin claude/elegant-einstein-2aqprx
bash INSTALLER-MAC.command
bash LANCER-MAC.command
```

L’installateur actualise les dépendances et conserve `.env`, les identifiants et les données
existantes. Le lancement applique les nouvelles migrations. Si Git refuse la mise à jour
à cause de modifications locales, conservez-les et résolvez le message avant de poursuivre ;
ne réinitialisez pas votre dossier pour forcer la mise à jour.
