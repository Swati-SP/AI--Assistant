# app/services/text_splitter.py
import re
from typing import List

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """
    Splits text into overlapping chunks of approximately `chunk_size` words.
    Overlap helps maintain context between chunks for RAG.
    """
    words = re.split(r'\s+', text.strip())
    chunks = []

    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i:i + chunk_size])
        if chunk:
            chunks.append(chunk)

    return chunks
