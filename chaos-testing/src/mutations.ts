/**
 * The mutation engine — the BREAK half of chaos testing. Each mutation takes
 * the sandbox HTML and returns a deliberately-broken copy, the way a real
 * Amazon redesign would look: a renamed class, stripped classes, a dropped
 * attribute, a moved element, extra nesting, a swapped tag, or a removed field.
 *
 * These are pure string -> string transforms so they can run against the local
 * fixture (--mock) or against HTML you serve to a real Bright Data collector.
 * They operate on the element the field's selector actually matches (deriving
 * the class from that element), so they work with compound Amazon selectors
 * like `.a-price .a-offscreen` and `h2 span`, not just single-class ones.
 */

import * as cheerio from "cheerio";
import { RECORD_SELECTOR, FIELD_SELECTORS } from "./fixtures.js";
import type { Mutation, MutationKind } from "./types.js";

/** First class on an element, e.g. "a-offscreen" — what a class selector keys on. */
function firstClassOf(el: cheerio.Cheerio<any>): string | undefined {
  return (el.attr("class") ?? "").split(/\s+/).filter(Boolean)[0];
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
  return [
    {
      kind: "rename-class",
      label: `rename the CSS class on every ${field} (e.g. .a-offscreen -> .a-offscreen-v2)`,
      targetField: field,
      apply: (html) =>
        forEachField(html, field, (_, el) => {
          const cls = firstClassOf(el);
          if (cls) el.removeClass(cls).addClass(`${cls}-v2`);
        }),
    },
    {
      kind: "strip-classes",
      label: `strip the class attribute off every ${field} (no class hook left)`,
      targetField: field,
      apply: (html) =>
        forEachField(html, field, (_, el) => {
          el.removeAttr("class");
        }),
    },
    {
      kind: "drop-attribute",
      label: `remove data-*/aria attributes from every ${field}`,
      targetField: field,
      apply: (html) =>
        forEachField(html, field, (_, el) => {
          for (const name of Object.keys(el.attr() ?? {})) {
            if (name.startsWith("data-") || name.startsWith("aria-")) el.removeAttr(name);
          }
        }),
    },
    {
      kind: "wrap-nesting",
      label: `wrap every ${field} in an extra <div>`,
      targetField: field,
      apply: (html) =>
        forEachField(html, field, ($, el) => {
          el.wrap($('<div class="wrap-injected"></div>'));
        }),
    },
    {
      kind: "change-tag",
      label: `swap the ${field} element's tag name (keeps classes)`,
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
          $card.find(FIELD_SELECTORS[field]).insertAfter($card); // now a sibling, not inside
        });
        return $.html();
      },
    },
    {
      kind: "remove-element",
      label: `delete every ${field} element`,
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
  "strip-classes",
  "drop-attribute",
  "wrap-nesting",
  "change-tag",
  "move-element",
  "remove-element",
];
