import { z } from 'zod'

const text = z.string().trim().max(500).refine(v => !/[\r\n\0]/.test(v), 'Valeur invalide')
const publicUrl = z.string().trim().url().refine(value => {
  const u = new URL(value)
  return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash
}, 'Utilisez une adresse http(s) sans chemin ni identifiants, par exemple https://mon-site.fr')
const endpoint = z.string().trim().url().refine(value => { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password }, 'Adresse http(s) requise')
export const runtimeValuesSchema = z.object({
  APP_BASE_URL: publicUrl,
  EMAIL_PROVIDER: z.enum(['sandbox', 'resend', 'smtp']),
  SMTP_HOST: text,
  SMTP_PORT: z.number().int().min(1).max(65535),
  SMTP_USER: text,
  SMTP_SECURE: z.boolean(),
  IMAP_HOST: text,
  IMAP_PORT: z.number().int().min(1).max(65535),
  IMAP_USER: text,
  IMAP_SECURE: z.boolean(),
  OVERPASS_URL: endpoint,
  OVERTURE_RELEASE: z.string().trim().regex(/^$|^\d{4}-\d{2}-\d{2}\.\d+$/, 'Format attendu : AAAA-MM-JJ.numéro, ou vide pour automatique'),
  CRAWLER_CONTACT: text,
  WORKER_CONCURRENCY: z.number().int().min(1).max(16),
  CLAUDE_CLI_PATH: text,
  CODEX_CLI_PATH: text,
})
export const runtimeOverridesSchema = z.object(Object.fromEntries(Object.entries(runtimeValuesSchema.shape).map(([key, value]) => [key, z.nullable(value).default(null)])) as { [K in keyof typeof runtimeValuesSchema.shape]: z.ZodDefault<z.ZodNullable<(typeof runtimeValuesSchema.shape)[K]>> })
export type RuntimeConfig = z.infer<typeof runtimeValuesSchema>

