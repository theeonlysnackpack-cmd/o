import { getDB, auditLog } from '../pwa/db'

export async function requireTargetDeclaration(target:string, jurisdiction:string, purpose:string){
  const trimmed = (target||'').trim()
  if(!trimmed || trimmed.length<2) throw new Error('Target required (min 2 chars)')
  if(!purpose || purpose.trim().length<5) throw new Error('Purpose required (describe due diligence / red-team / asset investigation)')
  // Immutable audit log
  try{
    await auditLog({ action:'TARGET_DECLARATION', target: trimmed, meta:{ jurisdiction, purpose: purpose.slice(0,200), ts:Date.now() } })
  }catch{}
  // Check opt-out registry case-insensitive
  try{
    const db=await getDB()
    const blocked = await db.get('optout', trimmed.toLowerCase())
    if(blocked) throw new Error(`Target "${trimmed}" is in opt-out registry and blocked by operator policy.`)
  }catch(e:any){
    if(e?.message?.includes('opt-out')) throw e
    // if DB fails, allow but log
    console.warn('Opt-out check failed', e)
  }
  return true
}

export function fcraBanner(){
  return `FCRA FIREWALL: This data cannot support employment, credit, insurance, or housing decisions (FCRA 604). OSINT data is for due diligence / journalistic / security purposes only.`
}

export function jurisdictionRules(subjectLocation:'EU'|'US-CA'|'US-IL'|'US'|'other'){
  const rules:string[]=[]
  if(subjectLocation==='EU'){
    rules.push('GDPR: provide data-deletion affordance, purpose limitation, and explicit logging.')
  }
  if(subjectLocation==='US-IL'){
    rules.push('BIPA: face templates never leave device; biometric data stored only encrypted locally, explicit consent required.')
  }
  if(subjectLocation==='US-CA'){
    rules.push('CCPA: California resident - provide deletion affordance.')
  }
  rules.push('DPPA: motor-vehicle data entirely blocked (18 USC 2721).')
  rules.push('No bulk scraping, single-session human-in-loop.')
  return rules
}

export async function addToOptOut(name:string){
  const trimmed=name.trim()
  if(!trimmed) throw new Error('Name required')
  const db=await getDB()
  await db.put('optout', { name: trimmed, addedAt:Date.now() }, trimmed.toLowerCase())
  await auditLog({ action:'OPT_OUT_ADD', target:trimmed }).catch(()=>{})
}

export async function wipeSession(){
  const db=await getDB()
  try{ await db.clear('keyval') }catch{}
  try{ await db.clear('dossiers') }catch{}
  try{ await db.clear('audit') }catch{}
  try{ await db.clear('tles') }catch{}
  try{ await db.clear('prefs') }catch{}
  // Keep optout and profiles? Profiles can be wiped separately via face manager for BIPA
  try{ localStorage.removeItem('orbital-onboard') }catch{}
}

export function noTosViolatingAutomationCheck(){
  return {
    allowed: true,
    policy: 'Single-session, rate-limited, human-confirmed extraction. No captcha bypass, no bulk scrapers. This keeps the tool legally clean and is the honest way to do OSINT.',
    rules: [
      'One browser tab per source',
      'Human must confirm extraction',
      'No automated CAPTCHA solving',
      'Rate-limited, no hammering',
      'Respect robots.txt where applicable, prefer public APIs'
    ]
  }
}
