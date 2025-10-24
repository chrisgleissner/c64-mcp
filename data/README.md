# Data Folder

This directory contains the **source knowledge corpus** for the Model Context Protocol (MCP) server. It includes raw reference materials on the **Commodore 64 (C64)** hardware, software, and programming environment. All files in this section are considered **authoritative input data** for the Retrieval-Augmented Generation (RAG) pipeline.

Developers may add new source documents here to extend the MCP’s contextual understanding. Supported formats include Markdown (`.md`), plain text (`.txt`), and structured data formats (`.json`, `.csv`). Binary or non-textual assets should be avoided.

## RAG Embeddings

The `embeddings_*.json` files contain the **vectorized representations** of the knowledge corpus.  These are produced by the RAG embedding pipeline using the configuration defined in `src/rag/`. Each file encodes the **semantic embeddings** that power contextual retrieval and reasoning within the MCP AI runtime.

The embeddings are generated from:

- Documents stored in this directory and its subdirectories.
- External sources declared in [`src/rag/sources.csv`](../src/rag/sources.csv) and downloaded to the `external` folder.

When new knowledge files are added, re-run the embedding process to keep the RAG index synchronized. For more details, see the **Local RAG** chapter in the [README](../README.md).
