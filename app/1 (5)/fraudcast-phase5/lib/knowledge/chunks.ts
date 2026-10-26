// FraudCast – split documents into chunks (one chunk per "## " section) with metadata. Pure function.

import { KNOWLEDGE_DOCS, type KnowledgeDoc } from "./docs";

export type ChunkRow = {
  chunk_id: string;
  document_id: string;
  title: string;
  source_type: string;
  version: string;
  effective_date: string;
  section: string;
  content: string;
  access_level: string;
  source_reference: string;
};

export function chunkDocs(docs: KnowledgeDoc[] = KNOWLEDGE_DOCS): ChunkRow[] {
  const rows: ChunkRow[] = [];
  for (const d of docs) {
    const parts = d.body.split(/^##\s+/m).map((p) => p.trim()).filter(Boolean);
    parts.forEach((part, i) => {
      const nl = part.indexOf("\n");
      const section = (nl === -1 ? part : part.slice(0, nl)).trim();
      const content = (nl === -1 ? "" : part.slice(nl + 1)).replace(/\s+/g, " ").trim();
      if (!content) return;
      rows.push({
        chunk_id: `${d.document_id}-S${String(i + 1).padStart(2, "0")}`,
        document_id: d.document_id, title: d.title, source_type: d.source_type, version: d.version,
        effective_date: d.effective_date, section, content, access_level: d.access_level, source_reference: d.source_reference,
      });
    });
  }
  return rows;
}

/** Text that gets embedded: title and section give the vector useful context. */
export const embeddingText = (c: ChunkRow) => `${c.title} – ${c.section}\n${c.content}`;
