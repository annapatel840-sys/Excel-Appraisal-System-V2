const express = require('express');
const path = require('path');

const app = express();
const port = Number(process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || 9000);
const distPath = path.join(__dirname, '..', 'dist');

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'employee-appraisal', runtime: 'nodejs' });
});

// Vite emits content-hashed JS/CSS filenames on every production build. Cache
// those immutable assets aggressively, but never let browsers/proxies reuse old HTML.
app.use(express.static(distPath, {
  index: false,
  setHeaders(res, filePath) {
    const name = path.basename(filePath);
    const isHashedAsset = /-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|svg|png|jpe?g|webp)$/i.test(name);
    if (name === 'index.html') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (isHashedAsset) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  },
}));
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Employee Appraisal Management listening on port ${port}`);
});
