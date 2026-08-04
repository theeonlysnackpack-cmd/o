import * as THREE from 'three'

export class TextureManager {
  private loader = new THREE.TextureLoader()
  baseTexture?: THREE.Texture
  cloudTexture?: THREE.Texture
  goesTexture?: THREE.Texture
  nightTexture?: THREE.Texture
  currentEarthMat?: THREE.MeshPhongMaterial | THREE.ShaderMaterial

  constructor(private scene: THREE.Scene) {}

  async loadBase(){
    // Low-res first
    const lowRes = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
    const darkRes = 'https://unpkg.com/three-globe/example/img/earth-night.jpg'
    const fallbackCanvas = this.createFallbackEarthCanvas()
    const fallbackTex = new THREE.CanvasTexture(fallbackCanvas)
    fallbackTex.colorSpace = THREE.SRGBColorSpace

    try{
      const tex = await this.loader.loadAsync(lowRes)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      this.baseTexture = tex
      return tex
    }catch{
      console.warn('Base texture load failed, using fallback')
      this.baseTexture = fallbackTex
      // Also try github raw? Keep fallback
      return fallbackTex
    }
  }

  createFallbackEarthCanvas(){
    const c = document.createElement('canvas')
    c.width=1024; c.height=512
    const ctx=c.getContext('2d')!
    const grad=ctx.createLinearGradient(0,0,0,512)
    grad.addColorStop(0,'#0d213f')
    grad.addColorStop(0.5,'#13315c')
    grad.addColorStop(1,'#0a1a33')
    ctx.fillStyle=grad
    ctx.fillRect(0,0,1024,512)
    // continents rough
    ctx.fillStyle='#1b3a5f'
    for(let i=0;i<30;i++){
      ctx.beginPath()
      const x=Math.random()*1024, y=Math.random()*512, r=20+Math.random()*80
      ctx.arc(x,y,r,0,Math.PI*2)
      ctx.fill()
    }
    // grid lines
    ctx.strokeStyle='rgba(94,225,255,0.08)'
    ctx.lineWidth=1
    for(let lon=0;lon<1024;lon+=64){ ctx.beginPath(); ctx.moveTo(lon,0); ctx.lineTo(lon,512); ctx.stroke() }
    for(let lat=0;lat<512;lat+=64){ ctx.beginPath(); ctx.moveTo(0,lat); ctx.lineTo(1024,lat); ctx.stroke() }
    return c
  }

  async attemptGOES(): Promise<THREE.Texture | null>{
    // Try to fetch latest GOES image with time rounding
    const now = new Date()
    // Round to nearest 10 min
    const tryTimes: Date[]=[]
    for(let i=0;i<6;i++){
      const d=new Date(now.getTime()-i*10*60*1000)
      d.setUTCMinutes(Math.floor(d.getUTCMinutes()/10)*10,0,0)
      tryTimes.push(d)
    }
    for(const dt of tryTimes){
      const yyyy=dt.getUTCFullYear()
      const mm=String(dt.getUTCMonth()+1).padStart(2,'0')
      const dd=String(dt.getUTCDate()).padStart(2,'0')
      const hh=String(dt.getUTCHours()).padStart(2,'0')
      const min=String(dt.getUTCMinutes()).padStart(2,'0')
      // Pattern: https://cdn.star.nesdis.noaa.gov/GOES16/ABI/FD/GEOCOLOR/20240501/GOES16-FD-GEOCOLOR-202405011200_... Actually filename is complex.
      // Simplified: try full-disk jpeg: https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/1808x1808.jpg (latest)
      const urls=[
        `https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/1808x1808.jpg`,
        `https://cdn.star.nesdis.noaa.gov/GOES16/ABI/FD/GEOCOLOR/1808x1808.jpg`,
        `https://rammb-slider.cira.colostate.edu/data/imagery/20240501/goes-16---full_disk---geocolor---${yyyy}${mm}${dd}${hh}${min}00/images/01/00/01_00001.png`
      ]
      for(const url of urls){
        try{
          const res = await fetch(url, { mode:'no-cors' }) // no-cors will be opaque but texture loader may still need cors; we try loader with crossOrigin
          // Try loader directly
          const tex = await this.loader.loadAsync(url)
          tex.colorSpace=THREE.SRGBColorSpace
          console.log(`[GOES] loaded ${url}`)
          this.goesTexture=tex
          return tex
        }catch{}
      }
    }
    // fallback: use a procedural live cloud texture that moves
    console.log('[GOES] falling back to procedural clouds')
    return null
  }

  createLiveCloudCanvasTexture(){
    const c=document.createElement('canvas')
    c.width=2048; c.height=1024
    const ctx=c.getContext('2d')!
    // transparent base
    ctx.clearRect(0,0,c.width,c.height)
    // draw moving cloud noise
    for(let i=0;i<800;i++){
      const x=Math.random()*c.width
      const y=Math.random()*c.height
      const r=10+Math.random()*40
      ctx.fillStyle=`rgba(255,255,255,${0.2+Math.random()*0.5})`
      ctx.beginPath()
      ctx.ellipse(x,y,r,r*0.6,Math.random()*Math.PI,0,Math.PI*2)
      ctx.fill()
    }
    const tex=new THREE.CanvasTexture(c)
    tex.colorSpace=THREE.SRGBColorSpace
    return tex
  }
}
