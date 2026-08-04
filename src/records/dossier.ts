import { getDB, auditLog, Dossier, ChecklistItem, Fact } from '../pwa/db'
import { generateChecklist } from './catalog'

export async function createDossier(target:string, jurisdiction:string, opts?:any): Promise<Dossier>{
  const id=Math.random().toString(36).slice(2) + Date.now().toString(36)
  const checklist=generateChecklist(target, jurisdiction, opts)
  const safeTarget = target.trim()
  const dossier:Dossier={
    id,
    target: safeTarget,
    jurisdiction,
    createdAt:Date.now(),
    checklist,
    facts:[],
    graphNodes:[ { data:{ id: safeTarget, label: safeTarget, type:'person', confidence:'primary' } } ],
    graphEdges:[],
    timeline:[]
  }
  const db=await getDB()
  await db.put('dossiers', dossier)
  await auditLog({ action:'DOSSIER_CREATE', target: safeTarget, meta:{ id, jurisdiction } }).catch(()=>{})
  return dossier
}
export async function getDossier(id:string){
  const db=await getDB()
  return db.get('dossiers', id)
}
export async function listDossiers(){
  const db=await getDB()
  return db.getAll('dossiers')
}
export async function addFact(dossierId:string, fact:Omit<Fact,'id'>){
  const db=await getDB()
  const dos=await db.get('dossiers', dossierId)
  if(!dos) throw new Error('Dossier not found')
  const newFact:Fact={ id: Math.random().toString(36).slice(2)+Date.now().toString(36), ...fact }

  // dedupe by field+value
  const exists = dos.facts.find(f=> f.field===fact.field && f.value===fact.value)
  if(exists){
    // update existing
    Object.assign(exists, fact)
  } else {
    dos.facts.push(newFact)
  }

  // graph dedupe
  const nodeId = fact.value
  const hasNode = dos.graphNodes.some((n:any)=> n.data.id===nodeId)
  if(!hasNode){
    dos.graphNodes.push({ data:{ id:nodeId, label:fact.value.slice(0,80), type:fact.field, confidence:fact.confidence } })
  }
  const edgeId = `${dos.target}::${fact.field}::${fact.value}`
  const hasEdge = dos.graphEdges.some((e:any)=> e.data.id===edgeId)
  if(!hasEdge){
    dos.graphEdges.push({ data:{ id: edgeId, source: dos.target, target: nodeId, label: fact.field, confidence: fact.confidence, verification: fact.verification } })
  }

  if(fact.timestamp){
    dos.timeline.push({ id:newFact.id, date:new Date(fact.timestamp).toISOString(), title:`${fact.field}: ${fact.value}`, source:fact.source, description:fact.source })
  }
  await db.put('dossiers', dos)
  await auditLog({ action:'FACT_ADD', target:dos.target, sources:[fact.source], meta:{ dossierId, factId:newFact.id } }).catch(()=>{})
  return dos
}
export async function updateChecklistItem(dossierId:string, sourceId:string, status:ChecklistItem['status']){
  const db=await getDB()
  const dos=await db.get('dossiers', dossierId)
  if(!dos) return
  const item=dos.checklist.find(c=>c.sourceId===sourceId)
  if(item) item.status=status
  await db.put('dossiers', dos)
}
export function confidenceScore(fact:Fact): number{
  const base={ primary:0.95, aggregator:0.65, 'self-report':0.4 }[fact.confidence]||0.5
  const ver={ verified:1, unverified:0.7, conflicting:0.3 }[fact.verification]||0.7
  return Math.round(base*ver*100)
}

export async function exportDossierJSON(id:string){
  const dossier=await getDossier(id)
  if(!dossier) throw new Error('No dossier')
  return JSON.stringify(dossier, null, 2)
}

export async function generatePDFReport(id:string){
  const { jsPDF } = await import('jspdf')
  const dossier=await getDossier(id)
  if(!dossier) throw new Error('No dossier')
  const doc=new jsPDF()
  doc.setFontSize(16)
  // sanitize for PDF (avoid special chars)
  const safeTarget = dossier.target.replace(/[^\x20-\x7E]/g,'_')
  doc.text(`OSINT Dossier - ${safeTarget}`, 10, 15)
  doc.setFontSize(10)
  doc.text(`Jurisdiction: ${dossier.jurisdiction} | Created: ${new Date(dossier.createdAt).toLocaleString()}`, 10, 22)
  doc.text(`FCRA FIREWALL: This data cannot support employment, credit, insurance, or housing decisions.`, 10, 28)
  let y=36
  doc.setFontSize(12)
  doc.text('Facts & Sources', 10, y); y+=6
  doc.setFontSize(9)
  dossier.facts.slice(0,120).forEach(f=>{
    if(y>270){ doc.addPage(); y=12 }
    const line = `- [${f.verification}/${f.confidence} ${confidenceScore(f)}%] ${f.field}: ${f.value} (${f.source})`.slice(0,110)
    try{ doc.text(line, 10, y) }catch{}
    y+=5
  })
  y+=4
  if(y>250){ doc.addPage(); y=12 }
  doc.setFontSize(12)
  doc.text('Timeline',10,y); y+=6
  doc.setFontSize(9)
  dossier.timeline.sort((a,b)=>a.date.localeCompare(b.date)).slice(0,80).forEach(ev=>{
    if(y>270){ doc.addPage(); y=12 }
    try{ doc.text(`${ev.date.slice(0,10)} - ${ev.title.slice(0,90)} [${ev.source}]`.slice(0,115),10,y) }catch{}
    y+=5
  })
  y+=4
  doc.setFontSize(8)
  doc.text('All sources cited. Methods: single-session browser, human-in-the-loop, no bulk scraping.',10,280)
  return doc.output('datauristring')
}
