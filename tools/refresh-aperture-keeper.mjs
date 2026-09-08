/** Refresh the keeper in an already curated museum export without rebuilding its
 * exhibition from another agent's working tree. The shared body remains source
 * code; this guarded build adapter replaces only the exported keeper factory and
 * its display-name literals. Normal museum builds run this same adapter. */
import ts from 'typescript';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEEPER_NAME, KEEPER_BODY_VERSION } from '../public/sanctuary-world/lab/limen-body.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const alias='__createStationKeeper';
export function adaptKeeper(source, file='museum.js') {
  const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  if(tree.parseDiagnostics.length)throw Error('Museum export must parse before adapting the keeper.');
  const edits=[],factories=[];
  function visit(node) {
    if(ts.isFunctionDeclaration(node)&&node.body) {
      const body=node.body.getText(tree);
      if(body.includes('bodyVersion')&&body.includes('limen-floating-robe'))factories.push(node);
    }
    const token=ts.isStringLiteralLike(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node);
    if(token&&/\bLimen\b/.test(node.getText(tree)))
      edits.push({start:node.getStart(tree),end:node.end,text:node.getText(tree).replace(/\bLimen\b/g,KEEPER_NAME)});
    ts.forEachChild(node,visit);
  }
  visit(tree);
  const connected=source.includes(`import { createLimenBody as ${alias} }`);
  if(!connected&&factories.length!==1)throw Error(`Expected one portable keeper factory; found ${factories.length}. Review the new museum export.`);
  if(connected&&factories.length)throw Error('Museum export contains both a shared and a bundled keeper.');
  if(edits.length>16)throw Error('Unexpected keeper-name scope. Review the new export before changing its text.');
  const labels=edits.length;
  if(!connected) {
    const factory=factories[0],parameter=factory.parameters[0]?.name;
    if(factory.parameters.length!==1||!ts.isIdentifier(parameter))throw Error('The museum keeper factory interface has changed.');
    for(let i=edits.length-1;i>=0;i--)if(edits[i].start>=factory.body.pos&&edits[i].end<=factory.body.end)edits.splice(i,1);
    edits.push({start:factory.body.getStart(tree),end:factory.body.end,text:`{return ${alias}(${parameter.text});}`});
  }
  for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
  const prelude=`import { createLimenBody as ${alias} } from "../../lab/limen-body.js?v=${KEEPER_BODY_VERSION}";\n`;
  source=connected?source.replace(/^import \{ createLimenBody as __createStationKeeper \}[^\n]*\n/,prelude):prelude+source;
  if(ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length)throw Error('Keeper adaptation must produce valid JavaScript.');
  return {source,labels};
}

export async function refreshApertureKeeper(museum=resolve(root,'public/sanctuary-world/aperture')) {
  const htmlPath=resolve(museum,'index.html'),html=await readFile(htmlPath,'utf8');
  const entry=html.match(/<script[^>]+src="(\.\/assets\/index-[^"/]+\.js)"/);
  if(!entry)throw Error('Cannot identify the museum entry module.');
  const oldPath=resolve(museum,entry[1]);
  const {source,labels}=adaptKeeper(await readFile(oldPath,'utf8'),oldPath);
  const hash=createHash('sha256').update(source).digest('hex').slice(0,10);
  const name=`./assets/index-${hash}.js`,nextPath=resolve(museum,name);
  await writeFile(nextPath,source);await writeFile(htmlPath,html.replace(entry[1],name));
  if(oldPath!==nextPath)await unlink(oldPath);
  console.log(`Museum keeper: ${KEEPER_NAME}, ${KEEPER_BODY_VERSION}; ${labels} name tokens; exhibition assets retained.`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await refreshApertureKeeper();
