import { store } from '../state/store'
import { CITY_HOTSPOTS } from '../cameras/webcamManager'

type Command = {
  pattern: RegExp
  description: string
  example: string
  exec: (match: RegExpMatchArray, transcript:string)=>void
}

export class VoiceControl {
  private recognition?: any
  private listening=false
  commands: Command[]
  private lastStartAttempt=0

  constructor(private onCommand:(text:string)=>void){
    this.commands = [
      { pattern:/focus on (.+)/i, description:'Focus camera and track satellite', example:'Focus on ISS', exec:(m)=>{
        const name=m[1].trim().slice(0,50)
        store.patch({ searchQuery:name })
        this.onCommand(`focus:${name}`)
      }},
      { pattern:/show (starlink|gps|iss|oneweb|cubesat|debris|all)/i, description:'Show constellation layer', example:'Show Starlink', exec:(m)=>{
        this.onCommand(`show:${m[1]}`)
      }},
      { pattern:/hide (starlink|gps|iss|oneweb|cubesat|debris|all)/i, description:'Hide layer', example:'Hide debris', exec:(m)=>{
        this.onCommand(`hide:${m[1]}`)
      }},
      { pattern:/go to (.+)/i, description:'Fly to city and open webcam', example:'Go to Cape Canaveral', exec:(m)=>{
        const loc=m[1].trim().slice(0,60)
        const city = CITY_HOTSPOTS.find(c=>c.name.toLowerCase().includes(loc.toLowerCase()) || loc.toLowerCase().includes(c.id))
        if(city){
          this.onCommand(`goto:${city.id}`)
        } else {
          this.onCommand(`goto:custom:${loc}`)
        }
      }},
      { pattern:/time[- ]?lapse (\d+)x/i, description:'Speed up time', example:'Time-lapse 10x', exec:(m)=>{
        let scale=parseInt(m[1])
        if(!isFinite(scale) || scale<1) scale=1
        if(scale>10000) scale=10000
        store.patch({ timeScale:scale })
        this.onCommand(`timelapse:${scale}`)
      }},
      { pattern:/back to real time|real[- ]?time/i, description:'Return to realtime', example:'Back to real time', exec:()=>{
        store.patch({ timeScale:1 })
        this.onCommand('realtime')
      }},
      { pattern:/show ground tracks/i, description:'Toggle ground tracks', example:'Show ground tracks', exec:()=>{ this.onCommand('toggle:groundTracks') }},
      { pattern:/coverage on|show coverage/i, description:'Enable footprints', example:'Coverage on', exec:()=>{ this.onCommand('toggle:footprints') }},
      { pattern:/switch profile/i, description:'Re-run face match', example:'Switch profile', exec:()=>{ this.onCommand('switchProfile') }},
      { pattern:/fly to (tokyo|new york|london|cape canaveral|paris|sydney)/i, description:'Preset fly', example:'Fly to Tokyo', exec:(m,transcript)=>{
        const lower=transcript.toLowerCase()
        const map: Record<string,string>={ 'tokyo':'tokyo', 'new york':'nyc', 'london':'london', 'cape canaveral':'cape', 'paris':'paris', 'sydney':'sydney' }
        for(const k in map){ if(lower.includes(k)) { this.onCommand(`goto:${map[k]}`); break } }
      }},
    ]
  }

  init(){
    try{
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if(!SpeechRecognition){
        console.warn('SpeechRecognition not supported')
        return false
      }
      const rec = new SpeechRecognition()
      rec.continuous=true
      rec.interimResults=false
      rec.lang=navigator.language||'en-US'
      rec.maxAlternatives=1
      rec.onresult=(e:any)=>{
        try{
          for(let i=e.resultIndex;i<e.results.length;i++){
            if(e.results[i].isFinal){
              const transcript=(e.results[i][0].transcript||'').trim().slice(0,200)
              if(!transcript) continue
              store.patch({ lastVoiceCommand:transcript })
              this.handle(transcript)
            }
          }
        }catch(err){ console.warn('onresult error', err) }
      }
      rec.onend=()=>{
        if(this.listening){
          // avoid tight loop if permission denied
          const now=Date.now()
          if(now - this.lastStartAttempt < 1000) {
            setTimeout(()=>{ try{ rec.start(); this.lastStartAttempt=Date.now() }catch{} }, 1000)
          } else {
            try{ rec.start(); this.lastStartAttempt=now }catch(e){ console.warn('Restart failed', e); this.listening=false; store.patch({ voiceListening:false }) }
          }
        }
      }
      rec.onerror=(ev:any)=>{
        console.warn('STT error',ev?.error||ev)
        if(ev?.error==='not-allowed' || ev?.error==='service-not-allowed'){
          this.listening=false
          store.patch({ voiceListening:false })
        }
      }
      rec.onnomatch=()=>{ console.log('No match') }
      this.recognition=rec
      return true
    }catch(e){
      console.warn('init SpeechRecognition failed', e)
      return false
    }
  }

  handle(transcript:string){
    try{
      this.onCommand(`transcript:${transcript}`)
      for(const cmd of this.commands){
        const m=transcript.match(cmd.pattern)
        if(m){
          try{ cmd.exec(m,transcript) }catch(err){ console.warn('Command exec failed', err) }
          return true
        }
      }
    }catch(e){ console.warn('handle failed', e) }
    return false
  }

  start(){
    if(!this.recognition){
      const ok=this.init()
      if(!ok) return false
    }
    if(!this.recognition) return false
    // throttle start attempts
    const now=Date.now()
    if(now - this.lastStartAttempt < 500) return false
    this.lastStartAttempt=now
    try{
      this.recognition.start()
      this.listening=true
      store.patch({ voiceListening:true })
      return true
    }catch(e){
      console.warn('recognition.start failed', e)
      // if already started, ignore
      if((e as any)?.message?.includes('already started')){
        this.listening=true
        store.patch({ voiceListening:true })
        return true
      }
      return false
    }
  }
  stop(){
    this.listening=false
    try{ this.recognition?.stop() }catch{}
    try{ this.recognition?.abort?.() }catch{}
    store.patch({ voiceListening:false })
  }
  toggle(){
    if(this.listening) this.stop(); else this.start()
  }

  getCheatSheet(){ return this.commands.map(c=>({ pattern:c.pattern.source, description:c.description, example:c.example })) }
}
