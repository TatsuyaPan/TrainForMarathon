import { GENERATED_CONTENT } from "./generated.js";
import type { ContentDocument, ContentIndexEntry } from "./types.js";

const documents: readonly ContentDocument[] = GENERATED_CONTENT;
const byId = new Map(documents.map((document) => [document.id, document]));

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
  const document = byId.get(contentId);
  if (!document) throw new Error(`Unknown content: ${contentId}`);
  return { ...document, assets: document.assets.map((asset) => ({ ...asset })) };
}
