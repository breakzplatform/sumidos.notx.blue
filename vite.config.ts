import { defineConfig, loadEnv, type Plugin } from 'vite';
import { headTags } from './src/lib/head.ts';
import { allowedHosts, buildClientMetadata, metadataPath, parseHostList } from './src/lib/oauth-metadata.ts';
import { ENGLISH_HOST, PRIMARY_HOST } from './src/lib/site.ts';

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

const HEAD_MARK = '<!-- site-head -->';
/** Served at crickets.notx.blue/ by a host rewrite (netlify.toml). */
const ENGLISH_PAGE = 'index.en.html';

/**
 * Fills the <head> for sumidos.notx.blue and writes a copy of the built page
 * for crickets.notx.blue, so link previews show each host's name and
 * language without running the app.
 */
function siteHead(): Plugin {
  const primary = headTags(PRIMARY_HOST);
  return {
    name: 'sumidos:site-head',
    enforce: 'post',
    transformIndexHtml(html) {
      if (!html.includes(HEAD_MARK)) throw new Error(`index.html lost its ${HEAD_MARK} marker`);
      return html.replace(HEAD_MARK, primary);
    },
    generateBundle(_options, bundle) {
      const page = bundle['index.html'];
      if (page?.type !== 'asset' || typeof page.source !== 'string') return;
      const english = page.source
        .replace('<html lang="pt-BR">', '<html lang="en">')
        .replace(primary, headTags(ENGLISH_HOST))
        .replace('aria-label="sumidos.notx.blue"', 'aria-label="crickets.notx.blue"')
        .replace('id="wordmark-name">sumidos<', 'id="wordmark-name">crickets<');
      if (!english.includes('<html lang="en">') || !english.includes('>crickets<')) throw new Error('could not write the English page');
      this.emitFile({ type: 'asset', fileName: ENGLISH_PAGE, source: english });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const hosts = allowedHosts(parseHostList(env.VITE_OAUTH_EXTRA_HOSTS));
  return {
    // `vite build --base=/sumidos/` overrides this for a subpath deploy.
    base: '/',
    plugins: [siteHead(), clientMetadata(hosts)],
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
