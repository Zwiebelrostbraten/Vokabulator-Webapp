import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build, preview } from 'vite';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import * as XLSX from '@e965/xlsx';
import { unzipSync, strFromU8 } from 'fflate';
test('real browser: project subpath, accessible responsive sliders and explicit actual downloads without persistent storage', {timeout:60000,skip:process.env.RUN_BROWSER_TESTS!=='1'?'Explicit browser test: npm run test:browser':false},async()=>{
  const outDir=await mkdtemp(join(tmpdir(),'vokabulator-browser-'));
  const savedDir=await mkdtemp(join(tmpdir(),'vokabulator-downloads-'));
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
    // Chromium's path() is an opaque temporary ID; persist the suggested name.
    const persist=async(download,expected)=>{
      assert.equal(download.suggestedFilename(),expected);
      const target=join(savedDir,download.suggestedFilename());await download.saveAs(target);
      assert.equal(basename(target),expected);assert.ok(!basename(target).endsWith('.zip'));
      assert.deepEqual(await readFile(target),await readFile(await download.path()));
      return target;
    };
    const cardBlobs=[];
    await page.addInitScript(()=>{
      const original=URL.createObjectURL;
      window.cardBlobTypes=[];
      URL.createObjectURL=blob=>{window.cardBlobTypes.push(blob.type);return original.call(URL,blob);};
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
    const reviewDir='/opt/data/profiles/mrs_patmore/cache/vokabulator-ui-review';
    await mkdir(reviewDir,{recursive:true});
    assert.equal(await page.locator('#status').getAttribute('data-state'),'ready');
    assert.equal(await page.locator('#parallel').isVisible(),false);
    for(const width of [1200,390]) {
      await page.setViewportSize({width,height:900});
      await page.screenshot({path:join(reviewDir,`initial-${width}.png`),fullPage:true});
    }
    await page.setViewportSize({width:1200,height:900});
    await page.getByText('Erweiterte Einstellungen',{exact:true}).click();
    const columns=await page.locator('.options-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns,2,'desktop options have two columns');
    await page.getByLabel('Lateinischer Text',{exact:true}).fill('rosa rosam rosa');
    for(const [name,id,initial,max] of [['Parallele Navigium-Anfragen','parallel','64','128'],['Bedeutungen pro Vokabel','meanings','1','3']]) {
      const slider=page.getByRole('slider',{name:new RegExp(name)});
      assert.equal(await slider.inputValue(),initial);
      assert.equal(await page.locator('#'+id+'-value').textContent(),initial);
      await slider.focus();await slider.press('ArrowRight');
      assert.equal(await slider.inputValue(),String(Number(initial)+1));
      assert.equal(await page.locator('#'+id+'-value').textContent(),String(Number(initial)+1));
      await slider.press('Home');assert.equal(await slider.inputValue(),'1');
      assert.equal(await page.locator('#'+id+'-value').textContent(),'1');
      await slider.press('End');assert.equal(await slider.inputValue(),max);
      assert.equal(await page.locator('#'+id+'-value').textContent(),max);
    }
    await page.getByRole('slider',{name:/Parallele Navigium/}).evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal(await page.locator('#parallel-value').textContent(),'2');
    assert.equal(await page.locator('textarea').count(),1);
    assert.equal(await page.locator('#results, [data-field], [data-delete]').count(),0);
    assert.equal(await page.locator('#export-menu').isVisible(),false);
    assert.equal(await page.locator('#generator #lesson, #brainyoo, #anki').count(),0);
    const downloads=[];
    const bothDownloads=new Promise(resolve=>page.on('download',download=>{downloads.push(download);if(downloads.length===2)resolve();}));
    await page.getByRole('button',{name:'Vokabeln generieren',exact:true}).click();
    await page.locator('#status').filter({hasText:'Fertig:'}).waitFor();
    assert.equal(downloads.length,0);assert.equal(await page.locator('#export-menu').isVisible(),true);
    for(const id of ['xlsx','ods','csv','pdf','by2','apkg'])assert.equal(await page.locator('#'+id).isVisible(),true);
    for(const id of ['xlsx','ods','csv','pdf'])assert.equal(await page.locator('#'+id).isEnabled(),true);
    assert.equal(await page.locator('#by2').isDisabled(),true);assert.equal(await page.locator('#apkg').isDisabled(),true);
    assert.deepEqual((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations,[]);
    await page.getByLabel('Lektions-/Stapelname').fill('Meine Lektion & Text');
    assert.equal(await page.locator('#by2').isEnabled(),true);
    assert.equal(await page.locator('#status').getAttribute('data-state'),'success');
    for(const width of [1200,390]) {
      await page.setViewportSize({width,height:900});
      await page.screenshot({path:join(reviewDir,`success-${width}.png`),fullPage:true});
    }
    await page.setViewportSize({width:1200,height:900});
    await page.getByRole('button',{name:'Excel (.xlsx) herunterladen',exact:true}).click();
    await page.getByRole('button',{name:'Brainyoo (.by2) herunterladen',exact:true}).click();
    await bothDownloads;
    assert.match(await page.locator('#status').textContent(),/Dateien stehen zum Download bereit/);
    assert.match(await page.locator('#count').textContent(),/1 Vokabel · Nomen: 1/);
    assert.equal(sessions,1);assert.equal(challenges,1);
    assert.deepEqual(queries.sort(),['rosa','rosam']);
    const [excel,by2]=downloads;
    assert.equal(excel.suggestedFilename(),'Vokabelliste.xlsx');
    assert.equal(by2.suggestedFilename(),'Meine-Lektion-Text.by2');
    const workbook=XLSX.read(await readFile(await excel.path()));
    assert.equal(workbook.Sheets.Nomen.F2.v,'Blume');
    assert.equal(workbook.Sheets.Nomen.G2.v,'Blüte');
    assert.equal(workbook.Sheets.Nomen.H2.v,'rosa; rosam');
    const by2Saved=await persist(by2,'Meine-Lektion-Text.by2');
    cardBlobs.push((await page.evaluate(()=>window.cardBlobTypes)).at(-1));
    assert.equal(cardBlobs[0],'application/x-brainyoo');
    const xml=strFromU8(unzipSync(await readFile(by2Saved))['by_content.xml']);
    const structure=await page.evaluate(xml=>{
      const document=new DOMParser().parseFromString(xml,'text/xml');
      return {errors:document.querySelectorAll('parsererror').length,cards:document.querySelectorAll('vocabularycard').length,title:document.querySelector('lesson').getAttribute('title'),answer:document.querySelector('vocabularyAnswer').textContent};
    },xml);
    assert.equal(structure.errors,0);assert.equal(structure.cards,1);assert.equal(structure.title,'Meine Lektion & Text');assert.match(structure.answer,/Rose\nBlume\nBlüte/);
    for(const [id,extension] of [['ods','ods'],['csv','csv'],['pdf','pdf'],['apkg','apkg']]) {
      const [file]=await Promise.all([page.waitForEvent('download'),page.locator('#'+id).click()]);
      assert.equal(file.suggestedFilename(),(id==='apkg'?'Meine-Lektion-Text':'Vokabelliste')+'.'+extension);
      const bytes=new Uint8Array(await readFile(await file.path()));
      if(id==='pdf') {
        const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const pdf=await getDocument({data:bytes}).promise;
        assert.equal(pdf.numPages,1);const text=(await (await pdf.getPage(1)).getTextContent()).items.map(x=>x.str).join(' ');
        for(const expected of ['Vokabelliste','Nom. Sg.','Gen. Sg.','Rose','Blume','Blüte','rosa; rosam'])assert.ok(text.includes(expected),expected);
      }
      if(id==='ods')assert.equal(XLSX.read(bytes).Sheets.Nomen.G2.v,'Blüte');
      if(id==='csv')assert.deepEqual([...bytes.slice(0,3)],[239,187,191]);
      if(id==='apkg') {
        const saved=await persist(file,'Meine-Lektion-Text.apkg');assert.equal(basename(saved),'Meine-Lektion-Text.apkg');
        assert.equal((await page.evaluate(()=>window.cardBlobTypes)).at(-1),'application/x-anki');
        const {default:init}=await import('sql.js');const SQL=await init();const db=new SQL.Database(unzipSync(bytes)['collection.anki2']);
        assert.equal(db.exec('pragma integrity_check')[0].values[0][0],'ok');assert.equal(db.exec('select count(*) from cards')[0].values[0][0],1);assert.equal(db.exec('select tags from notes')[0].values[0][0],' Latein ');assert.equal(Object.values(JSON.parse(db.exec('select decks from col')[0].values[0][0]))[0].name,'Meine Lektion & Text');db.close();
      }
    }
    downloads.splice(2);
    await page.getByLabel('Lektions-/Stapelname').fill('');
    assert.equal(await page.locator('#by2').isDisabled(),true);
    await page.getByRole('slider',{name:/Bedeutungen pro Vokabel/}).press('Home');
    await page.getByRole('button',{name:'Vokabeln generieren',exact:true}).click();
    await page.locator('#status').filter({hasText:'Fertig:'}).waitFor();
    assert.equal(downloads.length,2);assert.equal(await page.locator('#by2').isVisible(),true);
    const [onlyExcel]=await Promise.all([page.waitForEvent('download'),page.locator('#xlsx').click()]);
    assert.equal(onlyExcel.suggestedFilename(),'Vokabelliste.xlsx');
    const shortWorkbook=XLSX.read(await readFile(await onlyExcel.path()));
    assert.equal(shortWorkbook.Sheets.Nomen.E2.v,'Rose');
    assert.equal(shortWorkbook.Sheets.Nomen.F1.v,'Textbelege');
    assert.equal(downloads.length,3);
    assert.equal(sessions,2);
    await page.getByLabel('Lektions-/Stapelname').fill('Erhalten');
    await page.route('https://*/lookup?*',()=>{});
    await page.getByRole('button',{name:'Vokabeln generieren',exact:true}).click();
    await page.locator('#cancel').waitFor();
    assert.equal(await page.locator('#export-menu').isVisible(),true);
    assert.equal(await page.locator('#xlsx').isDisabled(),true);
    assert.equal(await page.locator('#by2').isDisabled(),true);
    await page.locator('#cancel').click();
    await page.locator('#status').filter({hasText:'Abgebrochen.'}).waitFor();
    assert.equal(downloads.length,3);assert.equal(await page.locator('#xlsx').isEnabled(),true);
    assert.equal(await page.getByLabel('Lektions-/Stapelname').inputValue(),'Erhalten');assert.equal(await page.locator('#apkg').isEnabled(),true);
    const [retained]=await Promise.all([page.waitForEvent('download'),page.locator('#xlsx').click()]);
    assert.deepEqual(await readFile(await retained.path()),await readFile(await onlyExcel.path()));
    assert.equal(await page.locator('#status').getAttribute('data-state'),'cancelled');
    await page.route('https://worker.test/session',route=>route.fulfill({status:503,json:{error:'Sicherheitsdienst nicht erreichbar.'},headers:{'Access-Control-Allow-Origin':'*'}}));
    await page.locator('#generate').click();
    await page.locator('#status[data-state="error"]').waitFor();
    assert.match(await page.locator('#status').textContent(),/zuletzt erstellten Dateien bleiben/);
    assert.equal(await page.locator('#xlsx').isEnabled(),true);
    assert.equal(await page.locator('#lesson').inputValue(),'Erhalten');
    await page.unroute('https://worker.test/session');
    await page.route('https://worker.test/session',route=>route.fulfill({json:{ticket:'browser-ticket'},headers:{'Access-Control-Allow-Origin':'*'}}));
    await page.unroute('https://*/lookup?*');
    await page.route('https://*/lookup?*',route=>route.fulfill({json:{found:false},headers:{'Access-Control-Allow-Origin':'*'}}));
    await page.locator('#generate').click();
    await page.locator('#status').filter({hasText:'Keine Vokabeln gefunden.'}).waitFor();
    assert.equal(await page.locator('#status').getAttribute('data-state'),'error');
    assert.equal(await page.locator('#lesson').inputValue(),'Erhalten');
    assert.equal(await page.locator('#xlsx').isEnabled(),true);
    const [afterEmpty]=await Promise.all([page.waitForEvent('download'),page.locator('#xlsx').click()]);
    assert.deepEqual(await readFile(await afterEmpty.path()),await readFile(await onlyExcel.path()));
    await page.getByText('Erweiterte Einstellungen',{exact:true}).click();
    assert.equal(await page.locator('#parallel').isVisible(),false);
    assert.equal(await page.locator('#meanings').isVisible(),true);
    for(const width of [1200,768,390,320]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`no horizontal overflow at ${width}: `+JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth).map(el=>({tag:el.tagName,id:el.id,class:el.className,right:el.getBoundingClientRect().right})))));
      if(width<=390)assert.equal(await page.locator('.options-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
      const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
    }
    assert.deepEqual(errors,[]);

  } finally {await rm(savedDir,{recursive:true,force:true});await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));await rm(outDir,{recursive:true,force:true});}
});
