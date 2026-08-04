import { getDB } from '../pwa/db'
import { store } from '../state/store'

export type Enrollment = { descriptor:number[], name:string }

export class FaceManager {
  private video?: HTMLVideoElement
  private canvas?: HTMLCanvasElement
  private stream?: MediaStream
  private detecting=false
  private modelsLoaded=false

  async init(video:HTMLVideoElement, canvas:HTMLCanvasElement){
    this.video=video; this.canvas=canvas
    // For MVP, we use a lightweight face detection stub using browser FaceDetector if available, else dummy.
    // To avoid heavy face-api models download for demo, we implement a placeholder that can still enroll via manual snapshot hash.
    return true
  }

  async startCamera(){
    try{
      this.stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user', width:320, height:240 } })
      if(this.video){
        this.video.srcObject=this.stream
        await this.video.play()
      }
      return true
    }catch(e){
      console.warn('Camera denied',e)
      return false
    }
  }
  stopCamera(){
    this.stream?.getTracks().forEach(t=>t.stop())
    if(this.video) this.video.srcObject=null
  }

  // Simplified face descriptor: perceptual hash of video frame (not real face recognition, placeholder for privacy-first on-device)
  // In production you would load face-api.js TinyFaceDetector + FaceLandmark + FaceRecognitionNet and compute 128D descriptor.
  // We keep interface identical, so swapping real model is drop-in.
  captureDescriptor(): number[] | null{
    if(!this.video || !this.canvas) return null
    const canvas=this.canvas
    const ctx=canvas.getContext('2d')!
    canvas.width=112; canvas.height=112
    ctx.drawImage(this.video,0,0,112,112)
    const data=ctx.getImageData(0,0,112,112).data
    // simple 64-dim embedding: average per 14x14 block luminance
    const descriptor:number[]=[]
    const block=14
    for(let by=0;by<8;by++){
      for(let bx=0;bx<8;bx++){
        let sum=0, cnt=0
        for(let y=by*block;y<(by+1)*block;y++){
          for(let x=bx*block;x<(bx+1)*block;x++){
            const idx=(y*112+x)*4
            const lum=0.299*data[idx]+0.587*data[idx+1]+0.114*data[idx+2]
            sum+=lum; cnt++
          }
        }
        descriptor.push(sum/cnt/255)
      }
    }
    // pad to 128
    while(descriptor.length<128) descriptor.push(0)
    return descriptor
  }

  async enroll(name:string){
    const desc=this.captureDescriptor()
    if(!desc) throw new Error('No face captured')
    const db=await getDB()
    const id=Math.random().toString(36).slice(2)
    const profile={ id, name, createdAt:Date.now(), descriptor:desc, language:navigator.language, savedCameras:[], defaultView:{} }
    await db.put('profiles', profile)
    store.patch({ activeProfileId:id })
    return profile
  }

  async matchCurrent(): Promise<{ profile:any, score:number } | null>{
    const desc=this.captureDescriptor()
    if(!desc) return null
    const db=await getDB()
    const all=await db.getAll('profiles')
    let best:{profile:any,score:number}|null=null
    for(const p of all){
      if(!p.descriptor) continue
      const score=this.cosineSimilarity(desc,p.descriptor)
      if(!best || score>best.score) best={ profile:p, score }
    }
    if(best && best.score>0.92){
      store.patch({ activeProfileId:best.profile.id })
      return best
    }
    return null
  }

  private cosineSimilarity(a:number[],b:number[]){
    let dot=0, na=0, nb=0
    for(let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i] }
    return dot/(Math.sqrt(na)*Math.sqrt(nb)+1e-9)
  }

  async listProfiles(){
    const db=await getDB()
    return db.getAll('profiles')
  }
  async deleteProfile(id:string){
    const db=await getDB()
    await db.delete('profiles',id)
  }
  async wipeAll(){
    const db=await getDB()
    await db.clear('profiles')
    store.patch({ activeProfileId:undefined })
  }
}
