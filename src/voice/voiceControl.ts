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

  constructor(private onCommand:(text:string)=>void){
    this.commands = [
      { pattern:/focus on (.+)/i, description:'Focus camera and track satellite', example:'Focus on ISS', exec:(m)=>{
        const name=m[1].trim()
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
        const loc=m[1].trim()
        const city = CITY_HOTSPOTS.find(c=>c.name.toLowerCase().includes(loc.toLowerCase()) || loc.toLowerCase().includes(c.id))
        if(city){
          this.onCommand(`goto:${city.id}`)
        } else {
          // try geocode via simple mapping
          this.onCommand(`goto:custom:${loc}`)
        }
      }},
      { pattern:/time[- ]?lapse (\d+)x/i, description:'Speed up time', example:'Time-lapse 10x', exec:(m)=>{
        const scale=parseInt(m[1])
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
      { pattern:/fly to tokyo|fly to new york|fly to london/i, description:'Preset fly', example:'Fly to Tokyo', exec:(m,transcript)=>{
        const lower=transcript.toLowerCase()
        const map: Record<string,string>={ 'tokyo':'tokyo', 'new york':'nyc', 'london':'london' }
        for(const k in map){ if(lower.includes(k)) { this.onCommand(`goto:${map[k]}`); break } }
      }},
    ]
  }

  init(){
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if(!SpeechRecognition){
      console.warn('SpeechRecognition not supported')
      return false
    }
    const rec = new SpeechRecognition()
    rec.continuous=true
    rec.interimResults=false
    rec.lang=navigator.language||'en-US'
    rec.onresult=(e:any)=>{
      for(let i=e.resultIndex;i<e.results.length;i++){
        if(e.results[i].isFinal){
          const transcript=e.results[i][0].transcript.trim()
          store.patch({ lastVoiceCommand:transcript })
          this.handle(transcript)
        }
      }
    }
    rec.onend=()=>{
      if(this.listening){
        try{ rec.start() }catch{}
      }
    }
    rec.onerror=(ev:any)=>{ console.warn('STT error',ev) }
    this.recognition=rec
    return true
  }

  handle(transcript:string){
    this.onCommand(`transcript:${transcript}`)
    for(const cmd of this.commands){
      const m=transcript.match(cmd.pattern)
      if(m){ cmd.exec(m,transcript); return true }
    }
    return false
  }

  start(){
    if(!this.recognition) this.init()
    if(!this.recognition) return false
    try{
      this.recognition.start()
      this.listening=true
      store.patch({ voiceListening:true })
      return true
    }catch(e){ console.warn(e); return false }
  }
  stop(){
    this.listening=false
    try{ this.recognition?.stop() }catch{}
    store.patch({ voiceListening:false })
  }
  toggle(){
    if(this.listening) this.stop(); else this.start()
  }

  getCheatSheet(){ return this.commands.map(c=>({ pattern:c.pattern.source, description:c.description, example:c.example })) }
}
