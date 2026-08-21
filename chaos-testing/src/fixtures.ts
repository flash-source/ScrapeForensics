/**
 * The sandbox page and the "scraper contract": which selector each logical
 * field is extracted with. The mock adapter starts from these selectors; the
 * mutation engine breaks the page out from under them; the healer's job is to
 * find working replacements. Real Bright Data runs replace all of this with a
 * live public URL, but the field list stays the same.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export const FIXTURE_PATH = join(here, "fixtures", "product-page.html");

/** CSS selector for each repeated record on the page. */
export const RECORD_SELECTOR = ".product-card";

/** Fields we require, and the selector (relative to a record) they start on. */
export const FIELD_SELECTORS: Record<string, string> = {
  title: ".title",
  price: ".price",
  stock: ".stock",
};

export const REQUIRED_FIELDS = Object.keys(FIELD_SELECTORS);

export async function loadFixture(): Promise<string> {
  return readFile(FIXTURE_PATH, "utf-8");
}
