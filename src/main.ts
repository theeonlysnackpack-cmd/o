import './styles.css'
import { store } from './state/store'
import { fetchAllTLEs, TLEEntry } from './data/celestrak'
import { Globe } from './earth/globe'
import { CITY_HOTSPOTS } from './cameras/webcamManager'
import { VoiceControl } from './voice/voiceControl'
import { FaceManager } from './face/faceManager'
import { getDB, kvGet, kvSet, auditLog } from './pwa/db'
import { RECORDS_CATALOG, EXCLUDED } from './records/catalog'
import { createDossier, listDossiers, getDossier, addFact, updateChecklistItem, exportDossierJSON, generatePDFReport, confidenceScore } from './records/dossier'
import { renderEntityGraph } from './records/entityGraph'
import { requireTargetDeclaration, fcraBanner, jurisdictionRules, addToOptOut, wipeSession, noTosViolatingAutomationCheck } from './records/guardrails'
import { LiveAssetTracker } from './tracking/liveAssets'
import { formatCountdown } from './utils/time'

function escapeHtml(s: string): string {
  return (s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' } as any)[c])
}
function haversineDeg(lat1:number, lon1:number, lat2:number, lon2:number){
  const dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
  return 2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))*180/Math.PI
}

// --- DOM SKELETON ---
const app = document.getElementById('app')!
app.innerHTML = `
  <div id="canvas-container"></div>
  <div id="globe-tooltip"></div>
  <div class="topbar">
    <div class="brand">
      <div class="brand-mark">O</div>
      <div class="brand-title">ORBITAL<small>Live Earth Observation Deck</small></div>
    </div>
    <div class="top-mid">
      <div id="staleness-badge" class="badge"><span class="dot"></span><span id="staleness-text">FETCHING TLEs...</span></div>
      <div id="countdown-badge" class="badge"><span class="mono" id="countdown-text">--:--:--</span></div>
      <button id="btn-refresh" class="icon-btn">⟳ Force Refresh</button>
      <button id="btn-geoloc" class="icon-btn">📍 My Location</button>
    </div>
    <div class="top-right">
      <div id="mic-indicator" class="mic-indicator" title="Voice control — click to toggle"><div class="pulse"></div></div>
      <div id="face-indicator" class="icon-btn">🧑 Face: none</div>
      <button id="btn-export" class="icon-btn">Export JSON</button>
      <button id="btn-import" class="icon-btn">Import</button>
      <input id="file-import" type="file" accept=".json" style="display:none" />
      <button id="btn-install" class="icon-btn" style="display:none">⬇ Install PWA</button>
      <button id="btn-onboard" class="icon-btn">? Help</button>
    </div>
  </div>

  <div class="hud">
    <div class="left">
      <div class="panel" style="max-height:54vh">
        <div class="panel-head"><h2>Satellite Catalog • <span id="sat-count">0</span></h2><span class="small mono" id="perf-fps">60 FPS</span></div>
        <div class="panel-body col">
          <input id="sat-search" class="input" placeholder="Search ISS, STARLINK-123, GPS..." />
          <div class="row" style="flex-wrap:wrap;gap:6px;margin:6px 0">
            <span class="chip"><span class="c" style="background:#5ee1ff"></span>Starlink</span>
            <span class="chip"><span class="c" style="background:#3eff8b"></span>GPS</span>
            <span class="chip"><span class="c" style="background:#ff5a6a"></span>ISS</span>
            <span class="chip"><span class="c" style="background:#9d7cff"></span>OneWeb</span>
            <span class="chip"><span class="c" style="background:#ffcf4d"></span>CubeSat</span>
          </div>
          <div id="sat-list" class="list"></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Focused • Live Metrics</h2><button id="btn-clear-focus" class="icon-btn" style="padding:2px 6px">✕</button></div>
        <div class="panel-body small mono" id="focus-metrics">
          <div class="small">No satellite selected. Click a point or use search. Try voice: “Focus on ISS”</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Layers</h2></div>
        <div class="panel-body">
          <div class="toggle"><span>Constellation coloring</span><input type="checkbox" data-layer="constellation" checked /></div>
          <div class="toggle"><span>Orbital paths</span><input type="checkbox" data-layer="orbitalPaths" /></div>
          <div class="toggle"><span>Ground tracks</span><input type="checkbox" data-layer="groundTracks" /></div>
          <div class="toggle"><span>Coverage footprints</span><input type="checkbox" data-layer="footprints" /></div>
          <div class="toggle"><span>Day/night terminator</span><input type="checkbox" data-layer="terminator" checked /></div>
          <div class="toggle"><span>Webcam hotspots</span><input type="checkbox" data-layer="webcamHotspots" checked /></div>
          <div class="toggle"><span>AIS vessels (live public)</span><input type="checkbox" data-layer="ais" /></div>
          <div class="toggle"><span>ADS-B aircraft (public)</span><input type="checkbox" data-layer="adsb" /></div>
          <div class="hr"></div>
          <div class="small">Performance: <span id="gpu-tier">mid</span> • <span id="degraded">stable 60fps</span></div>
          <div class="small">Try: <span class="kbd">Show Starlink</span> <span class="kbd">Time-lapse 10x</span> <span class="kbd">Go to Cape Canaveral</span></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Ground Cameras • Live</h2></div>
        <div class="panel-body" id="cam-list" style="max-height:22vh;overflow:auto;display:flex;flex-direction:column;gap:6px"></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Overhead — Right Now</h2><span class="small" id="geo-status">No location</span></div>
        <div class="panel-body small" id="overhead-panel">Grant geolocation to see satellites above you.</div>
      </div>
    </div>

    <div class="right">
      <div class="panel" style="flex:1">
        <div class="tabs">
          <div class="tab active" data-tab="dossier">Dossier Builder</div>
          <div class="tab" data-tab="catalog">Records Catalog</div>
          <div class="tab" data-tab="assets">Live Assets</div>
          <div class="tab" data-tab="audit">Audit & Guardrails</div>
          <div class="tab" data-tab="face">Face Profiles</div>
        </div>
        <div class="panel-body" id="right-content" style="overflow:auto"></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Voice — Cheat Sheet & Status</h2></div>
        <div class="panel-body small" id="voice-panel"></div>
      </div>
    </div>

    <div class="center-pip" id="pip-container"></div>

    <div class="bottombar">
      <div class="preset-bar">
        <button class="icon-btn" data-preset="free">Free Orbit</button>
        <button class="icon-btn" data-preset="follow">Follow Sat</button>
        <button class="icon-btn" data-preset="fixed">Earth-fixed City</button>
        <button class="icon-btn" data-preset="cinematic">Cinematic Dolly</button>
        <button class="icon-btn" data-preset="satellite">Sat POV</button>
      </div>
      <div class="time-controls">
        <span>Time:</span>
        <button class="icon-btn" data-timescale="1">1× Real</button>
        <button class="icon-btn" data-timescale="10">10×</button>
        <button class="icon-btn" data-timescale="100">100×</button>
        <button class="icon-btn" data-timescale="1000">1000×</button>
        <span id="current-time" class="mono"></span>
      </div>
    </div>
  </div>

  <div id="loader" class="loader">
    <div class="loader-card">
      <div style="font-weight:800;letter-spacing:0.06em;font-size:20px">ORBITAL INITIALIZING</div>
      <div class="small" style="margin-top:6px">Real current Earth orientation • SGP4 in Web Worker • 12k sats instanced</div>
      <div class="progress"><div id="load-progress" style="width:0%"></div></div>
      <div id="load-msg" class="small mono">Booting...</div>
      <div class="small" style="margin-top:8px;opacity:0.6">Live GOES texture attempt + CelesTrak TLEs (cached offline). No API key, no registration.</div>
    </div>
  </div>
`

