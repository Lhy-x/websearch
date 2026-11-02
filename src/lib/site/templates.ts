import type { IconName, Layout, SiteStyle, SiteTheme } from './schema'

/**
 * Template library. A template = a layout family (structure) + a theme + a section plan + a sector
 * copy library. Copy never states unverifiable facts (no years, prices, reviews, certifications):
 * service lists are marked "indicative" and must be validated with the business.
 */
export interface TemplateFacts {
  name: string
  city: string | null
  sectorLabel: string
  hasPhone: boolean
  hasEmail: boolean
}

type Item = { title: string; description: string; icon?: IconName }

export interface TemplateDef {
  id: string
  name: string
  sector: string
  layout: Layout
  description: string
  defaultStyle: SiteStyle
  theme: SiteTheme
  sectionOrder: ('about' | 'services' | 'benefits' | 'process' | 'gallery' | 'hours' | 'area' | 'faq' | 'cta' | 'contact')[]
  hero: (f: TemplateFacts) => { eyebrow: string; title: string; subtitle: string }
  primaryCtaLabel: string
  about: (f: TemplateFacts) => { title: string; body: string }
  servicesTitle: string
  services: Item[]
  benefitsTitle: string
  benefits: Item[]
  process?: Item[]
  faq: (f: TemplateFacts) => { q: string; a: string }[]
  areaBody: (f: TemplateFacts) => string
}

const where = (f: TemplateFacts) => (f.city ? ` à ${f.city}` : '')
const contactWay = (f: TemplateFacts) => (f.hasPhone ? 'par téléphone' : f.hasEmail ? 'par email' : 'directement')

const theme = (t: Partial<SiteTheme> & Pick<SiteTheme, 'primary' | 'accent' | 'background' | 'surface' | 'text' | 'muted' | 'headingFont' | 'bodyFont'>): SiteTheme => ({
  radius: 'md',
  density: 'comfortable',
  buttonStyle: 'solid',
  headingCase: 'normal',
  ...t,
})

