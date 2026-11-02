import { googlePlacesConnector } from './google-places'
import { osmConnector } from './osm'
import { overtureConnector } from './overture'
import { rechercheEntreprisesConnector } from './recherche-entreprises'
import type { Connector, SourceId } from './types'

export const CONNECTORS: Connector[] = [overtureConnector, rechercheEntreprisesConnector, osmConnector, googlePlacesConnector]
export const CONNECTOR_BY_ID = new Map<SourceId, Connector>(CONNECTORS.map((c) => [c.id, c]))