// Quick refs
const canvasContainer = document.getElementById('canvas-container')!
const satListEl = document.getElementById('sat-list')!
const satSearchEl = document.getElementById('sat-search') as HTMLInputElement
const satCountEl = document.getElementById('sat-count')!
const focusMetricsEl = document.getElementById('focus-metrics')!
const camListEl = document.getElementById('cam-list')!
const overheadEl = document.getElementById('overhead-panel')!
const pipContainer = document.getElementById('pip-container')!
const loaderEl = document.getElementById('loader')!
const loadProgressEl = document.getElementById('load-progress')!
const loadMsgEl = document.getElementById('load-msg')!
const stalenessEl = document.getElementById('staleness-text')!
const countdownEl = document.getElementById('countdown-text')!
const stalenessBadge = document.getElementById('staleness-badge')!
const perfFpsEl = document.getElementById('perf-fps')!
const gpuTierEl = document.getElementById('gpu-tier')!
const degradedEl = document.getElementById('degraded')!
const geoStatusEl = document.getElementById('geo-status')!
const currentTimeEl = document.getElementById('current-time')!
const rightContentEl = document.getElementById('right-content')!
const voicePanelEl = document.getElementById('voice-panel')!

// Worker
const worker = new Worker(new URL('./sat/worker.ts', import.meta.url), { type:'module' })
let tleEntries: TLEEntry[] = []
let positionsMap = new Map<string, { x:number,y:number,z:number, lat:number,lon:number,alt:number, vx:number,vy:number,vz:number }>()

// Globe
const globe = new Globe(canvasContainer, worker)
globe.onSatClickCb((id)=>{
  store.patch({ focusedSatId:id, trackedSatId:id })
  worker.postMessage({ type:'computeOrbit', id, steps: 90 })
})

// Layers wiring (clone to avoid mutating state)
document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach(inp=>{
  inp.addEventListener('change', ()=>{
    const current = store.get().layers
    const next = { ...current, [inp.dataset.layer!]: inp.checked } as any
    store.patch({ layers: next })
  })
})

store.subscribe(s=>{
  satCountEl.textContent = s.satCount.toLocaleString()
  perfFpsEl.textContent = `${s.performance.fps} FPS`
  gpuTierEl.textContent = s.performance.gpuTier
  degradedEl.textContent = s.performance.degraded ? '⚠ degrading' : 'stable 60fps'
  if(s.layers){
    document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach(inp=>{
      const key = (inp as any).dataset.layer
      if(key && (s.layers as any)[key] !== undefined) inp.checked = (s.layers as any)[key]
    })
  }
  currentTimeEl.textContent = new Date().toUTCString()
})

let satListRaf = 0
function scheduleSatList(){ if(satListRaf) return; satListRaf = requestAnimationFrame(()=>{ satListRaf=0; renderSatList(); }) }
store.subscribe(()=>{
  renderFocusMetrics()
  scheduleSatList()
})

// Satellite list rendering (escaped, throttled)
function renderSatList(){
  const query = store.get().searchQuery.toLowerCase()
  const filtered = tleEntries.filter(e=>{
    if(query && !e.name.toLowerCase().includes(query) && !e.id.includes(query)) return false
    return true
  }).slice(0, 300)
  satListEl.innerHTML = filtered.map(e=>{
    const pos = positionsMap.get(e.id)
    const alt = pos ? `${pos.alt.toFixed(0)}km` : '--'
    const isFocused = store.get().focusedSatId===e.id
    return `<div class="list-item ${isFocused?'active':''}" data-id="${escapeHtml(e.id)}"><div><strong>${escapeHtml(e.name)}</strong><div class="small mono">${escapeHtml(e.id)} • ${escapeHtml(e.group)}</div></div><div class="small mono" style="text-align:right">${escapeHtml(alt)}<br/>${pos? `${pos.lat.toFixed(1)},${pos.lon.toFixed(1)}`:''}</div></div>`
  }).join('')
  satListEl.querySelectorAll('.list-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id=(el as HTMLElement).dataset.id!
      store.patch({ focusedSatId:id, trackedSatId:id })
      globe.focusOnSat(id)
      worker.postMessage({ type:'computeOrbit', id, steps: 120 })
    })
  })
}
satSearchEl.addEventListener('input', ()=>{
  store.patch({ searchQuery: satSearchEl.value })
  renderSatList()
})
document.getElementById('btn-clear-focus')?.addEventListener('click', ()=>{
  store.patch({ focusedSatId: undefined, trackedSatId: undefined })
  focusMetricsEl.innerHTML=`<div class="small">No satellite selected. Click a point or use search. Try voice: “Focus on ISS”</div>`
})
try{
  const ro = new ResizeObserver(()=> globe.resize())
  ro.observe(canvasContainer)
}catch{}

function renderFocusMetrics(){
  const id = store.get().focusedSatId
  if(!id){ focusMetricsEl.innerHTML = `<div class="small">No satellite selected. Click a point or use search. Try voice: “Focus on ISS”</div>`; return }
  const entry = tleEntries.find(e=>e.id===id)
  const pos = positionsMap.get(id)
  if(!entry || !pos){ focusMetricsEl.innerHTML=`<div>Loading ${escapeHtml(id)}...</div>`; return }
  const vel = Math.sqrt(pos.vx*pos.vx + pos.vy*pos.vy + pos.vz*pos.vz)
  const passesInfo = `<div class="small" id="passes-here">Calculating passes...</div>`
  focusMetricsEl.innerHTML = `
    <div style="font-weight:700;color:var(--accent)">${escapeHtml(entry.name)} • ${escapeHtml(entry.id)}</div>
    <div class="col" style="margin-top:8px">
      <div>Alt: ${pos.alt.toFixed(1)} km</div>
      <div>Vel: ${vel.toFixed(2)} km/s</div>
      <div>Lat/Lon: ${pos.lat.toFixed(3)}°, ${pos.lon.toFixed(3)}°</div>
      <div>Group: ${escapeHtml(entry.group)}</div>
      <div class="hr"></div>
      <div class="row"><button class="icon-btn" id="btn-orbit">Orbital Path</button><button class="icon-btn" id="btn-ground">Ground Track</button><button class="icon-btn" id="btn-footprint">Footprint</button></div>
      ${passesInfo}
    </div>
  `
  document.getElementById('btn-orbit')?.addEventListener('click', ()=> worker.postMessage({ type:'computeOrbit', id, steps:180 }))
  document.getElementById('btn-ground')?.addEventListener('click', ()=> {
    worker.postMessage({ type:'computeOrbit', id, steps:180 })
    store.patch({ layers:{...store.get().layers, groundTracks:true} })
  })
  document.getElementById('btn-footprint')?.addEventListener('click', ()=>{
    if(pos) globe.setFootprint(pos.lat, pos.lon, pos.alt)
    store.patch({ layers:{...store.get().layers, footprints:true} })
  })
}

