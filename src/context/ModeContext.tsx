"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useEnvironment } from "@/hooks/useEnvironment";
import { scoreFrame, type EnvironmentScore } from "@/lib/environment/scoring";
import { getFaceLandmarker } from "@/lib/attention/faceTracking";
import {
  updateAttentionState,
  resetAttentionState,
} from "@/lib/attention/attentionScoring";
import { resolveAttentionPulseNode } from "@/lib/attention/matchHesitationToNode";
import type { ConceptNode } from "@/types/analysis";

export type Mode = "calm" | "focused" | "overwhelmed";

interface ModeContextValue {
  mode: Mode;
  label: string;
  noiseLevel: number;
  micGranted: boolean;
  visionRead: string;
  demoNoise: number | null;
  setDemoNoise: (n: number | null) => void;
  environmentScore: EnvironmentScore | null;
  activeConditions: string[];
  liveFlaggedWord: string | null;
  confirmedHints: string[];
  trackHesitationKeystroke: (key: string, currentValue: string) => void;
  consumeHesitationHints: () => string[];
  onContent: boolean;
  attentionPulseNode: string | null;
  setAttentionAnalysisContext: (nodes: ConceptNode[]) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const ModeContext = createContext<ModeContextValue>({
  mode: "focused",
  label: "getting a read...",
  noiseLevel: 0,
  micGranted: false,
  visionRead: "Reading the room...",
  demoNoise: null,
  setDemoNoise: () => {},
  environmentScore: null,
  activeConditions: [],
  liveFlaggedWord: null,
  confirmedHints: [],
  trackHesitationKeystroke: () => {},
  consumeHesitationHints: () => [],
  onContent: true,
  attentionPulseNode: null,
  setAttentionAnalysisContext: () => {},
  videoRef: { current: null },
  canvasRef: { current: null },
});

const visionPhrases: Record<Mode, string[]> = {
  calm: [
    "Soft light, tidy desk. Good conditions for deep work.",
    "Steady lighting, low clutter. This space is set up well.",
  ],
  focused: [
    "Decent lighting, a bit of activity nearby. Workable.",
    "Some movement in frame, lighting is fine.",
  ],
  overwhelmed: [
    "Busy visual field detected. Might be worth clearing your desk.",
    "A lot going on in view. Dimming things down could help.",
  ],
};

const PAUSE_MS = 1200;
const BACKSPACE_THRESHOLD = 3;

export function ModeProvider({ children }: { children: ReactNode }) {
  const env = useEnvironment();
  const [visionRead, setVisionRead] = useState("Reading the room...");
  const [demoNoise, setDemoNoise] = useState<number | null>(null);

  const [environmentScore, setEnvironmentScore] = useState<EnvironmentScore | null>(null);
  const [activeConditions, setActiveConditions] = useState<string[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceLandmarkerRef = useRef<import("@mediapipe/tasks-vision").FaceLandmarker | null>(null);

  const [onContent, setOnContent] = useState(true);
  const [attentionPulseNode, setAttentionPulseNode] = useState<string | null>(null);
  const attentionNodesRef = useRef<ConceptNode[]>([]);

  const wordHesitationRef = useRef({
    word: "",
    lastKeyTime: 0,
    backspaceCount: 0,
    pauseFlagged: false,
  });
  const hesitationHintsRef = useRef<string[]>([]);
  const [liveFlaggedWord, setLiveFlaggedWord] = useState<string | null>(null);
  const [confirmedHints, setConfirmedHints] = useState<string[]>([]);

  const setAttentionAnalysisContext = (nodes: ConceptNode[]) => {
    attentionNodesRef.current = nodes;
  };

  const trackHesitationKeystroke = (key: string, currentValue: string) => {
    const now = Date.now();
    const state = wordHesitationRef.current;

    const words = currentValue.split(/\s+/);
    const currentWord = words[words.length - 1] ?? "";
    if (currentWord !== state.word) {
      const priorWord = state.word.trim();
      if (state.pauseFlagged && priorWord.length > 1) {
        const hints = hesitationHintsRef.current;
        if (!hints.includes(priorWord)) {
          hesitationHintsRef.current = [...hints, priorWord].slice(-8);
          setConfirmedHints((prev) => [...prev, priorWord].slice(-8));
        }
      }
      setLiveFlaggedWord(null);
      wordHesitationRef.current = {
        word: currentWord,
        lastKeyTime: now,
        backspaceCount: 0,
        pauseFlagged: false,
      };
      return;
    }

    const timeSinceLastKey = now - state.lastKeyTime;
    const isBackspace = key === "Backspace";
    const backspaceCount = isBackspace ? state.backspaceCount + 1 : state.backspaceCount;
    const pausedTooLong = state.lastKeyTime > 0 && timeSinceLastKey > PAUSE_MS;
    const tooManyBackspaces = backspaceCount >= BACKSPACE_THRESHOLD;
    const pauseFlagged = state.pauseFlagged || pausedTooLong || tooManyBackspaces;

    wordHesitationRef.current = {
      word: currentWord,
      lastKeyTime: now,
      backspaceCount,
      pauseFlagged,
    };

    if (pauseFlagged && !state.pauseFlagged) {
      setLiveFlaggedWord(currentWord);
    }
  };

  const consumeHesitationHints = (): string[] => {
    const hints = hesitationHintsRef.current;
    hesitationHintsRef.current = [];
    wordHesitationRef.current = {
      word: "",
      lastKeyTime: 0,
      backspaceCount: 0,
      pauseFlagged: false,
    };
    setLiveFlaggedWord(null);
    return hints;
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) return;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        try {
          faceLandmarkerRef.current = await getFaceLandmarker();
        } catch (err) {
          console.error("Face landmarker failed to load, attention tracking disabled:", err);
          faceLandmarkerRef.current = null;
        }

        intervalId = setInterval(() => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas || video.videoWidth === 0) return;

          const w = 160;
          const h = Math.round((video.videoHeight / video.videoWidth) * w);
          canvas.width = w;
          canvas.height = h;

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;

          ctx.drawImage(video, 0, 0, w, h);
          const frame = ctx.getImageData(0, 0, w, h);
          const score = scoreFrame(frame.data, w, h, 0);
          setEnvironmentScore(score);
          setActiveConditions(score.activeConditions ?? []);

          const landmarker = faceLandmarkerRef.current;
          if (landmarker && video.videoWidth > 0) {
            try {
              const result = landmarker.detectForVideo(video, performance.now());
              const transformMatrix =
                result.facialTransformationMatrixes?.[0]?.data ?? null;
              const blendshapesRaw = result.faceBlendshapes?.[0]?.categories ?? null;
              const blendshapes = blendshapesRaw
                ? Object.fromEntries(
                    blendshapesRaw.map((c) => [c.categoryName, c.score]),
                  )
                : null;

              const attention = updateAttentionState({
                transformMatrix,
                blendshapes,
              });

              setOnContent(attention.onContent);

              if (!attention.onContent) {
                const nodes = attentionNodesRef.current;
                const hints = hesitationHintsRef.current.length
                  ? hesitationHintsRef.current
                  : confirmedHints;
                if (nodes.length > 0 && hints.length > 0) {
                  const pulseId = resolveAttentionPulseNode(hints, nodes);
                  setAttentionPulseNode(pulseId);
                } else {
                  setAttentionPulseNode(null);
                }
              } else {
                setAttentionPulseNode(null);
              }
            } catch (err) {
              console.warn("Face detection frame skipped:", err);
            }
          }
        }, 400);
      } catch (err) {
        console.error("Camera access failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      resetAttentionState();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveNoise = demoNoise ?? env.noiseLevel;
  const effectiveMicGranted = demoNoise !== null ? true : env.microphoneGranted;

  const mode: Mode = useMemo(() => {
    const clutterOrDim =
      activeConditions.includes("cluttered") ||
      activeConditions.includes("dim") ||
      activeConditions.includes("glare") ||
      activeConditions.includes("noisy");

    if (!effectiveMicGranted && !clutterOrDim) return "focused";
    if (effectiveNoise > 60 || (clutterOrDim && activeConditions.length >= 2))
      return "overwhelmed";
    if (effectiveNoise > 30 || clutterOrDim) return "focused";
    return "calm";
  }, [effectiveNoise, effectiveMicGranted, activeConditions]);

  const label = useMemo(() => {
    const suffix = demoNoise !== null ? " (demo)" : "";
    if (!effectiveMicGranted && activeConditions.length === 0) return "getting a read...";
    if (mode === "overwhelmed") return "a bit scattered" + suffix;
    if (mode === "focused") return "focused" + suffix;
    return "calm workspace" + suffix;
  }, [mode, effectiveMicGranted, demoNoise, activeConditions]);

  useEffect(() => {
    if (environmentScore?.narration) {
      setVisionRead(environmentScore.narration);
      return;
    }
    const phrases = visionPhrases[mode];
    const pick = phrases[Math.floor(Math.random() * phrases.length)];
    setVisionRead(pick);
  }, [mode, environmentScore]);

  return (
    <ModeContext.Provider
      value={{
        mode,
        label,
        noiseLevel: effectiveNoise,
        micGranted: effectiveMicGranted,
        visionRead,
        demoNoise,
        setDemoNoise,
        environmentScore,
        activeConditions,
        liveFlaggedWord,
        confirmedHints,
        trackHesitationKeystroke,
        consumeHesitationHints,
        onContent,
        attentionPulseNode,
        setAttentionAnalysisContext,
        videoRef,
        canvasRef,
      }}
    >
      <video ref={videoRef} muted playsInline style={{ display: "none" }} />
      <canvas ref={canvasRef} style={{ display: "none" }} />
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  return useContext(ModeContext);
}
