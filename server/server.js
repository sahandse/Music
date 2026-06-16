require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { nanoid } = require('nanoid');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;
const CATALOG_FILE = path.join(__dirname, 'data', 'catalog.json');
const SOURCE_DOMAINS = String(process.env.SOURCE_DOMAINS || 'biamusic.ir,dl.biamusic.ir')
  .split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 900);
const MAX_CRAWL_ITEMS = Number(process.env.MAX_CRAWL_ITEMS || 30);
const ENABLE_MEDIA_PROXY = String(process.env.ENABLE_MEDIA_PROXY || 'false') === 'true';

app.use(cors());
app.use(express.json({limit:'2mb'}));
app.use(express.static(path.join(__dirname,'public')));

const sleep = ms => new Promise(r => setTimeout(r, ms));
function clean(s=''){ return String(s).replace(/\s+/g,' ').replace(/‌/g,'‌').trim(); }
function readCatalog(){ if(!fs.existsSync(CATALOG_FILE)) return []; return JSON.parse(fs.readFileSync(CATALOG_FILE,'utf8')); }
function writeCatalog(items){ fs.writeFileSync(CATALOG_FILE, JSON.stringify(items,null,2), 'utf8'); }
function abs(url, base){ try { return new URL(url, base).href; } catch { return null; } }
function hostOf(url){ try { return new URL(url).hostname.replace(/^www\./,'').toLowerCase(); } catch { return ''; } }
function allowed(url){ const h=hostOf(url); return SOURCE_DOMAINS.some(d => h === d || h.endsWith('.'+d)); }
function assertAllowed(url){ if(!allowed(url)) { const e = new Error('URL/domain is not in SOURCE_DOMAINS allowlist'); e.status=403; throw e; } }
function qualityFromText(text='', url=''){
  const t = `${text} ${url}`;
  const m = t.match(/(1080p|720p|480p|320|128|256|64)/i);
  return m ? m[1].toLowerCase() : 'default';
}
function typeFromUrl(url='', text=''){
  const s = `${url} ${text}`.toLowerCase();
  if(/\.(mp4|webm|mkv|mov)(\?|#|$)/.test(s) || /\/video\//.test(s) || /ویدیو|video/.test(text)) return 'video';
  return 'audio';
}
function mediaExt(url='') { return /\.(mp3|m4a|aac|ogg|wav|mp4|webm|mkv|mov)(\?|#|$)/i.test(url); }
function uniqueBy(arr, keyFn){ const seen=new Set(); return arr.filter(x=>{ const k=keyFn(x); if(seen.has(k)) return false; seen.add(k); return true; }); }

async function fetchHtml(url){
  assertAllowed(url);
  const res = await axios.get(url, {
    timeout: 20000,
    headers: {
      'User-Agent': 'AuthorizedMusicCrawler/1.0 (+contract-based; contact: app-owner)',
      'Accept': 'text/html,application/xhtml+xml'
    }
  });
  return res.data;
}

function parseListing(html, pageUrl){
  const $ = cheerio.load(html);
  $('script,style,noscript').remove();
  const links=[];
  $('a[href]').each((_,el)=>{
    const href = abs($(el).attr('href'), pageUrl);
    if(!href || !allowed(href)) return;
    if(/\/music\//.test(href) || /\/video\//.test(href) || /\/album\//.test(href)){
      const title = clean($(el).text());
      if(title && title.length > 4) links.push({title, url:href, type:typeFromUrl(href,title)});
    }
  });
  return uniqueBy(links, x=>x.url).slice(0, 60);
}

function parseDetail(html, pageUrl){
  const $ = cheerio.load(html);
  $('script,style,noscript').remove();
  const bodyText = $('body').text();
  const title = clean($('h1').first().text()) || clean($('title').text());
  const h2s = $('h2').map((_,h)=>clean($(h).text())).get();
  const englishTitle = h2s.find(x=>/[A-Za-z]/.test(x)) || '';
  const mainLine = clean($('h1').first().nextAll().first().text());
  let artist = clean($('a[href*="/artist/"]').first().text());
  if(!artist && / - /.test(mainLine)) artist = clean(mainLine.split(' - ')[0]);
  const cover = abs($('meta[property="og:image"]').attr('content') || $('img').first().attr('data-src') || $('img').first().attr('src'), pageUrl);
  const date = (bodyText.match(/\d{1,2}\s+[آ-ی]+\s+\d{4}|[۰-۹]{1,2}\s+[آ-ی]+\s+[۰-۹]{4}/)||[])[0] || '';
  const ratingMatch = bodyText.match(/امتیاز\s*([\d.۰-۹]+)\s*\/\s*5.*?تعداد رای:\s*([\d۰-۹,]+)/s);
  const mediaLinks=[];
  $('a[href], audio[src], video[src], source[src]').each((_,el)=>{
    const raw = $(el).attr('href') || $(el).attr('src');
    const u = abs(raw, pageUrl);
    if(!u || !allowed(u)) return;
    const text = clean($(el).text()) || clean($(el).parent().text());
    const likely = mediaExt(u) || /کیفیت|download|دانلود|320|128|1080|720|480/i.test(text);
    if(!likely) return;
    mediaLinks.push({
      quality: qualityFromText(text, u),
      url: u,
      type: typeFromUrl(u, text)
    });
  });
  const type = mediaLinks.some(m=>m.type==='video') || /\/video\//.test(pageUrl) ? 'video' : 'audio';
  return {
    id: nanoid(), type, title, englishTitle, artist,
    cover: cover || '', pageUrl, date,
    rating: ratingMatch ? {score: ratingMatch[1], votes: ratingMatch[2]} : null,
    mediaLinks: uniqueBy(mediaLinks, x=>x.url),
    importedAt: new Date().toISOString()
  };
}

app.get('/api/health', (req,res)=>res.json({ok:true, domains:SOURCE_DOMAINS, proxy:ENABLE_MEDIA_PROXY}));
app.get('/api/source/list', async (req,res)=>{
  try{
    const url = req.query.url || 'https://biamusic.ir/';
    const html = await fetchHtml(url);
    res.json({ok:true, items: parseListing(html, url)});
  }catch(e){ res.status(e.status||500).json({ok:false, message:e.message}); }
});
app.get('/api/source/detail', async (req,res)=>{
  try{
    const url = String(req.query.url||'');
    if(!url) return res.status(400).json({ok:false,message:'url is required'});
    const html = await fetchHtml(url);
    res.json({ok:true, item: parseDetail(html, url)});
  }catch(e){ res.status(e.status||500).json({ok:false, message:e.message}); }
});
app.post('/api/catalog/import', async (req,res)=>{
  try{
    const url = String(req.body.url||'');
    if(!url) return res.status(400).json({ok:false,message:'url is required'});
    const html = await fetchHtml(url);
    const item = parseDetail(html, url);
    const catalog = readCatalog().filter(x=>x.pageUrl !== item.pageUrl);
    catalog.unshift(item); writeCatalog(catalog);
    res.status(201).json({ok:true, item});
  }catch(e){ res.status(e.status||500).json({ok:false, message:e.message}); }
});
app.post('/api/catalog/crawl', async (req,res)=>{
  try{
    const startUrl = String(req.body.startUrl || 'https://biamusic.ir/');
    const limit = Math.min(Number(req.body.limit||12), MAX_CRAWL_ITEMS);
    const html = await fetchHtml(startUrl);
    const listing = parseListing(html, startUrl).slice(0, limit);
    const imported=[];
    for(const l of listing){
      await sleep(REQUEST_DELAY_MS);
      try{
        const detailHtml = await fetchHtml(l.url);
        imported.push(parseDetail(detailHtml, l.url));
      }catch(err){ imported.push({error:err.message, pageUrl:l.url, title:l.title}); }
    }
    const okItems = imported.filter(x=>!x.error);
    const old = readCatalog().filter(x=>!okItems.some(n=>n.pageUrl===x.pageUrl));
    writeCatalog([...okItems, ...old]);
    res.json({ok:true, count:okItems.length, imported});
  }catch(e){ res.status(e.status||500).json({ok:false, message:e.message}); }
});
app.get('/api/catalog', (req,res)=>{
  const q=String(req.query.q||'').toLowerCase().trim();
  const type=String(req.query.type||'');
  let items=readCatalog();
  if(type==='audio'||type==='video') items=items.filter(x=>x.type===type);
  if(q) items=items.filter(x=>[x.title,x.englishTitle,x.artist].join(' ').toLowerCase().includes(q));
  res.json({ok:true, count:items.length, items});
});
app.delete('/api/catalog/:id', (req,res)=>{
  const old=readCatalog(); const next=old.filter(x=>x.id!==req.params.id); writeCatalog(next);
  res.json({ok:true, deleted:old.length-next.length});
});
app.get('/api/proxy', async (req,res)=>{
  try{
    if(!ENABLE_MEDIA_PROXY) return res.status(403).send('Media proxy is disabled. Set ENABLE_MEDIA_PROXY=true only after authorization.');
    const url = String(req.query.url||'');
    assertAllowed(url);
    const upstream = await axios.get(url, {responseType:'stream', timeout:30000, headers:{'User-Agent':'AuthorizedMusicCrawler/1.0'}});
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'application/octet-stream');
    if(upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
    pipeline(upstream.data, res, err=>{ if(err) console.error(err.message); });
  }catch(e){ res.status(e.status||500).send(e.message); }
});

app.listen(PORT, ()=>console.log(`Authorized app: http://localhost:${PORT}`));