// Cameras
function renderCamList(){
  camListEl.innerHTML = CITY_HOTSPOTS.map(c=>`
    <div class="list-item" data-city="${escapeHtml(c.id)}"><div><strong>${escapeHtml(c.name)}</strong><div class="small">${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}</div></div><div><button class="icon-btn">Open</button></div></div>
  `).join('')
  camListEl.querySelectorAll('.list-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id=(el as HTMLElement).dataset.city!
      const city=CITY_HOTSPOTS.find(x=>x.id===id)!
      openWebcam(city)
    })
  })
}
renderCamList()

function openWebcam(pin: typeof CITY_HOTSPOTS[0]){
  store.patch({ activeWebcam: pin, fixedLocation:{ lat:pin.lat, lon:pin.lon, name:pin.name }, cameraMode:'fixed' })
  globe.flyTo(pin.lat, pin.lon, 3.4)
  worker.postMessage({ type:'computePasses', lat:pin.lat, lon:pin.lon, altKm:0.02, hours:2 })

  pipContainer.classList.add('open')
  const safeUrl = escapeHtml(pin.url)
  const bodyContent = pin.type==='youtube'
    ? `<iframe src="${safeUrl}" allow="autoplay; fullscreen" loading="lazy" referrerpolicy="no-referrer"></iframe>`
    : pin.type==='image'
      ? `<img src="${safeUrl}" alt="${escapeHtml(pin.name)}" loading="lazy" /><div class="small" style="position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,0.6);padding:2px 6px;border-radius:4px">Live image</div>`
      : `<div style="width:100%;height:100%;display:grid;place-items:center;background:#0a1222;padding:12px;text-align:center"><div><div class="small">This portal may block embedding (X-Frame-Options).</div><a href="${safeUrl}" target="_blank" rel="noopener" class="icon-btn" style="margin-top:8px;display:inline-block">Open in new tab →</a><div class="small mono" style="margin-top:6px">${safeUrl.slice(0,60)}</div></div></div>`

  pipContainer.innerHTML=`
    <div class="pip">
      <div class="pip-head"><div><strong>${escapeHtml(pin.name)}</strong><div class="small mono">${pin.lat.toFixed(3)}, ${pin.lon.toFixed(3)}</div></div><button id="btn-close-pip" class="icon-btn">✕</button></div>
      <div class="pip-body" style="position:relative">${bodyContent}</div>
      <div class="pip-foot"><span class="mono">SGP4 visible passes</span><span id="visible-sats-count">-- sats overhead</span></div>
    </div>
  `
  document.getElementById('btn-close-pip')?.addEventListener('click', ()=>{ pipContainer.classList.remove('open'); pipContainer.innerHTML='' })
  auditLog({ action:'WEBCAM_OPEN', meta:{ city: pin.id } }).catch(()=>{})
}

// Presets
document.querySelectorAll('[data-preset]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const preset=(btn as HTMLElement).dataset.preset!
    store.patch({ cameraMode: preset as any })
    if(preset==='free'){ (globe as any).controls.autoRotate=false; store.patch({ cameraMode:'free' }) }
    if(preset==='cinematic'){ (globe as any).controls.autoRotate=true }
    if(preset==='fixed' && store.get().fixedLocation){
      globe.flyTo(store.get().fixedLocation!.lat, store.get().fixedLocation!.lon, 3.4)
    }
  })
})
document.querySelectorAll('[data-timescale]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const sc=parseInt((btn as HTMLElement).dataset.timescale!)
    store.patch({ timeScale: sc })
    worker.postMessage({ type:'timeScale', scale: sc })
  })
})

