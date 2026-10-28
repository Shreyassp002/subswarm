import type { JobResult } from "@subswarm/shared";

export default function ResultEvidence({ result }: { result: JobResult }) {
  const attribution = result.attribution;
  return (
    <p className="field-hint">
      {attribution?.kind === "query-uids"
        ? `Gateway-reported participant UIDs: ${attribution.uids.join(", ")}. ${attribution.note}`
        : attribution?.kind === "registered-participants"
          ? attribution.note
          : "This response has no request-specific miner attribution. Village residents are registered participants, not verified responders."}
    </p>
  );
}
