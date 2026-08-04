export function lerp(a:number,b:number,t:number){ return a+(b-a)*t }
export function clamp(v:number,min:number,max:number){ return Math.max(min, Math.min(max,v)) }
export function deg2rad(d:number){ return d*Math.PI/180 }
export function rad2deg(r:number){ return r*180/Math.PI }

// Observer -> satellite look angles simplified (az/el) using ECF
export type Geodetic = { lat:number, lon:number, altKm:number }
export function geodeticToEcf(g:Geodetic){
  const a=6378.137, e2=6.69437999014e-3;
  const lat=deg2rad(g.lat), lon=deg2rad(g.lon);
  const N=a/Math.sqrt(1-e2*Math.sin(lat)*Math.sin(lat));
  const x=(N+g.altKm)*Math.cos(lat)*Math.cos(lon);
  const y=(N+g.altKm)*Math.cos(lat)*Math.sin(lon);
  const z=(N*(1-e2)+g.altKm)*Math.sin(lat);
  return {x,y,z}
}
export function ecfDistance(a:{x:number,y:number,z:number}, b:{x:number,y:number,z:number}){
  const dx=a.x-b.x, dy=a.y-b.y, dz=a.z-b.z; return Math.sqrt(dx*dx+dy*dy+dz*dz)
}
