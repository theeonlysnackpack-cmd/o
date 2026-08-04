import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { gmst, sunPosition } from '../utils/time'
import { TextureManager } from './textureManager'
import { store } from '../state/store'
import { TLEEntry } from '../data/celestrak'

const R = 2 // visual radius
const EARTH_SCALE = R / 6378.137

export class Globe {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  earthMesh: THREE.Mesh
  atmosphereMesh: THREE.Mesh
  cloudMesh: THREE.Mesh
  terminatorMesh?: THREE.Mesh
  textureMgr: TextureManager
  satInstanced?: THREE.InstancedMesh
  satCount = 0
  satData: { id:string, name:string, group:string }[] = []
  positions: Map<string, { x:number,y:number,z:number, lat:number,lon:number,alt:number }> = new Map()
  private raycaster = new THREE.Raycaster()
  private mouse = new THREE.Vector2()
  private animationId?: number
  private clock = new THREE.Clock()
  private timeScale = 1
  private focusedId?: string
  private layerFlags = store.get().layers
  private _onSatClick?: (id:string)=>void
  private pathLine?: THREE.Line
  private groundTrackLine?: THREE.Line
  private footprintCircle?: THREE.Mesh
  private sunLight: THREE.DirectionalLight
  private goesOverlay?: THREE.Mesh
  private earthRotRad = 0

  constructor(private container: HTMLElement, private worker: Worker){
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x060912)
    this.addStars()

    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    this.camera = new THREE.PerspectiveCamera(45, w/h, 0.1, 1000)
    this.camera.position.set(0,2.2,6)

