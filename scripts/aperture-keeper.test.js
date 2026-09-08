import { test, expect } from 'bun:test';
import { adaptKeeper } from '../tools/refresh-aperture-keeper.mjs';

test('updating the museum keeper preserves exhibition code and template expressions',()=>{
  const exhibit='const work={title:"An existing artwork",url:"./art/original.webp",statement:"The artist’s exact words."};';
  const source=exhibit+'function factory(T){const g=new T.Group();g.userData.bodyVersion="living-keeper-3";g.name="limen-floating-robe";return g;}const ui=`Follow Limen ${work.title} <button>Continue with Limen</button>`;';
  const {source:result}=adaptKeeper(source);
  expect(result).toContain(exhibit);
  expect(result).toContain('function factory(T){return __createStationKeeper(T);}');
  expect(result).toContain('`Follow Anima ${work.title} <button>Continue with Anima</button>`');
  expect(adaptKeeper(result).source).toBe(result);
});

test('an unknown museum export fails without widening the edit scope',()=>{
  expect(()=>adaptKeeper('const unknownFactory = () => {};')).toThrow('Expected one portable keeper factory');
  expect(()=>adaptKeeper('const invalid = ;')).toThrow('must parse');
});
