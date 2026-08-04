export function nowUtc(): Date { return new Date() }

export function gmst(date: Date): number {
  // Approximate GMST in radians, from satellite.js gstime but self-contained
  const jd = jday(date);
  const t = (jd - 2451545.0) / 36525;
  let gmstSec = 67310.54841 + (876600 * 3600 + 8640184.812866) * t + 0.093104 * t * t - 6.2e-6 * t * t * t;
  gmstSec = gmstSec % 86400;
  if (gmstSec < 0) gmstSec += 86400;
  return (gmstSec / 86400) * 2 * Math.PI; // rad
}

export function jday(date: Date): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds()/3600 + date.getUTCMilliseconds()/3600000;
  let Y = year, M = month;
  if (M <= 2) { Y -=1; M+=12 }
  const A = Math.floor(Y/100);
  const B = 2 - A + Math.floor(A/4);
  const JD = Math.floor(365.25*(Y+4716)) + Math.floor(30.6001*(M+1)) + day + B -1524.5 + hour/24;
  return JD;
}

export function sunPosition(date: Date): { ra: number, dec: number, lon: number, lat: number } {
  // Simplified solar position for terminator
  const jd = jday(date);
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (357.528 + 0.9856003 * n) % 360;
  const gRad = g * Math.PI/180;
  const lambda = (L + 1.915*Math.sin(gRad)+0.02*Math.sin(2*gRad)) % 360;
  const eps = 23.439 - 0.0000004*n;
  const lambdaRad = lambda*Math.PI/180;
  const epsRad = eps*Math.PI/180;
  const alpha = Math.atan2(Math.cos(epsRad)*Math.sin(lambdaRad), Math.cos(lambdaRad));
  const delta = Math.asin(Math.sin(epsRad)*Math.sin(lambdaRad));
  const gmstRad = gmst(date);
  const lon = ((alpha - gmstRad)*180/Math.PI) % 360;
  return { ra: alpha, dec: delta, lon: normalizeLon(lon), lat: delta*180/Math.PI };
}
function normalizeLon(l:number){ let x=l; while(x>180) x-=360; while(x<-180) x+=360; return x; }

export function formatDuration(ms:number){ const s=Math.floor(ms/1000); const m=Math.floor(s/60); const h=Math.floor(m/60); if(h>0) return `${h}h ${m%60}m`; if(m>0) return `${m}m ${s%60}s`; return `${s}s` }
export function formatCountdown(target:number){ const d=Math.max(0,target-Date.now()); return formatDuration(d); }
