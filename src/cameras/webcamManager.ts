import { WebcamPin } from '../state/store'

export const CITY_HOTSPOTS: WebcamPin[] = [
  { id:'nyc', name:'New York - Times Square', lat:40.7580, lon:-73.9855, url:'https://www.skylinewebcams.com/en/webcam/usa/new-york/new-york/times-square.html', type:'iframe' },
  { id:'tokyo', name:'Tokyo - Shibuya Crossing', lat:35.6595, lon:139.7005, url:'https://www.youtube.com/embed/2zK12Gwzy2g?autoplay=1&mute=1', type:'youtube' },
  { id:'london', name:'London - Thames', lat:51.5007, lon:-0.1246, url:'https://www.skylinewebcams.com/en/webcam/england/london/london/thames-river.html', type:'iframe' },
  { id:'cape', name:'Cape Canaveral - LC39', lat:28.5729, lon:-80.6490, url:'https://www.youtube.com/embed/21X5lGlDOfg?autoplay=1&mute=1', type:'youtube' },
  { id:'paris', name:'Paris - Eiffel', lat:48.8584, lon:2.2945, url:'https://www.skylinewebcams.com/en/webcam/france/ile-de-france/paris/eiffel-tower.html', type:'iframe' },
  { id:'sydney', name:'Sydney Harbour', lat:-33.8568, lon:151.2153, url:'https://www.skylinewebcams.com/en/webcam/australia/new-south-wales/sydney/sydney-harbour.html', type:'iframe' },
  { id:'dubai', name:'Dubai - Burj Khalifa', lat:25.1972, lon:55.2744, url:'https://www.youtube.com/embed/7dA5f-F2rVo?autoplay=1&mute=1', type:'youtube' },
  { id:'sf', name:'San Francisco - Golden Gate', lat:37.8199, lon:-122.4783, url:'https://www.skylinewebcams.com/en/webcam/usa/california/san-francisco/golden-gate-bridge.html', type:'iframe' },
  { id:'rio', name:'Rio - Copacabana', lat:-22.9711, lon:-43.1822, url:'https://www.skylinewebcams.com/en/webcam/brasil/rio-de-janeiro/rio-de-janeiro/copacabana-beach.html', type:'iframe' },
  { id:'iss-cam', name:'ISS Live HD', lat:0, lon:0, url:'https://www.youtube.com/embed/86YLFOog4GM?autoplay=1&mute=1', type:'youtube' },
]

export const EXTRA_FEEDS = [
  { name:'GOES-18 Full Disk (latest)', url:'https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/1808x1808.jpg', type:'image' },
  { name:'Windy Webcams Map', url:'https://webcams.windy.com/', type:'iframe' }
]

export function findNearestCity(lat:number, lon:number){
  let best=CITY_HOTSPOTS[0], bestD=Infinity
  for(const c of CITY_HOTSPOTS){
    const d = Math.hypot(c.lat-lat, c.lon-lon)
    if(d<bestD){ bestD=d; best=c }
  }
  return best
}