const commonFaq = (f: TemplateFacts, extra: { q: string; a: string }[]) => [
  ...extra,
  { q: 'Comment nous contacter ?', a: `Le plus simple est de nous joindre ${contactWay(f)} : toutes nos coordonnées sont en bas de page.` },
]

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'coiffeur',
    name: 'Coiffeur — Salon',
    sector: 'hair_salon',
    layout: 'salon',
    description: 'Salon de coiffure ou institut : élégant, doux, centré sur la prise de rendez-vous.',
    defaultStyle: 'elegant',
    theme: theme({ primary: '#7a4b5c', accent: '#d9a5a0', background: '#fbf7f4', surface: '#ffffff', text: '#2b2024', muted: '#76676c', headingFont: 'Playfair Display', bodyFont: 'Inter', radius: 'lg', density: 'airy' }),
    sectionOrder: ['about', 'services', 'benefits', 'hours', 'faq', 'contact'],
    hero: (f) => ({ eyebrow: `Salon de coiffure${where(f)}`, title: f.name, subtitle: 'Coupe, couleur et coiffage dans un cadre chaleureux. Prenez le temps de prendre soin de vous.' }),
    primaryCtaLabel: 'Prendre rendez-vous',
    about: (f) => ({ title: 'Le salon', body: `${f.name} vous accueille${where(f)} pour vos coupes, couleurs et coiffages. Chaque prestation commence par un échange pour comprendre vos envies et vous conseiller.` }),
    servicesTitle: 'Prestations',
    services: [
      { title: 'Coupe & brushing', description: 'Coupe personnalisée et mise en forme adaptées à votre style.', icon: 'scissors' },
      { title: 'Couleur', description: 'Coloration, reflets ou balayage selon vos envies.', icon: 'brush' },
      { title: 'Soins', description: 'Soins pour nourrir et protéger vos cheveux.', icon: 'sparkles' },
      { title: 'Coiffage événement', description: 'Chignons et coiffures pour vos occasions particulières.', icon: 'star' },
    ],
    benefitsTitle: 'Pourquoi venir au salon',
    benefits: [
      { title: 'Écoute et conseil', description: 'Un diagnostic avant chaque prestation.', icon: 'heart' },
      { title: 'Sur rendez-vous', description: 'Un créneau réservé pour vous, sans attente.', icon: 'calendar' },
      { title: 'Proximité', description: 'Un salon de quartier facile d’accès.', icon: 'map' },
    ],
    faq: (f) => commonFaq(f, [{ q: 'Faut-il prendre rendez-vous ?', a: `Nous vous recommandons de réserver votre créneau ${contactWay(f)} afin de vous garantir une place.` }]),
    areaBody: (f) => `Le salon se situe${where(f)}.`,
  },
  {
    id: 'barbier',
    name: 'Barbier — Barbershop',
    sector: 'barber',
    layout: 'barber',
    description: 'Barbershop : sombre, contrasté, typographie forte.',
    defaultStyle: 'moderne',
    theme: theme({ primary: '#c8a24a', accent: '#c8a24a', background: '#111111', surface: '#1b1b1b', text: '#f3efe6', muted: '#a8a296', headingFont: 'Bebas Neue', bodyFont: 'Roboto', radius: 'none', buttonStyle: 'solid', headingCase: 'uppercase' }),
    sectionOrder: ['services', 'about', 'benefits', 'hours', 'contact'],
    hero: (f) => ({ eyebrow: `Barbershop${where(f)}`, title: f.name, subtitle: 'Coupes, dégradés et taille de barbe réalisés avec précision.' }),
    primaryCtaLabel: 'Réserver',
    about: (f) => ({ title: 'L’adresse', body: `${f.name} est un barbershop${where(f)} dédié à la coupe homme et à l’entretien de la barbe.` }),
    servicesTitle: 'La carte',
    services: [
      { title: 'Coupe homme', description: 'Ciseaux ou tondeuse, finitions soignées.', icon: 'scissors' },
      { title: 'Dégradé', description: 'Fade, taper, contours nets.', icon: 'layers' },
      { title: 'Taille de barbe', description: 'Mise en forme et contours de la barbe.', icon: 'brush' },
      { title: 'Rasage', description: 'Rasage traditionnel.', icon: 'flame' },
    ],
    benefitsTitle: 'L’esprit',
    benefits: [
      { title: 'Précision', description: 'Le souci du détail sur chaque coupe.', icon: 'check' },
      { title: 'Ambiance', description: 'Un lieu pensé pour se détendre.', icon: 'coffee' },
      { title: 'Rapidité', description: 'Des créneaux organisés pour limiter l’attente.', icon: 'clock' },
    ],
    faq: (f) => commonFaq(f, []),
    areaBody: (f) => `Retrouvez-nous${where(f)}.`,
  },
  {
    id: 'restaurant',
    name: 'Restaurant — Table',
    sector: 'restaurant',
    layout: 'table',
    description: 'Restaurant : ambiance, cuisine, réservation et horaires mis en avant.',
    defaultStyle: 'editorial',
    theme: theme({ primary: '#8c2f1b', accent: '#e0b15c', background: '#fdf8f0', surface: '#ffffff', text: '#2a1a12', muted: '#7d6a5c', headingFont: 'DM Serif Display', bodyFont: 'DM Sans', radius: 'sm' }),
    sectionOrder: ['about', 'services', 'hours', 'cta', 'faq', 'contact'],
    hero: (f) => ({ eyebrow: `Restaurant${where(f)}`, title: f.name, subtitle: 'Une table où l’on prend le temps. Réservez votre moment.' }),
    primaryCtaLabel: 'Réserver une table',
    about: (f) => ({ title: 'La maison', body: `${f.name} vous reçoit${where(f)} pour le déjeuner ou le dîner. La carte et les suggestions du moment sont à découvrir sur place.` }),
    servicesTitle: 'À votre table',
    services: [
      { title: 'Sur place', description: 'Installez-vous et profitez du service en salle.', icon: 'utensils' },
      { title: 'Groupes & occasions', description: 'Contactez-nous pour organiser un repas à plusieurs.', icon: 'users' },
      { title: 'Suggestions du moment', description: 'Demandez les propositions du jour en salle.', icon: 'leaf' },
    ],
    benefitsTitle: 'L’expérience',
    benefits: [],
    faq: (f) => commonFaq(f, [{ q: 'Peut-on réserver ?', a: `Oui, réservez votre table ${contactWay(f)}.` }, { q: 'Accueillez-vous les groupes ?', a: 'Contactez-nous à l’avance pour vérifier les disponibilités.' }]),
    areaBody: (f) => `Le restaurant se trouve${where(f)}.`,
  },
  {
    id: 'cafe',
    name: 'Café — Comptoir',
    sector: 'cafe',
    layout: 'table',
    description: 'Café, salon de thé ou bar : lumineux et convivial.',
    defaultStyle: 'creatif',
    theme: theme({ primary: '#2f5d50', accent: '#f2c46d', background: '#f7f4ec', surface: '#ffffff', text: '#1d2a26', muted: '#62706b', headingFont: 'Fraunces', bodyFont: 'Work Sans', radius: 'lg', buttonStyle: 'pill' }),
    sectionOrder: ['about', 'services', 'hours', 'contact'],
    hero: (f) => ({ eyebrow: `Café${where(f)}`, title: f.name, subtitle: 'Une pause, un café, un moment à partager.' }),
    primaryCtaLabel: 'Nous trouver',
    about: (f) => ({ title: 'Le lieu', body: `${f.name} est un lieu de pause${where(f)}, pour un café le matin ou un moment entre amis.` }),
    servicesTitle: 'Au comptoir',
    services: [
      { title: 'Boissons chaudes', description: 'Cafés, thés et chocolats.', icon: 'coffee' },
      { title: 'Petite restauration', description: 'Demandez la sélection du jour.', icon: 'wheat' },
      { title: 'À emporter', description: 'Pour une pause sur le pouce.', icon: 'sun' },
    ],
    benefitsTitle: '',
    benefits: [],
    faq: (f) => commonFaq(f, []),
    areaBody: (f) => `Retrouvez-nous${where(f)}.`,
  },
  {
    id: 'boulangerie',
    name: 'Boulangerie — Artisanale',
    sector: 'bakery',
    layout: 'bakery',
    description: 'Boulangerie, pâtisserie, boucherie ou traiteur : chaleureux, artisanal.',
    defaultStyle: 'artisanal',
    theme: theme({ primary: '#9a5b1e', accent: '#e8c27a', background: '#fbf3e6', surface: '#fffaf2', text: '#3a2614', muted: '#86705a', headingFont: 'Fraunces', bodyFont: 'Work Sans', radius: 'md' }),
    sectionOrder: ['about', 'services', 'hours', 'area', 'contact'],
    hero: (f) => ({ eyebrow: `Artisan${where(f)}`, title: f.name, subtitle: 'Le goût du fait maison, chaque jour.' }),
    primaryCtaLabel: 'Horaires & accès',
    about: (f) => ({ title: 'La boutique', body: `${f.name} vous accueille${where(f)}. Passez nous voir pour découvrir la production du jour.` }),
    servicesTitle: 'Nos spécialités',
    services: [
      { title: 'Pains', description: 'Une sélection de pains à découvrir en boutique.', icon: 'wheat' },
      { title: 'Viennoiseries', description: 'Pour le petit-déjeuner et le goûter.', icon: 'sun' },
      { title: 'Pâtisseries', description: 'Gâteaux et douceurs.', icon: 'heart' },
      { title: 'Commandes', description: 'Contactez-nous pour vos commandes particulières.', icon: 'calendar' },
    ],
    benefitsTitle: '',
    benefits: [],
    faq: (f) => commonFaq(f, [{ q: 'Peut-on passer commande ?', a: `Contactez la boutique ${contactWay(f)} pour vos commandes.` }]),
    areaBody: (f) => `La boutique se trouve${where(f)}.`,
  },
  {
    id: 'plombier',
    name: 'Plombier — Intervention',
    sector: 'plumber',
    layout: 'trade',
    description: 'Plombier / chauffagiste : téléphone en avant, zone d’intervention, demande de devis.',
    defaultStyle: 'moderne',
    theme: theme({ primary: '#0d4f8b', accent: '#f59e0b', background: '#f5f8fb', surface: '#ffffff', text: '#0f1c2b', muted: '#5b6b7c', headingFont: 'Archivo', bodyFont: 'Archivo', radius: 'md' }),
    sectionOrder: ['services', 'process', 'benefits', 'area', 'faq', 'cta', 'contact'],
    hero: (f) => ({ eyebrow: `Plomberie & chauffage${where(f)}`, title: f.name, subtitle: 'Installation, dépannage et entretien. Expliquez-nous votre besoin, nous vous répondons rapidement.' }),
    primaryCtaLabel: 'Appeler',
    about: (f) => ({ title: 'Votre artisan', body: `${f.name} intervient${where(f)} et alentours pour vos travaux de plomberie et de chauffage.` }),
    servicesTitle: 'Interventions',
    services: [
      { title: 'Dépannage', description: 'Fuite, canalisation bouchée, panne d’eau chaude.', icon: 'wrench' },
      { title: 'Installation sanitaire', description: 'Salle de bain, WC, robinetterie.', icon: 'droplet' },
      { title: 'Chauffage', description: 'Installation et entretien de chaudières et radiateurs.', icon: 'flame' },
      { title: 'Rénovation', description: 'Remise à neuf de vos installations.', icon: 'home' },
    ],
    benefitsTitle: 'Nos engagements',
    benefits: [
      { title: 'Devis clair', description: 'Un devis détaillé avant intervention.', icon: 'check' },
      { title: 'Réactivité', description: 'Une réponse rapide à votre demande.', icon: 'clock' },
      { title: 'Travail soigné', description: 'Un chantier propre et rangé.', icon: 'shield' },
    ],
    process: [
      { title: 'Vous nous contactez', description: 'Décrivez votre besoin.', icon: 'phone' },
      { title: 'Diagnostic & devis', description: 'Nous évaluons et chiffrons l’intervention.', icon: 'compass' },
      { title: 'Intervention', description: 'Réalisation des travaux convenus.', icon: 'wrench' },
    ],
    faq: (f) => commonFaq(f, [{ q: 'Intervenez-vous en urgence ?', a: `Contactez-nous ${contactWay(f)} : nous vous indiquerons nos disponibilités.` }, { q: 'Le devis est-il gratuit ?', a: 'Demandez-nous les conditions lors de votre premier contact.' }]),
    areaBody: (f) => `Nous intervenons${where(f)} et dans les communes alentour.`,
  },
  {
    id: 'electricien',
    name: 'Électricien — Intervention',
    sector: 'electrician',
    layout: 'trade',
    description: 'Électricien : énergique, mise aux normes, dépannage.',
    defaultStyle: 'moderne',
    theme: theme({ primary: '#1f2937', accent: '#facc15', background: '#f9fafb', surface: '#ffffff', text: '#111827', muted: '#6b7280', headingFont: 'Space Grotesk', bodyFont: 'Inter', radius: 'sm' }),
    sectionOrder: ['services', 'benefits', 'process', 'area', 'faq', 'contact'],
    hero: (f) => ({ eyebrow: `Électricité générale${where(f)}`, title: f.name, subtitle: 'Installation, rénovation et dépannage électrique pour particuliers et professionnels.' }),
    primaryCtaLabel: 'Demander un devis',
    about: (f) => ({ title: 'Votre électricien', body: `${f.name} réalise vos travaux électriques${where(f)}.` }),
    servicesTitle: 'Prestations',
    services: [
      { title: 'Dépannage électrique', description: 'Panne, disjoncteur, court-circuit.', icon: 'zap' },
      { title: 'Mise en conformité', description: 'Remise aux normes de votre installation.', icon: 'shield' },
      { title: 'Rénovation', description: 'Tableau électrique, prises, éclairage.', icon: 'home' },
      { title: 'Éclairage', description: 'Intérieur et extérieur.', icon: 'sun' },
    ],
    benefitsTitle: 'Pourquoi nous choisir',
    benefits: [
      { title: 'Sécurité', description: 'Des installations réalisées dans les règles.', icon: 'shield' },
      { title: 'Transparence', description: 'Un devis détaillé avant travaux.', icon: 'check' },
      { title: 'Proximité', description: 'Un artisan local.', icon: 'map' },
    ],
    process: [
      { title: 'Prise de contact', description: 'Expliquez votre projet ou votre panne.', icon: 'phone' },
      { title: 'Visite & devis', description: 'Évaluation sur place si nécessaire.', icon: 'compass' },
      { title: 'Réalisation', description: 'Travaux et contrôle final.', icon: 'zap' },
    ],
    faq: (f) => commonFaq(f, []),
    areaBody: (f) => `Zone d’intervention :${where(f) || ' secteur local'} et environs.`,
  },
  {
    id: 'garage',
    name: 'Garage automobile',
    sector: 'garage',
    layout: 'trade',
    description: 'Garage : industriel, sombre, prise de rendez-vous atelier.',
    defaultStyle: 'moderne',
    theme: theme({ primary: '#d62828', accent: '#d62828', background: '#f2f2f0', surface: '#ffffff', text: '#161616', muted: '#5f5f5f', headingFont: 'Oswald', bodyFont: 'Inter', radius: 'none', headingCase: 'uppercase' }),
    sectionOrder: ['services', 'benefits', 'hours', 'faq', 'contact'],
    hero: (f) => ({ eyebrow: `Garage${where(f)}`, title: f.name, subtitle: 'Entretien, réparation et diagnostic de votre véhicule.' }),
    primaryCtaLabel: 'Prendre rendez-vous',
    about: (f) => ({ title: 'L’atelier', body: `${f.name} entretient et répare votre véhicule${where(f)}.` }),
    servicesTitle: 'L’atelier',
    services: [
      { title: 'Entretien & révision', description: 'Vidange, filtres, contrôle des niveaux.', icon: 'wrench' },
      { title: 'Freinage', description: 'Plaquettes, disques, liquide de frein.', icon: 'shield' },
      { title: 'Pneumatiques', description: 'Montage, équilibrage, parallélisme.', icon: 'car' },
      { title: 'Diagnostic', description: 'Recherche de panne et voyants.', icon: 'chart' },
    ],
    benefitsTitle: 'Au garage',
    benefits: [
      { title: 'Devis avant travaux', description: 'Vous validez avant toute intervention.', icon: 'check' },
      { title: 'Conseil', description: 'Des explications claires sur votre véhicule.', icon: 'users' },
      { title: 'Rendez-vous', description: 'Un créneau atelier planifié.', icon: 'calendar' },
    ],
    faq: (f) => commonFaq(f, [{ q: 'Faut-il prendre rendez-vous ?', a: `Oui, contactez l’atelier ${contactWay(f)} pour planifier l’intervention.` }]),
    areaBody: (f) => `Le garage est situé${where(f)}.`,
  },
  {
    id: 'nettoyage',
    name: 'Entreprise de nettoyage',
    sector: 'cleaning',
    layout: 'trade',
    description: 'Nettoyage : clair, aéré, rassurant, orienté devis.',
    defaultStyle: 'minimaliste',
    theme: theme({ primary: '#0e7c86', accent: '#7dd3c0', background: '#f4fbfb', surface: '#ffffff', text: '#0f2a2c', muted: '#5a7577', headingFont: 'Manrope', bodyFont: 'Manrope', radius: 'lg', density: 'airy', buttonStyle: 'pill' }),
    sectionOrder: ['services', 'process', 'benefits', 'area', 'faq', 'contact'],
    hero: (f) => ({ eyebrow: `Nettoyage professionnel${where(f)}`, title: f.name, subtitle: 'Entretien de bureaux, commerces, parties communes et logements.' }),
    primaryCtaLabel: 'Demander un devis',
    about: (f) => ({ title: 'Qui sommes-nous', body: `${f.name} propose des prestations de nettoyage${where(f)}.` }),
    servicesTitle: 'Prestations',
    services: [
      { title: 'Bureaux & locaux', description: 'Entretien régulier de vos espaces de travail.', icon: 'briefcase' },
      { title: 'Parties communes', description: 'Halls, escaliers, ascenseurs.', icon: 'home' },
      { title: 'Vitrerie', description: 'Nettoyage des vitres et surfaces vitrées.', icon: 'sun' },
      { title: 'Fin de chantier', description: 'Remise en état après travaux.', icon: 'hammer' },
    ],
    benefitsTitle: 'Notre approche',
    benefits: [
      { title: 'Sur mesure', description: 'Une fréquence adaptée à vos besoins.', icon: 'calendar' },
      { title: 'Fiabilité', description: 'Un interlocuteur unique.', icon: 'users' },
      { title: 'Soin', description: 'Des méthodes adaptées à chaque surface.', icon: 'leaf' },
    ],
    process: [
      { title: 'Échange', description: 'Nous analysons vos besoins.', icon: 'phone' },
      { title: 'Proposition', description: 'Un devis adapté à vos locaux.', icon: 'compass' },
      { title: 'Mise en place', description: 'Démarrage des prestations.', icon: 'check' },
    ],
    faq: (f) => commonFaq(f, [{ q: 'Intervenez-vous chez les particuliers ?', a: 'Contactez-nous pour en discuter selon votre besoin.' }]),
    areaBody: (f) => `Nous intervenons${where(f)} et dans les environs.`,
  },
  {
    id: 'immobilier',
    name: 'Agence immobilière',
    sector: 'real_estate',
    layout: 'corporate',
    description: 'Immobilier : institutionnel, confiance, estimation.',
    defaultStyle: 'premium',
    theme: theme({ primary: '#1d3557', accent: '#c9a227', background: '#f8f9fb', surface: '#ffffff', text: '#14213d', muted: '#5c677d', headingFont: 'Josefin Sans', bodyFont: 'Nunito Sans', radius: 'sm' }),
    sectionOrder: ['about', 'services', 'process', 'area', 'cta', 'contact'],
    hero: (f) => ({ eyebrow: `Agence immobilière${where(f)}`, title: f.name, subtitle: 'Vente, achat, location : un accompagnement local pour votre projet immobilier.' }),
    primaryCtaLabel: 'Estimer mon bien',
    about: (f) => ({ title: 'L’agence', body: `${f.name} accompagne vendeurs, acquéreurs et propriétaires${where(f)}.` }),
    servicesTitle: 'Nos services',
    services: [
      { title: 'Vente', description: 'Mise en valeur et commercialisation de votre bien.', icon: 'key' },
      { title: 'Achat', description: 'Recherche de biens selon vos critères.', icon: 'home' },
      { title: 'Location & gestion', description: 'Mise en location et suivi.', icon: 'briefcase' },
      { title: 'Estimation', description: 'Une estimation fondée sur le marché local.', icon: 'chart' },
    ],
    benefitsTitle: '',
    benefits: [],
    process: [
      { title: 'Premier rendez-vous', description: 'Nous définissons votre projet.', icon: 'users' },
      { title: 'Stratégie', description: 'Prix, mise en valeur, diffusion.', icon: 'compass' },
      { title: 'Accompagnement', description: 'Jusqu’à la signature.', icon: 'check' },
    ],
    faq: (f) => commonFaq(f, []),
    areaBody: (f) => `Secteur couvert :${where(f) || ' local'} et alentours.`,
  },
  {
    id: 'architecte',
    name: 'Architecte — Studio',
    sector: 'architect',
    layout: 'studio',
    description: 'Architecte / designer : éditorial, minimal, grandes typographies.',
    defaultStyle: 'minimaliste',
    theme: theme({ primary: '#1a1a1a', accent: '#b5651d', background: '#f4f2ee', surface: '#ffffff', text: '#1a1a1a', muted: '#6e6a63', headingFont: 'DM Serif Display', bodyFont: 'DM Sans', radius: 'none', density: 'airy', buttonStyle: 'outline' }),
    sectionOrder: ['about', 'services', 'process', 'gallery', 'contact'],
    hero: (f) => ({ eyebrow: `Architecture${where(f)}`, title: f.name, subtitle: 'Concevoir des lieux justes, à l’écoute de ceux qui les habitent.' }),
    primaryCtaLabel: 'Parler de votre projet',
    about: (f) => ({ title: 'L’agence', body: `${f.name} accompagne les projets de construction, de rénovation et d’aménagement${where(f)}.` }),
    servicesTitle: 'Missions',
    services: [
      { title: 'Conception', description: 'Esquisse, avant-projet, projet.', icon: 'compass' },
      { title: 'Permis de construire', description: 'Constitution et dépôt du dossier.', icon: 'layers' },
      { title: 'Suivi de chantier', description: 'Coordination des entreprises.', icon: 'hammer' },
      { title: 'Aménagement intérieur', description: 'Optimisation des espaces.', icon: 'home' },
    ],
    benefitsTitle: '',
    benefits: [],
    process: [
      { title: 'Écoute', description: 'Comprendre le programme et le site.', icon: 'users' },
      { title: 'Conception', description: 'Explorer et dessiner.', icon: 'brush' },
      { title: 'Réalisation', description: 'Accompagner jusqu’à la livraison.', icon: 'check' },
    ],
    faq: (f) => commonFaq(f, []),
    areaBody: (f) => `Basé${where(f)}.`,
  },
  {
    id: 'conseil',
    name: 'Cabinet de conseil',
    sector: 'consulting',
    layout: 'corporate',
    description: 'Conseil / services B2B : sobre, structuré, crédible.',
    defaultStyle: 'institutionnel',
    theme: theme({ primary: '#243b53', accent: '#3ebd93', background: '#ffffff', surface: '#f5f7fa', text: '#102a43', muted: '#627d98', headingFont: 'Libre Baskerville', bodyFont: 'Source Sans 3', radius: 'sm' }),
    sectionOrder: ['about', 'services', 'process', 'faq', 'contact'],
    hero: (f) => ({ eyebrow: `Conseil${where(f)}`, title: f.name, subtitle: 'Un regard extérieur et des méthodes concrètes pour faire avancer vos projets.' }),
    primaryCtaLabel: 'Prendre contact',
    about: (f) => ({ title: 'Le cabinet', body: `${f.name} accompagne les dirigeants et les équipes${where(f)}.` }),
    servicesTitle: 'Expertises',
    services: [
      { title: 'Diagnostic', description: 'État des lieux et priorités.', icon: 'chart' },
      { title: 'Stratégie', description: 'Définition d’objectifs et de plans d’action.', icon: 'compass' },
      { title: 'Accompagnement', description: 'Mise en œuvre aux côtés de vos équipes.', icon: 'users' },
    ],
    benefitsTitle: '',
    benefits: [],
    process: [
      { title: 'Cadrage', description: 'Comprendre votre contexte.', icon: 'briefcase' },
      { title: 'Recommandations', description: 'Des propositions concrètes.', icon: 'layers' },
      { title: 'Suivi', description: 'Mesurer et ajuster.', icon: 'chart' },
    ],
    faq: (f) => commonFaq(f, []),
    areaBody: (f) => `Basé${where(f)}.`,
  },
  {
    id: 'photographe',
    name: 'Photographe — Portfolio',
    sector: 'photographer',
    layout: 'studio',
    description: 'Photographe : sombre, visuel, galerie en avant.',
    defaultStyle: 'creatif',
    theme: theme({ primary: '#f5f5f4', accent: '#e76f51', background: '#0c0c0c', surface: '#161616', text: '#f5f5f4', muted: '#a3a3a3', headingFont: 'Sora', bodyFont: 'Inter', radius: 'none', density: 'airy', buttonStyle: 'outline' }),
    sectionOrder: ['gallery', 'about', 'services', 'contact'],
    hero: (f) => ({ eyebrow: `Photographe${where(f)}`, title: f.name, subtitle: 'Portraits, événements et reportages.' }),
    primaryCtaLabel: 'Me contacter',
    about: (f) => ({ title: 'À propos', body: `${f.name}, photographe${where(f)}.` }),
    servicesTitle: 'Prestations',
    services: [
      { title: 'Portrait', description: 'Séances individuelles, famille, professionnel.', icon: 'camera' },
      { title: 'Événements', description: 'Mariages, fêtes, événements d’entreprise.', icon: 'calendar' },
      { title: 'Reportage', description: 'Commerce, artisanat, corporate.', icon: 'briefcase' },
    ],
    benefitsTitle: '',
    benefits: [],
    faq: (f) => commonFaq(f, []),
    areaBody: (f) => `Basé${where(f)}.`,
  },
  {
    id: 'artisan',
    name: 'Artisan du bâtiment',
    sector: 'artisan',
    layout: 'trade',
    description: 'Menuisier, peintre, maçon, couvreur… : robuste, concret, chantier.',
    defaultStyle: 'artisanal',
    theme: theme({ primary: '#5b3a1e', accent: '#e07a2f', background: '#f7f3ee', surface: '#ffffff', text: '#2a1d12', muted: '#7a6a5b', headingFont: 'Fraunces', bodyFont: 'Work Sans', radius: 'sm' }),
    sectionOrder: ['services', 'process', 'benefits', 'gallery', 'area', 'contact'],
    hero: (f) => ({ eyebrow: `Artisan${where(f)}`, title: f.name, subtitle: 'Travaux réalisés avec soin, du premier échange à la fin du chantier.' }),
    primaryCtaLabel: 'Demander un devis',
    about: (f) => ({ title: 'L’entreprise', body: `${f.name} réalise vos travaux${where(f)} et alentours.` }),
    servicesTitle: 'Travaux',
    services: [
      { title: 'Rénovation', description: 'Remise à neuf intérieure et extérieure.', icon: 'hammer' },
      { title: 'Neuf', description: 'Réalisation de vos projets de construction.', icon: 'home' },
      { title: 'Petits travaux', description: 'Réparations et interventions ponctuelles.', icon: 'wrench' },
    ],
    benefitsTitle: 'Nos engagements',
    benefits: [
      { title: 'Devis détaillé', description: 'Chaque poste expliqué.', icon: 'check' },
      { title: 'Chantier propre', description: 'Respect des lieux.', icon: 'shield' },
      { title: 'Interlocuteur unique', description: 'Du devis à la réception.', icon: 'users' },
    ],
    process: [
      { title: 'Visite', description: 'Nous étudions votre projet sur place.', icon: 'compass' },
      { title: 'Devis', description: 'Une proposition chiffrée détaillée.', icon: 'check' },
      { title: 'Chantier', description: 'Réalisation et réception des travaux.', icon: 'hammer' },
    ],
    faq: (f) => commonFaq(f, []),
    areaBody: (f) => `Nous intervenons${where(f)} et dans les communes voisines.`,
  },
  {
    id: 'generique',
    name: 'Générique — Commerce local',
    sector: 'generic',
    layout: 'corporate',
    description: 'Template neutre pour tout commerce ou service local.',
    defaultStyle: 'moderne',
    theme: theme({ primary: '#3b5bdb', accent: '#fab005', background: '#ffffff', surface: '#f8f9fa', text: '#212529', muted: '#6c757d', headingFont: 'Space Grotesk', bodyFont: 'Inter', radius: 'md' }),
    sectionOrder: ['about', 'services', 'hours', 'faq', 'contact'],
    hero: (f) => ({ eyebrow: `${f.sectorLabel}${where(f)}`, title: f.name, subtitle: 'Bienvenue ! Découvrez nos services et contactez-nous simplement.' }),
    primaryCtaLabel: 'Nous contacter',
    about: (f) => ({ title: 'Qui sommes-nous', body: `${f.name} vous accueille${where(f)}.` }),
    servicesTitle: 'Nos services',
    services: [
      { title: 'Conseil', description: 'Nous prenons le temps de comprendre votre besoin.', icon: 'users' },
      { title: 'Service', description: 'Des prestations adaptées.', icon: 'check' },
      { title: 'Proximité', description: 'Un commerce local.', icon: 'map' },
    ],
    benefitsTitle: '',
    benefits: [],
    faq: (f) => commonFaq(f, []),
    areaBody: (f) => `Retrouvez-nous${where(f)}.`,
  },
]

export const TEMPLATE_BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]))

export function templateForSector(sectorTemplateId: string | null | undefined): TemplateDef {
  return TEMPLATE_BY_ID.get(sectorTemplateId ?? '') ?? TEMPLATE_BY_ID.get('generique')!
}
