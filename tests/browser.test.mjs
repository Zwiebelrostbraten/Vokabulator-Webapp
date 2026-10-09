import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build, preview } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as XLSX from '@e965/xlsx';
import { unzipSync, strFromU8 } from 'fflate';
test('real browser: project subpath, accessible responsive review and actual downloads without persistent storage', {timeout:60000,skip:process.env.RUN_BROWSER_TESTS!=='1'?'Explicit browser test: npm run test:browser':false},async()=>{
  const outDir=await mkdtemp(join(tmpdir(),'vokabulator-browser-'));
  await build({base:'/vokabulator/',build:{outDir,emptyOutDir:true},logLevel:'silent',plugins:[{name:'public-test-config',transform(_code,id){if(id.endsWith('/assets/config.mjs'))return 'export const API_BASE_URL="https://worker.test";export const TURNSTILE_SITE_KEY="public-test-sitekey";';}}]});
  const server=await preview({base:'/vokabulator/',build:{outDir},preview:{host:'127.0.0.1',port:0},logLevel:'silent'});let browser;
  try {
    browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
    const context=await browser.newContext({viewport:{width:1200,height:900}});
    const page=await context.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      Storage.prototype.setItem=()=>{throw Error('persistent storage forbidden');};
      indexedDB.open=()=>{throw Error('persistent storage forbidden');};
      navigator.serviceWorker.register=()=>{throw Error('persistent storage forbidden');};
    });
    let challenges=0,sessions=0;
    await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?*',route=>route.fulfill({contentType:'application/javascript',body:'window.turnstile={render(el,options){setTimeout(()=>options.callback("browser-token"),0);return 1;},remove(){}};'}));
    await page.route('https://worker.test/session',async route=>{sessions++;assert.deepEqual(route.request().postDataJSON(),{token:'browser-token'});challenges++;await route.fulfill({json:{ticket:'browser-ticket'},headers:{'Access-Control-Allow-Origin':'*'}});});
    const queries=[];
    await page.route('https://*/lookup?*',async route=>{
      assert.equal(route.request().headers().authorization,'Bearer browser-ticket');
      const q=new URL(route.request().url()).searchParams.get('q');queries.push(q);
      await route.fulfill({json:{query:q,found:true,lemma:'rosa, -ae f.',wordType:'SUBST',classLabel:'Substantiv',deponens:false,meanings:['Rose','Blume','Blüte'],flexion:[{form:'SubstantivForm(NOM,SG)',wort:['rosa']},{form:'SubstantivForm(GEN,SG)',wort:['rosae']}]},headers:{'Access-Control-Allow-Origin':'*'}});
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/vokabulator/`);
    const columns=await page.locator('.options-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns,2,'desktop options have two columns');
    await page.getByLabel('Lateinischer Text',{exact:true}).fill('rosa rosam rosa');
    await page.getByLabel('Bedeutungen pro Vokabel').fill('3');
    await page.getByLabel('Brainyoo-Export (.by2) ermöglichen',{exact:true}).check();
    await page.getByLabel('Lektionsname für Brainyoo').fill('Meine Lektion & Text');
    await page.getByRole('button',{name:'Vokabeln generieren',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Fertig:'}).waitFor();
    assert.equal(sessions,1);assert.equal(challenges,1);
    assert.deepEqual(queries.sort(),['rosa','rosam']);
    await page.getByLabel('Bedeutung II. – rosa, -ae f.',{exact:true}).fill('eigene Bedeutung');
    const [excel]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Excel (.xlsx) herunterladen'}).click()]);
    assert.equal(excel.suggestedFilename(),'Vokabelliste.xlsx');
    const workbook=XLSX.read(await readFile(await excel.path()));
    assert.equal(workbook.Sheets.Nomen.F2.v,'eigene Bedeutung');
    assert.equal(workbook.Sheets.Nomen.H2.v,'rosa; rosam');
    const [by2]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Brainyoo (.by2) herunterladen'}).click()]);
    const xml=strFromU8(unzipSync(await readFile(await by2.path()))['by_content.xml']);
    const structure=await page.evaluate(xml=>{
      const document=new DOMParser().parseFromString(xml,'text/xml');
      return {errors:document.querySelectorAll('parsererror').length,cards:document.querySelectorAll('vocabularycard').length,title:document.querySelector('lesson').getAttribute('title'),answer:document.querySelector('vocabularyAnswer').textContent};
    },xml);
    assert.equal(structure.errors,0);assert.equal(structure.cards,1);assert.equal(structure.title,'Meine Lektion & Text');assert.match(structure.answer,/eigene Bedeutung/);
    for(const width of [1200,390]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`no horizontal overflow at ${width}`);
      if(width===390)assert.equal(await page.locator('.options-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
      const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
    }
    assert.deepEqual(errors,[]);
  } finally {await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));await rm(outDir,{recursive:true,force:true});}
});
