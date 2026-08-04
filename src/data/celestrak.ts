import { getTLECache, saveTLECache } from '../pwa/db'

export type TLEEntry = { id:string, name:string, line1:string, line2:string, group:string }

const CELESTRAK_BASE = 'https://celestrak.org/NORAD/elements/gp.php'

const GROUPS = [
  { key:'starlink', name:'Starlink', limit: 5000 },
  { key:'visual', name:'Visual Bright', limit: 300 },
  { key:'stations', name:'ISS & Stations', limit: 20 },
  { key:'gps-ops', name:'GPS', limit: 100 },
  { key:'oneweb', name:'OneWeb', limit: 600 },
  { key:'active', name:'Active (12k)', limit: 12500 },
]

function tleChecksum(line: string): string {
  // compute checksum for first 68 chars
  const core = line.slice(0,68).padEnd(68,' ')
  let sum=0
  for(const ch of core){
    if(ch>='0' && ch<='9') sum+=parseInt(ch)
    else if(ch==='-') sum+=1
  }
  return core + (sum%10).toString()
}

function pad(num: number, width: number, decimals?: number, padChar=' '){
  let s = decimals!=null ? num.toFixed(decimals) : num.toString()
  // ensure sign preserved, padStart
  return s.padStart(width, padChar)
}

function formatTLELines(satnum: number, classification: string, intDes: string, epoch: string, mmDot: number, mmDDot: string, bstar: string, elset: string, incl: number, raan: number, ecc: number, argp: number, ma: number, mm: number, rev: number){
  // Very simplified TLE formatter, not perfect columns but satellite.js is tolerant
  // Line1: 1 NNNNNC NNNN... etc
  // We'll use fixed-width fields similar to real TLE
  const s1 = `1 ${satnum.toString().padStart(5,' ')}${classification} ${intDes.padEnd(8,' ')} ${epoch} ${mmDot.toExponential(4).replace('e','').padStart(10,' ')} ${mmDDot.padStart(8,' ')} ${bstar.padStart(8,' ')} 0 ${elset}`
  const l1 = tleChecksum(s1)
  const eccStr = ecc.toFixed(7).slice(2).padStart(7,'0').slice(0,7)
  const s2 = `2 ${satnum.toString().padStart(5,' ')} ${incl.toFixed(4).padStart(8,' ')} ${raan.toFixed(4).padStart(8,' ')} ${eccStr} ${argp.toFixed(4).padStart(8,' ')} ${ma.toFixed(4).padStart(8,' ')} ${mm.toFixed(8).padStart(11,' ')}${rev.toString().padStart(5,' ')}`
  const l2 = tleChecksum(s2)
  return [l1,l2]
}

export async function fetchTLEGroup(group:string): Promise<TLEEntry[]> {
  const cacheKey = `tle-${group}`
  const url = `${CELESTRAK_BASE}?GROUP=${group}&FORMAT=tle`
  try{
    const controller = new AbortController()
    const timeout = setTimeout(()=>controller.abort(), 12000)
    const res = await fetch(url, { cache:'no-store', signal: controller.signal })
    clearTimeout(timeout)
    if(!res.ok) throw new Error(`HTTP ${res.status}`)
    const txt = await res.text()
    if(txt.length<50 || !txt.includes('1 ') || !txt.includes('2 ')) throw new Error('Invalid TLE format')
    await saveTLECache(cacheKey, txt)
    return parseTLE(txt, group)
  }catch(e){
    console.warn(`[CelesTrak] ${group} fetch failed, using cache/demo`, e)
    const cached = await getTLECache(cacheKey)
    if(cached?.data){
      try{ return parseTLE(cached.data, group) }catch{}
    }
    return generateDemoTLEs(group)
  }
}

function parseTLE(txt:string, group:string): TLEEntry[]{
  const lines = txt.trim().split('\n').map(s=>s.trim()).filter(Boolean)
  const out: TLEEntry[]=[]
  let i=0
  while(i<lines.length){
    let name=''
    let l1=''
    let l2=''
    if(lines[i].startsWith('1 ') && i+1<lines.length && lines[i+1].startsWith('2 ')){
      // 2-line without name
      l1=lines[i]; l2=lines[i+1]; name=`SAT ${l1.slice(2,7).trim()}`; i+=2
    } else if(i+2<lines.length && lines[i+1].startsWith('1 ') && lines[i+2].startsWith('2 ')){
      name=lines[i]; l1=lines[i+1]; l2=lines[i+2]; i+=3
    } else {
      i++; continue
    }
    if(!l1 || !l2) continue
    const id = l1.slice(2,7).trim()
    if(!id) continue
    out.push({ id, name: name.replace(/^\s+|\s+$/g,'').slice(0,24) || `SAT ${id}`, line1:l1, line2:l2, group })
  }
  return out
}

