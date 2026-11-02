import { sql } from './core/db'
import { TEMPLATES } from '@/lib/site/templates'

/** Idempotent seed of reference data (templates registry, default offer & strategy). */
export async function seedDefaults() {
  const db = sql()
  for (const t of TEMPLATES) {
    await db`insert into website_templates (id, name, sector, layout, description) values (${t.id}, ${t.name}, ${t.sector}, ${t.layout}, ${t.description})
             on conflict (id) do update set name = excluded.name, sector = excluded.sector, layout = excluded.layout, description = excluded.description`
  }
  const [{ n } = { n: 0 }] = await db<{ n: number }[]>`select count(*)::int as n from sales_offers`
  if (n === 0) {
    await db`insert into sales_offers (name, kind, description, price_cents) values
      ('Site vitrine', 'vitrine', 'Site vitrine responsive (5 sections), nom de domaine et hébergement la première année, mise en ligne sous 10 jours.', null),
      ('Refonte de site', 'refonte', 'Refonte complète du site existant : design moderne, mobile, vitesse et référencement de base.', null),
      ('Site + maintenance', 'maintenance', 'Site vitrine + maintenance mensuelle (mises à jour, sauvegardes, petites modifications).', null),
      ('Site + SEO local', 'seo_local', 'Site vitrine + optimisation du référencement local (fiche d’établissement, pages locales).', null),
      ('Site + prise de rendez-vous', 'booking', 'Site vitrine avec module de prise de rendez-vous en ligne.', null)`
  }
  const [{ s } = { s: 0 }] = await db<{ s: number }[]>`select count(*)::int as s from prompt_strategies`
  if (s === 0) {
    await db`insert into prompt_strategies (name, instructions, tone, is_default) values
      ('Démonstration offerte', 'Mettre en avant la démonstration déjà réalisée pour l’établissement. Proposer un échange de 15 minutes. Rester bref et factuel.', 'professionnel', true),
      ('Audit du site existant', 'S’appuyer uniquement sur les constats vérifiés de l’audit (2 ou 3 maximum). Proposer une refonte sans dénigrer le prestataire actuel.', 'professionnel', false)`
  }
}
