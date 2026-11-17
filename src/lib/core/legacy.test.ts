import { describe, expect, it } from 'vitest';
import { translateLegacyUrl } from './legacy';

const maps = { setups: { 'slug-a': 'm/a~p~gguf~q4@local~hw', 'slug-b': 'm/b~api@cloud~openrouter' } };
const t = (u: string, m = maps) => translateLegacyUrl(u, m)!;

describe('legacy link translator', () => {
  it('ignores non-Crucible paths', () => {
    expect(translateLegacyUrl('/blog/')).toBeNull();
    expect(translateLegacyUrl('/crucible/nope/')).toBeNull();
  });
  it('main page: mode id and filters move to the query, in codec order (ROUTE-06/09)', () => {
    const r = t('/crucible/#chat&suite=v3&exclude=forge&harness=pi&where=local&quant=q4_k_m,-&reasoning=all');
    expect(r.href).toBe('/?mode=chat&suite=v3&exclude=forge&harness=pi&where=local&quant=q4_k_m,-');
  });
  it('main page defaults vanish (harness=best, where=all)', () => {
    expect(t('/crucible/#combined&harness=best&where=all').href).toBe('/?mode=combined');
    expect(t('/crucible/').href).toBe('/');
  });
  it('provisional: hash wins over the legacy ?provisional=1 query (ROUTE-12)', () => {
    expect(t('/crucible/?provisional=1').href).toBe('/?provisional=1');
    expect(t('/crucible/?provisional=1#chat&provisional=0').href).toBe('/?mode=chat');
    expect(t('/crucible/#chat&provisional=true').href).toBe('/?mode=chat&provisional=1');
  });
  it('legacy &compare= goes to compare with the first 4 slugs, mapped to setup ids', () => {
    const r = t('/crucible/#chat&compare=slug-a,slug-b,gone,x,y&suite=v3');
    expect(r.path).toBe('/compare/');
    expect(r.href).toBe('/compare/?s=m%2Fa~p~gguf~q4%40local~hw,m%2Fb~api%40cloud~openrouter&suite=v3');
    expect(r.unresolved).toEqual(['gone', 'x']);
  });
  it('compare page: slugs in the id part', () => {
    const r = t('/crucible/compare/#slug-b&mode=agentic');
    expect(r.href).toBe('/compare/?s=m%2Fb~api%40cloud~openrouter&mode=agentic');
    expect(t('/crucible/compare/#nope').unresolved).toEqual(['nope']);
    expect(t('/crucible/compare/#nope').href).toBe('/compare/');
  });
  it('task page: id into the path, aliases kept as given', () => {
    expect(t('/crucible/task/#react-lead-form&suite=v3&provisional=1').href).toBe(
      '/task/react-lead-form/?suite=v3&provisional=1',
    );
    expect(t('/crucible/task/').href).toBe('/task/');
    expect(t('/crucible/task/?run=abc#x').href).toBe('/task/x/');
  });
  it('model page: three levels, unknown maker, ibm, setup and dropped variant/deployment', () => {
    expect(t('/crucible/model/').href).toBe('/model/');
    expect(t('/crucible/model/#qwen').href).toBe('/model/qwen/');
    expect(t('/crucible/model/#qwen/qwen3.5-9b&mode=chat&suite=v3').href).toBe(
      '/model/qwen/qwen3.5-9b/?suite=v3&mode=chat',
    );
    expect(t('/crucible/model/#-/foo').path).toBe('/model/unknown/foo/');
    expect(t('/crucible/model/#ibm/granite-4').path).toBe('/model/ibm-granite/granite-4/');
    const r = t('/crucible/model/#qwen/q&setup=slug-a&variant=v1&deployment=d1');
    expect(r.search).toContain('setup=m%2Fa~p~gguf~q4%40local~hw');
    expect(r.dropped).toEqual(['variant=v1', 'deployment=d1']);
    expect(t('/crucible/model/#qwen/q&setup=zzz').unresolved).toEqual(['zzz']);
  });
  it('todo, about, runs and full URLs', () => {
    expect(t('/crucible/todo/#&suite=v3&mode=chat&sort=fewest&all=1').href).toBe(
      '/todo/?suite=v3&mode=chat&sort=fewest&all=1',
    );
    expect(t('/crucible/todo/#&sort=easiest').href).toBe('/todo/');
    expect(t('/crucible/about/').href).toBe('/about/');
    expect(t('/crucible/run/').href).toBe('/runs/');
    expect(t('https://www.schaferandrew.com/crucible/task/#a%20b').href).toBe('/task/a%20b/');
  });
  it('tolerates garbage encodings', () => {
    expect(() => t('/crucible/#%E0%A4%A&suite=%E0')).not.toThrow();
  });
});
