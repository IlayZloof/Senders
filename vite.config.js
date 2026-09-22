import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        map: resolve(__dirname, 'map.html'),
        spot: resolve(__dirname, 'spot.html'),
        profile: resolve(__dirname, 'profile.html'),
        login: resolve(__dirname, 'login.html'),
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
      },
    },
  },
  server: {
    open: '/index.html',
  },
});
