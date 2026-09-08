/** Build the editable museum source and its paired station body together.
 * Usage: bun tools/build-aperture.mjs /absolute/path/to/sanctuary-spatial-study */
import { cp, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { refreshApertureKeeper } from './refresh-aperture-keeper.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv[2])throw Error('Provide the sanctuary-spatial-study source directory.');
const museum=resolve(process.argv[2]);
await access(resolve(museum,'src/scene/guide.ts'));
await cp(resolve(root,'public/sanctuary-world/lab/limen-body.js'),resolve(museum,'src/scene/limen-body.js'));
await cp(resolve(root,'public/sanctuary-world/lab/limen-motion.js'),resolve(museum,'src/scene/limen-motion.js'));
const build=spawnSync('bun',['run','build'],{cwd:museum,stdio:'inherit'});
if(build.status!==0)process.exit(build.status||1);
await cp(resolve(museum,'dist'),resolve(root,'public/sanctuary-world/aperture'),{recursive:true});
await refreshApertureKeeper();
console.log('Updated the connected museum from its editable source.');
