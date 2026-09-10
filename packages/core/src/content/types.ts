export interface ContentIndexEntry {
  id: string;
  sectionId: string;
  title: string;
  contentVersion: 1;
  previousId?: string;
  nextId?: string;
}

export interface ContentAsset {
  id: string;
  uri: string;
}

export interface ContentDocument extends ContentIndexEntry {
  markdown: string;
  assets: readonly ContentAsset[];
}
