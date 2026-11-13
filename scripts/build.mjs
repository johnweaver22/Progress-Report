import {mkdirSync,copyFileSync,cpSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
rmSync(dist,{recursive:true,force:true}); mkdirSync(dist,{recursive:true});
for(const name of ['index.html','styles.css','app.js','criteria.js','storage.js','pdf.js','sw.js','manifest.webmanifest','.nojekyll']) copyFileSync(path.join(root,name),path.join(dist,name));
for(const name of ['assets','vendor']) cpSync(path.join(root,name),path.join(dist,name),{recursive:true});
console.log('Built self-contained offline app in dist/');
