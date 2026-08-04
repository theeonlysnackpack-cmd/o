import { openDB, DBSchema } from 'idb'

export interface OrbitalDB extends DBSchema {
  keyval: { key: string; value: any }
  tles: { key: string; value: { data: string; fetchedAt:number } }
  profiles: { key: string; value: FaceProfile }
  dossiers: { key: string; value: Dossier }
  audit: { key: string; value: AuditEntry, indexes: { 'by-ts': number } }
  optout: { key: string; value: { name:string, addedAt:number } }
  prefs: { key: string; value: any }
}

export type FaceProfile = {
  id:string
  name:string
  createdAt:number
  language?:string
  voicePref?:string
  savedCameras?: string[]
  defaultView?: any
  descriptor?: number[]
}

export type Dossier = {
  id:string
  target:string
  jurisdiction:string
  createdAt:number
  checklist: ChecklistItem[]
  facts: Fact[]
  graphNodes: any[]
  graphEdges: any[]
  timeline: TimelineEvent[]
}

export type ChecklistItem = {
  sourceId:string
  category:string
  name:string
  url:string
  query:string
  status:'pending'|'done'|'skipped'
  notes?:string
}

export type Fact = {
  id:string
  field:string
  value:string
  source:string
  sourceUrl?:string
  confidence:'primary'|'aggregator'|'self-report'
  verification:'verified'|'unverified'|'conflicting'
  timestamp?:number
}

export type TimelineEvent = {
  id:string
  date:string
  title:string
  source:string
  description?:string
}

export type AuditEntry = {
  id:string
  ts:number
  action:string
  actorProfileId?:string
  target?:string
  sources?:string[]
  meta?:any
}

const DB_NAME='orbital-v1'
const DB_VER=2

export async function getDB(){
  return openDB<OrbitalDB>(DB_NAME, DB_VER, {
    upgrade(db, oldVersion){
      if(!db.objectStoreNames.contains('keyval')) db.createObjectStore('keyval')
      if(!db.objectStoreNames.contains('tles')) db.createObjectStore('tles')
      if(!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles')
      if(!db.objectStoreNames.contains('dossiers')) db.createObjectStore('dossiers')
      if(!db.objectStoreNames.contains('audit')){
        const s=db.createObjectStore('audit',{keyPath:'id'})
        s.createIndex('by-ts','ts')
      } else if(oldVersion<2){
        // migrate: ensure index exists
        try{
          const tx = (db as any).transaction
          // Can't easily add index here if store exists, but idb upgrade will handle
        }catch{}
      }
      if(!db.objectStoreNames.contains('optout')) db.createObjectStore('optout')
      if(!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs')
    }
  })
}

export async function kvGet(key:string){ try{ const db=await getDB(); return await db.get('keyval',key) }catch{ return undefined } }
export async function kvSet(key:string,val:any){ try{ const db=await getDB(); return await db.put('keyval',val,key) }catch(e){ console.warn('kvSet failed', e) } }

export async function saveTLECache(key:string,data:string){
  try{ const db=await getDB(); await db.put('tles',{data,fetchedAt:Date.now()},key) }catch(e){ console.warn('saveTLECache failed', e) }
}
export async function getTLECache(key:string){
  try{ const db=await getDB(); return await db.get('tles',key) }catch{ return undefined }
}

function genId(){ return Math.random().toString(36).slice(2)+Date.now().toString(36)+Math.random().toString(36).slice(2,6) }

export async function auditLog(entry:Omit<AuditEntry,'id'|'ts'>&Partial<Pick<AuditEntry,'id'|'ts'>>){
  try{
    const db=await getDB();
    const rec: AuditEntry = { id: entry.id || genId(), ts: entry.ts||Date.now(), action: entry.action, actorProfileId: entry.actorProfileId, target: entry.target, sources: entry.sources, meta: entry.meta }
    await db.put('audit',rec)
    return rec
  }catch(e){
    console.warn('auditLog failed', e)
    return { id: genId(), ts: Date.now(), action: entry.action } as AuditEntry
  }
}
