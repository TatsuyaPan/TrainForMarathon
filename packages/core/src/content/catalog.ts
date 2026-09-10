import { GENERATED_CONTENT } from "./generated.js";
import type { ContentDocument, ContentIndexEntry } from "./types.js";

const documents: readonly ContentDocument[] = GENERATED_CONTENT;
const byId = new Map(documents.map((entry) => [entry.id, entry]));

export function getContentIndex(): readonly ContentIndexEntry[] {
  return documents.map(({ id, sectionId, title, contentVersion, previousId, nextId }) => ({
    id,
    sectionId,
    title,
    contentVersion,
    previousId,
    nextId,
  }));
}

export function getContentById(contentId: string): ContentDocument {
  const entry = byId.get(contentId);
  if (!entry) throw new Error(`Unknown content: ${contentId}`);
  return { ...entry, assets: entry.assets.map((asset) => ({ ...asset })) };
}
