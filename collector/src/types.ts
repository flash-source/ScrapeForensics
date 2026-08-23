export interface CollectorRecord {
  collectorId: string; // Bright Data's c_* id
  targetUrl: string;
  description: string;
  createdAt: string; // ISO timestamp
}

export interface RunResult {
  collectorId: string;
  timestamp: string;
  success: boolean;
  rowCount: number;
  data: unknown[];
  rawOutput: string; // kept for debugging when parsing guesses wrong
}

export type HealStatus = string;

export interface HealResult {
  collectorId: string;
  status: HealStatus;
  prompt: string; // what we told bdata was broken
  previewResult?: unknown[];
  diffSummary?: string; // Bright Data's own summary"
  viewUrl?: string; // link to the full diff in the Bright Data dashboard
  timestamp: string;
}

export interface IncidentRecord {
  id: string;
  collectorId: string;
  detectedAt: string;
  fieldsAffected?: string[];
  rowsAffected?: number;
  healPrompt: string;
  healResult?: HealResult;
  verifiedAt?: string;
  verifiedSuccess?: boolean;
  notes?: string;
  failureType?: string;
  severity?: string;
  likelyCause?: string;
  diagnosisConfidence?: number;
  diagnosisExplanation?: string;
}
