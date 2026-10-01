import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getMeta } from '../db/db';
import type { Item } from '../domain/types';

export function useItems(): Item[] | undefined {
  return useLiveQuery(() => db().items.toArray(), []);
}

export function useItemMap(): Map<string, Item> {
  const items = useItems();
  const [m, setM] = useState(new Map<string, Item>());
  useEffect(() => {
    if (items) setM(new Map(items.map((i) => [i.id, i])));
  }, [items]);
  return m;
}

export function useMeta<T>(key: string, fallback: T): T {
  return useLiveQuery(() => getMeta(key, fallback), [key], fallback) as T;
}

export function useHashRoute(): [string, (r: string) => void] {
  const read = () => window.location.hash.replace(/^#\/?/, '') || '';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [route, (r: string) => (window.location.hash = `/${r}`)];
}

export function download(filename: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFile(file: File): Promise<string> {
  return file.text();
}

export function buzz() {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* not supported */
  }
}

export function ago(t: number | null | undefined): string {
  if (!t) return 'never';
  const s = (Date.now() - t) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
