import { describe, expect, it } from 'vitest';
import { headTags, headText } from '../src/lib/head';

describe('headText', () => {
  it('names each host in its own language', () => {
    expect(headText('crickets.notx.blue', 'en')).toEqual({
      title: 'Accounts you follow that stopped posting • crickets.notx.blue',
      description: 'Find out who a Bluesky handle follows that stopped posting. Runs in your browser.',
      siteName: 'crickets.notx.blue',
      ogLocale: 'en',
      imageAlt: 'crickets.notx.blue: who you follow that stopped posting',
    });
    expect(headText('sumidos.notx.blue', 'pt-BR')).toMatchObject({
      title: 'Contas que você segue e pararam de postar • sumidos.notx.blue',
      ogLocale: 'pt_BR',
    });
  });

  it('keeps the host name when the language changes', () => {
    expect(headText('sumidos.notx.blue', 'en').siteName).toBe('sumidos.notx.blue');
  });
});

describe('headTags', () => {
  it('points the preview at the host it was built for', () => {
    const tags = headTags('crickets.notx.blue');
    expect(tags).toContain('<link rel="canonical" href="https://crickets.notx.blue/" />');
    expect(tags).toContain('<meta property="og:locale" content="en" />');
    expect(tags).toContain('<meta property="og:image" content="https://crickets.notx.blue/og-crickets.notx.blue.png" />');
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(tags).not.toContain('sumidos');
  });
});
