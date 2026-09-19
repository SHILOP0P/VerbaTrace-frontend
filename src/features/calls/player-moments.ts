import type { AnalysisResponse } from "../../types";
import { analysisV3Result, isAnalysisDone } from "../../shared/lib/analysis";
import { stripAnalysisRefs } from "../../shared/lib/analysis-refs";
import { maskProfanity } from "../../shared/lib/display-text";
import type { PlayerMoment } from "../../shared/ui/audio";

const statusLabels: Record<string, string> = {
  met: "выполнено",
  mostly_met: "в основном",
  partially_met: "частично",
  minimally_met: "минимально",
  missed: "пропущено"
};

/**
 * The places in the recording the analysis rests on: one per scored card that
 * has a quote matched to the transcript. A card without a matched quote has no
 * place to point at and stays only in the analysis.
 */
export function playerMoments(analysis: AnalysisResponse | undefined, speakerName: (key: string) => string): PlayerMoment[] {
  if (!isAnalysisDone(analysis)) return [];
  const result = analysisV3Result(analysis);
  if (!result) return [];
  const resolve = (text: string) => stripAnalysisRefs(text).replace(/\{\{speaker:([^}]+)\}\}/gi, (_, key: string) => speakerName(key.trim()));
  return result.items.flatMap((item): PlayerMoment[] => {
    if (item.processing_status === "pending" || item.score === null) return [];
    const evidence = item.evidence.find((entry) => entry.match_status === "matched" && typeof entry.start_seconds === "number");
    if (!evidence) return [];
    return [{
      id: item.id,
      seconds: evidence.start_seconds!,
      tone: item.score >= 75 ? "good" : item.score >= 50 ? "warn" : "bad",
      title: resolve(item.title),
      status: statusLabels[item.status] ?? "оценено",
      quote: maskProfanity(evidence.quote),
      speakerKey: evidence.speaker || undefined
    }];
  }).sort((left, right) => left.seconds - right.seconds);
}
