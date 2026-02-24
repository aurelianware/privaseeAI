// Health check + debug endpoints
function createHealthRoutes(app) {
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      auth: 'Auth0'
    });
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  // Debug endpoint to check authentication flow
  app.get('/api/debug/auth', (req, res) => {
    res.json({
      timestamp: new Date().toISOString(),
      message: 'Auth debug endpoint working',
      userAgent: req.get('User-Agent'),
      headers: {
        authorization: req.get('Authorization') ? 'Bearer [PRESENT]' : 'MISSING',
        cookie: req.get('Cookie') ? '[PRESENT]' : 'MISSING'
      },
      url: req.url,
      method: req.method
    });
  });
}

module.exports = { createHealthRoutes };
