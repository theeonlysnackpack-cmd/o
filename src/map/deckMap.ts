import { Deck, MapView } from '@deck.gl/core'
import { ScatterplotLayer, BitmapLayer } from '@deck.gl/layers'
import { TileLayer } from '@deck.gl/geo-layers'

type SatPos = { id:string, lat:number, lon:number, alt:number, group?:string, name?:string }

export class DeckMap {
  deck?: Deck
  private container: HTMLElement
  private viewState: any = { longitude: 0, latitude: 20, zoom: 1.2, pitch: 0, bearing: 0 }
  private isVisible = false
  private positions: SatPos[] = []
  private onSatClick?: (id:string)=>void

  constructor(container: HTMLElement){
    this.container = container
    this.container.style.display='none'
    this.container.style.position='absolute'
    this.container.style.inset='0'
    this.container.style.zIndex='1'
    this.container.style.pointerEvents='auto'
  }

  setVisible(v:boolean){
    this.isVisible=v
    this.container.style.display = v ? 'block' : 'none'
    if(v && !this.deck) this.init()
    if(this.deck){
      try{ (this.deck as any).setProps({ controller: v }) }catch{}
    }
  }

  toggle(){ this.setVisible(!this.isVisible); return this.isVisible }

  getVisible(){ return this.isVisible }

  onClick(fn:(id:string)=>void){ this.onSatClick=fn }

  private init(){
    // @ts-ignore - deck types are loose
    this.deck = new Deck({
      parent: this.container as HTMLDivElement,
      views: [new MapView({ repeat: true } as any)],
      initialViewState: this.viewState,
      controller: true,
      layers: this.getLayers() as any,
      getTooltip: ({object}:any)=>{
        if(!object) return null
        if(object.name) return `${object.name}\nAlt: ${object.alt?.toFixed(0)}km\n${object.lat?.toFixed(2)},${object.lon?.toFixed(2)}`
        return `${object.id||''}`
      },
      onViewStateChange: ({viewState}:any)=>{ this.viewState=viewState },
      onClick: (info:any)=>{
        if(info.object?.id && this.onSatClick) this.onSatClick(info.object.id)
      }
    } as any)
  }

  private colorForGroup(nameOrGroup?:string): [number,number,number]{
    const n=(nameOrGroup||'').toUpperCase()
    if(n.includes('STARLINK')) return [94,225,255]
    if(n.includes('GPS')||n.includes('NAVSTAR')) return [62,255,139]
    if(n.includes('ISS')||n.includes('ZARYA')) return [255,90,106]
    if(n.includes('ONEWEB')) return [157,124,255]
    if(n.includes('CUBESAT')||n.includes('FLLOCK')||n.includes('LEMUR')) return [255,207,77]
    return [138,160,200]
  }

  private getLayers(): any[]{
    const layers:any[] = []

    const tileLayer = new TileLayer({
      id: 'base-tiles',
      data: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      // @ts-ignore
      renderSubLayers: (props:any)=>{
        const {bbox: {west, south, east, north}} = props.tile
        return new BitmapLayer(props, {
          data: undefined,
          image: props.data,
          bounds: [west, south, east, north]
        } as any)
      }
    } as any)
    layers.push(tileLayer)

    if(this.positions.length>0){
      layers.push(new ScatterplotLayer({
        id: 'sats',
        data: this.positions,
        getPosition: (d:any)=>[d.lon, d.lat],
        getRadius: (d:any)=> Math.max(1.5, Math.min(8, d.alt ? (500/d.alt*5) : 4)),
        radiusUnits: 'pixels',
        getFillColor: (d:any)=> this.colorForGroup(d.group || d.name || '') as any,
        opacity: 0.85,
        pickable: true,
        radiusMinPixels: 1,
        radiusMaxPixels: 10,
        updateTriggers: { getPosition: this.positions.length }
      } as any))
    }

    return layers
  }

  updateSatellites(posList: {id:string, lat:number, lon:number, alt:number, name?:string, group?:string}[]){
    this.positions = posList as any
    if(!this.isVisible) return
    if(!this.deck) this.init()
    try{ this.deck?.setProps({ layers: this.getLayers() } as any) }catch(e){ console.warn('deck update failed', e) }
  }

  updateVessels(_vessels: {lat:number, lon:number, name?:string}[]){
    try{ this.deck?.setProps({ layers: this.getLayers() } as any) }catch{}
  }

  updateAircraft(_aircraft: {lat:number, lon:number, callsign?:string}[]){
    try{ this.deck?.setProps({ layers: this.getLayers() } as any) }catch{}
  }

  flyTo(lat:number, lon:number, zoom:number=3){
    const newView = {
      longitude: lon,
      latitude: lat,
      zoom,
      pitch: 0,
      bearing: 0,
      transitionDuration: 1200
    }
    if(this.deck){
      try{
        // @ts-ignore
        this.deck.setProps({ viewState: { ...this.viewState, ...newView } })
      }catch{}
    } else {
      this.viewState = { ...this.viewState, longitude: lon, latitude: lat, zoom }
    }
  }

  resize(){
    try{ this.deck?.setProps({ width: this.container.clientWidth, height: this.container.clientHeight } as any) }catch{}
  }

  destroy(){
    try{ this.deck?.finalize() }catch{}
  }
}
