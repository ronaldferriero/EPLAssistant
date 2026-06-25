# Deployment Instructions

## GitHub Pages Setup

To enable the website, you need to configure GitHub Pages settings:

1. Go to: https://github.com/ronaldferriero/EPLAssistant/settings/pages
2. Under "Build and deployment":
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/docs**
3. Click **Save**
4. Wait 1-2 minutes for deployment to complete

## Website URL

Once enabled, your site will be available at:
**https://ronaldferriero.github.io/EPLAssistant/**

## How it works

- The `.github/workflows/deploy.yml` file handles automatic deployment
- Every push to the `main` branch triggers a new deployment
- No build step needed - this is a static HTML/CSS/JS application

## Local Development

The Guides folder (3.7GB) is excluded from the repository but kept locally.
The knowledge base (`data/knowledge-base.json`) is already extracted and included.

To rebuild the knowledge base if you add new guides:
```bash
python3 scripts/build_knowledge_base.py
```
