import { resetDatabase } from '../src/server/maintenance/reset'
try {
  const result=await resetDatabase({confirm:process.argv.includes('--confirm')})
  if(!result.applied)console.log('Aucune donnée modifiée. Pour effacer les données après sauvegarde : npm run reset:local -- --confirm\nL’application et son moteur doivent être arrêtés. Les réglages et clés enregistrés sur le site seront effacés ; les valeurs du fichier .env restent conservées.')
}catch(error){console.error((error as Error).message);process.exitCode=1}
