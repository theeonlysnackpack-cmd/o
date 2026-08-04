import { getTLECache, saveTLECache } from '../pwa/db'

export type TLEEntry = { id:string, name:string, line1:string, line2:string, group:string }

const CELESTRAK_BASE = 'https://celestrak.org/NORAD/elements/gp.php'
const FALLBACK_PROXY = '' // Could use cors proxy if needed, but we attempt direct

// Groups to fetch for ~12k
const GROUPS = [
  { key:'starlink', name:'Starlink' },
  { key:'active', name:'Active' },
  { key:'gps-ops', name:'GPS' },
  { key:'stations', name:'ISS & Stations' },
  { key:'visual', name:'Visual' },
  { key:'oneweb', name:'OneWeb' },
]

export async function fetchTLEGroup(group:string): Promise<TLEEntry[]> {
  const cacheKey = `tle-${group}`
  const url = `${CELESTRAK_BASE}?GROUP=${group}&FORMAT=tle`
  try{
    const cached = await getTLECache(cacheKey)
    // We still try network but use cache if network fails
    const res = await fetch(url, { cache:'no-store' })
    if(!res.ok) throw new Error(`HTTP ${res.status}`)
    const txt = await res.text()
    if(!txt.includes('\n1 ') && !txt.includes('\n2 ')) throw new Error('Invalid TLE format')
    await saveTLECache(cacheKey, txt)
    return parseTLE(txt, group)
  }catch(e){
    console.warn(`Failed to fetch ${group}, trying cache`, e)
    const cached = await getTLECache(cacheKey)
    if(cached?.data){
      return parseTLE(cached.data, group)
    }
    // Fallback: sample demo data so app still works offline
    return generateDemoTLEs(group)
  }
}

function parseTLE(txt:string, group:string): TLEEntry[]{
  const lines = txt.trim().split('\n').map(s=>s.trim()).filter(Boolean)
  const out: TLEEntry[]=[]
  for(let i=0;i<lines.length;i+=3){
    const name = lines[i] || `UNKNOWN ${i}`
    const l1 = lines[i+1] || ''
    const l2 = lines[i+2] || ''
    if(!l1.startsWith('1 ') || !l2.startsWith('2 ')){
      // Some files have no name? Check 2-line
      if(lines[i].startsWith('1 ') && lines[i+1]?.startsWith('2 ')){
        out.push({ id: lines[i].slice(2,7).trim(), name: `SAT ${lines[i].slice(2,7).trim()}`, line1: lines[i], line2: lines[i+1], group })
        i-=1
      }
      continue
    }
    const id = l1.slice(2,7).trim()
    out.push({ id, name: name.replace(/^\s+|\s+$/g,''), line1:l1, line2:l2, group })
  }
  return out
}

function generateDemoTLEs(group:string): TLEEntry[]{
  // Generate synthetic but valid-ish TLEs for offline demo: uses ISS template mutated
  const baseISS=[
    'ISS (ZARYA)',
    '1 25544U 98067A   24001.00000000  .00010000  00000-0  18000-3 0  9990',
    '2 25544  51.6400  21.0000 0004000   0.0000  67.0000 15.50000000 10000'
  ]
  const count = group==='active'? 12000 : group==='starlink'? 5000 : 200
  const out:TLEEntry[]=[]
  for(let i=0;i<count;i++){
    const inc = group==='starlink'? 53 : group==='gps-ops'? 55 : group==='oneweb'? 87 : 51 + Math.random()*40
    const raan = (i* 360 / count + Math.random()*2) % 360
    const meanAnom = Math.random()*360
    const ecc = (Math.random()*0.001).toFixed(7)
    const mm = group==='gps-ops'? 2.0056 : 15.0 + Math.random()
    const l1=`1 ${40000+i}U 24001A   24001.00000000  .00010000  00000-0  18000-3 0  999${i%9}`
    const l2=`2 ${40000+i} ${inc.toFixed(4)} ${raan.toFixed(4)} 00${ecc.slice(2)} ${meanAnom.toFixed(4)} ${Math.random()*360} ${mm.toFixed(8).padStart(11,'0')} ${10000+i}`
    const name= group==='starlink'? `STARLINK-${1000+i}` : group==='gps-ops'? `GPS BIIA-${i}` : group==='oneweb'? `ONEWEB-${i}` : group==='stations'&&i===0? 'ISS (ZARYA)' : `${group.toUpperCase()}-${i}`
    out.push({ id:`${40000+i}`, name, line1:l1, line2:l2, group })
  }
  // Include real ISS first if stations
  if(group==='stations'){
    out[0]={ id:'25544', name:baseISS[0], line1:baseISS[1], line2:baseISS[2], group }
  }
  return out
}

export async function fetchAllTLEs(onProgress?:(p:number,msg:string)=>void): Promise<TLEEntry[]>{
  const all: TLEEntry[]=[]
  const uniq = new Map<string,TLEEntry>()
  let idx=0
  for(const g of GROUPS){
    onProgress?.(idx/GROUPS.length, `Fetching ${g.name}...`)
    const entries = await fetchTLEGroup(g.key)
    for(const e of entries){
      if(!uniq.has(e.id)){
        uniq.set(e.id,e)
        all.push(e)
      }
    }
    idx++
  }
  onProgress?.(1,'Done')
  // Limit to ~12k for performance, prioritize starlink+active
  if(all.length>12500) return all.slice(0,12500)
  return all
}

export function classifyConstellation(name:string): 'STARLINK'|'GPS'|'ISS'|'ONEWEB'|'CUBESAT'|'OTHER'{
  const n=name.toUpperCase()
  if(n.includes('STARLINK')) return 'STARLINK'
  if(n.includes('GPS')||n.includes('NAVSTAR')) return 'GPS'
  if(n.includes('ISS')||n.includes('ZARYA')||n.includes('STATION')) return 'ISS'
  if(n.includes('ONEWEB')) return 'ONEWEB'
  if(n.includes('CUBESAT')||n.includes('FLLOCK')||n.includes('LEMUR')||n.includes(' cubesat')) return 'CUBESAT'
  return 'OTHER'
}
