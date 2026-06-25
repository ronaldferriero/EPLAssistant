# EPL Assistant

This is a lightweight local chatbot for Enterprise Permitting & Licensing (EPL) guidance.

It routes answers based on:

- user role such as `Administrator`, `Coordinator`, or `Reviewer`
- vendor-specific context such as `Bluebeam` or `DigEplan` when relevant
- shared EPL setup and user-guide procedures

## Included sources

- `Guides/ReviewManagementSetupGuide-2023.pdf`
- `Guides/WorkflowSetupGuide-2023.pdf`
- `Guides/ReviewCoordinatorUserGuide-2023.pdf`
- `Guides/ManageTeamsUserGuide-2024.pdf`
- `Guides/MyReviewsSummaryUserGuide-2024.pdf`
- `Guides/ReviewManagementDashboardUserGuide-2024.pdf`
- `Guides/ManageMyReviewsUserGuide-2024-Bluebeam.pdf`
- `Guides/ManageMyReviewsUserGuide-2024.3-DigEplan.pdf`

## Live Website

🌐 **[https://ronaldferriero.github.io/EPLAssistant/](https://ronaldferriero.github.io/EPLAssistant/)**

## Run locally

Open `index.html` in a browser. It includes a browser-friendly local data bundle, so it should work directly from the file system.

If you prefer to run it from a simple local server:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Rebuild the guide knowledge base

The chatbot answers from `data/knowledge-base.json`, which is generated from the PDFs.

1. Install `pypdf` if needed.
2. Run:

```bash
python3 scripts/build_knowledge_base.py
```

If you installed `pypdf` into a custom target such as `/tmp/ereviews_pdf_deps`, run:

```bash
PYTHONPATH=/tmp/ereviews_pdf_deps python3 scripts/build_knowledge_base.py
```