    this.renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
    this.container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.minDistance = 2.2
    this.controls.maxDistance = 18
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.autoRotate = false
    this.controls.autoRotateSpeed = 0.25

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.12))
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.4)
    this.scene.add(this.sunLight)

    this.textureMgr = new TextureManager(this.scene)

    const geo = new THREE.SphereGeometry(R, 96, 96)
    const fallbackCanvas = this.textureMgr.createFallbackEarthCanvas()
    const fallbackTex = new THREE.CanvasTexture(fallbackCanvas)
    fallbackTex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.MeshPhongMaterial({
      map: fallbackTex,
      bumpScale: 0.02,
      specular: new THREE.Color(0x222222),
      shininess: 8,
    })
    this.earthMesh = new THREE.Mesh(geo, mat)
    this.earthMesh.rotation.order = 'ZXY'
    this.scene.add(this.earthMesh)

    const cloudGeo = new THREE.SphereGeometry(R*1.005, 64, 64)
    const cloudMat = new THREE.MeshPhongMaterial({
      map: this.textureMgr.createLiveCloudCanvasTexture(),
      transparent:true,
      opacity:0.38,
      depthWrite:false,
    })
    this.cloudMesh = new THREE.Mesh(cloudGeo, cloudMat)
    this.scene.add(this.cloudMesh)

    const atmosGeo = new THREE.SphereGeometry(R*1.18, 32, 32)
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vNormal; void main(){ vNormal=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vNormal; void main(){ float intensity=pow(0.7-dot(vNormal, vec3(0,0,1)), 3.0); gl_FragColor=vec4(0.3,0.6,1.0,1.0)*intensity; }`,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent:true
    })
    this.atmosphereMesh = new THREE.Mesh(atmosGeo, atmosMat)
    this.scene.add(this.atmosphereMesh)

    this.createTerminator()
    this.loadTextures()

    window.addEventListener('resize', ()=>this.resize())
    this.renderer.domElement.addEventListener('click', (e)=>this.onClick(e))
    this.renderer.domElement.addEventListener('mousemove', (e)=>this.onMousemove(e))

    store.subscribe(s=>{
      this.layerFlags = s.layers
      this.timeScale = s.timeScale
      this.focusedId = s.focusedSatId || s.trackedSatId
      this.controls.autoRotate = s.cameraMode==='cinematic'
    })

    this.animate()
  }

  onSatClickCb(fn:(id:string)=>void){ this._onSatClick=fn }

  private addStars(){
    const geo = new THREE.BufferGeometry()
    const verts:number[]=[]
    for(let i=0;i<5000;i++){
      const r=70+Math.random()*90
      const theta=Math.random()*Math.PI*2
      const phi=Math.acos(2*Math.random()-1)
      verts.push(r*Math.sin(phi)*Math.cos(theta), r*Math.sin(phi)*Math.sin(theta), r*Math.cos(phi))
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,3))
    const mat=new THREE.PointsMaterial({ size:0.5, sizeAttenuation:false, color:0x8aa0c8, transparent:true, opacity:0.9 })
    this.scene.add(new THREE.Points(geo,mat))
  }

  private async loadTextures(){
    try{
      const base = await this.textureMgr.loadBase()
      if(base && this.earthMesh.material instanceof THREE.MeshPhongMaterial){
        this.earthMesh.material.map = base
        this.earthMesh.material.needsUpdate=true
      }
    }catch{}
    this.textureMgr.attemptGOES().then(tex=>{
      if(tex){
        const overlayGeo = new THREE.SphereGeometry(R*1.0015, 96,96)
        const overlayMat = new THREE.MeshBasicMaterial({ map:tex, transparent:true, opacity:0.78, depthWrite:false })
        const overlay = new THREE.Mesh(overlayGeo, overlayMat)
        overlay.rotation.order='ZXY'
        this.scene.add(overlay)
        this.goesOverlay=overlay
      }
    }).catch(()=>{})
  }

  private createTerminator(){
    const geo=new THREE.SphereGeometry(R*1.002, 64,64)
    const mat=new THREE.ShaderMaterial({
      uniforms:{ sunDir:{ value:new THREE.Vector3(1,0,0) } },
      vertexShader:` varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); } `,
      fragmentShader:` varying vec3 vPos; uniform vec3 sunDir; void main(){ float c = dot(normalize(vPos), sunDir); float line = exp(-pow(c*7.0,2.0))*0.85; gl_FragColor = vec4(vec3(0.5,0.7,1.0)*line, line*0.75); } `,
      transparent:true,
      blending:THREE.AdditiveBlending,
      depthWrite:false,
      side:THREE.DoubleSide
    })
    const mesh=new THREE.Mesh(geo,mat)
    mesh.rotation.order='ZXY'
    this.scene.add(mesh)
    this.terminatorMesh=mesh
  }

  setSatellites(entries: TLEEntry[]){
    this.satData = entries.map(e=>({id:e.id,name:e.name,group:e.group}))
    this.satCount = entries.length
    store.patch({ satCount: entries.length })

    if(this.satInstanced){
      this.scene.remove(this.satInstanced)
      this.satInstanced.geometry.dispose()
      ;(this.satInstanced.material as any).dispose()
      this.satInstanced = undefined
    }
    const satGeo = new THREE.SphereGeometry(0.012, 6,6)
    const mat = new THREE.MeshBasicMaterial({ vertexColors:true, transparent:true, opacity:0.95 })
    const inst = new THREE.InstancedMesh(satGeo, mat, entries.length)
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    inst.frustumCulled = false
    // @ts-ignore - instanceColor exists in r150+
    if(inst.instanceColor){
      inst.instanceColor.setUsage(THREE.DynamicDrawUsage)
    }
    for(let i=0;i<entries.length;i++){
      const cls = this.classify(entries[i].name)
      const col = this.colorForConstellation(cls)
      // @ts-ignore
      inst.setColorAt(i, col)
    }
    // @ts-ignore
    if(inst.instanceColor) inst.instanceColor.needsUpdate=true
    this.scene.add(inst)
    this.satInstanced = inst
  }

  private classify(name:string){
    const n=name.toUpperCase()
    if(n.includes('STARLINK')) return 'STARLINK'
    if(n.includes('GPS')||n.includes('NAVSTAR')) return 'GPS'
    if(n.includes('ISS')||n.includes('ZARYA')) return 'ISS'
    if(n.includes('ONEWEB')) return 'ONEWEB'
    if(n.includes('FLLOCK')||n.includes('CUBESAT')||n.includes('LEMUR')||n.includes('CUBESAT')) return 'CUBESAT'
    return 'OTHER'
  }
  private colorForConstellation(c:string){
    switch(c){
      case 'STARLINK': return new THREE.Color(0x5ee1ff)
      case 'GPS': return new THREE.Color(0x3eff8b)
      case 'ISS': return new THREE.Color(0xff5a6a)
      case 'ONEWEB': return new THREE.Color(0x9d7cff)
      case 'CUBESAT': return new THREE.Color(0xffcf4d)
      default: return new THREE.Color(0x8aa0c8)
    }
  }

  // Rotate (x,z) around Y by angle (match Three's makeRotationY)
  private rotateY(x:number, z:number, angle:number){
    const c=Math.cos(angle), s=Math.sin(angle)
    return { x: x*c + z*s, z: -x*s + z*c }
  }

  updatePositions(posList: {id:string,x:number,y:number,z:number,lat:number,lon:number,alt:number}[]){
    if(!this.satInstanced) return
    this.positions.clear()
    const dummy = new THREE.Object3D()
    const earthRot = this.earthRotRad

    for(let i=0;i<posList.length;i++){
      const p=posList[i]
      this.positions.set(p.id, p)
      let x = p.x * EARTH_SCALE
      let y = p.z * EARTH_SCALE
      let z = -p.y * EARTH_SCALE

      const r = this.rotateY(x, z, earthRot)
      x=r.x; z=r.z

      dummy.position.set(x,y,z)
      dummy.updateMatrix()
      this.satInstanced.setMatrixAt(i, dummy.matrix)
    }
    this.satInstanced.instanceMatrix.needsUpdate=true

    if(this.focusedId){
      const p = this.positions.get(this.focusedId)
      if(p && store.get().cameraMode==='follow'){
        let sx=p.x*EARTH_SCALE, sy=p.z*EARTH_SCALE, sz=-p.y*EARTH_SCALE
        const rr=this.rotateY(sx, sz, earthRot)
        sx=rr.x; sz=rr.z
        this.controls.target.lerp(new THREE.Vector3(sx,sy,sz), 0.08)
      }
    }
  }

  private earthRotationRad(date:Date){ return gmst(date) }

  private onClick(evt:MouseEvent){
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((evt.clientX-rect.left)/rect.width)*2-1
    this.mouse.y = -((evt.clientY-rect.top)/rect.height)*2+1
    this.raycaster.setFromCamera(this.mouse, this.camera)
    if(this.satInstanced){
      const intersects = this.raycaster.intersectObject(this.satInstanced)
      if(intersects.length>0 && intersects[0].instanceId!==undefined){
        const idx=intersects[0].instanceId!
        const id = this.satData[idx]?.id
        if(id) this._onSatClick?.(id)
      }
    }
  }
  private onMousemove(evt:MouseEvent){
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((evt.clientX-rect.left)/rect.width)*2-1
    this.mouse.y = -((evt.clientY-rect.top)/rect.height)*2+1
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const tooltip=document.getElementById('globe-tooltip')
    if(!tooltip) return
    if(this.satInstanced){
      const hits=this.raycaster.intersectObject(this.satInstanced)
      if(hits.length>0 && hits[0].instanceId!==undefined){
        const idx=hits[0].instanceId
        const sat=this.satData[idx]
        if(sat){
          const p=this.positions.get(sat.id)
          tooltip.style.display='block'
          tooltip.style.left=`${evt.clientX}px`
          tooltip.style.top=`${evt.clientY}px`
          tooltip.textContent=`${sat.name} | ${p? `${p.alt.toFixed(0)}km ${p.lat.toFixed(1)}°,${p.lon.toFixed(1)}°` : ''}`
          return
        }
      }
    }
    tooltip.style.display='none'
  }

  setOrbitPath(path:{lat:number,lon:number,alt:number}[]){
    if(this.pathLine){ this.scene.remove(this.pathLine); this.pathLine.geometry.dispose(); (this.pathLine.material as any).dispose() }
    if(!path || path.length===0) return
    if(!this.layerFlags.orbitalPaths) return
    const verts:number[]=[]
    const earthRot=this.earthRotRad
    for(const pt of path){
      const latRad=pt.lat*Math.PI/180, lonRad=pt.lon*Math.PI/180
      const r = 6378+pt.alt
      const x = r*Math.cos(latRad)*Math.cos(lonRad)
      const y = r*Math.cos(latRad)*Math.sin(lonRad)
      const z = r*Math.sin(latRad)
      let tx = x*EARTH_SCALE, ty = z*EARTH_SCALE, tz = -y*EARTH_SCALE
      const rot=this.rotateY(tx, tz, earthRot)
      tx=rot.x; tz=rot.z
      verts.push(tx,ty,tz)
    }
    const geo=new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,3))
    const mat=new THREE.LineBasicMaterial({ color:0x5ee1ff, transparent:true, opacity:0.85 })
    const line=new THREE.Line(geo,mat)
    this.scene.add(line)
    this.pathLine=line
  }

  setGroundTrack(path:{lat:number,lon:number}[]){
    if(this.groundTrackLine){ this.scene.remove(this.groundTrackLine); this.groundTrackLine.geometry.dispose(); (this.groundTrackLine.material as any).dispose() }
    if(!path || !this.layerFlags.groundTracks) return
    const verts:number[]=[]
    const earthRot=this.earthRotRad
    for(const pt of path){
      const latRad=pt.lat*Math.PI/180, lonRad=pt.lon*Math.PI/180
      const r=6378+25
      const x=r*Math.cos(latRad)*Math.cos(lonRad)
      const y=r*Math.cos(latRad)*Math.sin(lonRad)
      const z=r*Math.sin(latRad)
      let tx=x*EARTH_SCALE, ty=z*EARTH_SCALE, tz=-y*EARTH_SCALE
      const rot=this.rotateY(tx,tz,earthRot)
      tx=rot.x; tz=rot.z
      verts.push(tx,ty,tz)
    }
    const geo=new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,3))
    const mat=new THREE.LineDashedMaterial({ color:0x7c5cff, dashSize:0.06, gapSize:0.03, scale:1, transparent:true, opacity:0.75 } as any)
    const line=new THREE.Line(geo,mat)
    line.computeLineDistances()
    this.scene.add(line)
    this.groundTrackLine=line
  }

  setFootprint(lat:number,lon:number,altKm:number){
    if(this.footprintCircle){ this.scene.remove(this.footprintCircle); this.footprintCircle.geometry.dispose(); (this.footprintCircle.material as any).dispose() }
    if(!this.layerFlags.footprints) return
    const Rearth=6378
    const clampedAlt = Math.max(100, altKm)
    const central = Math.acos(Rearth/(Rearth+clampedAlt))
    const radius = Math.min(R*0.95, central*R)
    const geo=new THREE.CircleGeometry(radius, 64)
    const mat=new THREE.MeshBasicMaterial({ color:0x3eff8b, transparent:true, opacity:0.18, side:THREE.DoubleSide })
    const mesh=new THREE.Mesh(geo,mat)
    const latRad=lat*Math.PI/180, lonRad=lon*Math.PI/180
    const r=R*1.015
    const x=r*Math.cos(latRad)*Math.cos(lonRad)
    const y=r*Math.sin(latRad)
    const z=-r*Math.cos(latRad)*Math.sin(lonRad)
    const earthRot=this.earthRotRad
    const rot=this.rotateY(x,z,earthRot)
    mesh.position.set(rot.x,y,rot.z)
    mesh.lookAt(0,0,0)
    mesh.rotateX(Math.PI)
    this.scene.add(mesh)
    this.footprintCircle=mesh
  }

  flyTo(lat:number, lon:number, altFactor:number=3.2){
    const latRad=lat*Math.PI/180, lonRad=lon*Math.PI/180
    const r=R*altFactor
    const x=r*Math.cos(latRad)*Math.cos(lonRad)
    const y=r*Math.sin(latRad)
    const z=-r*Math.cos(latRad)*Math.sin(lonRad)
    const earthRot=this.earthRotRad
    const rot=this.rotateY(x,z,earthRot)
    const targetPos=new THREE.Vector3(rot.x, y, rot.z)
    const startPos=this.camera.position.clone()
    const startTarget=this.controls.target.clone()
    const endTarget=new THREE.Vector3(rot.x*0.28,y*0.28,rot.z*0.28)
    let t=0
    const anim=()=>{
      t+=0.025
      if(t>=1){ this.camera.position.copy(targetPos); this.controls.target.copy(endTarget); return }
      const ease = 1-Math.pow(1-t,3)
      this.camera.position.lerpVectors(startPos,targetPos,ease)
      this.controls.target.lerpVectors(startTarget,endTarget,ease)
      requestAnimationFrame(anim)
    }
    anim()
  }

  focusOnSat(id:string){
    this.focusedId=id
    store.patch({ focusedSatId:id, trackedSatId:id, cameraMode:'follow' })
  }

  resize(){
    const w=this.container.clientWidth || window.innerWidth
    const h=this.container.clientHeight || window.innerHeight
    this.camera.aspect=w/h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w,h)
  }

  private animate(){
    this.animationId=requestAnimationFrame(()=>this.animate())
    const delta=this.clock.getDelta()
    this.controls.update()
    const now=new Date()
    const rot= this.earthRotationRad(now)
    this.earthRotRad = rot
    // tilt: apply Z rotation after Y? Since order ZXY, Y then Z
    this.earthMesh.rotation.y=rot
    this.earthMesh.rotation.z=23.44*Math.PI/180
    this.cloudMesh.rotation.y=rot + now.getTime()*0.000015
    this.cloudMesh.rotation.z=23.44*Math.PI/180
    if(this.goesOverlay){
      this.goesOverlay.rotation.y=rot
      this.goesOverlay.rotation.z=23.44*Math.PI/180
    }
    if(this.terminatorMesh){
      const sunPos=sunPosition(now)
      const phi = (90-sunPos.lat)*Math.PI/180
      const theta=(sunPos.lon+180)*Math.PI/180
      const r=10
      const sx=r*Math.sin(phi)*Math.cos(theta)
      const sy=r*Math.cos(phi)
      const sz=r*Math.sin(phi)*Math.sin(theta)
      const dir=new THREE.Vector3(sx,sy,sz).normalize()
      ;(this.terminatorMesh.material as any).uniforms.sunDir.value.copy(dir)
      this.terminatorMesh.rotation.y=rot
      this.terminatorMesh.rotation.z=23.44*Math.PI/180
      this.sunLight.position.set(sx,sy,sz)
    }
    this.renderer.render(this.scene,this.camera)
    const fps = delta>0 ? 1/delta : 60
    if(Math.random()<0.03){
      store.patch({ performance:{ fps:Math.round(fps), degraded:fps<32, gpuTier: fps>55?'high':fps>33?'mid':'low'} })
    }
  }

  dispose(){
    if(this.animationId) cancelAnimationFrame(this.animationId)
    this.renderer.dispose()
  }
}
