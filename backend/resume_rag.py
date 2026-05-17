import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Iterable


TOKEN_PATTERN = re.compile(r"[a-zA-Z][a-zA-Z0-9+#.\-]{1,}")


@dataclass(frozen=True)
class RetrievedResumeChunk:
    index: int
    score: float
    text: str


def _tokens(text: str) -> list[str]:
    return [token.lower() for token in TOKEN_PATTERN.findall(text)]


def _chunk_text(text: str, max_chars: int = 900, overlap_chars: int = 140) -> list[str]:
    paragraphs = [paragraph.strip() for paragraph in re.split(r"\n\s*\n", text) if paragraph.strip()]
    chunks: list[str] = []
    current = ""

    for paragraph in paragraphs:
        if not current:
            current = paragraph
        elif len(current) + len(paragraph) + 2 <= max_chars:
            current = f"{current}\n\n{paragraph}"
        else:
            chunks.append(current)
            overlap = current[-overlap_chars:] if len(current) > overlap_chars else current
            current = f"{overlap}\n\n{paragraph}" if overlap else paragraph

    if current:
        chunks.append(current)

    if not chunks and text.strip():
        for start in range(0, len(text), max_chars - overlap_chars):
            chunks.append(text[start : start + max_chars].strip())

    return [chunk for chunk in chunks if chunk]


class ResumeRAGIndex:
    def __init__(self, resume_text: str):
        self.chunks = _chunk_text(resume_text)
        self.chunk_tokens = [Counter(_tokens(chunk)) for chunk in self.chunks]
        self.document_frequency = Counter(
            token for chunk_counter in self.chunk_tokens for token in chunk_counter.keys()
        )
        self.total_chunks = max(len(self.chunks), 1)

    def retrieve(self, query: str, top_k: int = 5) -> list[RetrievedResumeChunk]:
        query_tokens = Counter(_tokens(query))
        if not query_tokens or not self.chunks:
            return []

        scored: list[RetrievedResumeChunk] = []
        for index, chunk_counter in enumerate(self.chunk_tokens):
            score = 0.0
            chunk_length = sum(chunk_counter.values()) or 1

            for token, query_count in query_tokens.items():
                frequency = chunk_counter.get(token, 0)
                if not frequency:
                    continue

                idf = math.log((self.total_chunks + 1) / (self.document_frequency[token] + 0.5)) + 1
                normalized_tf = frequency / chunk_length
                score += idf * query_count * normalized_tf

            if score:
                scored.append(RetrievedResumeChunk(index=index, score=score, text=self.chunks[index]))

        return sorted(scored, key=lambda item: item.score, reverse=True)[:top_k]


def build_resume_rag_context(resume_text: str, queries: Iterable[str], top_k: int = 5) -> str:
    query = "\n\n".join(query for query in queries if query and query.strip())
    index = ResumeRAGIndex(resume_text)
    chunks = index.retrieve(query, top_k=top_k)

    if not chunks:
        return resume_text[:4000]

    return "\n\n".join(
        f"[Resume excerpt {position}: score={chunk.score:.4f}]\n{chunk.text}"
        for position, chunk in enumerate(chunks, start=1)
    )
