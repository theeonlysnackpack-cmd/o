// @ts-nocheck
// Web Worker for SGP4 propagation - runs at ~10Hz
import * as satellite from 'satellite.js'

type TLEPayload = { id:string, name:string, line1:string, line2:string, group:string }

let satrecs: { id:string, name:string, rec:any, group:string }[] = []
let timer: number | null = null
let timeScale = 1
let simulatedTime = Date.now() // for time-lapse

type Pos = { id:string, x:number,y:number,z:number, lat:number, lon:number, alt:number, vx:number, vy:number, vz:number }

function propagateAll(date:Date): Pos[]{
  const out:Pos[]=[]
  for(const s of satrecs){
    try{
      const pv = satellite.propagate(s.rec, date) as any
      if(!pv || pv.position === false || pv.velocity === false) continue
      const pos = pv.position
      const vel = pv.velocity
      if(!pos || !vel) continue
      const gmst = satellite.gstime(date)
      const ecf = satellite.eciToEcf(pos, gmst)
      const gd = satellite.eciToGeodetic(pos, gmst)
      const lat = satellite.degreesLat(gd.latitude)
      const lon = satellite.degreesLong(gd.longitude)
      const alt = gd.height
      if(!isFinite(lat) || !isFinite(lon) || !isFinite(alt)) continue
      out.push({ id:s.id, x:ecf.x, y:ecf.y, z:ecf.z, lat, lon, alt, vx:vel.x, vy:vel.y, vz:vel.z })
    }catch{}
  }
  return out
}

self.onmessage = (e:any)=>{
  const { type } = e.data
  if(type==='init'){
    const entries: TLEPayload[] = e.data.entries
    satrecs = entries.map(ent=>{
      try{
        const rec = satellite.twoline2satrec(ent.line1, ent.line2)
        // @ts-ignore - satrec might be invalid but still usable
        if((rec as any).error) return null as any
        return { id:ent.id, name:ent.name, rec, group:ent.group }
      }catch{
        return null as any
      }
    }).filter(Boolean) as any
    console.log(`[worker] loaded ${satrecs.length} satrecs`)
    if(timer) clearInterval(timer as any)
    simulatedTime = Date.now()
    let lastReal = Date.now()
    // propagate at 10Hz with timeScale support
    timer = setInterval(()=>{
      const nowReal = Date.now()
      const deltaReal = nowReal - lastReal
      lastReal = nowReal
      if(timeScale !== 1){
        simulatedTime += deltaReal * timeScale
      } else {
        simulatedTime = nowReal
      }
      const d = new Date(simulatedTime)
      const positions = propagateAll(d)
      ;(self as any).postMessage({ type:'positions', positions, ts:d.getTime(), count:satrecs.length })
    }, 100) as any
  }
  if(type==='timeScale'){
    timeScale = e.data.scale ?? 1
    simulatedTime = Date.now()
  }
  if(type==='tick'){
    simulatedTime = e.data.ts ?? Date.now()
    timeScale = e.data.scale ?? timeScale
  }
  if(type==='computeOrbit'){
    const { id, steps } = e.data
    const found = satrecs.find(s=>s.id===id)
    if(!found) { (self as any).postMessage({ type:'orbit', id, path:[]}); return }
    const path=[]
    const start = new Date(simulatedTime)
    for(let i=0;i<(steps||90);i++){
      const d = new Date(start.getTime()+ i*60*1000)
      const pv = satellite.propagate(found.rec, d) as any
      if(!pv || pv.position===false) continue
      const gmst = satellite.gstime(d)
      try{
        const gd = satellite.eciToGeodetic(pv.position, gmst)
        path.push({ lat:satellite.degreesLat(gd.latitude), lon:satellite.degreesLong(gd.longitude), alt:gd.height, t:d.getTime() })
      }catch{}
    }
    ;(self as any).postMessage({ type:'orbit', id, path })
  }
  if(type==='computePasses'){
    const { lat, lon, altKm } = e.data
    const observerGd = { latitude:satellite.degreesToRadians(lat), longitude:satellite.degreesToRadians(lon), height:altKm || 0.02 }
    const now = new Date(simulatedTime)
    const visible: { id:string, name:string, maxEl:number, aos:number, los:number }[]=[]
    const limit = Math.min(2500, satrecs.length)
    for(let i=0;i<limit;i++){
      const s=satrecs[i]
      try{
        const pv = satellite.propagate(s.rec, now) as any
        if(!pv || pv.position===false) continue
        const gmst = satellite.gstime(now)
        const posEcf = satellite.eciToEcf(pv.position, gmst)
        const look = satellite.ecfToLookAngles(observerGd, posEcf)
        const el = satellite.radiansToDegrees(look.elevation)
        if(isFinite(el) && el>10){
          visible.push({ id:s.id, name:s.name, maxEl:el, aos:now.getTime(), los:now.getTime()+10*60000 })
        }
      }catch{}
    }
    visible.sort((a,b)=>b.maxEl-a.maxEl)
    ;(self as any).postMessage({ type:'passes', lat,lon, passes:visible.slice(0,50) })
  }
}