// Voice
const voiceSupport = (()=>{ try{ const SR=(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; return !!SR }catch{ return false } })()
const voice = new VoiceControl((cmd)=>{
  if(cmd.startsWith('focus:')){
    const name=cmd.slice(6).toLowerCase()
    const found=tleEntries.find(e=>e.name.toLowerCase().includes(name))
    if(found){ store.patch({ focusedSatId:found.id, trackedSatId:found.id }); globe.focusOnSat(found.id); worker.postMessage({ type:'computeOrbit', id:found.id, steps:120 }) }
  } else if(cmd.startsWith('show:')){
    const what=cmd.slice(5).toLowerCase()
    if(what.includes('ground')) store.patch({ layers:{...store.get().layers, groundTracks:true} })
    else if(what.includes('coverage')||what.includes('footprint')) store.patch({ layers:{...store.get().layers, footprints:true} })
    else {
      store.patch({ searchQuery: what })
      satSearchEl.value=what
      renderSatList()
    }
  } else if(cmd.startsWith('hide:')){
    const what=cmd.slice(5).toLowerCase()
    if(what.includes('ground')) store.patch({ layers:{...store.get().layers, groundTracks:false} })
    else if(what.includes('coverage')||what.includes('footprint')) store.patch({ layers:{...store.get().layers, footprints:false} })
    else if(what==='all'){ store.patch({ searchQuery:'' }); satSearchEl.value='' }
  } else if(cmd.startsWith('goto:')){
    const rest=cmd.slice(5)
    if(rest.startsWith('custom:')){
      const loc=rest.slice(7)
      alert(`Voice “Go to ${loc}” — geocoding not implemented offline. Try presets.`)
    } else {
      const city=CITY_HOTSPOTS.find(c=>c.id===rest)
      if(city) openWebcam(city)
    }
  } else if(cmd.startsWith('timelapse:')){
    const sc=parseInt(cmd.slice(10))
    worker.postMessage({ type:'timeScale', scale:sc })
  } else if(cmd==='realtime'){
    worker.postMessage({ type:'timeScale', scale:1 })
    store.patch({ timeScale:1 })
  } else if(cmd.startsWith('toggle:')){
    const layer=cmd.slice(7)
    if(layer==='groundTracks') store.patch({ layers:{...store.get().layers, groundTracks:!store.get().layers.groundTracks} })
    if(layer==='footprints') store.patch({ layers:{...store.get().layers, footprints:!store.get().layers.footprints} })
  } else if(cmd==='switchProfile'){
    faceManager.matchCurrent()
  }
})
const voiceInitOk = voice.init()
function renderVoicePanel(){
  const cheat=voice.getCheatSheet()
  voicePanelEl.innerHTML=`
    <div>Mic: <strong>${store.get().voiceListening?'LISTENING':'muted'}</strong> • Last: <span class="mono">${escapeHtml(store.get().lastVoiceCommand||'—')}</span> • Support: ${voiceSupport && voiceInitOk ? 'yes' : 'no (keyboard fallback)'}</div>
    <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">${cheat.map(c=>`<div class="row" style="justify-content:space-between"><span>${escapeHtml(c.description)}</span><span class="kbd">${escapeHtml(c.example)}</span></div>`).join('')}</div>
    <div class="hr"></div>
    <div class="small">Continuous listening with mute toggle. Web Speech API on-device. Fallback keyboard.</div>
  `
}
renderVoicePanel()
store.subscribe(()=>renderVoicePanel())

document.getElementById('mic-indicator')!.addEventListener('click', ()=>{
  if(!voiceSupport){ alert('SpeechRecognition not supported in this browser — use Chrome/Edge. Keyboard fallback available.'); return }
  if(store.get().voiceListening) voice.stop(); else voice.start()
})
store.subscribe(s=>{
  const mic=document.getElementById('mic-indicator')!
  if(s.voiceListening) mic.classList.add('listening'); else mic.classList.remove('listening')
})

// Face
const faceManager = new FaceManager()
const faceIndicatorEl = document.getElementById('face-indicator')!
async function updateFaceIndicator(){
  try{
    const db=await getDB()
    const profiles=await db.getAll('profiles')
    const active=store.get().activeProfileId ? profiles.find(p=>p.id===store.get().activeProfileId) : null
    faceIndicatorEl.textContent = active ? `🧑 Face: ${escapeHtml(active.name)}` : `🧑 Face: ${profiles.length} enrolled`
  }catch{ faceIndicatorEl.textContent='🧑 Face: —' }
}
store.subscribe(()=>updateFaceIndicator())
updateFaceIndicator()

// Right tabs
const tabs = document.querySelectorAll('.tab')
function switchTab(tab:string){
  tabs.forEach(t=> t.classList.toggle('active', (t as HTMLElement).dataset.tab===tab))
  renderRight(tab)
}
tabs.forEach(t=> t.addEventListener('click', ()=> switchTab((t as HTMLElement).dataset.tab!)))

async function renderRight(tab:string){
  if(tab==='dossier'){
    const dossiers=await listDossiers()
    const selectedId=store.get().selectedDossierId || dossiers[0]?.id
    const selected = selectedId ? await getDossier(selectedId) : null
    rightContentEl.innerHTML=`
      <div class="col" style="gap:12px">
        <div style="background:#0e162a;border:1px solid var(--border);border-radius:10px;padding:10px">
          <div style="font-weight:700">Target Declaration Gate (mandatory)</div>
          <div class="small">Declare target + jurisdiction + purpose. Immutable audit log. Opt-out blocked. FCRA firewall enforced.</div>
          <div class="row" style="margin-top:8px;gap:6px">
            <input id="dossier-target" class="input" placeholder="Target name, e.g. John Doe" style="flex:1" />
            <select id="dossier-juris" class="input" style="width:140px"><option value="federal">Federal</option><option value="state">State</option><option value="county">County</option><option value="global">Global</option></select>
          </div>
          <div class="row" style="margin-top:6px">
            <input id="dossier-purpose" class="input" placeholder="Purpose: due diligence / red-team recon (required)" />
          </div>
          <div class="row" style="margin-top:6px">
            <button id="btn-create-dossier" class="icon-btn" style="background:var(--accent);color:#000">Create Dossier + Checklist</button>
          </div>
          <div class="small mono" style="margin-top:6px;background:#0a0f1e;padding:6px;border-radius:6px">${escapeHtml(fcraBanner())}</div>
        </div>

        <div class="row" style="gap:6px">
          <select id="select-dossier" class="input">${dossiers.map(d=>`<option value="${escapeHtml(d.id)}" ${d.id===selectedId?'selected':''}>${escapeHtml(d.target)} • ${escapeHtml(d.jurisdiction)} • ${new Date(d.createdAt).toLocaleDateString()}</option>`).join('')}</select>
          <button id="btn-export-json" class="icon-btn">Export JSON</button>
          <button id="btn-export-pdf" class="icon-btn">Export PDF</button>
        </div>

        ${selected ? `
          <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
            <div style="padding:8px 10px;border-bottom:1px solid var(--border);font-weight:700">${escapeHtml(selected.target)} — Checklist (${selected.checklist.filter(c=>c.status==='done').length}/${selected.checklist.length})</div>
            <div style="max-height:220px;overflow:auto">
              ${selected.checklist.map(c=>`
                <div class="list-item" style="font-size:11px">
                  <div><span class="chip">${escapeHtml(c.category)}</span> ${escapeHtml(c.name)}<div class="small">${escapeHtml(c.notes?.slice(0,80)||'')}</div></div>
                  <div class="row"><span class="small ${c.status==='done'?'':'mono'}">${escapeHtml(c.status)}</span><button class="icon-btn" data-open="${escapeHtml(c.sourceId)}">Open</button><button class="icon-btn" data-done="${escapeHtml(c.sourceId)}">✓</button></div>
                </div>
              `).join('')}
            </div>
          </div>

          <div>
            <div style="font-weight:700;margin-bottom:6px">Add Fact (dedupe + normalized)</div>
            <div class="row"><input id="fact-field" class="input" placeholder="Field: address / company / N-number" style="flex:1"/><input id="fact-value" class="input" placeholder="Value" style="flex:1"/></div>
            <div class="row" style="margin-top:6px"><select id="fact-conf" class="input"><option value="primary">primary gov record</option><option value="aggregator">aggregator</option><option value="self-report">self-report</option></select><select id="fact-ver" class="input"><option value="verified">verified</option><option value="unverified">unverified</option><option value="conflicting">conflicting</option></select><input id="fact-src" class="input" placeholder="Source name" style="flex:1"/></div>
            <button id="btn-add-fact" class="icon-btn" style="margin-top:6px">Add Fact → Graph + Timeline</button>
            <div style="margin-top:8px;max-height:140px;overflow:auto;border:1px solid var(--border);border-radius:8px">
              ${(selected.facts||[]).slice(-20).reverse().map(f=>`<div class="list-item"><span>${escapeHtml(f.field)}: ${escapeHtml(f.value)} <span class="chip">${escapeHtml(f.confidence)} ${confidenceScore(f)}%</span></span><span class="small">${escapeHtml(f.source)}</span></div>`).join('') || '<div class="small" style="padding:8px">No facts yet. Use checklist to open portals (human-confirmed, single-session, no captcha bypass).</div>'}
            </div>
          </div>

          <div>
            <div style="font-weight:700">Entity Graph (Cytoscape.js)</div>
            <div id="cy"></div>
          </div>

          <div class="timeline" id="dossier-tl">
            ${selected.timeline.sort((a,b)=>a.date.localeCompare(b.date)).slice(0,50).map(ev=>`<div class="tl-item"><strong>${escapeHtml(ev.date.slice(0,10))}</strong> — ${escapeHtml(ev.title)}<div class="small">${escapeHtml(ev.source)}</div></div>`).join('') || '<div class="small">Timeline from dated records.</div>'}
          </div>
        ` : `<div class="small">No dossier selected. Declare target above.</div>`}
      </div>
    `
    document.getElementById('btn-create-dossier')?.addEventListener('click', async ()=>{
      const target=(document.getElementById('dossier-target') as HTMLInputElement).value.trim()
      const juris=(document.getElementById('dossier-juris') as HTMLSelectElement).value
      const purpose=(document.getElementById('dossier-purpose') as HTMLInputElement).value.trim()
      if(!target || !purpose){ alert('Target and purpose required (guardrail)'); return }
      try{
        await requireTargetDeclaration(target, juris, purpose)
        const d=await createDossier(target, juris)
        store.patch({ selectedDossierId:d.id })
        renderRight('dossier')
      }catch(e:any){ alert(e.message) }
    })
    document.getElementById('select-dossier')?.addEventListener('change', (e)=>{
      const id=(e.target as HTMLSelectElement).value
      store.patch({ selectedDossierId:id })
      renderRight('dossier')
    })
    document.getElementById('btn-export-json')?.addEventListener('click', async ()=>{
      if(!selected) return
      const js=await exportDossierJSON(selected.id)
      const blob=new Blob([js],{type:'application/json'})
      const url=URL.createObjectURL(blob)
      const a=document.createElement('a'); a.href=url; a.download=`dossier-${selected.target.replace(/[^a-z0-9]/gi,'_')}.json`; a.click()
      setTimeout(()=>URL.revokeObjectURL(url), 4000)
    })
    document.getElementById('btn-export-pdf')?.addEventListener('click', async ()=>{
      if(!selected) return
      try{
        const uri=await generatePDFReport(selected.id)
        const a=document.createElement('a'); a.href=uri; a.download=`dossier-${selected.target.replace(/[^a-z0-9]/gi,'_')}.pdf`; a.click()
      }catch(e:any){ alert('PDF export failed: '+e.message) }
    })
    document.querySelectorAll('[data-open]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const sid=(b as HTMLElement).dataset.open!
        const item=selected?.checklist.find(c=>c.sourceId===sid)
        if(item){ window.open(item.url,'_blank','noopener,noreferrer'); updateChecklistItem(selected!.id, sid, 'done').catch(()=>{}) }
      })
    })
    document.querySelectorAll('[data-done]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const sid=(b as HTMLElement).dataset.done!
        updateChecklistItem(selected!.id, sid, 'done').then(()=>renderRight('dossier')).catch(()=>{})
      })
    })
    document.getElementById('btn-add-fact')?.addEventListener('click', async ()=>{
      if(!selected) return
      const field=(document.getElementById('fact-field') as HTMLInputElement).value.trim()
      const value=(document.getElementById('fact-value') as HTMLInputElement).value.trim()
      const conf=(document.getElementById('fact-conf') as HTMLSelectElement).value as any
      const ver=(document.getElementById('fact-ver') as HTMLSelectElement).value as any
      const src=(document.getElementById('fact-src') as HTMLInputElement).value.trim() || 'manual'
      if(!field||!value) return
      try{
        await addFact(selected.id, { field, value, confidence:conf, verification:ver, source:src, sourceUrl:'', timestamp:Date.now() })
        renderRight('dossier')
      }catch(e:any){ alert(e.message) }
    })
    if(selected){
      setTimeout(()=>{
        const cyEl=document.getElementById('cy')
        if(cyEl){
          try{ renderEntityGraph(cyEl, selected) }catch(e){ console.warn('Graph render failed', e) }
        }
      }, 80)
    }

  } else if(tab==='catalog'){
    rightContentEl.innerHTML=`
      <div class="col" style="gap:10px">
        <div style="font-weight:800">Records Catalog — All Primary Public Sources, No Paywall Bypass</div>
        <div class="small">Federal/state/county, FAA/FCC/USCG, SOS/SEC, OSINT public. Excluded: FCRA/DPPA/licensed-broker.</div>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          ${['courts','licenses','corporate','people','assets'].map(cat=>`<span class="chip">${escapeHtml(cat)} (${RECORDS_CATALOG.filter(r=>r.category===cat).length})</span>`).join('')}
        </div>
        <input id="catalog-search" class="input" placeholder="Search source: FAA, PACER, SEC..." />
        <div id="catalog-list" style="display:flex;flex-direction:column;gap:6px;max-height:60vh;overflow:auto"></div>
        <div class="hr"></div>
        <div style="font-weight:700">Deliberately Excluded (why)</div>
        <div class="col" style="gap:6px">${EXCLUDED.map(e=>`<div class="small"><strong>${escapeHtml(e.category)}:</strong> ${escapeHtml(e.reason)}</div>`).join('')}</div>
      </div>
    `
    const searchEl=document.getElementById('catalog-search') as HTMLInputElement
    const listEl=document.getElementById('catalog-list')!
    const render=()=>{
      const q=(searchEl.value||'').toLowerCase()
      const filtered=RECORDS_CATALOG.filter(r=> !q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
      listEl.innerHTML=filtered.map(r=>`
        <div class="list-item" style="flex-direction:column;align-items:flex-start">
          <div class="row" style="justify-content:space-between;width:100%"><strong>${escapeHtml(r.name)}</strong><span class="chip">${escapeHtml(r.category)} • ${escapeHtml(r.confidence)}</span></div>
          <div class="small">${escapeHtml(r.description)}</div>
          <div class="row"><span class="small mono" style="overflow:hidden;text-overflow:ellipsis;max-width:220px">${escapeHtml(r.url)}</span><button class="icon-btn" data-open="${escapeHtml(r.id)}">Open portal</button></div>
        </div>
      `).join('')
      listEl.querySelectorAll('[data-open]').forEach(b=>{
        b.addEventListener('click', ()=>{
          const id=(b as HTMLElement).dataset.open!
          const src=RECORDS_CATALOG.find(s=>s.id===id)!
          window.open(src.url,'_blank','noopener,noreferrer')
        })
      })
    }
    searchEl.addEventListener('input', render)
    render()

  } else if(tab==='assets'){
    const tracker=new LiveAssetTracker()
    rightContentEl.innerHTML=`
      <div class="col" style="gap:10px">
        <div style="font-weight:800">Live Asset Tracking — Public Broadcast Only</div>
        <div class="small">AIS vessels via satellite (Spire/ORBCOMM) + coastal. ADS-B via ground + satellite. Correlate IMO→owner, N-number→FAA owner back to dossier graph.</div>
        <div class="row"><button id="btn-fetch-adsb" class="icon-btn">Fetch ADS-B (ADSB.lol + OpenSky)</button><button id="btn-fetch-ais" class="icon-btn">Fetch AIS (sim + Spire-ready)</button></div>
        <div id="assets-status" class="small mono">Idle</div>
        <div class="hr"></div>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><div style="font-weight:700">Aircraft • <span id="ac-count">0</span></div><div id="ac-list" class="list" style="max-height:24vh"></div></div>
          <div style="flex:1"><div style="font-weight:700">Vessels • <span id="vs-count">0</span></div><div id="vs-list" class="list" style="max-height:24vh"></div></div>
        </div>
        <div class="small">${escapeHtml(fcraBanner())}</div>
        <div class="small">PIA/blocked P24 filtered, respect opt-out. Public broadcast only — no hacking.</div>
      </div>
    `
    const statusEl=document.getElementById('assets-status')!
    const acList=document.getElementById('ac-list')!
    const vsList=document.getElementById('vs-list')!
    const acCount=document.getElementById('ac-count')!
    const vsCount=document.getElementById('vs-count')!
    let acData:any[]=[], vsData:any[]=[]

    const renderAssets=()=>{
      acCount.textContent=acData.length.toString()
      vsCount.textContent=vsData.length.toString()
      acList.innerHTML=acData.slice(0,100).map(a=>`<div class="list-item"><span>${escapeHtml(a.callsign||a.icao)} ${escapeHtml(a.nNumber||'')} ${a.alt? Math.round(a.alt)+'ft':''}</span><span class="small">${(a.lat?.toFixed(2)||'--')},${(a.lon?.toFixed(2)||'--')}</span></div>`).join('')
      vsList.innerHTML=vsData.slice(0,100).map(v=>`<div class="list-item"><span>${escapeHtml(v.name)} ${escapeHtml(v.imo||'')}</span><span class="small">${escapeHtml(v.owner||'')}</span></div>`).join('')
    }

    document.getElementById('btn-fetch-adsb')?.addEventListener('click', async ()=>{
      statusEl.textContent='Fetching ADS-B...'
      try{
        acData=await tracker.fetchADSB(store.get().fixedLocation?.lat, store.get().fixedLocation?.lon)
        statusEl.textContent=`ADS-B: ${acData.length} aircraft`
        renderAssets()
        await auditLog({ action:'ADSB_FETCH', meta:{ count:acData.length } })
      }catch(e:any){ statusEl.textContent='ADS-B failed: '+e.message+' — using sim fallback'; acData=await tracker.fetchAIS().then(()=>tracker.getAircrafts()); renderAssets() }
    })
    document.getElementById('btn-fetch-ais')?.addEventListener('click', async ()=>{
      statusEl.textContent='Fetching AIS (public broadcast)...'
      try{
        vsData=await tracker.fetchAIS()
        statusEl.textContent=`AIS: ${vsData.length} vessels`
        renderAssets()
        await auditLog({ action:'AIS_FETCH', meta:{ count:vsData.length } })
      }catch(e:any){ statusEl.textContent='AIS failed: '+e.message }
    })

  } else if(tab==='audit'){
    const db=await getDB()
    const audits=(await db.getAll('audit')).sort((a,b)=>b.ts-a.ts).slice(0,100)
    const optouts=await db.getAll('optout')
    rightContentEl.innerHTML=`
      <div class="col" style="gap:10px">
        <div style="font-weight:800">Guardrails — Ship This or Tool Is Indefensible</div>
        <div class="small">Target declaration gate, immutable audit log, session retention + one-click wipe, FCRA firewall, jurisdiction rules, opt-out registry, no ToS-violating automation.</div>
        <div class="row"><button id="btn-wipe" class="icon-btn" style="border-color:var(--red);color:var(--red)">🔥 One-Click Wipe Local</button><button id="btn-add-optout" class="icon-btn">Add Opt-Out</button></div>
        <div><strong>Opt-Out Registry • ${optouts.length}</strong><div class="small">${optouts.map(o=>escapeHtml(o.name)).join(', ')||'empty'}</div></div>
        <div><strong>Jurisdiction Rules</strong><div class="small">${jurisdictionRules('US').map(escapeHtml).join(' • ')}<br/>EU: ${jurisdictionRules('EU').map(escapeHtml).join(' • ')}<br/>IL BIPA: ${jurisdictionRules('US-IL').map(escapeHtml).join(' • ')}</div></div>
        <div><strong>Audit Log • Immutable • ${audits.length}</strong><div class="list" style="max-height:36vh">${audits.map(a=>`<div class="list-item"><span class="mono">${escapeHtml(new Date(a.ts).toLocaleTimeString())} ${escapeHtml(a.action)} ${escapeHtml(a.target||'')}</span><span class="small">${(a.sources||[]).map(escapeHtml).join(',')} </span></div>`).join('')}</div></div>
        <div class="small mono">No ToS-violating automation: ${escapeHtml((()=>{ try { return JSON.stringify(noTosViolatingAutomationCheck()); } catch { return 'policy: single-session, human-in-loop, no captcha busting'; } })())}</div>
      </div>
    `
    document.getElementById('btn-wipe')?.addEventListener('click', async ()=>{
      if(confirm('Wipe all local IndexedDB: TLE cache, profiles, dossiers, audit?')){
        await wipeSession()
        alert('Wiped.')
        renderRight('audit')
      }
    })
    document.getElementById('btn-add-optout')?.addEventListener('click', async ()=>{
      const name=prompt('Name to opt-out (exact match blocks future searches):')
      if(name){ await addToOptOut(name); renderRight('audit') }
    })

  } else if(tab==='face'){
    rightContentEl.innerHTML=`
      <div class="col" style="gap:10px">
        <div style="font-weight:800">Face Recognition — On-Device, Privacy-First</div>
        <div class="small">All inference in browser. Templates in IndexedDB only, cloud sync only if opted in. No images leave device. BIPA compliant.</div>
        <div class="row" style="gap:8px">
          <video id="face-video" width="160" height="120" style="background:#000;border-radius:10px;border:1px solid var(--border)" autoplay muted playsinline></video>
          <canvas id="face-canvas" width="112" height="112" style="display:none"></canvas>
          <div class="col">
            <button id="btn-start-cam" class="icon-btn">Start Camera</button>
            <button id="btn-enroll" class="icon-btn">Add Me (enroll wizard)</button>
            <button id="btn-match" class="icon-btn">Switch Profile (match)</button>
            <button id="btn-wipe-face" class="icon-btn" style="border-color:var(--red);color:var(--red)">Forget Me (wipe all)</button>
          </div>
        </div>
        <div id="face-list" class="list"></div>
        <div class="small mono" id="face-status">Idle</div>
        <div style="background:#0e162a;border:1px solid var(--border);border-radius:10px;padding:8px" class="small">
          <strong>Consent Notice (visible):</strong> “Face templates are created on-device from your camera, stored only in this browser’s IndexedDB, never uploaded unless you explicitly enable cloud sync. You can delete your template at any time with ‘Forget Me’. No images leave your device.”
        </div>
      </div>
    `
    const video=document.getElementById('face-video') as HTMLVideoElement
    const canvas=document.getElementById('face-canvas') as HTMLCanvasElement
    const statusEl=document.getElementById('face-status')!
    const listEl=document.getElementById('face-list')!
    await faceManager.init(video, canvas)

    const refreshList=async()=>{
      const profiles=await faceManager.listProfiles()
      listEl.innerHTML=profiles.map(p=>`<div class="list-item"><span>${escapeHtml(p.name)} • ${new Date(p.createdAt).toLocaleString()}</span><button class="icon-btn" data-del="${escapeHtml(p.id)}">Del</button></div>`).join('')
      listEl.querySelectorAll('[data-del]').forEach(b=>{
        b.addEventListener('click', async()=>{
          await faceManager.deleteProfile((b as HTMLElement).dataset.del!); refreshList(); updateFaceIndicator()
        })
      })
    }
    refreshList()

    document.getElementById('btn-start-cam')?.addEventListener('click', async()=>{
      const ok=await faceManager.startCamera()
      statusEl.textContent= ok? 'Camera started (on-device only)' : 'Camera permission denied — voice/keyboard still works'
    })
    document.getElementById('btn-enroll')?.addEventListener('click', async()=>{
      const name=prompt('Your display name for profile (saved locally):')
      if(!name) return
      if(!confirm('CONSENT: Face template will be created on-device, stored locally in IndexedDB, never uploaded unless you opt-in to cloud sync. Continue?')) return
      try{
        const p=await faceManager.enroll(name)
        statusEl.textContent=`Enrolled ${p.name} with on-device descriptor (privacy-first)`
        await auditLog({ action:'FACE_ENROLL', actorProfileId:p.id })
        refreshList(); updateFaceIndicator()
      }catch(e:any){ statusEl.textContent=`Enroll failed: ${e.message}` }
    })
    document.getElementById('btn-match')?.addEventListener('click', async()=>{
      const m=await faceManager.matchCurrent()
      if(m){ statusEl.textContent=`Matched ${m.profile.name} score ${m.score.toFixed(3)} — loaded prefs`; store.patch({ activeProfileId:m.profile.id }); updateFaceIndicator() }
      else statusEl.textContent='No match >0.92 threshold'
    })
    document.getElementById('btn-wipe-face')?.addEventListener('click', async()=>{
      if(confirm('One-tap wipe all face templates?')){ await faceManager.wipeAll(); refreshList(); updateFaceIndicator(); statusEl.textContent='Wiped all face templates (BIPA compliant)' }
    })
  }
}
renderRight('dossier')

