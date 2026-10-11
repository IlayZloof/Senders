import { readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vite';

// Single source of truth for the site version: "version" in package.json.
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));
const APP_VERSION = pkg.version;

/** Publishes /version.json in the build and on the dev/preview server. */
function versionJsonPlugin() {
  const body = () =>
    JSON.stringify(
      {
        version: APP_VERSION,
        commit: process.env.GITHUB_SHA || null,
        builtAt: new Date().toISOString(),
      },
      null,
      2
    ) + '\n';
  const serve = (server) => {
    server.middlewares.use('/version.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.end(body());
    });
  };
  return {
    name: 'senders-version-json',
    configureServer: serve,
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body() });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [versionJsonPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        map: resolve(__dirname, 'map.html'),
        spot: resolve(__dirname, 'spot.html'),
        profile: resolve(__dirname, 'profile.html'),
        editProfile: resolve(__dirname, 'edit-profile.html'),
        login: resolve(__dirname, 'login.html'),
        waiting: resolve(__dirname, 'waiting.html'),
        addSpot: resolve(__dirname, 'add-spot.html'),
        admin: resolve(__dirname, 'admin.html'),
        users: resolve(__dirname, 'users.html'),
        safety: resolve(__dirname, 'safety.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        terms: resolve(__dirname, 'terms.html'),
        faq: resolve(__dirname, 'faq.html'),
        community: resolve(__dirname, 'community.html'),
        about: resolve(__dirname, 'about.html'),
        contact: resolve(__dirname, 'contact.html'),
        reels: resolve(__dirname, 'reels.html'),
      },
    },
  },
  server: {
    open: '/index.html',
  },
});
