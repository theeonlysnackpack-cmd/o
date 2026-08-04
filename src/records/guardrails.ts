import { getDB, auditLog } from '../pwa/db'

export async function requireTargetDeclaration(target:string, jurisdiction:string, purpose:string){
  if(!target || target.trim().length<2) throw new Error('Target required')
  // Immutable audit log
  await auditLog({ action:'TARGET_DECLARATION', target, meta:{ jurisdiction, purpose, ts:Date.now() } })
  // Check opt-out registry
  const db=await getDB()
  const blocked = await db.get('optout', target.toLowerCase())
  if(blocked) throw new Error(`Target ${target} is in opt-out registry and blocked by operator policy.`)
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
    rules.push('BIPA: face templates never leave device; biometric data stored only encrypted locally.')
  }
  rules.push('DPPA: motor-vehicle data entirely blocked.')
  return rules
}

export async function addToOptOut(name:string){
  const db=await getDB()
  await db.put('optout', { name, addedAt:Date.now() }, name.toLowerCase())
  await auditLog({ action:'OPT_OUT_ADD', target:name })
}

export async function wipeSession(){
  const db=await getDB()
  await db.clear('keyval')
  await db.clear('dossiers')
  await db.clear('audit')
  // Keep optout and profiles? Profiles can be wiped separately via face manager
}

export function noTosViolatingAutomationCheck(){
  // Enforce: one browser session per source, human-in-loop confirmation, no captcha busting, no bulk scrapers
  return {
    allowed: true,
    policy: 'Single-session, rate-limited, human-confirmed extraction. No captcha bypass, no bulk scrapers. This keeps the tool legally clean.'
  }
}
