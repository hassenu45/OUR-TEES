import express from "express";
import { httpServerHandler } from "cloudflare:node";

// Minimal session (no crypto)
function session() {
  return function(req, res, next) {
    req.session = {};
    next();
  };
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(session());
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});
app.get('/api/settings', async (_req, res) => {
  res.json({ test: true });
});
app.post('/api/login', async (req, res) => {
  try {
    if (req.body && req.body.password === '2007127') {
      return res.json({ success: true });
    }
    res.status(401).json({ error: 'bad password' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.listen(8080);
export default httpServerHandler({ port: 8080 });
