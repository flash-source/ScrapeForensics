/** The kinds of controlled breakage the mutation engine can introduce. */
export type MutationKind =
  | "rename-class" // .a-offscreen -> .a-offscreen-v2
  | "strip-classes" // remove the element's class attribute entirely
  | "drop-attribute" // remove a data-*/aria attribute the scraper may lean on
  | "move-element" // relocate the field out of its expected parent card
  | "wrap-nesting" // add an extra wrapper element around the field
  | "change-tag" // <span class="a-size-medium"> -> <div class="a-size-medium">
  | "remove-element"; // field deleted entirely — intentionally unrecoverable

export interface Mutation {
  kind: MutationKind;
  /** Human label for the incident log / report. */
  label: string;
  targetField: string;
  /** Applies the mutation to an HTML string and returns the mutated HTML. */
  apply: (html: string) => string;
}

/** One field's before/after selector, for the EXPLAIN-style diff in a report. */
export interface SelectorChange {
  field: string;
  before: string;
  after: string | null; // null == the healer could not find a working selector
}

/** Outcome of a single mutate -> run -> heal -> verify cycle. */
export interface ChaosResult {
  mutation: MutationKind;
  label: string;
  targetField: string;
  /** Did the mutation actually break extraction of any required field? */
  broke: boolean;
  /** Fields that dropped out after the mutation, before healing. */
  fieldsBroken: string[];
  /** Fields that came back non-empty after healing. */
  fieldsRecovered: string[];
  /** How many product rows were affected by the break. */
  rowsAffected: number;
  outcome: "healed" | "partial" | "failed" | "resilient";
  /** Wall-clock ms for the heal + verify portion (what a Reliability Score cares about). */
  recoveryMs: number;
  selectorChanges: SelectorChange[];
  incidentId?: string;
  error?: string;
}

export interface ReliabilityScore {
  total: number;
  broke: number;
  resilient: number; // mutation introduced but nothing the scraper needed actually broke
  healed: number;
  partial: number;
  failed: number;
  /** recovered field-instances / broken field-instances, 0..1 */
  fieldRecovery: number;
  avgRecoveryMs: number;
  /** 0..100 headline number: healed=1, partial=0.5, failed=0, averaged over broken cases. */
  score: number;
}