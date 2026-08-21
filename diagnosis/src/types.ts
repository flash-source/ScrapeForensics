export type FailureType =
  | "healthy"
  | "no_rows"
  | "field_degradation"
  | "schema_change"
  | "partial_failure"
  | "extraction_error"
  | "unknown";

export type Severity =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type LikelyCause =
  | "none"
  | "dom_structure_change"
  | "selector_change"
  | "schema_drift"
  | "page_unavailable"
  | "extraction_failure"
  | "unknown";

export interface FieldComparison {
  field: string;

  previousSuccessRate: number;
  currentSuccessRate: number;

  drop: number;

  previousSample?: unknown;
  currentSample?: unknown;
}

export interface SchemaComparison {
  previousFields: string[];
  currentFields: string[];

  addedFields: string[];
  removedFields: string[];
  unchangedFields: string[];
}

export interface DiagnosisResult {
  failed: boolean;

  failureType: FailureType;
  severity: Severity;
  likelyCause: LikelyCause;

  confidence: number;

  previousRowCount: number;
  currentRowCount: number;

  affectedFields: string[];

  fieldComparisons: FieldComparison[];

  schemaComparison: SchemaComparison;

  explanation: string;

  healPrompt: string;
}
