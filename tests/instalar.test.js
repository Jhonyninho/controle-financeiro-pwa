import { describe, expect, it } from 'vitest';
import { ehCelular, ehIOS } from '../src/ui/instalar.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0';

describe('instalação do app', () => {
  it('reconhece iPhone e iPad (que se apresenta como Mac com toque)', () => {
    expect(ehIOS(IPHONE, 5)).toBe(true);
    expect(ehIOS(IPAD, 5)).toBe(true);
    expect(ehIOS(IPAD, 0)).toBe(false); // Mac de verdade
  });
  it('separa celular de computador', () => {
    expect(ehCelular(ANDROID, 5)).toBe(true);
    expect(ehCelular(IPHONE, 5)).toBe(true);
    expect(ehCelular(WINDOWS, 0)).toBe(false);
  });
});
