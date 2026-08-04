export type RecordSource = {
  id:string
  category:'courts'|'licenses'|'corporate'|'people'|'assets'
  name:string
  jurisdiction:'federal'|'state'|'county'|'global'
  url:string
  queryTemplate:string
  description:string
  confidence:'primary'|'aggregator'|'self-report'
  requiresAuth?:boolean
  notes?:string
}

export const RECORDS_CATALOG: RecordSource[] = [
  // Courts & government
  { id:'pacer-federal', category:'courts', name:'PACER — Federal Dockets', jurisdiction:'federal', url:'https://pacer.uscourts.gov/', queryTemplate:'https://pacer.uscourts.gov/search?q={target}', description:'Federal civil/criminal dockets, requires account', confidence:'primary' },
  { id:'pacer-bankruptcy', category:'courts', name:'PACER Bankruptcy', jurisdiction:'federal', url:'https://pacer.uscourts.gov/', queryTemplate:'{target} bankruptcy', description:'Bankruptcy filings', confidence:'primary' },
  { id:'county-assessor', category:'courts', name:'County Assessor / Recorder', jurisdiction:'county', url:'https://www.netronline.com/public_records.htm', queryTemplate:'{county} assessor {target}', description:'Deeds, property ownership, tax bills, mortgage chains', confidence:'primary' },
  { id:'bop-inmate', category:'courts', name:'BOP Inmate Locator', jurisdiction:'federal', url:'https://www.bop.gov/inmateloc/', queryTemplate:'https://www.bop.gov/inmateloc/ {target}', description:'Federal inmate status', confidence:'primary' },
  { id:'state-doc', category:'courts', name:'State DOC Inmate Search', jurisdiction:'state', url:'https://www.doc.state.{state}.us', queryTemplate:'{state} DOC {target}', description:'State prison records', confidence:'primary' },
  { id:'sex-offender', category:'courts', name:'NSOPW Sex Offender Registry', jurisdiction:'federal', url:'https://www.nsopw.gov/', queryTemplate:'https://www.nsopw.gov/search {target}', description:'National sex offender public data', confidence:'primary' },
  { id:'fec-donations', category:'courts', name:'FEC Campaign Finance', jurisdiction:'federal', url:'https://www.fec.gov/data/', queryTemplate:'https://www.fec.gov/data/receipts/individual-contributions/?contributor_name={target}', description:'Campaign donations', confidence:'primary' },
  { id:'usaspending', category:'courts', name:'USAspending Contracts', jurisdiction:'federal', url:'https://www.usaspending.gov/', queryTemplate:'https://www.usaspending.gov/search/?q={target}', description:'Federal contracts', confidence:'primary' },
  // Licenses & registries
  { id:'faa-aircraft', category:'licenses', name:'FAA Aircraft Registry (N-Number)', jurisdiction:'federal', url:'https://registry.faa.gov/aircraftinquiry/', queryTemplate:'https://registry.faa.gov/aircraftinquiry/Search/NNumberResult?nNumberTxt={nNumber}', description:'Aircraft owner + address history via N-number', confidence:'primary' },
  { id:'fcc-licenses', category:'licenses', name:'FCC License Search', jurisdiction:'federal', url:'https://wireless2.fcc.gov/UlsApp/UlsSearch/searchLicense.jsp', queryTemplate:'FCC {target}', description:'Amateur radio, GMRS → name/address', confidence:'primary' },
  { id:'uscg-boats', category:'licenses', name:'USCG / State Boat Registrations', jurisdiction:'state', url:'https://www.dco.uscg.mil/nvdc/', queryTemplate:'Vessel {target}', description:'State boat registration lookups', confidence:'primary' },
  { id:'state-licenses', category:'licenses', name:'State Professional License Boards', jurisdiction:'state', url:'https://www.dca.ca.gov/', queryTemplate:'{state} professional license {target}', description:'Medical, legal, real estate licenses', confidence:'primary' },
  { id:'uspto', category:'licenses', name:'USPTO Patents / Trademarks', jurisdiction:'federal', url:'https://ppubs.uspto.gov/pubwebapp/', queryTemplate:'USPTO {target}', description:'Inventor/assignee registry', confidence:'primary' },
  { id:'ofac', category:'licenses', name:'OFAC Sanctions List', jurisdiction:'federal', url:'https://sanctionssearch.ofac.treas.gov/', queryTemplate:'OFAC {target}', description:'Sanctions screening', confidence:'primary' },
  // Corporate & finance
  { id:'sos-business', category:'corporate', name:'Secretary of State Business Filings', jurisdiction:'state', url:'https://www.nass.org/business-services', queryTemplate:'{state} SOS {target}', description:'Agent of record, incorporator', confidence:'primary' },
  { id:'sec-edgar', category:'corporate', name:'SEC EDGAR', jurisdiction:'federal', url:'https://www.sec.gov/edgar/search/', queryTemplate:'https://www.sec.gov/cgi-bin/browse-edgar?company={target}', description:'Officers, directors, insider holdings', confidence:'primary' },
  { id:'ucc', category:'corporate', name:'UCC Filings', jurisdiction:'state', url:'https://www.sos.state.{state}.us/ucc', queryTemplate:'{state} UCC {target}', description:'Liens and secured transactions', confidence:'primary' },
  { id:'nonprofit-990', category:'corporate', name:'ProPublica Nonprofit Explorer (990s)', jurisdiction:'federal', url:'https://projects.propublica.org/nonprofits/', queryTemplate:'https://projects.propublica.org/nonprofits/search?q={target}', description:'Officers, salaries', confidence:'aggregator' },
  // People & identity (OSINT only)
  { id:'linkedin-public', category:'people', name:'LinkedIn Public Profile (browser)', jurisdiction:'global', url:'https://www.linkedin.com/', queryTemplate:'site:linkedin.com "{target}"', description:'Public pages only - queried as browser, no scraping', confidence:'self-report' },
  { id:'github-public', category:'people', name:'GitHub Public', jurisdiction:'global', url:'https://github.com/', queryTemplate:'site:github.com {target}', description:'Public repos/gists', confidence:'self-report' },
  { id:'username-enum', category:'people', name:'Username Enumeration', jurisdiction:'global', url:'https://whatsmyname.app/', queryTemplate:'{target}', description:'Check hundreds of platforms', confidence:'aggregator' },
  { id:'hibp', category:'people', name:'HaveIBeenPwned Public Index', jurisdiction:'global', url:'https://haveibeenpwned.com/', queryTemplate:'HIBP {target}', description:'Breach exposure checks (public indices only)', confidence:'aggregator' },
  { id:'whois-history', category:'people', name:'Historical WHOIS (pre/post-GDPR)', jurisdiction:'global', url:'https://who.is/', queryTemplate:'WHOIS {domain}', description:'Registrant history via WHOIS history services', confidence:'aggregator' },
  { id:'archive', category:'people', name:'Internet Archive Snapshots', jurisdiction:'global', url:'https://web.archive.org/', queryTemplate:'https://web.archive.org/web/*/{target}', description:'Wayback captures', confidence:'aggregator' },
  { id:'dork', category:'people', name:'Google/Bing Dorking', jurisdiction:'global', url:'https://www.google.com/', queryTemplate:'"{target}" site:*.gov OR site:*.edu', description:'Advanced search operators', confidence:'aggregator' },
  // Assets
  { id:'ais-vessels', category:'assets', name:'AIS Live Vessel Feeds (public broadcast)', jurisdiction:'global', url:'https://www.marinetraffic.com/', queryTemplate:'AIS {imo} {target}', description:'Ships broadcast position, received by satellite/costal - OSINT', confidence:'primary' },
  { id:'adsb-aircraft', category:'assets', name:'ADS-B Live Aircraft (public broadcast)', jurisdiction:'global', url:'https://adsb.lol/', queryTemplate:'ADSB {nNumber}', description:'Civil aircraft broadcast, via open aggregators', confidence:'primary' },
]

