export interface AttentionRawSample {
  transformMatrix: number[] | null;
  blendshapes: Record<string, number> | null;
}

export interface AttentionState {
  onContent: boolean;
  offContentScore: number;
  debug: {
    yawDeg: number;
    pitchDeg: number;
    gazeOffScore: number;
  };
}

const SMOOTHING_ALPHA = 0.25;
const OFF_CONTENT_ENTER = 55;
const OFF_CONTENT_EXIT = 40;
const YAW_LIMIT_DEG = 25;
const PITCH_LIMIT_DEG = 20;

const GAZE_AWAY_BLENDSHAPES = [
  "eyeLookOutLeft",
  "eyeLookOutRight",
  "eyeLookUpLeft",
  "eyeLookUpRight",
  "eyeLookDownLeft",
  "eyeLookDownRight",
] as const;

let smoothedOffContentScore = 0;
let hysteresisState: "on" | "off" = "on";

function matrixToYawPitch(m: number[]): { yawDeg: number; pitchDeg: number } {
  const r02 = m[2];
  const r10 = m[4], r11 = m[5], r12 = m[6];
  const r22 = m[10];

  const yawRad = Math.atan2(r02, r22);
  const pitchRad = Math.atan2(-r12, Math.sqrt(r10 * r10 + r11 * r11));

  return {
    yawDeg: (yawRad * 180) / Math.PI,
    pitchDeg: (pitchRad * 180) / Math.PI,
  };
}

function headPoseOffScore(yawDeg: number, pitchDeg: number): number {
  const yawExcess = Math.max(0, Math.abs(yawDeg) - YAW_LIMIT_DEG);
  const pitchExcess = Math.max(0, Math.abs(pitchDeg) - PITCH_LIMIT_DEG);
  const raw = Math.max(yawExcess, pitchExcess) / 20;
  return Math.min(100, raw * 100);
}

function gazeOffScore(blendshapes: Record<string, number> | null): number {
  if (!blendshapes) return 0;
  let maxScore = 0;
  for (const name of GAZE_AWAY_BLENDSHAPES) {
    const v = blendshapes[name];
    if (typeof v === "number") maxScore = Math.max(maxScore, v);
  }
  return Math.min(100, (maxScore / 0.6) * 100);
}

export function updateAttentionState(sample: AttentionRawSample): AttentionState {
  let yawDeg = 0;
  let pitchDeg = 0;
  let headScore = 0;

  if (sample.transformMatrix && sample.transformMatrix.length >= 16) {
    const pose = matrixToYawPitch(sample.transformMatrix);
    yawDeg = pose.yawDeg;
    pitchDeg = pose.pitchDeg;
    headScore = headPoseOffScore(yawDeg, pitchDeg);
  }

  const gazeScore = gazeOffScore(sample.blendshapes);
  const instantOffScore = Math.max(headScore, gazeScore);

  smoothedOffContentScore =
    SMOOTHING_ALPHA * instantOffScore + (1 - SMOOTHING_ALPHA) * smoothedOffContentScore;

  if (hysteresisState === "on" && smoothedOffContentScore >= OFF_CONTENT_ENTER) {
    hysteresisState = "off";
  } else if (hysteresisState === "off" && smoothedOffContentScore <= OFF_CONTENT_EXIT) {
    hysteresisState = "on";
  }

  return {
    onContent: hysteresisState === "on",
    offContentScore: smoothedOffContentScore,
    debug: { yawDeg, pitchDeg, gazeOffScore: gazeScore },
  };
}

export function resetAttentionState(): void {
  smoothedOffContentScore = 0;
  hysteresisState = "on";
}