function generateDemoTLEs(group:string): TLEEntry[]{
  // Use real ISS as template and vary RAAN/MA for diversity
  const issL1='1 25544U 98067A   24001.00000000  .00002182  00000-0  42000-4 0  9996'
  const issL2='2 25544  51.6400  21.1800 0004000   0.0000  67.0000 15.50000000 10008'
  const countMap: Record<string, number> = { active:8000, starlink:4500, 'gps-ops':80, stations:5, visual:200, oneweb:500 }
  const count = countMap[group] ?? 200
  const out:TLEEntry[]=[]
  const baseSatnum = group==='starlink'? 44000 : group==='gps-ops'? 20000 : group==='oneweb'? 45000 : group==='stations'? 25544 : 40000
  // epoch fixed
  const epoch='24001.00000000'
  for(let i=0;i<count;i++){
    const satnum = baseSatnum + i
    const incl = group==='starlink'? 53.0 + (Math.random()-0.5)*2 : group==='gps-ops'? 55 + (Math.random()-0.5)*5 : group==='oneweb'? 87.9 + (Math.random()-0.5)*0.5 : 51.6 + Math.random()*20
    const raan = (i * 360 / count + Math.random()*2) % 360
    const ecc = Math.random()*0.002
    const argp = Math.random()*360
    const ma = Math.random()*360
    const mm = group==='gps-ops'? 2.013 + Math.random()*0.02 : group==='oneweb'? 14.9 + Math.random()*0.1 : 15.0 + Math.random()*0.5
    const rev = 10000 + i
    // Use simple formatter with checksum
    const l1core = `1 ${satnum.toString().padStart(5,' ')}U 98067A   ${epoch}  .00002182  00000-0  42000-4 0  999`
    const l1 = tleChecksum(l1core)
    const eccStr = ecc.toFixed(7).slice(2).padStart(7,'0')
    const l2core = `2 ${satnum.toString().padStart(5,' ')} ${incl.toFixed(4).padStart(8,' ')} ${raan.toFixed(4).padStart(8,' ')} ${eccStr} ${argp.toFixed(4).padStart(8,' ')} ${ma.toFixed(4).padStart(8,' ')} ${mm.toFixed(8).padStart(11,' ')}${rev.toString().padStart(5,' ')}`
    const l2 = tleChecksum(l2core)
    const name = group==='starlink'? `STARLINK-${1000+i}` : group==='gps-ops'? `GPS BIIA-${10+i}` : group==='oneweb'? `ONEWEB-${i}` : group==='stations'&&i===0? 'ISS (ZARYA)' : `${group.toUpperCase()}-${i}`
    out.push({ id:`${satnum}`, name, line1: i===0 && group==='stations' ? issL1 : l1, line2: i===0 && group==='stations' ? issL2 : l2, group })
  }
  // Ensure ISS first for stations
  if(group==='stations'){
    out[0]={ id:'25544', name:'ISS (ZARYA)', line1:issL1, line2:issL2, group }
  }
  return out
}

export async function fetchAllTLEs(onProgress?:(p:number,msg:string)=>void): Promise<TLEEntry[]>{
  const all: TLEEntry[]=[]
  const uniq = new Map<string,TLEEntry>()
  let idx=0
  for(const g of GROUPS){
    onProgress?.(idx/GROUPS.length, `Fetching ${g.name} (${g.key})...`)
    try{
      const entries = await fetchTLEGroup(g.key)
      const sliced = entries.slice(0, g.limit)
      for(const e of sliced){
        if(!uniq.has(e.id)){
          uniq.set(e.id,e)
          all.push(e)
        }
      }
    }catch(e){
      console.warn(`Group ${g.key} failed`, e)
    }
    idx++
    // small delay to avoid hammering CelesTrak
    await new Promise(r=>setTimeout(r, 150))
  }
  onProgress?.(1, `Loaded ${all.length} unique satellites`)
  if(all.length>12500) return all.slice(0,12500)
  if(all.length<100){
    console.warn('Too few sats, adding demo')
    const demo = generateDemoTLEs('active').slice(0, 4000)
    for(const d of demo) if(!uniq.has(d.id)){ all.push(d); uniq.set(d.id,d) }
  }
  return all
}

export function classifyConstellation(name:string): 'STARLINK'|'GPS'|'ISS'|'ONEWEB'|'CUBESAT'|'OTHER'{
  const n=name.toUpperCase()
  if(n.includes('STARLINK')) return 'STARLINK'
  if(n.includes('GPS')||n.includes('NAVSTAR')) return 'GPS'
  if(n.includes('ISS')||n.includes('ZARYA')||n.includes('STATION')) return 'ISS'
  if(n.includes('ONEWEB')) return 'ONEWEB'
  if(n.includes('CUBESAT')||n.includes('FLLOCK')||n.includes('LEMUR')) return 'CUBESAT'
  return 'OTHER'
}
