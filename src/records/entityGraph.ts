import cytoscape from 'cytoscape'
import { Dossier } from '../pwa/db'

export function renderEntityGraph(container: HTMLElement, dossier: Dossier){
  const cy = cytoscape({
    container,
    elements: [...dossier.graphNodes, ...dossier.graphEdges],
    style: [
      {
        selector:'node',
        style:{
          'background-color':'data(confColor)',
          'label':'data(label)',
          'color':'#d6e1f5',
          'font-size':'10px',
          'font-family':'JetBrains Mono',
          'text-valign':'center',
          'text-halign':'center',
          'width':'label',
          'height':'label',
          'padding':'6px',
          'shape':'round-rectangle',
          'border-width':1,
          'border-color':'#2a3b5f',
          'text-wrap':'wrap',
          'text-max-width':'120px'
        }
      },
      {
        selector:'node[type="person"]',
        style:{ 'background-color':'#7c5cff', 'color':'white', 'font-weight':'bold' }
      },
      {
        selector:'edge',
        style:{
          'width':2,
          'line-color':'#2a3b5f',
          'target-arrow-color':'#2a3b5f',
          'target-arrow-shape':'triangle',
          'curve-style':'bezier',
          'label':'data(label)',
          'font-size':'8px',
          'color':'#7a8cb0'
        }
      },
      {
        selector:'edge[verification="unverified"]',
        style:{ 'line-style':'dashed', 'line-color':'#ffcf4d' }
      }
    ],
    layout: { name:'cose', animate:false }
  })

  // Inject confColor dynamically
  cy.nodes().forEach((n:any)=>{
    const c=n.data('confidence')
    const color = c==='primary'?'#3eff8b': c==='aggregator'?'#5ee1ff':'#ffcf4d'
    n.data('confColor', color)
  })

  return cy
}
