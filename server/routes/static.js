// Serve static files (React build) + SPA fallback
// MUST be registered last — the SPA catch-all will swallow unmatched routes.
const path = require('path');
const express = require('express');

function createStaticRoutes(app) {
  // Hashed assets (JS/CSS) → cache forever; everything else → no cache
  app.use(express.static(path.join(__dirname, '..', '..', 'dist'), {
    setHeaders(res, filePath) {
      if (/\/assets\//.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
      }
    }
  }));

  // Handle client-side routing (SPA) — never cache the shell
  app.get('/{*splat}', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  });
}

module.exports = { createStaticRoutes };
