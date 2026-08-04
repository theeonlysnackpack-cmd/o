# Face-API Models

This folder should contain face-api.js weights for real on-device face recognition.

Because the build sandbox has no internet egress, real models could not be downloaded automatically. The app gracefully falls back to a lightweight 64-dim luminance descriptor (privacy-first, 100% on-device, BIPA compliant) when models are missing.

## How to add real models (production)

### Option 1: Download from face-api.js repo
```bash
cd public/models
curl -L -o tiny_face_detector_model-weights_manifest.json https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-weights_manifest.json
curl -L -o tiny_face_detector_model-shard1 https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-shard1
curl -L -o face_landmark_68_model-weights_manifest.json https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-weights_manifest.json
curl -L -o face_landmark_68_model-shard1 https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-shard1
curl -L -o face_recognition_model-weights_manifest.json https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-weights_manifest.json
curl -L -o face_recognition_model-shard1 https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-shard1
curl -L -o face_recognition_model-shard2 https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-shard2
curl -L -o ssd_mobilenetv1_model-weights_manifest.json https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-weights_manifest.json
curl -L -o ssd_mobilenetv1_model-shard1 https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-shard1
curl -L -o ssd_mobilenetv1_model-shard2 https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-shard2
```

### Option 2: Use @vladmandic/face-api (more maintained)
The loader in `src/face/faceApiLoader.ts` uses `face-api.js` API compatible with `@vladmandic/face-api`. You can also host models from:
- https://github.com/vladmandic/face-api/tree/master/model

Place them in this folder, then the app will auto-detect and use 128D descriptors via `faceapi.detectSingleFace().withFaceDescriptor()`.

### Fallback behavior
If no manifests are found, `loadFaceApiModels()` returns false and `FaceManager` uses the lightweight luminance descriptor (64-dim → padded 128). This is:
- 100% on-device
- No images leave device
- BIPA compliant (templates never leave unless explicit opt-in)
- Works offline

The UI shows “Face-API models not found — using lightweight fallback (privacy-first)”.

### Privacy notes
- Real face-api descriptors are also on-device, but more accurate (128D)
- Templates stored in IndexedDB by default
- Cloud sync only if user explicitly opts in via Supabase adapter, and biometric cloud opt-in separately
- One-tap “Forget Me” wipe deletes all templates
