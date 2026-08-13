export interface EnvironmentScore {
  brightness: number;
  glare: number;
  clutter: number;
  noise: number;
  status: "dim" | "good" | "glare" | "cluttered" | "noisy";
  narration: string;
  recommendedMode: "normal" | "high-contrast" | "calm" | "focus" | "noisy";
  activeConditions: Array<"dim" | "glare" | "cluttered" | "noisy">;
}

const GLARE_THRESHOLD = 240;
const NOISE_ALERT_ENTER = 45;
const NOISE_ALERT_EXIT = 30;
const GLARE_PERCENT_ALERT_ENTER = 8;
const GLARE_PERCENT_ALERT_EXIT = 5;
const DIM_BRIGHTNESS_ALERT_ENTER = 35;
const DIM_BRIGHTNESS_ALERT_EXIT = 42;
const CLUTTER_ALERT_ENTER = 55;
const CLUTTER_ALERT_EXIT = 45;

// Smoothing: how much weight the newest frame gets vs. accumulated history.
// Lower = smoother/slower to react, higher = more responsive/twitchier.
const SMOOTHING_ALPHA = 0.25;

// Persisted across calls (module-scope) - this is what gives the scorer
// memory between frames instead of judging each frame in total isolation.
let smoothed: {
  brightness: number;
  glare: number;
  clutter: number;
  noise: number;
} | null = null;

// Hysteresis state: tracks whether each condition is CURRENTLY active,
// so entering/exiting use different thresholds and it can't flap on a
// single frame that lands right on the boundary.
let activeState = {
  dim: false,
  glare: false,
  cluttered: false,
  noisy: false,
};

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function estimateClutter(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  let varianceSum = 0;
  let count = 0;

  const step = 4;
  for (let y = 0; y < height - step; y += step) {
    for (let x = 0; x < width - step; x += step) {
      const i = (y * width + x) * 4;
      const iRight = (y * width + (x + step)) * 4;
      const iDown = ((y + step) * width + x) * 4;

      if (iRight >= data.length || iDown >= data.length) continue;

      const l = luminance(data[i], data[i + 1], data[i + 2]);
      const lRight = luminance(
        data[iRight],
        data[iRight + 1],
        data[iRight + 2],
      );
      const lDown = luminance(data[iDown], data[iDown + 1], data[iDown + 2]);

      varianceSum += Math.abs(l - lRight) + Math.abs(l - lDown);
      count++;
    }
  }

  if (count === 0) return 0;

  const avgVariance = varianceSum / (count * 2);
  return Math.min(100, Math.round((avgVariance / 60) * 100));
}

function ema(previous: number | null, current: number): number {
  if (previous === null) return current;
  return previous + SMOOTHING_ALPHA * (current - previous);
}

// Hysteresis: uses a different threshold to enter a state than to exit it,
// so a value hovering right at the line doesn't flip the condition every frame.
function withHysteresis(
  wasActive: boolean,
  value: number,
  enterThreshold: number,
  exitThreshold: number,
): boolean {
  if (wasActive) {
    return value >= exitThreshold;
  }
  return value >= enterThreshold;
}

// Same as withHysteresis but for "low value triggers" (dim brightness),
// where entering means dropping BELOW a threshold, not rising above one.
function withHysteresisInverted(
  wasActive: boolean,
  value: number,
  enterThreshold: number,
  exitThreshold: number,
): boolean {
  if (wasActive) {
    return value <= exitThreshold;
  }
  return value <= enterThreshold;
}

export function scoreFrame(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  noiseLevel = 0,
): EnvironmentScore {
  let total = 0;
  let count = 0;
  let blownOut = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const l = luminance(r, g, b);
    total += l;
    count++;

    if (l > GLARE_THRESHOLD) {
      blownOut++;
    }
  }

  const rawBrightness = count > 0 ? (total / count) * (100 / 255) : 0;
  const rawGlare = count > 0 ? (blownOut / count) * 100 : 0;
  const rawClutter = estimateClutter(data, width, height);
  const rawNoise = noiseLevel;

  // Smooth every signal against its recent history before making any
  // decision - kills single-frame spikes/dropouts from ever being able
  // to flip state on their own.
  smoothed = {
    brightness: ema(smoothed?.brightness ?? null, rawBrightness),
    glare: ema(smoothed?.glare ?? null, rawGlare),
    clutter: ema(smoothed?.clutter ?? null, rawClutter),
    noise: ema(smoothed?.noise ?? null, rawNoise),
  };

  const brightness = Math.round(smoothed.brightness);
  const glare = Math.round(smoothed.glare);
  const clutter = Math.round(smoothed.clutter);
  const noise = Math.round(smoothed.noise);

  // Evaluate each condition independently with hysteresis - a room can be
  // BOTH dim AND cluttered at the same time now, instead of only ever
  // reporting the first thing that happened to match.
  const dim = withHysteresisInverted(
    activeState.dim,
    brightness,
    DIM_BRIGHTNESS_ALERT_ENTER,
    DIM_BRIGHTNESS_ALERT_EXIT,
  );
  const glareActive = withHysteresis(
    activeState.glare,
    glare,
    GLARE_PERCENT_ALERT_ENTER,
    GLARE_PERCENT_ALERT_EXIT,
  );
  const cluttered = withHysteresis(
    activeState.cluttered,
    clutter,
    CLUTTER_ALERT_ENTER,
    CLUTTER_ALERT_EXIT,
  );
  const noisy = withHysteresis(
    activeState.noisy,
    noise,
    NOISE_ALERT_ENTER,
    NOISE_ALERT_EXIT,
  );

  activeState = { dim, glare: glareActive, cluttered, noisy };

  const activeConditions: EnvironmentScore["activeConditions"] = [];
  if (dim) activeConditions.push("dim");
  if (glareActive) activeConditions.push("glare");
  if (cluttered) activeConditions.push("cluttered");
  if (noisy) activeConditions.push("noisy");

  // Priority order for the SINGLE status/narration/mode fields, kept for
  // backward compatibility with anything downstream still reading them -
  // but activeConditions above is the real, non-lossy signal now and
  // carries every condition that's simultaneously true, not just one.
  let status: EnvironmentScore["status"] = "good";
  let narration = "Workspace looks clear. Optimal reading conditions.";
  let recommendedMode: EnvironmentScore["recommendedMode"] = "normal";

  if (noisy) {
    status = "noisy";
    narration =
      "Noisy environment detected - narrowing focus to one line at a time.";
    recommendedMode = "noisy";
  } else if (glareActive) {
    status = "glare";
    narration = "Detected glare - switching to high-contrast mode.";
    recommendedMode = "high-contrast";
  } else if (dim) {
    status = "dim";
    narration = "Low light detected - brightening the interface.";
    recommendedMode = "calm";
  } else if (cluttered) {
    status = "cluttered";
    narration = "Busy visual environment - simplifying to reduce load.";
    recommendedMode = "focus";
  }

  if (activeConditions.length > 1) {
    const conditionLabels: Record<string, string> = {
      dim: "low light",
      glare: "glare",
      cluttered: "a busy visual environment",
      noisy: "background noise",
    };
    const combined = activeConditions
      .map((c) => conditionLabels[c])
      .join(" and ");
    narration = `Detected ${combined} at once - adapting the interface to reduce overall load.`;
  }

  return {
    brightness,
    glare,
    clutter,
    noise,
    status,
    narration,
    recommendedMode,
    activeConditions,
  };
}
