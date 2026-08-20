/**
 * Minimal persistence for the collector registry and incident log.
 * Deliberately a flat JSON file, not a database — fastest thing that
 * works for a hackathon demo. Swap for Postgres/Mongo later by
 * reimplementing these four functions with the same signatures; nothing
 * else in the codebase should need to change.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { CollectorRecord, IncidentRecord } from "./types.js";

const DB_PATH = process.env.SCRAPEFORENSICS_DB ?? "./data/store.json";

interface Db {
  collectors: CollectorRecord[];
  incidents: IncidentRecord[];
}

async function load(): Promise<Db> {
  try {
    const raw = await readFile(DB_PATH, "utf-8");
    return JSON.parse(raw) as Db;
  } catch {
    return { collectors: [], incidents: [] };
  }
}

async function save(db: Db): Promise<void> {
  await mkdir(dirname(DB_PATH), { recursive: true });
  await writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

export async function saveCollector(record: CollectorRecord): Promise<void> {
  const db = await load();
  db.collectors = db.collectors.filter((c) => c.collectorId !== record.collectorId);
  db.collectors.push(record);
  await save(db);
}

export async function listCollectors(): Promise<CollectorRecord[]> {
  return (await load()).collectors;
}

export async function recordIncident(incident: IncidentRecord): Promise<void> {
  const db = await load();
  db.incidents = db.incidents.filter((i) => i.id !== incident.id);
  db.incidents.push(incident);
  await save(db);
}

export async function getIncidents(collectorId?: string): Promise<IncidentRecord[]> {
  const db = await load();
  return collectorId ? db.incidents.filter((i) => i.collectorId === collectorId) : db.incidents;
}
