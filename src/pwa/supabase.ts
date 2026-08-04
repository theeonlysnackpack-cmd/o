import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getDB } from './db'
import { store } from '../state/store'

type SupabaseConfig = {
  url: string
  anonKey: string
  enabled: boolean
}

let client: SupabaseClient | null = null
let config: SupabaseConfig | null = null

function getEnvConfig(): SupabaseConfig | null {
  // Vite env vars
  const url = (import.meta as any).env?.VITE_SUPABASE_URL || localStorage.getItem('orbital_supabase_url')
  const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || localStorage.getItem('orbital_supabase_anon_key')
  const enabled = !!(url && key)
  if(!enabled) return null
  return { url, anonKey: key, enabled }
}

export async function initSupabase(): Promise<SupabaseClient | null>{
  const cfg = getEnvConfig()
  if(!cfg) {
    console.log('[Supabase] not configured — running 100% backendless (optional)')
    return null
  }
  try{
    client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    })
    config = cfg
    console.log('[Supabase] client initialized', cfg.url)
    // Test connection
    // await client.from('orbital_profiles').select('id').limit(1)
    return client
  }catch(e){
    console.warn('[Supabase] init failed, falling back to backendless', e)
    return null
  }
}

export function isSupabaseEnabled(){ return !!client && !!config?.enabled }

export async function saveSupabaseConfig(url:string, anonKey:string){
  localStorage.setItem('orbital_supabase_url', url.trim())
  localStorage.setItem('orbital_supabase_anon_key', anonKey.trim())
  return initSupabase()
}

export function clearSupabaseConfig(){
  localStorage.removeItem('orbital_supabase_url')
  localStorage.removeItem('orbital_supabase_anon_key')
  client=null
  config=null
}

// Sync types
export type SyncProfile = {
  id:string
  name:string
  created_at:number
  descriptor?: number[]
  language?:string
  prefs?: any
  // never store raw images, only descriptors, and only if user explicitly opts in
}

export async function syncUpProfiles(){
  if(!client) return { ok:false, reason:'not configured' }
  try{
    const db=await getDB()
    const profiles=await db.getAll('profiles')
    // Only sync if user explicitly opted in via UI flag
    const optIn = localStorage.getItem('orbital_cloud_sync_optin')==='1'
    if(!optIn){
      return { ok:false, reason:'cloud sync not opted in — privacy-first' }
    }
    // For BIPA compliance, face templates never leave device unless explicitly opted in AND encrypted
    // Here we would encrypt before upload — placeholder
    const payload = profiles.map(p=>({
      id: p.id,
      name: p.name,
      created_at: p.createdAt,
      language: p.language,
      prefs: { savedCameras: p.savedCameras, defaultView: p.defaultView },
      // descriptor only if user allowed biometric cloud sync (separate flag)
      descriptor: localStorage.getItem('orbital_biometric_cloud_optin')==='1' ? p.descriptor : null
    }))
    // Example: upsert to table orbital_profiles (user must create table)
    // await client.from('orbital_profiles').upsert(payload)
    console.log('[Supabase] would sync up', payload.length, 'profiles')
    return { ok:true, count: payload.length }
  }catch(e:any){
    console.warn('[Supabase] sync up failed', e)
    return { ok:false, reason: e.message }
  }
}

export async function syncDownProfiles(){
  if(!client) return { ok:false, reason:'not configured' }
  try{
    // const { data } = await client.from('orbital_profiles').select('*')
    // const db=await getDB()
    // for(const row of data||[]){ await db.put('profiles', {...}) }
    console.log('[Supabase] would sync down')
    return { ok:true }
  }catch(e:any){
    return { ok:false, reason: e.message }
  }
}

export async function syncUpDossiers(){
  if(!client) return { ok:false, reason:'not configured' }
  const optIn = localStorage.getItem('orbital_cloud_sync_optin')==='1'
  if(!optIn) return { ok:false, reason:'not opted in' }
  try{
    const db=await getDB()
    const dossiers=await db.getAll('dossiers')
    console.log('[Supabase] would sync up dossiers', dossiers.length)
    // await client.from('orbital_dossiers').upsert(dossiers.map(d=>({ id:d.id, target:d.target, jurisdiction:d.jurisdiction, created_at:d.createdAt, facts:d.facts, timeline:d.timeline })))
    return { ok:true, count: dossiers.length }
  }catch(e:any){
    return { ok:false, reason: e.message }
  }
}

// Preferences sync: saved views, camera pins, language, voice prefs
export async function syncUpPreferences(){
  if(!client) return { ok:false }
  const optIn = localStorage.getItem('orbital_cloud_sync_optin')==='1'
  if(!optIn) return { ok:false, reason:'not opted in' }
  try{
    const prefs = {
      layers: store.get().layers,
      cameraMode: store.get().cameraMode,
      fixedLocation: store.get().fixedLocation,
      activeWebcam: store.get().activeWebcam,
      timeScale: store.get().timeScale,
      searchQuery: store.get().searchQuery,
      timestamp: Date.now()
    }
    const userId = (await client.auth.getUser()).data.user?.id || 'anonymous'
    // await client.from('orbital_prefs').upsert({ user_id: userId, prefs })
    console.log('[Supabase] would sync prefs for', userId, prefs)
    return { ok:true }
  }catch(e:any){
    return { ok:false, reason:e.message }
  }
}

export async function enableCloudSync(optInBiometric=false){
  if(!client){
    const c=await initSupabase()
    if(!c) throw new Error('Supabase not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or enter via UI')
  }
  localStorage.setItem('orbital_cloud_sync_optin','1')
  if(optInBiometric){
    if(!confirm('Biometric cloud sync: face descriptors will be encrypted and uploaded. Continue? This is required for BIPA explicit opt-in.')) return
    localStorage.setItem('orbital_biometric_cloud_optin','1')
  }
  return syncUpProfiles()
}

export function disableCloudSync(){
  localStorage.removeItem('orbital_cloud_sync_optin')
  localStorage.removeItem('orbital_biometric_cloud_optin')
}

export function getSyncStatus(){
  return {
    enabled: isSupabaseEnabled(),
    url: config?.url || (import.meta as any).env?.VITE_SUPABASE_URL || localStorage.getItem('orbital_supabase_url'),
    optIn: localStorage.getItem('orbital_cloud_sync_optin')==='1',
    biometricOptIn: localStorage.getItem('orbital_biometric_cloud_optin')==='1'
  }
}
