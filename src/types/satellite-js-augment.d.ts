declare module 'satellite.js' {
  export function radiansToDegrees(rad: number): number
  export function degreesToRadians(deg: number): number
  export function radiansLat(lat: number): number
  export function radiansLong(lon: number): number
  export function degreesLat(lat: number): number
  export function degreesLong(lon: number): number
  export function geodeticToEcf(observer: any): any
  export function eciToEcf(pos: any, gmst: number): any
  export function eciToGeodetic(pos: any, gmst: number): any
  export function ecfToLookAngles(observer: any, satEcf: any): any
  export function gstime(date: Date | number): number
  export function twoline2satrec(line1: string, line2: string): any
  export function propagate(satrec: any, date: Date): { position: any, velocity: any }
}
