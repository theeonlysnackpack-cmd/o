import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { gmst, sunPosition } from '../utils/time'
import { TextureManager } from './textureManager'
import { store } from '../state/store'
import { TLEEntry } from '../data/celestrak'

const EARTH_RADIUS = 6371 // km, but we use normalized 1 for rendering, scale factor applied elsewhere
const R = 2 // visual radius

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
  private worker?: Worker
  private visibleSatIds = new Set<string>()
  private focusedId?: string
  private layerFlags = store.get().layers
  private _onSatClick?: (id:string)=>void

  // Orbit path objects
  private pathLine?: THREE.Line
  private groundTrackLine?: THREE.Line
  private footprintCircle?: THREE.Mesh
  private terminatorLineMaterial?: THREE.Material

  constructor(private container: HTMLElement, worker: Worker){
    this.worker = worker
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x060912)
    // stars
    this.addStars()

    this.camera = new THREE.PerspectiveCamera(45, container.clientWidth/container.clientHeight, 0.1, 1000)
    this.camera.position.set(0,2,6)

    this.renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.minDistance = 2.3
    this.controls.maxDistance = 14
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.autoRotate = false
    this.controls.autoRotateSpeed = 0.2

    // Lighting for day/night
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.06))

    this.textureMgr = new TextureManager(this.scene)

    // Earth geometry
    const geo = new THREE.SphereGeometry(R, 128, 128)
    const mat = new THREE.MeshPhongMaterial({
      map: this.textureMgr.createFallbackEarthCanvas() as any, // placeholder, replaced async
      bumpScale: 0.02,
      specular: new THREE.Color(0x222222),
      shininess: 10,
    })
    this.earthMesh = new THREE.Mesh(geo, mat)
    // Real orientation: axial tilt 23.44 deg
    this.earthMesh.rotation.order = 'ZXY'
    this.scene.add(this.earthMesh)

    // Cloud layer
    const cloudGeo = new THREE.SphereGeometry(R*1.005, 64, 64)
    const cloudMat = new THREE.MeshPhongMaterial({
      map: this.textureMgr.createLiveCloudCanvasTexture(),
      transparent:true,
      opacity:0.45,
      depthWrite:false,
    })
    this.cloudMesh = new THREE.Mesh(cloudGeo, cloudMat)
    this.scene.add(this.cloudMesh)

    // Atmosphere glow
    const atmosGeo = new THREE.SphereGeometry(R*1.15, 64, 64)
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vNormal; void main(){ vNormal=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vNormal; void main(){ float intensity=pow(0.7-dot(vNormal, vec3(0,0,1)), 3.0); gl_FragColor=vec4(0.3,0.6,1.0,1.0)*intensity; }`,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent:true
    })
    this.atmosphereMesh = new THREE.Mesh(atmosGeo, atmosMat)
    this.scene.add(this.atmosphereMesh)

    // Terminator (day/night) as a second mesh with night texture masked by sun angle? We'll implement shader later; for now line
    this.createTerminator()

    // Sun light
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2)
    this.scene.add(sunLight)
    // Update sun position each frame
    const updateSun = ()=>{
      const pos = sunPosition(new Date())
      // Convert sun lon/lat to direction
      const phi = (90-pos.lat)*Math.PI/180
      const theta = (pos.lon+180)*Math.PI/180
      const r=10
      sunLight.position.set(r*Math.sin(phi)*Math.cos(theta), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(theta))
    }
    ;(this as any)._updateSun=updateSun

    // Resize
    window.addEventListener('resize', ()=>this.resize())
    // Click handling
    this.renderer.domElement.addEventListener('click', (e)=>this.onClick(e))
    this.renderer.domElement.addEventListener('mousemove', (e)=>this.onMousemove(e))

    // Load textures async
    this.loadTextures()

    // Subscribe to store layers
    store.subscribe(s=>{
      this.layerFlags = s.layers
      this.timeScale = s.timeScale
      this.focusedId = s.focusedSatId || s.trackedSatId
      if(s.cameraMode==='free'){ this.controls.autoRotate=false }
      if(s.cameraMode==='cinematic'){ this.controls.autoRotate=true }
    })

    this.animate()
  }

  onSatClickCb(fn:(id:string)=>void){ this._onSatClick=fn }

  private addStars(){
    const geo = new THREE.BufferGeometry()
    const verts=[]
    for(let i=0;i<4000;i++){
      const r=80+Math.random()*80
      const theta=Math.random()*Math.PI*2
      const phi=Math.acos(2*Math.random()-1)
      verts.push(r*Math.sin(phi)*Math.cos(theta), r*Math.sin(phi)*Math.sin(theta), r*Math.cos(phi))
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,3))
    const mat=new THREE.PointsMaterial({ size:0.6, sizeAttenuation:false, color:0x8aa0c8, transparent:true, opacity:0.8 })
    const points=new THREE.Points(geo,mat)
    this.scene.add(points)
  }

  private async loadTextures(){
    const base = await this.textureMgr.loadBase()
    if(base && this.earthMesh.material instanceof THREE.MeshPhongMaterial){
      this.earthMesh.material.map = base
      this.earthMesh.material.needsUpdate=true
    }
    // Attempt GOES live
    this.textureMgr.attemptGOES().then(tex=>{
      if(tex){
        // Blend GOES over base? For simplicity replace base with composite? We'll layer as second texture using custom shader later, for now just blend opacity
        // Create overlay mesh slightly larger
        const overlayGeo = new THREE.SphereGeometry(R*1.001, 128,128)
        const overlayMat = new THREE.MeshBasicMaterial({ map:tex, transparent:true, opacity:0.85, depthWrite:false })
        const overlay = new THREE.Mesh(overlayGeo, overlayMat)
        this.scene.add(overlay)
        // Sync rotation with earth
        // @ts-ignore
        this._goesOverlay=overlay
      }
    })
  }

  private createTerminator(){
    const geo=new THREE.SphereGeometry(R*1.002, 64,64)
    const mat=new THREE.ShaderMaterial({
      uniforms:{
        sunDir:{ value:new THREE.Vector3(1,0,0) }
      },
      vertexShader:`
        varying vec3 vNormal;
        varying vec3 vPos;
        void main(){
          vNormal=normalize(normalMatrix*normal);
          vPos=position;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      `,
      fragmentShader:`
        varying vec3 vNormal;
        varying vec3 vPos;
        uniform vec3 sunDir;
        void main(){
          float cosine = dot(normalize(vPos), sunDir);
          float dayMix = smoothstep(-0.15, 0.15, cosine);
          vec3 dayColor = vec3(0.0);
          vec3 nightColor = vec3(0.05,0.08,0.25)*0.6;
          // night lights would be brighter where dayMix low
          vec3 col = mix(nightColor, dayColor, 0.0); // we keep earth texture underneath, so we render terminator as overlay
          // show terminator line
          float line = exp(-pow(cosine*8.0,2.0))*0.7;
          gl_FragColor = vec4(vec3(line)*vec3(0.5,0.7,1.0), line*0.7);
        }
      `,
      transparent:true,
      blending:THREE.AdditiveBlending,
      depthWrite:false,
      side:THREE.DoubleSide
    })
    const mesh=new THREE.Mesh(geo,mat)
    this.scene.add(mesh)
    this.terminatorMesh=mesh
  }

  setSatellites(entries: TLEEntry[]){
    this.satData = entries.map(e=>({id:e.id,name:e.name,group:e.group}))
    this.satCount = entries.length
    store.patch({ satCount: entries.length })

    // Create instanced mesh
    if(this.satInstanced){ this.scene.remove(this.satInstanced); this.satInstanced.geometry.dispose(); (this.satInstanced.material as any).dispose() }
    const satGeo = new THREE.SphereGeometry(0.008, 6,6) // tiny
    const mat = new THREE.MeshBasicMaterial({ color:0xffffff })
    const inst = new THREE.InstancedMesh(satGeo, mat, entries.length)
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // color buffer
    const colors = new Float32Array(entries.length*3)
    for(let i=0;i<entries.length;i++){
      const cls = this.classify(entries[i].name)
      const col = this.colorForConstellation(cls)
      colors[i*3]=col.r; colors[i*3+1]=col.g; colors[i*3+2]=col.b
    }
    inst.geometry.setAttribute('color', new THREE.InstancedBufferAttribute(colors,3))
    // Use custom shader to use color? InstancedMesh with MeshBasicMaterial supports vertexColors if we set?
    // We'll use onBeforeCompile to inject
    ;(inst.material as any).vertexColors=true
    this.scene.add(inst)
    this.satInstanced = inst

    // Also create Points for performance fallback when GPU low? For now instanced only
  }

  private classify(name:string){ 
    const n=name.toUpperCase()
    if(n.includes('STARLINK')) return 'STARLINK'
    if(n.includes('GPS')||n.includes('NAVSTAR')) return 'GPS'
    if(n.includes('ISS')||n.includes('ZARYA')) return 'ISS'
    if(n.includes('ONEWEB')) return 'ONEWEB'
    if(n.includes('FLLOCK')||n.includes('CUBESAT')||n.includes('LEMUR')) return 'CUBESAT'
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

  updatePositions(posList: {id:string,x:number,y:number,z:number,lat:number,lon:number,alt:number}[]){
    if(!this.satInstanced) return
    this.positions.clear()
    const dummy = new THREE.Object3D()
    const earthRot = this.earthRotationRad(new Date())
    // For rendering, we need to convert ECF (already Earth-fixed) to our normalized coordinates
    // Normalize: divide by Earth radius 6378 km * scale
    const scale = R / 6378.137

    let visible=0
    for(let i=0;i<posList.length;i++){
      const p=posList[i]
      this.positions.set(p.id, p)
      // ECF to Three.js coordinates: we have earth at 0,0,0, our earth mesh rotates around Y to simulate GMST? Actually easier: keep earth fixed orientation and rotate satellites opposite?
      // Our approach: earthMesh rotation Y = GMST + tilt? We'll rotate earthMesh, and keep ECF positions in inertial frame rotated appropriately.
      // Simpler: we visualize ECF directly: earthMesh rotation Y = 0, but we rotate both earth and satellites by same GMST to keep correct sun lighting? More consistent to rotate earthMesh Y = GMST and also rotate satellite ECF positions by same? Actually ECF already co-rotates with earth, so if earthMesh rotates, we need to rotate satellite ECF positions by same earth rotation to stay fixed relative to surface.
      // Implementation: earthMesh rotation Y = earthRot, and transform satellite ECF into our coordinate system: Three.js Y is up (north pole), while ECF Z is north. So map: Z -> Y, X -> X, Y -> Z? Let's align.
      // Standard: ECF X through Greenwich equator, Y through 90E, Z north. Three.js: Y up. So mapping: Three X = ECF X, Three Z = -ECF Y, Three Y = ECF Z (approx)
      // Then apply inverse earth rotation? Wait ECF rotates with earth, so if we rotate earth mesh by GMST, its Greenwich meridian rotates. ECF positions already account for earth rotation, so they stay above same lon/lat. If we rotate visual earth by GMST, we must also rotate ECF positions by same GMST to keep lat/lon correspondence? Let's test mental: at GMST=0, Greenwich points to X axis. At GMST=90deg, Greenwich points to -Z in ECF? Actually ECF axes fixed to earth, so Greenwich always X even as earth rotates inertially. Our visual earth rotation should match GMST to show real orientation relative to sun/ECI. If we are rendering in ECI frame, earth rotates. If rendering in ECF frame, earth doesn't rotate but sun moves. Simpler to render in ECF: keep earthMesh Y rotation =0 (or fixed tilt) and move sun. But spec says "real current orientation — axial tilt and rotation aligned to UTC, so what's on screen matches what's actually overhead right now." So earth rotation should match UTC, meaning Greenwich at correct Earth rotation angle relative to sun? That's essentially GMST rotation. So we will rotate earthMesh by GMST.
      // Therefore satellite ECF positions, which are earth-fixed, must be rotated by same GMST to appear stationary over same ground point in Three.js? Actually if both earth and ECF rotate together, relative position stays same if we don't rotate ECF positions? No, if earthMesh rotates but ECF coords stay fixed in Three world, satellites would drift relative to ground. So we need to rotate ECF positions by earthMesh rotation.
      // Easiest: don't rotate earthMesh by GMST, but instead rotate sun and camera? That defeats spec visually? We can simulate axial tilt fixed and let sun move; earth texture orientation still needs to be correct to UTC? That orientation is essentially GMST rotation of texture. So we can achieve correct texture orientation by rotating earthMesh by GMST, and accordingly rotate ECF positions by same angle so they remain over correct lat/lon textures.
      // Let's implement.

      let x = p.x * scale
      let y = p.z * scale // Z north -> Y up
      let z = -p.y * scale // ECF Y -> -Z

      // Apply earth rotation quaternion around Y (Three Y is north, but our mapping made north Y, so earth rotation should be around Y as well? Earth rotation axis is north pole Y. Rotating around Y spins longitude. That's what GMST does.)
      // So rotate (x,z) around Y by -earthRot? Need sign check.
      const cosR = Math.cos(-earthRot), sinR=Math.sin(-earthRot)
      const xr = x*cosR - z*sinR
      const zr = x*sinR + z*cosR
      x=xr; z=zr

      // Cull: below horizon or occluded? Simple distance check: if satellite behind earth relative to camera, reduce opacity? For now all visible with frustum cull later.
      dummy.position.set(x,y,z)
      dummy.updateMatrix()
      this.satInstanced!.setMatrixAt(i, dummy.matrix)
      visible++
    }
    this.satInstanced!.instanceMatrix.needsUpdate=true
    // Frustum culling handled by Three

    // Update focused tracking if any
    if(this.focusedId){
      const p = this.positions.get(this.focusedId)
      if(p){
        let sx=p.x*scale, sy=p.z*scale, sz=-p.y*scale
        const cosR = Math.cos(-this.earthRotationRad(new Date())), sinR=Math.sin(-this.earthRotationRad(new Date()))
        const xr = sx*cosR - sz*sinR
        const zr = sx*sinR + sz*cosR
        sx=xr; sz=zr
        // Smooth follow camera target?
        if(store.get().cameraMode==='follow'){
          this.controls.target.lerp(new THREE.Vector3(sx,sy,sz), 0.05)
        }
      }
    }
  }

  private earthRotationRad(date:Date){
    // GMST in rad
    const gst = gmst(date)
    return gst
  }

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
        return
      }
    }
    // check earth intersection for webcam pin?
    const earthHits = this.raycaster.intersectObject(this.earthMesh)
    if(earthHits.length>0){
      // Could compute lat/lon from hit point
    }
  }
  private onMousemove(evt:MouseEvent){
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((evt.clientX-rect.left)/rect.width)*2-1
    this.mouse.y = -((evt.clientY-rect.top)/rect.height)*2+1
    this.raycaster.setFromCamera(this.mouse, this.camera)
    // tooltip for satellites
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
    if(this.pathLine){ this.scene.remove(this.pathLine); this.pathLine.geometry.dispose() }
    if(!path || path.length===0) return
    if(!this.layerFlags.orbitalPaths) return
    const verts=[]
    const scale=R/6378.137
    const earthRot=this.earthRotationRad(new Date())
    const cosR=Math.cos(-earthRot), sinR=Math.sin(-earthRot)
    for(const pt of path){
      // Convert lat/lon/alt to ECF then to Three
      const latRad=pt.lat*Math.PI/180, lonRad=pt.lon*Math.PI/180
      const alt=pt.alt
      const r = 6378+alt
      const x = r*Math.cos(latRad)*Math.cos(lonRad)
      const y = r*Math.cos(latRad)*Math.sin(lonRad)
      const z = r*Math.sin(latRad)
      let tx = x*scale, ty = z*scale, tz = -y*scale
      const xr = tx*cosR - tz*sinR, zr = tx*sinR + tz*cosR
      tx=xr; tz=zr
      verts.push(tx,ty,tz)
    }
    const geo=new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,3))
    const mat=new THREE.LineBasicMaterial({ color:0x5ee1ff, transparent:true, opacity:0.9 })
    const line=new THREE.Line(geo,mat)
    this.scene.add(line)
    this.pathLine=line
  }

  setGroundTrack(path:{lat:number,lon:number}[]){
    if(this.groundTrackLine){ this.scene.remove(this.groundTrackLine); this.groundTrackLine.geometry.dispose() }
    if(!path || !this.layerFlags.groundTracks) return
    const verts=[]
    const scale=R/6378.137
    const earthRot=this.earthRotationRad(new Date())
    const cosR=Math.cos(-earthRot), sinR=Math.sin(-earthRot)
    for(const pt of path){
      const latRad=pt.lat*Math.PI/180, lonRad=pt.lon*Math.PI/180
      const r=6378+20
      const x=r*Math.cos(latRad)*Math.cos(lonRad)
      const y=r*Math.cos(latRad)*Math.sin(lonRad)
      const z=r*Math.sin(latRad)
      let tx=x*scale, ty=z*scale, tz=-y*scale
      const xr=tx*cosR - tz*sinR, zr=tx*sinR + tz*cosR
      tx=xr; tz=zr
      verts.push(tx,ty,tz)
    }
    const geo=new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,3))
    const mat=new THREE.LineDashedMaterial({ color:0x7c5cff, dashSize:0.04, gapSize:0.02, scale:1, transparent:true, opacity:0.8 } as any)
    const line=new THREE.Line(geo,mat)
    line.computeLineDistances()
    this.scene.add(line)
    this.groundTrackLine=line
  }

  setFootprint(lat:number,lon:number,altKm:number){
    if(this.footprintCircle){ this.scene.remove(this.footprintCircle); this.footprintCircle.geometry.dispose() }
    if(!this.layerFlags.footprints) return
    // footprint radius approx acos(R/(R+h))
    const Rearth=6378
    const central = Math.acos(Rearth/(Rearth+altKm)) // rad
    const geo=new THREE.CircleGeometry(central*R, 64) // approximate? Circle on sphere is not planar, but use ring approximation projected onto sphere? For MVP planar circle oriented to lat/lon
    // Actually we need to position circle at lat/lon on sphere surface
    const mat=new THREE.MeshBasicMaterial({ color:0x3eff8b, transparent:true, opacity:0.15, side:THREE.DoubleSide, wireframe:false })
    const mesh=new THREE.Mesh(geo,mat)
    // place
    const latRad=lat*Math.PI/180, lonRad=lon*Math.PI/180
    const r=R*1.01
    const x=r*Math.cos(latRad)*Math.cos(lonRad)
    const y=r*Math.sin(latRad)
    const z=-r*Math.cos(latRad)*Math.sin(lonRad) // note mapping
    // rotation already includes earthRot? We'll apply earthRot similarly
    const earthRot=this.earthRotationRad(new Date())
    const cosR=Math.cos(-earthRot), sinR=Math.sin(-earthRot)
    let tx=x, ty=y, tz=z
    const xr=tx*cosR - tz*sinR, zr=tx*sinR + tz*cosR
    tx=xr; tz=zr
    mesh.position.set(tx,ty,tz)
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
    const earthRot=this.earthRotationRad(new Date())
    const cosR=Math.cos(-earthRot), sinR=Math.sin(-earthRot)
    let tx=x, tz=z
    const xr=tx*cosR - tz*sinR, zr=tx*sinR + tz*cosR
    tx=xr; tz=zr
    // animate camera
    const startPos=this.camera.position.clone()
    const targetPos=new THREE.Vector3(tx, y, tz)
    const startTarget=this.controls.target.clone()
    const endTarget=new THREE.Vector3(tx*0.3,y*0.3,tz*0.3)
    let t=0
    const anim=()=>{
      t+=0.02
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
    const w=this.container.clientWidth, h=this.container.clientHeight
    this.camera.aspect=w/h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w,h)
  }

  private animate(){
    this.animationId=requestAnimationFrame(()=>this.animate())
    const delta=this.clock.getDelta()
    this.controls.update()
    // earth rotation aligned to UTC real - slowly rotate
    const now=new Date()
    const rot=this.earthRotationRad(now)
    this.earthMesh.rotation.y=rot
    this.earthMesh.rotation.z=23.44*Math.PI/180 // axial tilt
    this.cloudMesh.rotation.y=rot + now.getTime()*0.00002 // clouds drift slightly faster
    this.cloudMesh.rotation.z=23.44*Math.PI/180
    if((this as any)._goesOverlay){
      (this as any)._goesOverlay.rotation.y=rot
      ;(this as any)._goesOverlay.rotation.z=23.44*Math.PI/180
    }
    if(this.terminatorMesh){
      const sunPos=sunPosition(now)
      const phi = (90-sunPos.lat)*Math.PI/180
      const theta=(sunPos.lon+180)*Math.PI/180
      const dir=new THREE.Vector3(
        Math.sin(phi)*Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi)*Math.sin(theta)
      )
      ;(this.terminatorMesh.material as any).uniforms.sunDir.value.copy(dir)
      this.terminatorMesh.rotation.y=rot
      this.terminatorMesh.rotation.z=23.44*Math.PI/180
    }
    // update sun light
    if((this as any)._updateSun) (this as any)._updateSun()

    this.renderer.render(this.scene,this.camera)
    // FPS tracking
    const fps = 1/delta
    if(Math.random()<0.02){
      store.patch({ performance:{ fps:Math.round(fps), degraded:fps<35, gpuTier: fps>55?'high':fps>35?'mid':'low'} })
    }
  }

  dispose(){
    if(this.animationId) cancelAnimationFrame(this.animationId)
    this.renderer.dispose()
  }
}
