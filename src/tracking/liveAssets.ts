export type Aircraft = { icao:string, callsign?:string, lat:number, lon:number, alt:number, owner?:string, nNumber?:string, velocity?:number, heading?:number }
export type Vessel = { mmsi:string, imo?:string, name?:string, lat:number, lon:number, course?:number, speed?:number, owner?:string }

export class LiveAssetTracker {
  private aircrafts: Aircraft[] = []
  private vessels: Vessel[] = []

  async fetchADSB(lat?:number, lon?:number){
    // Try ADSB.lol open API, fallback to OpenSky
    const attempts = [
      async ()=>{
        // ADSB.lol - point query (requires radius)
        const clat=lat??37.7749, clon=lon??-122.4194
        const res=await fetch(`https://api.adsb.lol/v2/point/${clat}/${clon}/250`)
        if(!res.ok) throw new Error('adsb.lol fail')
        const j=await res.json()
        return (j.ac||[]).map((a:any)=>({
          icao:a.hex,
          callsign:(a.flight||'').trim(),
          lat:a.lat,
          lon:a.lon,
          alt: (a.alt_baro==='ground'?0: a.alt_baro)||a.alt_geom||0,
          nNumber: this.icaoToNNumber(a.hex),
          velocity: a.gs,
          heading: a.track
        })).filter((x:any)=>x.lat&&x.lon)
      },
      async ()=>{
        const res=await fetch(`https://opensky-network.org/api/states/all?lamin=${(lat??37)-5}&lomin=${(lon??-122)-5}&lamax=${(lat??37)+5}&lomax=${(lon??-122)+5}`)
        if(!res.ok) throw new Error('opensky fail')
        const j=await res.json()
        return (j.states||[]).slice(0,200).map((s:any)=>({
          icao:s[0],
          callsign:(s[1]||'').trim(),
          lon:s[5], lat:s[6], alt:s[7]||0,
          velocity:s[9],
          heading:s[10],
          nNumber: this.icaoToNNumber(s[0])
        })).filter((x:any)=>x.lat&&x.lon)
      },
      async ()=>{
        // Simulated aircraft for demo
        return Array.from({length:80}, (_,i)=>({
          icao:(100000+i).toString(16),
          callsign:`DEMO${i}`,
          lat:(lat??37)+(Math.random()-0.5)*10,
          lon:(lon??-122)+(Math.random()-0.5)*10,
          alt: 30000+Math.random()*10000,
          nNumber:`N${10000+i}`,
          velocity:450+Math.random()*100,
          heading:Math.random()*360
        }))
      }
    ]
    for(const fn of attempts){
      try{
        const data=await fn()
        this.aircrafts=data
        console.log(`[ADSB] got ${data.length}`)
        return data
      }catch(e){ console.warn('ADSB attempt failed',e) }
    }
    return []
  }

  async fetchAIS(lat?:number, lon?:number){
    // No free global AIS API. Use simulated vessels streaming around globe, but structure ready for Spire/exactEarth satellite AIS ingestion via WebSocket.
    // In production: connect to aisstream.io websocket with API key (satellite + coastal)
    const vessels: Vessel[] = Array.from({length:120}, (_,i)=>{
      // place some near major ports
      const ports=[
        {lat:37.8,lon:-122.4},{lat:40.7,lon:-74},{lat:51.5,lon:-0.1},{lat:35.6,lon:139.6},{lat:33.7,lon:-118.2},{lat:25.0,lon:55.0},{lat:1.2,lon:103.8}
      ]
      const p=ports[i%ports.length]
      return {
        mmsi:(300000000+i).toString(),
        imo:`IMO${9000000+i}`,
        name:`VESSEL ${i} - ${['MAERSK','EVERGREEN','MSC','CMA'][i%4]}`,
        lat:p.lat+(Math.random()-0.5)*4,
        lon:p.lon+(Math.random()-0.5)*4,
        course:Math.random()*360,
        speed:Math.random()*20,
        owner:`Owner Corp ${i%10}`
      }
    })
    this.vessels=vessels
    return vessels
  }

  private icaoToNNumber(hex:string): string | undefined{
    // Simplified US registration mapping placeholder - real FAA registry lookup would use FAA API
    if(!hex) return undefined
    // For demo, map first bytes to N-number look-alike
    const num=parseInt(hex.slice(0,3),16)%80000
    if(num<1000) return undefined
    return `N${num}`
  }

  getAircrafts(){ return this.aircrafts }
  getVessels(){ return this.vessels }

  // Correlate to dossier: IMO -> owner, N-number -> owner
  correlateToDossier(targetName:string){
    const acMatches=this.aircrafts.filter(a=>a.owner?.toLowerCase().includes(targetName.toLowerCase()) || a.callsign?.toLowerCase().includes(targetName.toLowerCase()))
    const vMatches=this.vessels.filter(v=>v.owner?.toLowerCase().includes(targetName.toLowerCase()) || v.name?.toLowerCase().includes(targetName.toLowerCase()))
    return { aircraft:acMatches, vessels:vMatches }
  }
}
