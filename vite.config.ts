import { defineConfig, loadEnv, type Plugin } from 'vite';
import { allowedHosts, buildClientMetadata, metadataPath, parseHostList } from './src/lib/oauth-metadata.ts';

/**
 * Writes one OAuth client metadata document per allowed host, derived from
 * the same code the app uses at runtime.
 */
function clientMetadata(hosts: readonly string[]): Plugin {
  let base = '/';
  return {
    name: 'sumidos:client-metadata',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    generateBundle() {
      for (const host of hosts) {
        this.emitFile({
          type: 'asset',
          fileName: metadataPath(host),
          source: `${JSON.stringify(buildClientMetadata(host, base), null, 2)}\n`,
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const hosts = allowedHosts(parseHostList(env.VITE_OAUTH_EXTRA_HOSTS));
  return {
    // `vite build --base=/sumidos/` overrides this for a subpath deploy.
    base: '/',
    plugins: [clientMetadata(hosts)],
    build: {
      target: 'es2022',
      sourcemap: false,
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
