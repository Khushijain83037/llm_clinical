import { readFileSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import type { ClinicalExtraction } from "@test-evals/shared";
import { ClinicalExtractionSchema } from "@test-evals/shared";

// Resolve data/ dir relative to this source file regardless of cwd
const __fileDir = fileURLToPath(new URL(".", import.meta.url));
const FROM_FILE = resolve(__fileDir, "../../../../data");
const FROM_CWD_ROOT = resolve(process.cwd(), "data");
const FROM_CWD_UP2 = resolve(process.cwd(), "../../data");

const DATA_DIR = existsSync(FROM_FILE)
  ? FROM_FILE
  : existsSync(FROM_CWD_ROOT)
  ? FROM_CWD_ROOT
  : FROM_CWD_UP2;

export interface DatasetCase {
  id: string;
  transcript: string;
  gold: ClinicalExtraction;
}

let _cache: DatasetCase[] | null = null;

export function loadDataset(filter?: string[]): DatasetCase[] {
  if (!_cache) {
    const transcriptDir = join(DATA_DIR, "transcripts");
    const goldDir = join(DATA_DIR, "gold");

    const files = readdirSync(transcriptDir)
      .filter((f) => f.endsWith(".txt"))
      .sort();

    _cache = files.map((f) => {
      const id = f.replace(".txt", "");
      const transcript = readFileSync(join(transcriptDir, f), "utf-8");
      const goldRaw = JSON.parse(readFileSync(join(goldDir, `${id}.json`), "utf-8"));
      const gold = ClinicalExtractionSchema.parse(goldRaw);
      return { id, transcript, gold };
    });
  }

  if (filter && filter.length > 0) {
    return _cache.filter((c) => filter.includes(c.id));
  }

  return _cache;
}

export function getCase(id: string): DatasetCase | undefined {
  return loadDataset().find((c) => c.id === id);
}
