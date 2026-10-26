// Renders the illustrations used inside the sample PDFs (SVG -> PNG) with headless Chrome.
// Only needed to regenerate samples/assets/*.png (they are committed).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'samples', 'assets');
fs.mkdirSync(out, { recursive: true });

const font = `font-family="Helvetica, Arial, sans-serif"`;

const assets = {
  'seal.png': { w: 160, h: 160, svg: `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="76" fill="#1f3a5f"/><circle cx="80" cy="80" r="64" fill="none" stroke="#e9c46a" stroke-width="3"/>
      <path d="M44 100 Q80 40 116 100" fill="none" stroke="#e9c46a" stroke-width="5" stroke-linecap="round"/>
      <circle cx="80" cy="64" r="9" fill="#e9c46a"/>
      <text x="80" y="128" text-anchor="middle" ${font} font-size="15" font-weight="700" fill="#fff" letter-spacing="2">BRIGHTWATER</text>
    </svg>` },
  'budget-chart.png': { w: 900, h: 520, svg: `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520">
      <rect width="900" height="520" fill="#fff"/>
      <text x="40" y="48" ${font} font-size="26" font-weight="700" fill="#1f2937">Proposed 2027 budget by department ($M)</text>
      ${[['Public safety',46,'#1f3a5f'],['Roads & transit',31,'#2a9d8f'],['Parks & libraries',18,'#e9c46a'],['Housing',24,'#f4a261'],['Administration',12,'#e76f51']].map(([n,v,c],i)=>`
        <rect x="${210}" y="${90+i*76}" width="${v*13}" height="48" rx="6" fill="${c}"/>
        <text x="196" y="${122+i*76}" text-anchor="end" ${font} font-size="20" fill="#374151">${n.replace('&','&amp;')}</text>
        <text x="${222+v*13}" y="${122+i*76}" ${font} font-size="22" font-weight="700" fill="#111827">${v}</text>`).join('')}
      <line x1="210" y1="80" x2="210" y2="470" stroke="#9ca3af" stroke-width="2"/>
    </svg>` },
  'growth-chart.png': { w: 900, h: 560, svg: `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560">
      <rect width="900" height="560" fill="#fff"/>
      <text x="40" y="52" ${font} font-size="26" font-weight="700" fill="#1f2937">Weekly active users (thousands)</text>
      <g stroke="#e5e7eb" stroke-width="2">${[0,1,2,3,4].map(i=>`<line x1="80" y1="${110+i*92}" x2="860" y2="${110+i*92}"/>`).join('')}</g>
      <polyline fill="none" stroke="#6d28d9" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"
        points="80,470 205,452 330,420 455,350 580,290 705,190 860,120"/>
      ${[[80,470],[205,452],[330,420],[455,350],[580,290],[705,190],[860,120]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="10" fill="#6d28d9"/>`).join('')}
      <text x="860" y="96" text-anchor="end" ${font} font-size="24" font-weight="700" fill="#6d28d9">128k</text>
      <text x="80" y="506" ${font} font-size="18" fill="#6b7280">Jan</text><text x="840" y="506" ${font} font-size="18" fill="#6b7280">Jun</text>
    </svg>` },
  'app-screenshot.png': { w: 900, h: 560, svg: `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560">
      <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#6d28d9"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs>
      <rect width="900" height="560" rx="20" fill="#0f172a"/>
      <rect x="0" y="0" width="900" height="56" rx="20" fill="#1e293b"/>
      <circle cx="34" cy="28" r="8" fill="#f87171"/><circle cx="62" cy="28" r="8" fill="#fbbf24"/><circle cx="90" cy="28" r="8" fill="#34d399"/>
      <rect x="40" y="96" width="250" height="420" rx="14" fill="#1e293b"/>
      ${[0,1,2,3,4].map(i=>`<rect x="60" y="${120+i*72}" width="210" height="50" rx="10" fill="${i==1?'url(#g)':'#334155'}"/>`).join('')}
      <rect x="320" y="96" width="540" height="150" rx="14" fill="url(#g)"/>
      <text x="350" y="150" ${font} font-size="30" font-weight="700" fill="#fff">Good morning, Sam</text>
      <text x="350" y="190" ${font} font-size="20" fill="#e0e7ff">3 focus sessions planned today</text>
      <rect x="320" y="270" width="260" height="246" rx="14" fill="#1e293b"/><rect x="600" y="270" width="260" height="246" rx="14" fill="#1e293b"/>
      <circle cx="450" cy="400" r="62" fill="none" stroke="#6d28d9" stroke-width="18"/><circle cx="450" cy="400" r="62" fill="none" stroke="#a78bfa" stroke-width="18" stroke-dasharray="260 400" transform="rotate(-90 450 400)"/>
      ${[0,1,2,3].map(i=>`<rect x="626" y="${300+i*52}" width="${200-i*34}" height="26" rx="8" fill="#475569"/>`).join('')}
    </svg>` },
  'bouquet.png': { w: 800, h: 560, svg: `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde7ef"/><stop offset="1" stop-color="#fff7ed"/></linearGradient></defs>
      <rect width="800" height="560" fill="url(#bg)"/>
      <g stroke="#3f7d4e" stroke-width="10" stroke-linecap="round" fill="none">
        <path d="M400 520 L400 260"/><path d="M400 520 L270 300"/><path d="M400 520 L540 290"/><path d="M400 520 L190 380"/><path d="M400 520 L620 390"/></g>
      ${[[400,230,'#e11d48'],[262,280,'#f472b6'],[545,268,'#fb923c'],[182,370,'#c084fc'],[626,376,'#facc15']].map(([x,y,c])=>`
        <g transform="translate(${x} ${y})">${[0,1,2,3,4,5,6,7].map(k=>`<ellipse cx="0" cy="-36" rx="20" ry="38" fill="${c}" opacity=".92" transform="rotate(${k*45})"/>`).join('')}<circle r="20" fill="#7c2d12"/></g>`).join('')}
      <path d="M300 520 L500 520 L470 420 L330 420 Z" fill="#b45309"/><rect x="290" y="505" width="220" height="30" rx="8" fill="#92400e"/>
    </svg>` },
  'seed-packets.png': { w: 800, h: 480, svg: `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480">
      <rect width="800" height="480" fill="#ecfdf5"/>
      ${[['#16a34a','Basil',70],['#dc2626','Tomato',300],['#ca8a04','Sunflower',530]].map(([c,n,x])=>`
        <g transform="translate(${x} 60)"><rect width="200" height="340" rx="14" fill="${c}"/><rect x="16" y="16" width="168" height="308" rx="8" fill="#fff" opacity=".92"/>
        <circle cx="100" cy="120" r="52" fill="${c}" opacity=".85"/><text x="100" y="250" text-anchor="middle" ${font} font-size="28" font-weight="700" fill="#1f2937">${n}</text>
        <text x="100" y="284" text-anchor="middle" ${font} font-size="16" fill="#6b7280">Heirloom seeds</text></g>`).join('')}
    </svg>` },
  'divider.png': { w: 900, h: 8, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="8"><rect width="900" height="8" fill="#e9c46a"/></svg>` },
};

const chrome = process.env.CHROME_PATH || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] });
for (const [name, a] of Object.entries(assets)) {
  const page = await browser.newPage({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0">${a.svg}</body>`);
  await page.screenshot({ path: path.join(out, name), clip: { x: 0, y: 0, width: a.w, height: a.h }, omitBackground: false });
  await page.close();
  console.log('asset', name);
}
await browser.close();
