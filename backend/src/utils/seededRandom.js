/**
 * 문자열 시드를 32비트 정수 해시로 변환. (FNV-1a)
 * @param {string} text
 * @returns {number}
 */
export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 시드 기반 난수 생성기(mulberry32). 같은 시드는 항상 같은 수열을 만듦.
 * @param {string|number} seed
 * @returns {{next: () => number, int: (min:number, max:number) => number, pick: <T>(arr:T[]) => T, shuffle: <T>(arr:T[]) => T[], poisson: (lambda:number) => number}}
 */
export function createRng(seed) {
  let state = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    poisson: (lambda) => {
      const limit = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= next();
      } while (p > limit && k < 12);
      return k - 1;
    },
  };
}
