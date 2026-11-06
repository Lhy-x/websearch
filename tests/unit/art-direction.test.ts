import {expect,it} from 'vitest'
import {directionFacts,validateArtDirection,conceptsTooClose} from '@/server/sites/bespoke/direction'
import {checkPersonalization} from '@/server/sites/bespoke/personalization-checks'
import {buildBespokePrompt,buildRevisionPrompt} from '@/server/sites/bespoke/prompt'
import type {BusinessFacts} from '@/lib/site/facts'
import type {CreativeConcept} from '@/lib/site/art-direction'
const facts:BusinessFacts={businessId:'b',name:'Atelier Végétal',sector:'hair_salon',sectorLabel:'Coiffeur',templateId:'coiffeur',city:'Rouen',address:'Rue des plantes',postcode:'76000',phoneE164:null,phoneDisplay:null,email:null,emailStatus:'NONE',lat:null,lon:null,socials:[],openingHours:null,websiteStatus:'NO_WEBSITE_KNOWN',websiteUrl:null,auditFindings:[],publicDetails:'Coloration végétale et coupe à sec sur rendez-vous.'}
const concept:CreativeConcept={name:'Herbier des gestes',idea:'Un herbier typographique fondé sur la coloration végétale publiée.',hero:'Titre très ample au-dessus d’une composition botanique décentrée.',sections:[{purpose:'Présenter les soins publiés',title:'Le végétal',layout:'Longues légendes en alternance dans une colonne.'},{purpose:'Permettre un rendez-vous',title:'Votre visite',layout:'Grand bandeau de contact avec une marge ouverte.'}],typography:{display:'Fraunces',body:'Georgia'},palette:['#fbfaf5','#15382b','#a1b36c','#efdcba'],scene:{symbol:'Une feuille pliée dessinée pour ce salon.',placement:'Dans une marge à côté des légendes.',presentation:{fragments:3,depth:.2,bevel:.02,rotation:.3,spread:.4,turn:-.3,roughness:.2,exposure:1.4,transparent:true,accent:'none'}}}
function response(){return {evidence:[{id:'name',quote:facts.name,decision:'Le nom guide une identité d’atelier.'},{id:'city',quote:'Rouen',decision:'Le lieu devient un repère pratique.'},{id:'publicDetails',quote:'Coloration végétale',decision:'Le végétal guide la sculpture et les légendes.'}],candidates:[concept,{...concept,hero:'Une affiche radiale avec titre vertical et navigation à droite.',typography:{display:'Bodoni Moda',body:'Manrope'}},{...concept,hero:'Une petite introduction au bas d’une grande scène panoramique.',typography:{display:'Syne',body:'Karla'}}],selected:0,rationale:'Le traitement botanique exprime la prestation végétale effectivement publiée.'}}
it('requires exact factual anchors and uses the strongest available company detail',()=>{
 expect(validateArtDirection(response(),facts).concept.name).toBe('Herbier des gestes')
 const invented=response();invented.evidence[2]!.quote='Un label bio inventé'
 expect(()=>validateArtDirection(invented,facts)).toThrow('faits distincts')
 const generic=response();generic.evidence[2]={id:'activity',quote:'Coiffeur',decision:'Le métier donne des pistes graphiques.'}
 expect(()=>validateArtDirection(generic,facts)).toThrow('ignore les détails')
 expect(directionFacts(facts).publicDetails).toContain('végétale')
})
it('does not accept three cosmetic versions of the same creative proposal',()=>{
 const duplicated=response();duplicated.candidates=[concept,{...concept,name:'Même page rouge'}, {...concept,name:'Même page bleue'}]
 expect(()=>validateArtDirection(duplicated,facts)).toThrow('trois architectures distinctes')
 expect(conceptsTooClose(concept,{...concept,palette:['#ffffff','#000000','#ff0000','#00ff00']})).toBe(true)
})
it('requires the company-specific copy and typography to survive HTML generation',()=>{
 const direction=validateArtDirection(response(),facts)
 const generic='<html><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces&amp;display=swap"><style>body{font-family:Georgia}h1{font-family:Fraunces}</style><body><h1>Atelier Végétal</h1><p>Un salon de coiffure accueillant.</p></body></html>'
 expect(checkPersonalization(generic,direction).map(issue=>issue.code)).toContain('design_facts_unused')
 expect(checkPersonalization(generic.replace('Un salon de coiffure accueillant.','Découvrez notre coloration végétale sur rendez-vous.'),direction)).toEqual([])
 expect(checkPersonalization(generic.replaceAll('Fraunces','Arial'),direction).map(issue=>issue.code)).toContain('design_typography_ignored')
 expect(checkPersonalization(generic.replace(/<link[^>]+>/,''),direction).map(issue=>issue.code)).toContain('design_font_missing')
})
it('keeps rich facts in correction prompts and never supplies a catalogue of generic services',()=>{
 expect(buildBespokePrompt(facts,{})).not.toContain('Prestations typiques du métier')
 expect(buildRevisionPrompt('<h1>Test</h1>',facts,{})).toContain('Coloration végétale et coupe à sec')
})