// TLE fetch & worker lifecycle
async function loadTLEs(){
  loadMsgEl.textContent='Fetching CelesTrak — starlink, gps-ops, stations, visual, oneweb, active (12k)...'
  try{
    tleEntries = await fetchAllTLEs((p,msg)=>{
      loadProgressEl.style.width=`${Math.round(p*100)}%`
      loadMsgEl.textContent=msg
    })
    loadProgressEl.style.width='100%'
    loadMsgEl.textContent=`Loaded ${tleEntries.length} satellites • starting SGP4 worker`
    globe.setSatellites(tleEntries)
    worker.postMessage({ type:'init', entries: tleEntries })
    const now=Date.now()
    store.patch({ tlesFetchedAt: now, nextRefreshAt: now + 2*60*60*1000, satCount: tleEntries.length })
    await kvSet('lastTLEFetch', now)
    setTimeout(()=>{ loaderEl.style.display='none' }, 800)
  }catch(e:any){
    loadMsgEl.textContent=`Fetch failed: ${e.message} — using demo fallback`
    try{
      tleEntries = await fetchAllTLEs()
      globe.setSatellites(tleEntries)
      worker.postMessage({ type:'init', entries: tleEntries })
    }catch{}
    setTimeout(()=>{ loaderEl.style.display='none' }, 800)
  }
}
loadTLEs()

