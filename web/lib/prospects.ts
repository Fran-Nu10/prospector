import fs from "node:fs/promises";
import path from "node:path";
import type { ClientData } from "./schema";

/**
 * Los JSON de prospectos viven en data/prospects/ (raíz del repo, fuera de web/).
 * El lookup es por el campo `slug` DENTRO del JSON, no por nombre de archivo:
 * así `_ejemplo.json` (slug "ejemplo-burger-pocitos") también resuelve.
 */
const PROSPECTS_DIR = path.resolve(process.cwd(), "..", "data", "prospects");

export async function getAllProspects(): Promise<ClientData[]> {
  let files: string[];
  try {
    files = await fs.readdir(PROSPECTS_DIR);
  } catch {
    return [];
  }

  const prospects: ClientData[] = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    try {
      const raw = await fs.readFile(path.join(PROSPECTS_DIR, file), "utf-8");
      const data = JSON.parse(raw) as ClientData;
      if (data.slug && data.name && data.vertical) {
        prospects.push(data);
      }
    } catch {
      // JSON malformado: se ignora, no tira abajo el resto de las demos
    }
  }
  return prospects;
}

export async function getProspectBySlug(
  slug: string
): Promise<ClientData | null> {
  const prospects = await getAllProspects();
  return prospects.find((p) => p.slug === slug) ?? null;
}
