/**
 * The mutation engine — the BREAK half of chaos testing. Each mutation takes
 * the sandbox HTML and returns a deliberately-broken copy, the way a real site
 * change would look: a renamed class, a dropped attribute, a moved element,
 * extra nesting, a swapped tag, or a removed field.
 *
 * These are pure string -> string transforms so they can run against a local
 * fixture (--mock) or against HTML you serve to a real Bright Data collector.
 */

import * as cheerio from "cheerio";
import { RECORD_SELECTOR, FIELD_SELECTORS } from "./fixtures.js";
import type { Mutation, MutationKind } from "./types.js";

/** Strip the leading "." from a class selector like ".price" -> "price". */
function className(fieldSelector: string): string {
  return fieldSelector.replace(/^\./, "");
}

function forEachField(
  html: string,
  field: string,
  fn: ($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>) => void,
): string {
  const $ = cheerio.load(html);
  const sel = FIELD_SELECTORS[field];
  $(RECORD_SELECTOR).find(sel).each((_, node) => fn($, $(node)));
  return $.html();
}

/** Build the concrete mutation set for a given target field. */
function mutationsForField(field: string): Mutation[] {
  const cls = className(FIELD_SELECTORS[field]);

  return [
    {
      kind: "rename-class",
      label: `rename .${cls} class on every ${field}`,
      targetField: field,
      apply: (html) =>
        forEachField(html, field, (_, el) => {
          el.removeClass(cls).addClass(`${cls}-v2`);
        }),
    },
    {
      kind: "drop-class-keep-testid",
      label: `drop .${cls} class, leave data-testid (the classic redesign)`,
      targetField: field,
      apply: (html) =>
        forEachField(html, field, (_, el) => {
          el.removeClass(cls);
        }),
    },
    {
      kind: "drop-attribute",
      label: `remove data-testid from every ${field}`,
      targetField: field,
      apply: (html) =>
        forEachField(html, field, (_, el) => {
          el.removeAttr("data-testid");
        }),
    },
    {
      kind: "wrap-nesting",
      label: `wrap every ${field} in an extra <span>`,
      targetField: field,
      apply: (html) =>
        forEachField(html, field, ($, el) => {
          el.wrap($("<span class=\"field-wrap\"></span>"));
        }),
    },
    {
      kind: "change-tag",
      label: `swap the ${field} element's tag name`,
      targetField: field,
      apply: (html) =>
        forEachField(html, field, ($, el) => {
          const attrs = el.attr() ?? {};
          const inner = el.html() ?? "";
          const replacement = $("<div></div>").html(inner);
          for (const [k, v] of Object.entries(attrs)) replacement.attr(k, v);
          el.replaceWith(replacement);
        }),
    },
    {
      kind: "move-element",
      label: `move every ${field} out of its ${RECORD_SELECTOR}`,
      targetField: field,
      apply: (html) => {
        const $ = cheerio.load(html);
        $(RECORD_SELECTOR).each((_, card) => {
          const $card = $(card);
          const field$ = $card.find(FIELD_SELECTORS[field]);
          field$.insertAfter($card); // now a sibling of the card, not inside it
        });
        return $.html();
      },
    },
    {
      kind: "remove-element",
      label: `delete every ${field} element (unrecoverable)`,
      targetField: field,
      apply: (html) =>
        forEachField(html, field, (_, el) => {
          el.remove();
        }),
    },
  ];
}

/**
 * Every (field x mutation) combination. Deterministic and ordered, so a batch
 * run is reproducible and the Reliability Score is comparable across runs.
 */
export function allMutations(fields: string[]): Mutation[] {
  return fields.flatMap((f) => mutationsForField(f));
}

/**
 * A batch of `count` mutations. If count exceeds the number of distinct
 * mutations we cycle through them again — handy for "run 100 mutations"
 * headline numbers without inventing fake variety.
 */
export function mutationBatch(fields: string[], count: number): Mutation[] {
  const base = allMutations(fields);
  if (count <= 0) return base; // 0 / unspecified == run each distinct mutation once
  if (count <= base.length) return base.slice(0, count);
  const out: Mutation[] = [];
  for (let i = 0; i < count; i++) out.push(base[i % base.length]);
  return out;
}

export const MUTATION_KINDS: MutationKind[] = [
  "rename-class",
  "drop-class-keep-testid",
  "drop-attribute",
  "wrap-nesting",
  "change-tag",
  "move-element",
  "remove-element",
];