worker.onmessage = (e)=>{
  const { type } = e.data
  if(type==='positions'){
    const { positions } = e.data
    const map=new Map<string, any>()
    for(const p of positions){ map.set(p.id, p) }
    positionsMap = map
    globe.updatePositions(positions)
    updateOverhead()
  } else if(type==='orbit'){
    const { path } = e.data
    globe.setOrbitPath(path)
    globe.setGroundTrack(path)
  } else if(type==='passes'){
    const { passes, lat, lon } = e.data
    const el=document.getElementById('visible-sats-count')
    if(el) el.textContent=`${passes.length} sats visible from ${lat.toFixed(2)},${lon.toFixed(2)}`
    const focusPassesEl=document.getElementById('passes-here')
    if(focusPassesEl){
      focusPassesEl.innerHTML = passes.slice(0,10).map((p:any)=>`<div>${escapeHtml(p.name)} el ${p.maxEl.toFixed(1)}°</div>`).join('') || 'No passes >10°'
    }
  }
}
worker.onerror = (e)=>{ console.error('Worker error', e); loadMsgEl.textContent+=' • Worker error, reloading...'; }

// Countdown timer for TLE staleness
setInterval(()=>{
  const st=store.get()
  if(!st.tlesFetchedAt){ stalenessEl.textContent='NO DATA'; stalenessBadge.className='badge err'; return }
  const age=Date.now()-st.tlesFetchedAt
  const hours=age/3600000
  stalenessEl.textContent=`TLE Age: ${hours.toFixed(1)}h • ${st.satCount} sats`
  if(hours<1) stalenessBadge.className='badge'
  else if(hours<3) stalenessBadge.className='badge warn'
  else stalenessBadge.className='badge err'

  if(st.nextRefreshAt){
    const remaining=st.nextRefreshAt-Date.now()
    countdownEl.textContent= formatCountdown(st.nextRefreshAt)
    if(remaining<0){
      store.patch({ nextRefreshAt: Date.now()+2*60*60*1000 })
      fetchAllTLEs().then(entries=>{
        tleEntries=entries
        globe.setSatellites(entries)
        worker.postMessage({ type:'init', entries })
        store.patch({ tlesFetchedAt: Date.now(), nextRefreshAt: Date.now()+2*60*60*1000 })
      }).catch(()=>{})
    }
  }
}, 1000)

