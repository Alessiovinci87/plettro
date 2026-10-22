// Accordi preferiti: una variante precisa (diteggiatura) in un'accordatura.
// Funzioni pure, testate in tests/library-extras.test.ts.
export interface Favorite {
  tuningId: string;
  root: number;
  quality: string;
  bass?: number;
  frets: number[];
  /** millisecondi epoch */
  at: number;
}

export const FAVORITES_KEY = 'plettro.favorites.v1';

export const favKey = (f: Pick<Favorite, 'tuningId' | 'root' | 'quality' | 'bass' | 'frets'>) => `${f.tuningId}|${f.root}|${f.quality}|${f.bass ?? ''}|${f.frets.join(',')}`;

export function parseFavorites(raw: string | null): Favorite[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    if (!Array.isArray(v)) return [];
    return v.filter(
      (f): f is Favorite =>
        !!f &&
        typeof f.tuningId === 'string' &&
        Number.isInteger(f.root) &&
        typeof f.quality === 'string' &&
        Array.isArray(f.frets) &&
        f.frets.length > 0 &&
        f.frets.every((x: unknown) => Number.isInteger(x) && (x as number) >= -1 && (x as number) <= 24) &&
        typeof f.at === 'number',
    );
  } catch {
    return [];
  }
}

export const isFavorite = (list: Favorite[], f: Omit<Favorite, 'at'>) => list.some((x) => favKey(x) === favKey(f));

/** Aggiunge o toglie; i più recenti in cima. */
export function toggleFavorite(list: Favorite[], f: Omit<Favorite, 'at'>, at: number): Favorite[] {
  const k = favKey(f);
  return list.some((x) => favKey(x) === k) ? list.filter((x) => favKey(x) !== k) : [{ ...f, at }, ...list];
}
