import {expect,test} from '@playwright/test'

test('login works without JavaScript and never submits a password in the URL',async({browser,baseURL,request})=>{
 expect((await request.post('/api/auth/login',{headers:{origin:'https://foreign.example.test','sec-fetch-site':'cross-site'},form:{email:'admin@e2e.local',password:'e2e-password-123'}})).status()).toBe(403)
 const context=await browser.newContext({baseURL,javaScriptEnabled:false})
 try {
  const page=await context.newPage()
  const navigations:{method:string;url:string}[]=[]
  page.on('request',r=>{if(r.isNavigationRequest())navigations.push({method:r.method(),url:r.url()})})
  await page.goto('/login?next=%2Fgenerator')
  await page.getByLabel('Email',{exact:true}).fill('admin@e2e.local')
  await page.getByLabel('Mot de passe',{exact:true}).fill('e2e-password-123')
  await page.getByRole('button',{name:'Se connecter'}).click()
  await expect(page).toHaveURL(/\/generator$/)
  expect(navigations.some(r=>r.method==='POST'&&r.url.endsWith('/api/auth/login'))).toBe(true)
  expect(navigations.every(r=>!/[?&](email|password)=/.test(r.url))).toBe(true)
 }finally{await context.close()}
})
