import {
  Scissors, Sparkles, Heart, Star, Clock, MapPin, Phone, Mail, Wrench, Zap, Droplet, Shield, Check, Home, Car, Camera, Compass,
  Briefcase, BarChart3, Leaf, Coffee, Utensils, Wheat, Brush, Hammer, Key, Users, Calendar, Truck, Flame, Sun, Layers, type LucideIcon,
} from 'lucide-react'
import type { IconName } from '../schema'

const MAP: Record<IconName, LucideIcon> = {
  scissors: Scissors, sparkles: Sparkles, heart: Heart, star: Star, clock: Clock, map: MapPin, phone: Phone, mail: Mail, wrench: Wrench, zap: Zap,
  droplet: Droplet, shield: Shield, check: Check, home: Home, car: Car, camera: Camera, compass: Compass, briefcase: Briefcase, chart: BarChart3,
  leaf: Leaf, coffee: Coffee, utensils: Utensils, wheat: Wheat, brush: Brush, hammer: Hammer, key: Key, users: Users, calendar: Calendar,
  truck: Truck, flame: Flame, sun: Sun, layers: Layers,
}

export function Icon({ name, size = 22 }: { name?: IconName; size?: number }) {
  const C = MAP[name ?? 'check'] ?? Check
  return <C size={size} strokeWidth={1.6} aria-hidden="true" />
}
