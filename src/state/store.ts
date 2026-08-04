type Listener = (state: AppState)=>void

export type Constellation = 'STARLINK'|'GPS'|'ISS'|'ONEWEB'|'CUBESAT'|'OTHER'
export type LayerFlags = {
  constellation: boolean
  orbitalPaths: boolean
  groundTracks: boolean
  footprints: boolean
  terminator: boolean
  ais: boolean
  adsb: boolean
  webcamHotspots: boolean
}
export type CameraMode = 'free'|'follow'|'fixed'|'cinematic'|'satellite'
export type WebcamPin = { id:string, name:string, lat:number, lon:number, url:string, type:'youtube'|'iframe'|'image', thumb?:string }

export type AppState = {
  time: Date
  timeScale: number
  tlesFetchedAt?: number
  nextRefreshAt?: number
  satCount: number
  focusedSatId?: string
  trackedSatId?: string
  layers: LayerFlags
  cameraMode: CameraMode
  fixedLocation?: { lat:number, lon:number, name:string }
  activeWebcam?: WebcamPin
  searchQuery: string
  visibleCity?: WebcamPin
  profiles: any[]
  activeProfileId?: string
  voiceListening: boolean
  lastVoiceCommand?: string
  performance: { fps:number, degraded:boolean, gpuTier:'high'|'mid'|'low' }
  selectedDossierId?: string
  isOffline: boolean
}

const defaultState: AppState = {
  time: new Date(),
  timeScale: 1,
  satCount: 0,
  layers: { constellation:true, orbitalPaths:false, groundTracks:false, footprints:false, terminator:true, ais:false, adsb:false, webcamHotspots:true },
  cameraMode: 'free',
  searchQuery: '',
  voiceListening: false,
  performance: { fps:60, degraded:false, gpuTier:'mid' },
  isOffline: false,
  profiles: []
}

class Store {
  private state: AppState = { ...defaultState }
  private listeners = new Set<Listener>()
  private timeInterval?: number

  constructor(){
    this.timeInterval = window.setInterval(()=>{
      // keep time in sync with real UTC
      this.state.time = new Date()
      this.emit()
    }, 1000) as any
    window.addEventListener('online', ()=> this.patch({isOffline:false}))
    window.addEventListener('offline', ()=> this.patch({isOffline:true}))
  }

  get(): AppState { return this.state }
  patch(p: Partial<AppState>){
    this.state = { ...this.state, ...p }
    this.emit()
  }
  subscribe(fn:Listener){
    this.listeners.add(fn)
    try{ fn(this.state) }catch(e){ console.warn('Store listener error', e) }
    return ()=>this.listeners.delete(fn)
  }
  private emit(){
    for(const l of this.listeners){
      try{ l(this.state) }catch(e){ console.warn('Store emit error', e) }
    }
  }
}

export const store = new Store()
