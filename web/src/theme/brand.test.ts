import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  brandToStyle,
  loadTenantBrand,
  type TenantBrandSource,
} from './brand.ts';

const upap: TenantBrandSource = {
  async load(slug) {
    if (slug !== 'upap') {
      return null;
    }
    return {
      slug: 'upap',
      primary: 'oklch(0.577 0.245 27.325)',
      primaryForeground: '#fff',
      logoUrl: null,
    };
  },
};

const buap: TenantBrandSource = {
  async load(slug) {
    if (slug !== 'buap') {
      return null;
    }
    return {
      slug: 'buap',
      primary: 'oklch(0.488 0.243 264.376)',
      logoUrl: null,
    };
  },
};

describe('tenant brand', () => {
  it('paints UPAP primary without touching other tokens', () => {
    const style = brandToStyle({
      slug: 'upap',
      primary: 'oklch(0.577 0.245 27.325)',
      primaryForeground: '#fff',
      logoUrl: null,
    });
    assert.equal(style['--primary'], 'oklch(0.577 0.245 27.325)');
    assert.equal(style['--primary-foreground'], '#fff');
    assert.equal(style['--background'], undefined);
  });

  it('paints BUAP a different primary', async () => {
    const brand = await loadTenantBrand('buap', buap);
    assert.equal(
      brandToStyle(brand)['--primary'],
      'oklch(0.488 0.243 264.376)',
    );
  });

  it('keeps the default palette when the provider has no config', async () => {
    const brand = await loadTenantBrand('upap', {
      async load() {
        return null;
      },
    });
    assert.deepEqual(brandToStyle(brand), {});
  });

  it('ignores a config meant for another tenant', async () => {
    const brand = await loadTenantBrand('buap', upap);
    assert.equal(brand, null);
  });

  it('falls open when the provider throws', async () => {
    const brand = await loadTenantBrand('upap', {
      async load() {
        throw new Error('provider down');
      },
    });
    assert.equal(brand, null);
  });

  it('drops a value that is not a color', () => {
    const style = brandToStyle({
      slug: 'upap',
      primary: 'red; background: url(https://evil)',
      accent: 'blue',
      logoUrl: null,
    });
    assert.equal(style['--primary'], undefined);
    assert.equal(style['--accent'], 'blue');
  });

  it('uses no tenant theme when there is no slug', async () => {
    const brand = await loadTenantBrand(null, upap);
    assert.equal(brand, null);
  });

  it('sets --primary from color and exposes logoUrl', async () => {
    const withLogo: TenantBrandSource = {
      async load(slug) {
        if (slug !== 'upap') {
          return null;
        }
        return {
          slug: 'upap',
          primary: '#C8102E',
          logoUrl: 'https://cdn.example/upap-logo.png',
        };
      },
    };
    const brand = await loadTenantBrand('upap', withLogo);
    assert.equal(brandToStyle(brand)['--primary'], '#C8102E');
    assert.equal(brand?.logoUrl, 'https://cdn.example/upap-logo.png');
  });

  it('yields empty style when brandPrimary and logoUrl are null', () => {
    const style = brandToStyle({
      slug: 'upap',
      logoUrl: null,
    });
    assert.deepEqual(style, {});
  });

  it('returns null when the provider answers 404', async () => {
    const brand = await loadTenantBrand('missing', {
      async load() {
        return null;
      },
    });
    assert.equal(brand, null);
  });

  it('returns null when the provider throws on lookup', async () => {
    const brand = await loadTenantBrand('upap', {
      async load() {
        throw new Error('404 Not Found');
      },
    });
    assert.equal(brand, null);
  });

  it('drops an invalid brandPrimary color', () => {
    const style = brandToStyle({
      slug: 'upap',
      primary: 'red; background:url(https://evil)',
      logoUrl: 'https://cdn.example/logo.png',
    });
    assert.equal(style['--primary'], undefined);
    assert.equal(style['--logoUrl'], undefined);
  });

  it('ignores a mismatched slug from the provider', async () => {
    const mismatched: TenantBrandSource = {
      async load() {
        return {
          slug: 'buap',
          primary: '#C8102E',
          logoUrl: 'https://cdn.example/logo.png',
        };
      },
    };
    const brand = await loadTenantBrand('upap', mismatched);
    assert.equal(brand, null);
  });
});
