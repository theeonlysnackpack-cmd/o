import { getDB, auditLog, Dossier, ChecklistItem, Fact, TimelineEvent } from '../pwa/db'
import { generateChecklist } from './catalog'

export async function createDossier(target:string, jurisdiction:string, opts?:any): Promise<Dossier>{
  const id=Math.random().toString(36).slice(2)
  const checklist=generateChecklist(target, jurisdiction, opts)
  const dossier:Dossier={
    id,
    target,
    jurisdiction,
    createdAt:Date.now(),
    checklist,
    facts:[],
    graphNodes:[ { data:{ id: target, label: target, type:'person', confidence:'primary' } } ],
    graphEdges:[],
    timeline:[]
  }
  const db=await getDB()
  await db.put('dossiers', dossier)
  await auditLog({ action:'DOSSIER_CREATE', target, meta:{ id, jurisdiction } })
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
  const newFact:Fact={ id: Math.random().toString(36).slice(2), ...fact }
  dos.facts.push(newFact)
  // auto add to graph
  dos.graphNodes.push({ data:{ id:fact.value, label:fact.value, type:fact.field, confidence:fact.confidence } })
  dos.graphEdges.push({ data:{ id: `${dos.target}-${fact.value}`, source: dos.target, target: fact.value, label: fact.field, confidence: fact.confidence, verification: fact.verification } })
  // timeline if dated
  if(fact.timestamp){
    dos.timeline.push({ id:newFact.id, date:new Date(fact.timestamp).toISOString(), title:`${fact.field}: ${fact.value}`, source:fact.source, description:fact.source })
  }
  await db.put('dossiers', dos)
  await auditLog({ action:'FACT_ADD', target:dos.target, sources:[fact.source], meta:{ dossierId, factId:newFact.id } })
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
  return JSON.stringify(dossier, null, 2)
}

export async function generatePDFReport(id:string){
  // Use jsPDF dynamically
  const { jsPDF } = await import('jspdf')
  const dossier=await getDossier(id)
  if(!dossier) throw new Error('No dossier')
  const doc=new jsPDF()
  doc.setFontSize(18)
  doc.text(`OSINT Dossier — ${dossier.target}`, 10, 15)
  doc.setFontSize(10)
  doc.text(`Jurisdiction: ${dossier.jurisdiction} | Created: ${new Date(dossier.createdAt).toLocaleString()}`, 10, 22)
  doc.text(`FCRA FIREWALL: This data cannot support employment, credit, insurance, or housing decisions.`, 10, 28)
  let y=36
  doc.setFontSize(12)
  doc.text('Facts & Sources', 10, y); y+=6
  doc.setFontSize(9)
  dossier.facts.forEach(f=>{
    if(y>270){ doc.addPage(); y=12 }
    doc.text(`- [${f.verification}/${f.confidence} ${confidenceScore(f)}%] ${f.field}: ${f.value} (${f.source}) ${f.sourceUrl||''}`, 10, y)
    y+=5
  })
  y+=4
  doc.setFontSize(12)
  doc.text('Timeline',10,y); y+=6
  doc.setFontSize(9)
  dossier.timeline.sort((a,b)=>a.date.localeCompare(b.date)).forEach(ev=>{
    if(y>270){ doc.addPage(); y=12 }
    doc.text(`${ev.date.slice(0,10)} — ${ev.title} [${ev.source}]`,10,y); y+=5
  })
  y+=4
  doc.setFontSize(8)
  doc.text('All sources cited. Methods: single-session browser, human-in-the-loop, no bulk scraping.',10,280)
  return doc.output('datauristring')
}
