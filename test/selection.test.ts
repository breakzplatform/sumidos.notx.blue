import { describe, expect, it } from 'vitest';
import { Selection } from '../src/lib/selection';

describe('Selection', () => {
  it('marks and unmarks single accounts', () => {
    const s = new Selection();
    s.toggle('a');
    s.set('b', true);
    expect(s.pick(['a', 'b', 'c'])).toEqual(['a', 'b']);
    s.toggle('a');
    expect(s.pick(['a', 'b', 'c'])).toEqual(['b']);
  });

  it('marks everything in the filter, with no cap', () => {
    const s = new Selection();
    const visible = Array.from({ length: 1234 }, (_, i) => `did:${i}`);
    s.markAll(visible);
    expect(s.pick(visible)).toHaveLength(1234);
    expect(s.coversAll(visible)).toBe(true);
  });

  it('only acts on marked accounts that are still visible', () => {
    const s = new Selection();
    s.markAll(['a', 'b', 'c']);
    expect(s.pick(['c', 'a'])).toEqual(['c', 'a']);
    expect(s.has('b')).toBe(true);
  });

  it('is not "all" for an empty filter', () => {
    expect(new Selection().coversAll([])).toBe(false);
  });

  it('forgets unfollowed accounts and clears', () => {
    const s = new Selection();
    s.markAll(['a', 'b']);
    s.forget(['a']);
    expect(s.pick(['a', 'b'])).toEqual(['b']);
    s.clear();
    expect(s.pick(['a', 'b'])).toEqual([]);
  });

  it('tells the page box how much is marked', () => {
    const s = new Selection();
    const all = ['a', 'b', 'c', 'd'];
    const page = ['a', 'b'];
    expect(s.pageMark(page, all)).toBe('none');
    s.set('a', true);
    expect(s.pageMark(page, all)).toBe('some');
    s.markAll(page);
    expect(s.pageMark(page, all)).toBe('page');
    s.markAll(all);
    expect(s.pageMark(page, all)).toBe('every');
    // Unmarking any row, even off the page, drops back from "every".
    s.set('d', false);
    expect(s.pageMark(page, all)).toBe('page');
    expect(new Selection().pageMark([], [])).toBe('none');
  });
});