export const SECRET_GUIDES = [
  { key: 'ANTHROPIC_API_KEY', group: 'IA', title: 'Anthropic · Claude', description: 'Pour générer avec l’API Claude, facturée à l’usage.', url: 'https://platform.claude.com/settings/keys', steps: ['Ouvrez votre console Anthropic et activez la facturation de l’API.', 'Créez une clé dédiée au projet et collez-la ici.', 'Dans « Mon IA », choisissez Anthropic, enregistrez puis utilisez le test de connexion.'] },
  { key: 'OPENAI_API_KEY', group: 'IA', title: 'OpenAI', description: 'Pour l’API OpenAI. La facturation API est distincte de l’abonnement ChatGPT.', url: 'https://platform.openai.com/api-keys', steps: ['Ouvrez la plateforme OpenAI et configurez la facturation API.', 'Créez une clé de projet avec les autorisations nécessaires à la génération.', 'Collez-la ici, puis choisissez OpenAI et vos modèles dans « Mon IA ».'] },
  { key: 'OPENROUTER_API_KEY', group: 'IA', title: 'OpenRouter', description: 'Pour utiliser les modèles proposés par OpenRouter.', url: 'https://openrouter.ai/settings/keys', steps: ['Ajoutez des crédits dans OpenRouter.', 'Créez une clé avec une limite de dépenses.', 'Collez-la ici et choisissez OpenRouter et vos modèles dans « Mon IA ».'] },
  { key: 'GOOGLE_PLACES_API_KEY', group: 'Recherche', title: 'Google Places', description: 'Facultatif. Les sources publiques restent utilisables sans cette clé.', url: 'https://console.cloud.google.com/apis/library/places.googleapis.com', steps: ['Dans Google Cloud, sélectionnez un projet avec la facturation activée.', 'Activez Places API (New), puis créez une clé dans « Identifiants ».', 'Restreignez-la à Places API et, si possible, à l’adresse IP de votre serveur. Activez ensuite Google Places dans les sources de recherche.'] },
  { key: 'INSEE_SIRENE_API_KEY', group: 'Recherche', title: 'INSEE Sirene · option avancée', description: 'Clé conservée pour vos intégrations Sirene. Le connecteur public actuel Recherche d’entreprises ne l’utilise pas et ne nécessite aucune clé.', url: 'https://portail-api.insee.fr/', steps: ['La recherche publique fonctionne sans clé INSEE : laissez ce champ vide pour ce parcours.', 'Si vous utilisez une intégration Sirene distincte, obtenez ses identifiants depuis le portail INSEE.', 'Enregistrer cette clé seule n’active pas un nouveau connecteur dans l’application.'] },
  { key: 'STRIPE_SECRET_KEY', group: 'Paiement', title: 'Stripe · clé secrète', description: 'Pour ouvrir le paiement Checkout. Commencez en mode test.', url: 'https://dashboard.stripe.com/test/apikeys', steps: ['Ouvrez les clés API Stripe en mode test et copiez la clé secrète sk_test_…', 'Collez-la ici ou dans l’onglet Paiement.', 'Définissez votre prix et le webhook avant d’activer le bouton. Passez aux clés réelles uniquement après un essai de bout en bout.'] },
  { key: 'STRIPE_WEBHOOK_SECRET', group: 'Paiement', title: 'Stripe · signature du webhook', description: 'Permet de vérifier les confirmations de paiement et de récupérer les factures.', url: 'https://dashboard.stripe.com/test/webhooks', steps: ['Sur votre Mac : Paramètres → Paiement → Générer et démarrer récupère et enregistre le secret de test automatiquement avec le CLI Stripe installé.', 'Pour un webhook permanent, créez un endpoint Stripe vers votre adresse publique suivie de /api/webhooks/stripe. Les événements sont listés dans Paramètres → Paiement.', 'Copiez son secret de signature whsec_… ici. Les secrets du relais local et du webhook permanent sont distincts.'] },
  { key: 'RESEND_API_KEY', group: 'Email', title: 'Resend · envoi', description: 'Pour envoyer les emails de campagne via Resend.', url: 'https://resend.com/api-keys', steps: ['Vérifiez votre domaine dans Resend et ajoutez les enregistrements DNS demandés.', 'Créez une clé ayant l’autorisation d’envoyer sur ce domaine.', 'Collez-la ici, sélectionnez Resend dans les réglages de connexion et renseignez votre expéditeur dans « Mes emails ».'] },
  { key: 'RESEND_WEBHOOK_SECRET', group: 'Email', title: 'Resend · suivi des envois', description: 'Pour vérifier les événements de livraison et de rebond.', url: 'https://resend.com/webhooks', steps: ['Dans Mes emails, le bouton « Créer le webhook Resend » configure les événements et enregistre le secret automatiquement avec une clé API Full access.', 'Renseignez une adresse HTTPS publique ; sur Mac, le mini tuto explique comment utiliser un tunnel vers localhost.', 'Vous pouvez aussi créer le webhook manuellement dans Resend vers /api/webhooks/resend et coller son secret ici. Le suivi des livraisons ne remplace pas la réception IMAP des réponses.'] },
  { key: 'SMTP_PASSWORD', group: 'Email', title: 'SMTP · mot de passe', description: 'Pour envoyer avec votre fournisseur de messagerie.', url: 'https://support.google.com/accounts/answer/185833?hl=fr', steps: ['Récupérez le serveur SMTP, le port et l’identifiant auprès de votre hébergeur email.', 'Utilisez un mot de passe d’application si votre fournisseur le demande, notamment avec une authentification à deux facteurs.', 'Renseignez aussi l’hôte et le port ci-dessous. Le port 465 utilise généralement le TLS direct ; le port 587 utilise STARTTLS.'] },
  { key: 'IMAP_PASSWORD', group: 'Email', title: 'IMAP · réception', description: 'Pour relever les réponses à vos propositions.', url: 'https://support.google.com/mail/answer/7126229?hl=fr', steps: ['Activez IMAP chez votre fournisseur si nécessaire.', 'Renseignez son serveur, votre adresse et généralement le port 993 avec TLS.', 'Collez le mot de passe d’application ici. Le moteur de traitement relèvera la boîte périodiquement.'] },
  { key: 'INBOUND_WEBHOOK_SECRET', group: 'Email', title: 'Webhook de réception · secret partagé', description: 'Facultatif : pour un adaptateur qui transmet des réponses à /api/webhooks/inbound.', url: null, steps: ['Générez un secret dédié avec le bouton ci-dessous.', 'Configurez votre adaptateur pour envoyer Authorization: Bearer suivi de ce secret.', 'L’adaptateur doit transmettre le JSON attendu. Ce champ seul ne connecte pas automatiquement une boîte email.'] },
] as const
