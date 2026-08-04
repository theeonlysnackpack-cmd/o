import cytoscape from 'cytoscape'
import { Dossier } from '../pwa/db'

export function renderEntityGraph(container: HTMLElement, dossier: Dossier){
  // Deduplicate nodes/edges by id
  const seenNodes = new Map<string, any>()
  for(const n of dossier.graphNodes){
    const id = (n as any).data?.id
    if(id && !seenNodes.has(id)) seenNodes.set(id, n)
  }
  const seenEdges = new Map<string, any>()
  for(const e of dossier.graphEdges){
    const id = (e as any).data?.id
    if(id && !seenEdges.has(id)) seenEdges.set(id, e)
  }
  const nodes = Array.from(seenNodes.values()).map((n:any)=>{
    const conf = n.data.confidence
    const color = conf==='primary' ? '#3eff8b' : conf==='aggregator' ? '#5ee1ff' : '#ffcf4d'
    return { data: { ...n.data, confColor: color } }
  })
  const edges = Array.from(seenEdges.values())

  // clear previous
  container.innerHTML=''

  const cy = cytoscape({
    container,
    elements: [...nodes, ...edges],
    style: [
      {
        selector:'node',
        style:{
          'background-color':'data(confColor)',
          'label':'data(label)',
          'color':'#d6e1f5',
          'font-size':'9px',
          'font-family':'JetBrains Mono, monospace',
          'text-valign':'center',
          'text-halign':'center',
          'width':'label',
          'height':'label',
          'padding':'8px',
          'shape':'round-rectangle',
          'border-width':1,
          'border-color':'#2a3b5f',
          'text-wrap':'wrap',
          'text-max-width':'90px'
        } as any
      },
      {
        selector:'node[type="person"]',
        style:{ 'background-color':'#7c5cff', 'color':'white', 'font-weight':'bold', 'font-size':'10px' } as any
      },
      {
        selector:'edge',
        style:{
          'width':1.5,
          'line-color':'#2a3b5f',
          'target-arrow-color':'#2a3b5f',
          'target-arrow-shape':'triangle',
          'curve-style':'bezier',
          'label':'data(label)',
          'font-size':'7px',
          'color':'#7a8cb0',
          'text-rotation':'autorotate'
        } as any
      },
      {
        selector:'edge[verification="unverified"]',
        style:{ 'line-style':'dashed', 'line-color':'#ffcf4d' } as any
      },
      {
        selector:'edge[verification="conflicting"]',
        style:{ 'line-style':'dashed', 'line-color':'#ff5a6a' } as any
      }
    ],
    layout: { name:'cose', animate:false, idealEdgeLength:()=>60, nodeRepulsion:()=> 4000 } as any,
    minZoom:0.2,
    maxZoom:2,
    wheelSensitivity:0.2
  })

  // resize handler
  setTimeout(()=>{ try{ cy.resize(); cy.fit(); }catch{} }, 100)

  return cy
}
