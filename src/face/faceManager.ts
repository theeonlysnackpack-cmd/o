import { getDB } from '../pwa/db'
import { store } from '../state/store'
import { loadFaceApiModels, isFaceApiReady, computeFaceDescriptor, getFaceApi } from './faceApiLoader'

export type Enrollment = { descriptor:number[], name:string }

export class FaceManager {
  private video?: HTMLVideoElement
  private canvas?: HTMLCanvasElement
  private stream?: MediaStream
  private usingRealModel = false

  async init(video:HTMLVideoElement, canvas:HTMLCanvasElement){
    this.video=video; this.canvas=canvas
    // Try to load real face-api models in background (non-blocking)
    loadFaceApiModels().then(ok=>{
      this.usingRealModel = ok
      console.log(`[FaceManager] real model ${ok?'available':'fallback'}`)
    }).catch(()=>{ this.usingRealModel=false })
    return true
  }

  async startCamera(){
    try{
      if(!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia not supported')
      this.stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user', width:320, height:240 }, audio:false })
      if(this.video){
        this.video.srcObject=this.stream
        await new Promise<void>((res)=>{
          if(!this.video) return res()
          this.video!.onloadedmetadata = ()=> res()
          setTimeout(()=>res(), 2000)
        })
        try{ await this.video.play() }catch{}
      }
      return true
    }catch(e){
      console.warn('Camera denied',e)
      return false
    }
  }
  stopCamera(){
    try{ this.stream?.getTracks().forEach(t=>{ try{ t.stop() }catch{} }) }catch{}
    if(this.video){ try{ this.video.pause(); this.video.srcObject=null }catch{} }
    this.stream=undefined
  }

  private simpleDescriptor(): number[] | null{
    try{
      if(!this.video || !this.canvas) return null
      const video = this.video
      if(video.readyState < 2 || video.videoWidth===0) return null
      const canvas=this.canvas
      const ctx=canvas.getContext('2d')
      if(!ctx) return null
      canvas.width=112; canvas.height=112
      ctx.drawImage(video,0,0,112,112)
      const data=ctx.getImageData(0,0,112,112).data
      const descriptor:number[]=[]
      const block=14
      for(let by=0; by<8; by++){
        for(let bx=0; bx<8; bx++){
          let sum=0
          for(let y=by*block; y<(by+1)*block; y++){
            for(let x=bx*block; x<(bx+1)*block; x++){
              const idx=(y*112+x)*4
              const lum=0.299*data[idx]+0.587*data[idx+1]+0.114*data[idx+2]
              sum+=lum
            }
          }
          descriptor.push((sum/(block*block))/255)
        }
      }
      while(descriptor.length<128) descriptor.push(0)
      const mean = descriptor.reduce((a,b)=>a+b,0)/descriptor.length
      const variance = descriptor.reduce((acc,v)=>acc+(v-mean)*(v-mean),0)/descriptor.length
      if(variance<0.0005) return null
      return descriptor
    }catch(e){
      console.warn('simpleDescriptor failed', e)
      return null
    }
  }

  async captureDescriptor(): Promise<number[] | null>{
    // Try real model first if available
    if(isFaceApiReady() && this.video){
      try{
        const real = await computeFaceDescriptor(this.video)
        if(real){
          console.log('[FaceManager] using real 128D descriptor')
          return Array.from(real)
        }
      }catch(e){ console.warn('real descriptor failed, fallback', e) }
    }
    // Fallback lightweight
    return this.simpleDescriptor()
  }

  async enroll(name:string){
    const trimmed = name.trim()
    if(!trimmed) throw new Error('Name required')
    // Ensure models attempted
    await loadFaceApiModels().catch(()=>{})
    const desc = await this.captureDescriptor()
    if(!desc) throw new Error('No face captured — ensure camera started, face centered, good lighting')
    const db=await getDB()
    const id=Math.random().toString(36).slice(2)+Date.now().toString(36)
    const profile={
      id, name: trimmed, createdAt:Date.now(),
      descriptor:desc,
      language:navigator.language,
      savedCameras:[],
      defaultView:{},
      usingRealModel: isFaceApiReady()
    }
    await db.put('profiles', profile)
    store.patch({ activeProfileId:id })
    return profile
  }

  async matchCurrent(): Promise<{ profile:any, score:number, method:string } | null>{
    const desc = await this.captureDescriptor()
    if(!desc) return null
    const db=await getDB()
    const all=await db.getAll('profiles')
    let best:{profile:any,score:number,method:string}|null=null
    for(const p of all){
      if(!p.descriptor || p.descriptor.length===0) continue
      const score=this.cosineSimilarity(desc,p.descriptor)
      if(!isFinite(score)) continue
      if(!best || score>best.score) best={ profile:p, score, method: (p as any).usingRealModel || isFaceApiReady() ? 'face-api.js 128D' : 'lightweight 64D fallback' }
    }
    // Return best even if below threshold for UI feedback, but only activate if >0.92 (fallback) or >0.6 (real model euclidean distance converted? For face-api, threshold is usually 0.6 distance, but we use cosine)
    if(best){
      const threshold = best.method.includes('128D') ? 0.6 : 0.92
      if(best.score>threshold){
        store.patch({ activeProfileId:best.profile.id })
        return best
      }
      // still return best for UI to show score even if below threshold
      if(best.score>0.5) return best
    }
    return null
  }

  private cosineSimilarity(a:number[],b:number[]){
    try{
      let dot=0, na=0, nb=0
      const len=Math.min(a.length,b.length)
      for(let i=0;i<len;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i] }
      return dot/(Math.sqrt(na)*Math.sqrt(nb)+1e-9)
    }catch{ return 0 }
  }

  async listProfiles(){
    try{
      const db=await getDB()
      return await db.getAll('profiles')
    }catch{ return [] }
  }
  async deleteProfile(id:string){
    const db=await getDB()
    await db.delete('profiles',id)
    if(store.get().activeProfileId===id) store.patch({ activeProfileId: undefined })
  }
  async wipeAll(){
    const db=await getDB()
    await db.clear('profiles')
    store.patch({ activeProfileId:undefined })
    this.stopCamera()
  }

  getStatus(){
    return {
      realModel: isFaceApiReady(),
      using: this.usingRealModel ? 'face-api.js 128D real' : 'lightweight fallback 64D',
      hasStream: !!this.stream
    }
  }
}
