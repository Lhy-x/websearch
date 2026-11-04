import {afterAll,afterEach,beforeEach,expect,it,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {resetDb} from './helpers'
import {closeDb} from '@/server/core/db'
import {setSecret,updateSettings} from '@/server/core/settings'
import {publishO2Site,testO2Connection,mapO2Domain,normalizeCustomerDomain} from '@/server/hosting/o2switch'
const mocks=vi.hoisted(()=>({access:vi.fn(),ensureDir:vi.fn(),uploadFrom:vi.fn(),rename:vi.fn(),remove:vi.fn(),cd:vi.fn(),list:vi.fn(),close:vi.fn(),export:vi.fn(),fetch:vi.fn()}))
vi.mock('basic-ftp',()=>({Client:class{ftp={verbose:false};access=mocks.access;ensureDir=mocks.ensureDir;uploadFrom=mocks.uploadFrom;rename=mocks.rename;remove=mocks.remove;cd=mocks.cd;list=mocks.list;close=mocks.close}}))
vi.mock('@/server/sites/export',()=>({buildSiteFiles:mocks.export}))
beforeEach(async()=>{await resetDb();vi.resetAllMocks();vi.stubGlobal('fetch',mocks.fetch);await updateSettings({hosting:{host:'serveur.o2switch.net',username:'testuser',remoteBase:'/public_html',publicBaseUrl:'https://clients.example.fr',serverIp:'82.165.1.1'}});await setSecret('O2SWITCH_FTP_PASSWORD','fixture-ftps-secret');await setSecret('O2SWITCH_CPANEL_TOKEN','fixture-cpanel-secret');mocks.export.mockResolvedValue({files:[{name:'index.html',data:'<link href="site.css"><img src="assets/photo.jpg">'},{name:'site.css',data:'body{color:black}'},{name:'assets/photo.jpg',data:'test-bytes'},{name:'site.json',data:'private-config'},{name:'README.txt',data:'instructions'}],warnings:[]})})
afterEach(vi.unstubAllGlobals)
afterAll(closeDb)
it('uploads only public files to its order folder over verified FTPS and activates index last',async()=>{
 const id=randomUUID();await publishO2Site(id,{} as never)
 expect(mocks.access).toHaveBeenCalledWith(expect.objectContaining({secure:true,secureOptions:{minVersion:'TLSv1.2',servername:'serveur.o2switch.net'}}))
 expect(mocks.ensureDir.mock.calls.every(([dir])=>String(dir).startsWith('/public_html/pf-sites/'+id))).toBe(true)
 const names=mocks.uploadFrom.mock.calls.map(([,name])=>name)
 expect(names).not.toContain('site.json');expect(names).not.toContain('README.txt')
 expect(names.at(-1)).toMatch(/^\.pf-.*\.tmp$/)
 expect(mocks.rename).toHaveBeenCalledWith(names.at(-1),'index.html')
 expect(mocks.rename.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.uploadFrom.mock.invocationCallOrder.at(-1)!)
 expect(mocks.close).toHaveBeenCalledTimes(1)
})
it('tests account domains and FTP read access without uploading or creating a domain',async()=>{
 mocks.fetch.mockResolvedValue(Response.json({status:1,data:{main_domain:'clients.example.fr'}}))
 await testO2Connection()
 expect(mocks.cd).toHaveBeenCalledWith('/public_html');expect(mocks.list).toHaveBeenCalled()
 expect(mocks.uploadFrom).not.toHaveBeenCalled();expect(mocks.rename).not.toHaveBeenCalled()
 expect(mocks.fetch.mock.calls[0]![0]).toContain('/execute/DomainInfo/list_domains')
})
it('refuses to move an existing domain away from another document root',async()=>{
 mocks.fetch.mockResolvedValue(Response.json({cpanelresult:{event:{result:1},data:[{domain:'client.fr',documentroot:'/home/testuser/public_html/existing'}]}}))
 await expect(mapO2Domain(randomUUID(),'client.fr')).rejects.toThrow('autre dossier')
 expect(mocks.fetch).toHaveBeenCalledTimes(1)
})
it('rejects invalid domain names before any external request',()=>{
 for(const value of ['https://client.fr/path','127.0.0.1','localhost','example.test','../../client.fr'])expect(()=>normalizeCustomerDomain(value)).toThrow()
 expect(normalizeCustomerDomain('WWW.Client.FR.')).toBe('www.client.fr')
})
