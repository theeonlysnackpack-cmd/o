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
  descriptor?: number[] // face embedding simplified
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
const DB_VER=1

export async function getDB(){
  return openDB<OrbitalDB>(DB_NAME, DB_VER, {
    upgrade(db){
      if(!db.objectStoreNames.contains('keyval')) db.createObjectStore('keyval')
      if(!db.objectStoreNames.contains('tles')) db.createObjectStore('tles')
      if(!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles')
      if(!db.objectStoreNames.contains('dossiers')) db.createObjectStore('dossiers')
      if(!db.objectStoreNames.contains('audit')){
        const s=db.createObjectStore('audit',{keyPath:'id'})
        s.createIndex('by-ts','ts')
      }
      if(!db.objectStoreNames.contains('optout')) db.createObjectStore('optout')
      if(!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs')
    }
  })
}

export async function kvGet(key:string){ const db=await getDB(); return db.get('keyval',key) }
export async function kvSet(key:string,val:any){ const db=await getDB(); return db.put('keyval',val,key) }

export async function saveTLECache(key:string,data:string){
  const db=await getDB(); await db.put('tles',{data,fetchedAt:Date.now()},key)
}
export async function getTLECache(key:string){
  const db=await getDB(); return db.get('tles',key)
}

export async function auditLog(entry:Omit<AuditEntry,'id'|'ts'>&Partial<Pick<AuditEntry,'id'|'ts'>>){
  const db=await getDB();
  const rec: AuditEntry = { id: entry.id || Math.random().toString(36).slice(2), ts: entry.ts||Date.now(), action: entry.action, actorProfileId: entry.actorProfileId, target: entry.target, sources: entry.sources, meta: entry.meta }
  await db.put('audit',rec)
  return rec
}
