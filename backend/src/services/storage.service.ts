import { createHash } from "crypto";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

const STORAGE_DIR = join(process.cwd(), "data", "storage");

// Ensure storage dir exists
if (!existsSync(STORAGE_DIR)) {
  mkdirSync(STORAGE_DIR, { recursive: true });
}

// In-memory index for quick lookup
const index: Map<string, { hash: string; uri: string; filePath: string }> = new Map();

export function storeContent(content: unknown, prefix: string = "doc"): { hash: string; uri: string } {
  const raw = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  const hash = `0x${createHash("sha256").update(raw).digest("hex")}`;

  const id = uuidv4();
  const filename = `${prefix}_${id}.json`;
  const filePath = join(STORAGE_DIR, filename);
  writeFileSync(filePath, raw, "utf-8");

  // For MVP, URI is just a local reference. In production, this would be an IPFS hash.
  const uri = `local://${filename}`;

  index.set(hash, { hash, uri, filePath });
  index.set(uri, { hash, uri, filePath });

  return { hash, uri };
}

export function loadContent(hashOrUri: string): unknown | null {
  const entry = index.get(hashOrUri);
  if (!entry) {
    // Try to find by scanning storage dir
    return null;
  }

  try {
    const raw = readFileSync(entry.filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadContentByUri(uri: string): unknown | null {
  if (uri.startsWith("local://")) {
    const filename = uri.replace("local://", "");
    const filePath = join(STORAGE_DIR, filename);
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      return null;
    }
  }
  return loadContent(uri);
}
