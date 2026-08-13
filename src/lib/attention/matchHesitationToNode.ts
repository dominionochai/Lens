import type { ConceptNode } from "@/types/analysis";

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

export function matchHesitationToNode(
  hesitationWord: string,
  nodes: ConceptNode[],
): string | null {
  const target = normalize(hesitationWord);
  if (target.length < 2) return null;

  let best: { id: string; score: number } | null = null;

  for (const node of nodes) {
    const label = normalize(node.label);
    if (!label) continue;

    let score = 0;
    if (label === target) {
      score = 100;
    } else if (label.includes(target) || target.includes(label)) {
      const shorter = Math.min(label.length, target.length);
      const longer = Math.max(label.length, target.length);
      score = 50 + (shorter / longer) * 40;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { id: node.id, score };
    }
  }

  return best && best.score >= 55 ? best.id : null;
}

export function resolveAttentionPulseNode(
  recentHints: string[],
  nodes: ConceptNode[],
): string | null {
  for (let i = recentHints.length - 1; i >= 0; i--) {
    const match = matchHesitationToNode(recentHints[i], nodes);
    if (match) return match;
  }
  return null;
}