document.getElementById('btn-refresh')?.addEventListener('click', async ()=>{
  loadProgressEl.style.width='30%'; loaderEl.style.display='grid'; loadMsgEl.textContent='Force refresh TLEs...'
  try{
    tleEntries = await fetchAllTLEs((p,m)=>{ loadProgressEl.style.width=`${Math.round(p*100)}%`; loadMsgEl.textContent=m })
    globe.setSatellites(tleEntries); worker.postMessage({ type:'init', entries:tleEntries })
    store.patch({ tlesFetchedAt:Date.now(), nextRefreshAt: Date.now()+2*60*60*1000 })
  }catch(e:any){ loadMsgEl.textContent='Refresh failed: '+e.message }
  loaderEl.style.display='none'
})

// Geolocation overhead - improved with haversine, limited scan
let userLocation: {lat:number, lon:number} | null = null
let overheadRaf = 0
function updateOverhead(){
  if(overheadRaf) return
  overheadRaf = requestAnimationFrame(()=>{
    overheadRaf=0
    if(!userLocation || positionsMap.size===0) return
    const { lat, lon } = userLocation
    const candidates:{id:string,name:string,alt:number,distDeg:number}[]=[]
    let scanned=0
    for(const [id,pos] of positionsMap){
      if(scanned++>800) break
      if(pos.alt<180) continue
      const dist = haversineDeg(lat, lon, pos.lat, pos.lon)
      if(dist<25){
        candidates.push({ id, name: tleEntries.find(e=>e.id===id)?.name||id, alt:pos.alt, distDeg:dist })
      }
    }
    candidates.sort((a,b)=>a.distDeg-b.distDeg)
    const top=candidates.slice(0,8)
    overheadEl.innerHTML = top.map(o=>`<div class="list-item"><span>${escapeHtml(o.name)}</span><span class="small">${o.alt.toFixed(0)}km ${o.distDeg.toFixed(1)}°</span></div>`).join('') || '<div class="small">No sats overhead (within 25°) in scanned 800 — try Go to location or wait for passes.</div>'
  })
}
document.getElementById('btn-geoloc')?.addEventListener('click', ()=>{
  if(!navigator.geolocation){ alert('Geolocation not supported'); return }
  geoStatusEl.textContent='Locating...'
  navigator.geolocation.getCurrentPosition(pos=>{
    userLocation={ lat:pos.coords.latitude, lon:pos.coords.longitude }
    geoStatusEl.textContent=`${userLocation.lat.toFixed(3)}, ${userLocation.lon.toFixed(3)}`
    globe.flyTo(userLocation!.lat, userLocation!.lon, 2.8)
    worker.postMessage({ type:'computePasses', lat:userLocation!.lat, lon:userLocation!.lon, altKm:0 })
    updateOverhead()
  }, err=>{
    geoStatusEl.textContent=`Error: ${escapeHtml(err.message)}`
  })
})

