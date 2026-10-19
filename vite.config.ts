import { defineConfig, loadEnv, type Plugin } from 'vite';
import { buildClientMetadata, DEFAULT_OAUTH_SCOPE, DEFAULT_PUBLIC_URL } from './src/lib/oauth-metadata.ts';

/**
 * Writes client-metadata.json next to index.html at build time, derived
 * from VITE_PUBLIC_URL so it always matches what the app sends.
 */
function clientMetadata(publicUrl: string, scope: string): Plugin {
  return {
    name: 'quiet:client-metadata',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'client-metadata.json',
        source: `${JSON.stringify(buildClientMetadata(publicUrl, scope), null, 2)}\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const publicUrl = env.VITE_PUBLIC_URL || DEFAULT_PUBLIC_URL;
  const scope = env.VITE_OAUTH_SCOPE || DEFAULT_OAUTH_SCOPE;
  return {
    // Relative asset paths: the build works from any directory or host.
    base: './',
    plugins: [clientMetadata(publicUrl, scope)],
    build: {
      target: 'es2022',
      sourcemap: true,
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
    },
    test: {
      include: ['test/**/*.test.ts'],
      environment: 'node',
    },
  };
});
