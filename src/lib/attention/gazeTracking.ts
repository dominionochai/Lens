// gazeTracking.ts
// Derives a stable, smoothed "eyes on/off content" boolean from MediaPipe
// Face Landmarker output. Mirrors the smoothing + hysteresis pattern used in
// src/lib/environment/scoring.ts — do NOT skip smoothing, same lesson applies
// (a single noisy frame should never be able to flip the signal on its own).

import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";

// ---- Module-scope smoothing state -----------------------------------------
const SMOOTHING_ALPHA = 0.25; // same alpha as scoring.ts, keep consistent

let smoothedOffScore = 0; // 0 = fully "on content", 100 = fully "off content"
let isCurrentlyOff = false; // last published state, for hysteresis

// Hysteresis thresholds
const OFF_ENTER_THRESHOLD = 55;
const OFF_EXIT_THRESHOLD = 40;

// Head pose angle thresholds (degrees)
const YAW_OFF_DEG = 25;
const PITCH_OFF_DEG = 20;

// Secondary signal weight (blendshapes)
const EYE_LOOK_AWAY_BLENDSHAPE_WEIGHT = 20;

export interface GazeState {
  offScore: number;
  eyesOffContent: boolean;
  yawDeg: number;
  pitchDeg: number;
}

function estimateHeadPose(landmarks: { x: number; y: number; z: number }[]): {
  yawDeg: number;
  pitchDeg: number;
} {
  // 1 = nose tip, 33 = right eye outer corner, 263 = left eye outer corner, 168 = between eyebrows
  const noseTip = landmarks[1];
  const rightEyeOuter = landmarks[33];
  const leftEyeOuter = landmarks[263];
  const browMid = landmarks[168];

  if (!noseTip || !rightEyeOuter || !leftEyeOuter || !browMid) {
    return { yawDeg: 0, pitchDeg: 0 };
  }

  const eyeMidX = (rightEyeOuter.x + leftEyeOuter.x) / 2;
  const eyeSpan = Math.abs(leftEyeOuter.x - rightEyeOuter.x) || 1e-6;
  const yawRatio = (noseTip.x - eyeMidX) / eyeSpan;
  const yawDeg = yawRatio * 90;

  const pitchRatio = (noseTip.y - browMid.y) / eyeSpan;
  const NEUTRAL_PITCH_RATIO = 0.95;
  const pitchDeg = (pitchRatio - NEUTRAL_PITCH_RATIO) * 60;

  return { yawDeg, pitchDeg };
}

function estimateEyeLookAwayScore(result: FaceLandmarkerResult): number {
  const categories = result.faceBlendshapes?.[0]?.categories;
  if (!categories) return 0;

  const getScore = (name: string) =>
    categories.find((c) => c.categoryName === name)?.score ?? 0;

  const lookAway = Math.max(
    getScore("eyeLookOutLeft"),
    getScore("eyeLookOutRight"),
    getScore("eyeLookInLeft"),
    getScore("eyeLookInRight"),
    getScore("eyeLookUpLeft"),
    getScore("eyeLookUpRight"),
    getScore("eyeLookDownLeft"),
    getScore("eyeLookDownRight")
  );

  return lookAway * 100;
}

export function updateGazeState(result: FaceLandmarkerResult | null): GazeState {
  const landmarks = result?.faceLandmarks?.[0];

  let instantaneousOffScore: number;
  let yawDeg = 0;
  let pitchDeg = 0;

  if (!landmarks) {
    instantaneousOffScore = 65;
  } else {
    const pose = estimateHeadPose(landmarks);
    yawDeg = pose.yawDeg;
    pitchDeg = pose.pitchDeg;

    const yawOff = Math.abs(yawDeg) > YAW_OFF_DEG;
    const pitchOff = Math.abs(pitchDeg) > PITCH_OFF_DEG;

    const yawExcess = Math.max(0, Math.abs(yawDeg) - YAW_OFF_DEG);
    const pitchExcess = Math.max(0, Math.abs(pitchDeg) - PITCH_OFF_DEG);
    const poseScore = Math.min(100, Math.max(yawExcess, pitchExcess) * 4);

    const eyeScore = estimateEyeLookAwayScore(result!);

    instantaneousOffScore = Math.min(
      100,
      poseScore + (eyeScore / 100) * EYE_LOOK_AWAY_BLENDSHAPE_WEIGHT
    );

    if (!yawOff && !pitchOff && poseScore < 10) {
      instantaneousOffScore = poseScore;
    }
  }

  smoothedOffScore =
    SMOOTHING_ALPHA * instantaneousOffScore + (1 - SMOOTHING_ALPHA) * smoothedOffScore;

  if (!isCurrentlyOff && smoothedOffScore >= OFF_ENTER_THRESHOLD) {
    isCurrentlyOff = true;
  } else if (isCurrentlyOff && smoothedOffScore <= OFF_EXIT_THRESHOLD) {
    isCurrentlyOff = false;
  }

  return {
    offScore: smoothedOffScore,
    eyesOffContent: isCurrentlyOff,
    yawDeg,
    pitchDeg,
  };
}

export function resetGazeState(): void {
  smoothedOffScore = 0;
  isCurrentlyOff = false;
}