export const EXCLUDED = [
  { category:'FCRA', reason:'Credit headers are regulated by FCRA — broker territory, would destroy legitimacy. Excluded.' },
  { category:'DPPA', reason:'Motor-vehicle records regulated by DPPA — excluded entirely.' },
  { category:'Non-public breaches', reason:'Non-public database breaches require unauthorized access — excluded, only public breach indices allowed.' },
  { category:'Pretexting', reason:'Anything requiring pretexting/social engineering is illegal and excluded.' },
]

export function generateChecklist(target:string, jurisdiction:string, opts?:{ state?:string, county?:string }){
  const state = opts?.state || 'CA'
  const county = opts?.county || 'Los Angeles'
  return RECORDS_CATALOG
    .filter(s=> jurisdiction==='global' ? true : s.jurisdiction===jurisdiction || s.jurisdiction==='federal' || s.jurisdiction==='global' || s.jurisdiction==='state' )
    .map(s=>{
      let url=s.url
      let query=s.queryTemplate.replace('{target}', encodeURIComponent(target)).replace('{state}', state).replace('{county}', county)
      if(query.startsWith('http')) url=query
      return {
        sourceId:s.id,
        category:s.category,
        name:s.name,
        url,
        query: query,
        status:'pending' as const,
        notes:s.description
      }
    })
    .sort((a,b)=>{
      const order:{[k:string]:number}={ courts:0, licenses:1, corporate:2, assets:3, people:4 }
      return (order[a.category]??9)-(order[b.category]??9)
    })
}
