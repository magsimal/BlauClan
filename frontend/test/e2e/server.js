const path = require('path');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

async function startTestServer({ backendPort, port = 0 } = {}) {
  if (!backendPort) {
    throw new Error('backendPort is required to start the test server');
  }

  const app = express();
  const frontendRoot = path.resolve(__dirname, '..', '..');

  const proxyOptions = {
    target: `http://127.0.0.1:${backendPort}`,
    changeOrigin: false,
    ws: false,
    logLevel: 'error',
  };

  app.use(
    '/api',
    createProxyMiddleware({
      ...proxyOptions,
      pathRewrite: (path) => `/api${path}`,
    }),
  );
  app.use(
    '/places',
    createProxyMiddleware({
      ...proxyOptions,
      pathRewrite: (path) => `/places${path}`,
    }),
  );
  app.use(express.static(frontendRoot, { extensions: ['html'] }));

  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendRoot, 'index.html'));
  });

  return new Promise((resolve, reject) => {
    const server = app
      .listen(port, () => {
        const address = server.address();
        const resolvedPort = typeof address === 'object' && address ? address.port : port;
        resolve({
          port: resolvedPort,
          close: () =>
            new Promise((innerResolve, innerReject) => {
              server.close((err) => {
                if (err) innerReject(err);
                else innerResolve();
              });
            }),
        });
      })
      .on('error', reject);
  });
}

module.exports = {
  startTestServer,
};
