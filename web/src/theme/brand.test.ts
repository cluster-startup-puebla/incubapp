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
    };
  },
};

describe('tenant brand', () => {
  it('paints UPAP primary without touching other tokens', () => {
    const style = brandToStyle({
      slug: 'upap',
      primary: 'oklch(0.577 0.245 27.325)',
      primaryForeground: '#fff',
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
    });
    assert.equal(style['--primary'], undefined);
    assert.equal(style['--accent'], 'blue');
  });

  it('uses no tenant theme when there is no slug', async () => {
    const brand = await loadTenantBrand(null, upap);
    assert.equal(brand, null);
  });
});
