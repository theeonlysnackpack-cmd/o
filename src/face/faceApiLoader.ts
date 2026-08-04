import * as faceapi from 'face-api.js'

let modelsLoaded = false
let loadAttempted = false
let loadError: string | null = null

export async function loadFaceApiModels(baseUrl = '/models'): Promise<boolean>{
  if(modelsLoaded) return true
  if(loadAttempted && loadError) return false
  loadAttempted = true
  try{
    console.log('[FaceAPI] attempting to load models from', baseUrl)
    // Check if manifest exists
    const testUrls = [
      `${baseUrl}/tiny_face_detector_model-weights_manifest.json`,
      `${baseUrl}/face_landmark_68_model-weights_manifest.json`,
      `${baseUrl}/face_recognition_model-weights_manifest.json`
    ]
    // Try fetch first manifest to see if models available
    let hasModels = false
    for(const url of testUrls){
      try{
        const res = await fetch(url, { method:'HEAD', cache:'no-store' })
        if(res.ok){ hasModels=true; break }
      }catch{}
    }
    if(!hasModels){
      console.warn('[FaceAPI] no model manifests found in', baseUrl, '- using lightweight fallback descriptor (privacy-first, on-device)')
      loadError = 'models not found, using fallback'
      return false
    }

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(baseUrl),
      faceapi.nets.faceLandmark68Net.loadFromUri(baseUrl),
      faceapi.nets.faceRecognitionNet.loadFromUri(baseUrl),
      // optional: try load ssd mobilenet for better accuracy, but tiny is enough
      faceapi.nets.ssdMobilenetv1.loadFromUri(baseUrl).catch(()=>{ console.warn('[FaceAPI] ssdMobilenetv1 not available') }),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(baseUrl).catch(()=>{})
    ])
    modelsLoaded = true
    console.log('[FaceAPI] models loaded successfully')
    return true
  }catch(e:any){
    console.warn('[FaceAPI] model load failed, falling back to lightweight descriptor', e)
    loadError = e.message || 'load failed'
    return false
  }
}

export function isFaceApiReady(){ return modelsLoaded }

export function getFaceApi(){ return faceapi }

export async function computeFaceDescriptor(input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<Float32Array | null>{
  if(!modelsLoaded){
    const ok = await loadFaceApiModels()
    if(!ok) return null
  }
  try{
    const detection = await (faceapi as any).detectSingleFace(input, new (faceapi as any).TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor()
    if(!detection) return null
    return detection.descriptor as Float32Array
  }catch(e){
    console.warn('[FaceAPI] descriptor compute failed', e)
    return null
  }
}

export async function detectFaces(input: HTMLVideoElement){
  if(!modelsLoaded) await loadFaceApiModels()
  if(!modelsLoaded) return []
  try{
    return await (faceapi as any).detectAllFaces(input, new (faceapi as any).TinyFaceDetectorOptions())
  }catch{ return [] }
}
