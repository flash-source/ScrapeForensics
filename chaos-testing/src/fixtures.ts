import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export const FIXTURE_PATH = join(here, "fixtures", "amazon-search.html");

/** CSS selector for each repeated record (one Amazon search result card). */
export const RECORD_SELECTOR = 'div[data-component-type="s-search-result"]';

/** Fields we require, and the selector (relative to a record) they start on. */
export const FIELD_SELECTORS: Record<string, string> = {
  title: "h2 span",
  price: ".a-price .a-offscreen",
  rating: ".a-icon-alt",
};

export const REQUIRED_FIELDS = Object.keys(FIELD_SELECTORS);

export async function loadFixture(): Promise<string> {
  return readFile(FIXTURE_PATH, "utf-8");
}
