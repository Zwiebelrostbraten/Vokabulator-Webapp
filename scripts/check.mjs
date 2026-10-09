import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for(const dir of ['assets','worker','scripts','tests']) {
  for(const file of await readdir(dir)) {
    if(!file.endsWith('.mjs'))continue;
    const result=spawnSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});
    if(result.status)process.exit(result.status);
  }
}
console.log('Syntaxprüfung erfolgreich.');
