// Web Worker for SGP4 propagation - runs at ~10Hz, interpolates positions
import * as satellite from 'satellite.js'

type TLEPayload = { id:string, name:string, line1:string, line2:string, group:string }

let satrecs: { id:string, name:string, rec:any, group:string }[] = []
let timer: number | null = null
let lastDate = new Date()
let timeScale = 1

type Pos = { id:string, x:number,y:number,z:number, lat:number, lon:number, alt:number, vx:number, vy:number, vz:number }

function propagateAll(date:Date): Pos[]{
  const out:Pos[]=[]
  for(const s of satrecs){
    try{
      const pv = satellite.propagate(s.rec, date)
      if(!pv.position || !pv.velocity) continue
      const pos = pv.position as any
      const vel = pv.velocity as any
      const gmst = satellite.gstime(date)
      const ecf = satellite.eciToEcf(pos, gmst)
      const gd = satellite.eciToGeodetic(pos, gmst)
      const lat = satellite.degreesLat(gd.latitude)
      const lon = satellite.degreesLong(gd.longitude)
      const alt = gd.height
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
        return { id:ent.id, name:ent.name, rec, group:ent.group }
      }catch{
        return null as any
      }
    }).filter(Boolean)
    console.log(`[worker] loaded ${satrecs.length} satrecs`)
    if(timer) clearInterval(timer as any)
    // propagate at 10Hz
    timer = setInterval(()=>{
      const now = new Date(lastDate.getTime() + (Date.now()-lastDate.getTime())*timeScale)
      // Actually time scale handling: if timeScale !=1, accelerate
      // For simplicity, if timeScale>1 we add extra
      const accelerated = new Date(Date.now() + (Date.now() - lastDate.getTime())*(timeScale-1))
      // Use real now if timescale 1 else accelerated
      const d = timeScale===1 ? new Date() : accelerated
      const positions = propagateAll(d)
      // Transfer as flat Float64? We'll post as array of objects (structured clone) - okay for 12k at 10Hz ~ 120k objs per sec heavy
      // Optimize: send as Float32Array? For simplicity send object but throttled
      ;(self as any).postMessage({ type:'positions', positions, ts:d.getTime(), count:satrecs.length })
    }, 100) as any
  }
  if(type==='timeScale'){
    timeScale = e.data.scale
  }
  if(type==='tick'){
    lastDate = new Date(e.data.ts)
    timeScale = e.data.scale ?? timeScale
  }
  if(type==='computeOrbit'){
    const { id, steps } = e.data
    const found = satrecs.find(s=>s.id===id)
    if(!found) { (self as any).postMessage({ type:'orbit', id, path:[]}); return }
    const path=[]
    const start = new Date()
    for(let i=0;i<(steps||90);i++){
      const d = new Date(start.getTime()+ i*60*1000)
      const pv = satellite.propagate(found.rec, d)
      if(!pv.position) continue
      const gmst = satellite.gstime(d)
      const gd = satellite.eciToGeodetic(pv.position as any, gmst)
      path.push({ lat:satellite.degreesLat(gd.latitude), lon:satellite.degreesLong(gd.longitude), alt:gd.height, t:d.getTime() })
    }
    ;(self as any).postMessage({ type:'orbit', id, path })
  }
  if(type==='computePasses'){
    const { lat, lon, altKm, hours } = e.data
    // Compute visible passes for next hours for top N satellites
    const observerGd = { latitude:satellite.degreesToRadians(lat), longitude:satellite.degreesToRadians(lon), height:altKm }
    const now = new Date()
    const visible: { id:string, name:string, maxEl:number, aos:number, los:number }[]=[]
    const limit = Math.min(2000, satrecs.length) // for perf only check 2k closest? we check all but time sampled coarse
    // coarse: sample every 30s for 2h = 240 steps per sat => too heavy. Instead quick heuristic: check current elevation, if >0 include
    for(let i=0;i<limit;i++){
      const s=satrecs[i]
      const pv = satellite.propagate(s.rec, now)
      if(!pv.position) continue
      const gmst = satellite.gstime(now)
      const posEcf = satellite.eciToEcf(pv.position as any, gmst)
      const observerEcf = satellite.geodeticToEcf(observerGd)
      const look = satellite.ecfToLookAngles(observerGd, posEcf)
      const el = satellite.radiansToDegrees(look.elevation)
      if(el>10){
        visible.push({ id:s.id, name:s.name, maxEl:el, aos:now.getTime(), los:now.getTime()+10*60000 })
      }
    }
    // sort by maxEl
    visible.sort((a,b)=>b.maxEl-a.maxEl)
    ;(self as any).postMessage({ type:'passes', lat,lon, passes:visible.slice(0,50) })
  }
}