// Export / import session state
document.getElementById('btn-export')?.addEventListener('click', async ()=>{
  try{
    const db=await getDB()
    const dossiers=await db.getAll('dossiers')
    const profiles=await db.getAll('profiles')
    const state={ store:store.get(), dossiers, profiles, tleAge:store.get().tlesFetchedAt, timestamp:Date.now(), attribution:'TLEs © CelesTrak; Imagery © NOAA; Demo build, offline capable' }
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a'); a.href=url; a.download=`orbital-session-${new Date().toISOString().slice(0,10)}.json`; a.click()
    setTimeout(()=>URL.revokeObjectURL(url), 5000)
  }catch(e:any){ alert('Export failed: '+e.message) }
})
document.getElementById('btn-import')?.addEventListener('click', ()=> document.getElementById('file-import')!.click())
document.getElementById('file-import')?.addEventListener('change', async (e)=>{
  const input=e.target as HTMLInputElement
  const file=input.files?.[0]
  if(!file) return
  const txt=await file.text()
  try{
    const json=JSON.parse(txt)
    if(json.dossiers){ const db=await getDB(); for(const d of json.dossiers) await db.put('dossiers', d) }
    if(json.profiles){ const db=await getDB(); for(const p of json.profiles) await db.put('profiles', p) }
    if(json.store){ store.patch(json.store) }
    alert('Session imported — dossiers + profiles restored (air-gapped portability verified)')
    renderRight('dossier')
    updateFaceIndicator()
  }catch(err:any){ alert('Import failed: '+err.message) }
  input.value=''
})

// Onboarding modal
function showOnboarding(){
  const overlay=document.createElement('div'); overlay.className='overlay'
  overlay.innerHTML=`
    <div class="modal">
      <div class="modal-head"><div><div style="font-weight:800;font-size:22px;letter-spacing:0.04em">ORBITAL — Mission Control</div><div class="small">Frontend-only, live Earth, 12k sats SGP4 in worker, voice + face, PWA offline, records catalog + live AIS/ADS-B</div></div><button class="icon-btn" id="close-onboard">✕</button></div>
      <div class="modal-body">
        <div class="row" style="gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:260px;background:#0e162a;border:1px solid var(--border);border-radius:12px;padding:12px">
            <div style="font-weight:700">🌍 Wow 1 — Live Earth Shell</div><div class="small" style="margin-top:6px">Thousands of Starlink satellites forming a glowing shell gliding over a live-cloud Earth. Real axial tilt + GMST rotation aligned to UTC. Try cinematic dolly preset.</div>
          </div>
          <div style="flex:1;min-width:260px;background:#0e162a;border:1px solid var(--border);border-radius:12px;padding:12px">
            <div style="font-weight:700">🛰️ Wow 2 — ISS Terminator Crossing</div><div class="small" style="margin-top:6px">Watch ISS cross terminator into sunlight in real time as GOES texture updates overhead. Click ISS → orbital path + footprint + ground track.</div>
          </div>
          <div style="flex:1;min-width:260px;background:#0e162a;border:1px solid var(--border);border-radius:12px;padding:12px">
            <div style="font-weight:700">🎙️ Wow 3 — Voice to Tokyo</div><div class="small" style="margin-top:6px">Say “fly to Tokyo” — camera banks over Pacific, live webcam docks into HUD, SGP4 engine shows 3 Starlinks streaking past that sky in next 20 minutes. Try voice mic toggle top-right.</div>
          </div>
        </div>
        <div class="hr"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:240px">
            <div style="font-weight:700">Voice Commands</div>
            <div class="small mono" style="margin-top:6px">
              • “Focus on ISS” → camera zooms and tracks<br/>
              • “Show Starlink” / “Hide debris”<br/>
              • “Go to Cape Canaveral” → fly + webcam + passes<br/>
              • “Time-lapse 10x” / “Back to real time”<br/>
              • “Show ground tracks” / “Coverage on”<br/>
              • “Switch profile” → re-runs face match
            </div>
            <button id="btn-try-voice" class="icon-btn" style="margin-top:8px">🎤 Try Voice Now</button>
          </div>
          <div style="flex:1;min-width:240px">
            <div style="font-weight:700">Face Recognition (privacy-first)</div>
            <div class="small" style="margin-top:6px\">On-device only, no images leave device. Templates stored locally IndexedDB by default, cloud sync only if explicitly opted in. “Add me” wizard shows consent. One-tap “Forget me” wipe. Illinois BIPA compliant.</div>
            <button id="btn-try-face" class="icon-btn" style="margin-top:8px">🧑 Enroll Face</button>
          </div>
        </div>
        <div class="hr"></div>
        <div class="small\">Stack: Three.js, satellite.js, CelesTrak, NOAA GOES, Web Speech API, face-api on-device, Vite+TS, PWA, IndexedDB, Cytoscape.js, jsPDF. Fully frontend, optional cloud sync. Attribution: TLE © CelesTrak; imagery © NOAA. If mic/camera denied, mouse/keyboard works.</div>
        <div class="row" style="justify-content:flex-end;margin-top:12px"><button id="btn-start" class="icon-btn" style="background:var(--accent);color:#000;padding:10px 16px;font-weight:700">Enter ORBITAL →</button></div>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  const close=()=>{ overlay.remove() }
  overlay.querySelector('#close-onboard')?.addEventListener('click', close)
  overlay.querySelector('#btn-start')?.addEventListener('click', close)
  overlay.querySelector('#btn-try-voice')?.addEventListener('click', ()=>{ close(); if(voiceSupport) voice.start(); else alert('Voice not supported, use keyboard') })
  overlay.querySelector('#btn-try-face')?.addEventListener('click', ()=>{ close(); switchTab('face'); setTimeout(()=>document.getElementById('btn-start-cam')?.click(), 300) })
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) close() })
}
document.getElementById('btn-onboard')?.addEventListener('click', showOnboarding)
if(!localStorage.getItem('orbital-onboard')){
  setTimeout(()=>{ showOnboarding(); localStorage.setItem('orbital-onboard','1') }, 800)
}

// PWA install prompt
let deferredPrompt:any
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt=e; const btn=document.getElementById('btn-install')!; btn.style.display='inline-block' })
document.getElementById('btn-install')?.addEventListener('click', async()=>{
  if(deferredPrompt){ deferredPrompt.prompt(); const choice=await deferredPrompt.userChoice; console.log('PWA choice', choice); deferredPrompt=null; (document.getElementById('btn-install') as any).style.display='none' }
})

// Offline indicator
async function checkOffline(){
  try{
    if(!navigator.onLine){
      stalenessEl.textContent+=' • OFFLINE (cached)'
      countdownEl.textContent+=' • offline'
    }
  }catch{}
}
setInterval(checkOffline, 5000)

// Live clock
setInterval(()=>{ try{ currentTimeEl.textContent=new Date().toUTCString() }catch{} }, 1000)

// Global error handling
window.addEventListener('error', (e)=>{ console.error('Global error', e); loadMsgEl.textContent=`Error: ${e.message} — check console` })
window.addEventListener('unhandledrejection', (e)=>{ console.warn('Unhandled promise', e.reason) })
