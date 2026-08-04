import * as THREE from 'three'

export class TextureManager {
  private loader = new THREE.TextureLoader()
  baseTexture?: THREE.Texture
  goesTexture?: THREE.Texture

  constructor(private scene?: THREE.Scene){
    this.loader.setCrossOrigin('anonymous')
  }

  async loadBase(): Promise<THREE.Texture>{
    const fallback = this.createFallbackEarthCanvas()
    const fallbackTex = new THREE.CanvasTexture(fallback)
    fallbackTex.colorSpace = THREE.SRGBColorSpace

    const candidates = [
      'https://unpkg.com/three-globe@2.30.0/example/img/earth-blue-marble.jpg',
      'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
      'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg'
    ]
    for(const url of candidates){
      try{
        const tex = await this.loader.loadAsync(url)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 4
        this.baseTexture = tex
        return tex
      }catch{ /* continue */ }
    }
    console.warn('[Texture] base load failed, using procedural fallback')
    this.baseTexture = fallbackTex
    return fallbackTex
  }

  createFallbackEarthCanvas(){
    const c = document.createElement('canvas')
    c.width=1024; c.height=512
    const ctx=c.getContext('2d')!
    const grad=ctx.createLinearGradient(0,0,0,512)
    grad.addColorStop(0,'#0d213f')
    grad.addColorStop(0.45,'#14325e')
    grad.addColorStop(1,'#0a1a33')
    ctx.fillStyle=grad
    ctx.fillRect(0,0,1024,512)
    ctx.fillStyle='#17375f'
    // pseudo continents
    const shapes=[
      {x:180,y:140,w:120,h:90},{x:320,y:200,w:80,h:60},{x:500,y:120,w:200,h:160},{x:720,y:220,w:100,h:80},{x:150,y:300,w:140,h:70},{x:650,y:320,w:180,h:90}
    ]
    for(const s of shapes){
      ctx.beginPath()
      ctx.ellipse(s.x,s.y,s.w,s.h,0,0,Math.PI*2)
      ctx.fill()
    }
    ctx.strokeStyle='rgba(94,225,255,0.07)'
    ctx.lineWidth=1
    for(let lon=0;lon<1024;lon+=64){ ctx.beginPath(); ctx.moveTo(lon,0); ctx.lineTo(lon,512); ctx.stroke() }
    for(let lat=0;lat<512;lat+=64){ ctx.beginPath(); ctx.moveTo(0,lat); ctx.lineTo(1024,lat); ctx.stroke() }
    return c
  }

  async attemptGOES(): Promise<THREE.Texture | null>{
    // Try direct image URLs known to be CORS-enabled? GOES CDN usually blocks CORS, so we expect fallback.
    const urls=[
      'https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/1808x1808.jpg',
      'https://cdn.star.nesdis.noaa.gov/GOES16/ABI/FD/GEOCOLOR/1808x1808.jpg',
    ]
    for(const url of urls){
      try{
        const tex = await this.loader.loadAsync(url)
        tex.colorSpace=THREE.SRGBColorSpace
        console.log(`[GOES] live loaded ${url}`)
        this.goesTexture=tex
        return tex
      }catch(e){
        console.warn(`[GOES] failed ${url}`, (e as any)?.message||e)
      }
    }
    console.log('[GOES] falling back to procedural clouds')
    return null
  }

  createLiveCloudCanvasTexture(){
    const c=document.createElement('canvas')
    c.width=1024; c.height=512
    const ctx=c.getContext('2d')!
    ctx.clearRect(0,0,c.width,c.height)
    // soft cloud blobs
    for(let i=0;i<400;i++){
      const x=Math.random()*c.width
      const y=Math.random()*c.height
      const rx=8+Math.random()*36
      const ry=rx*0.6
      const alpha=0.12+Math.random()*0.35
      ctx.fillStyle=`rgba(255,255,255,${alpha})`
      ctx.beginPath()
      ctx.ellipse(x,y,rx,ry,Math.random()*Math.PI,0,Math.PI*2)
      ctx.fill()
    }
    const tex=new THREE.CanvasTexture(c)
    tex.colorSpace=THREE.SRGBColorSpace
    return tex
  }
}
