const { addExtra } = require('puppeteer-extra');
const puppeteer = addExtra(require('puppeteer-core'));
const Stealth = require('puppeteer-extra-plugin-stealth');
puppeteer.use(Stealth());
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL=process.argv[2]; const NAME='Notas IA';
(async()=>{
 const b=await puppeteer.launch({executablePath:CHROME,headless:false,defaultViewport:null,
  userDataDir:'/tmp/meet-guest-profile',
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--no-first-run',
        '--no-default-browser-check','--lang=es','--disable-blink-features=AutomationControlled','--start-maximized']});
 const p=(await b.pages())[0];
 await p.goto(URL,{waitUntil:'networkidle2',timeout:60000});
 await new Promise(r=>setTimeout(r,7000));
 // escribir nombre
 const typed=await p.evaluate((nm)=>{const i=document.querySelector('input[type=text]');if(i){i.focus();i.value='';return true;}return false;},NAME);
 if(typed){await p.type('input[type=text]',NAME,{delay:60});}
 await new Promise(r=>setTimeout(r,1500));
 await p.screenshot({path:'/tmp/meet-live.png'});
 // click Ask to join / Solicitar unirse
 const clicked=await p.evaluate(()=>{const bs=[...document.querySelectorAll('button,[role=button]')];
   for(const x of bs){const t=(x.textContent||'').trim();
     if(/^(Ask to join|Solicitar unirse|Pedir para unirte|Pedir unirse|Unirse ahora|Join now)$/i.test(t)){x.click();return t;}}return null;});
 console.log('TYPED='+typed+' CLICKED='+clicked);
 // mantener vivo + screenshots periódicos
 for(let k=0;k<60;k++){await new Promise(r=>setTimeout(r,5000));
   try{await p.screenshot({path:'/tmp/meet-live.png'});}catch(e){}}
 await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
