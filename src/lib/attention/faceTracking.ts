import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let faceLandmarkerInstance: FaceLandmarker | null = null;
let loadingPromise: Promise<FaceLandmarker> | null = null;

// Loads and caches the MediaPipe Face Landmarker model. Safe to call
// multiple times - only initializes once, subsequent calls reuse the
// same instance. Runs entirely client-side (WASM), no backend involved.
export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (faceLandmarkerInstance) return faceLandmarkerInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
    );

    const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: "VIDEO",
      numFaces: 1,
    });

    faceLandmarkerInstance = landmarker;
    return landmarker;
  })();

  return loadingPromise;
}
