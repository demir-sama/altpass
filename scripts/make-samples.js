// Generates three deliberately INACCESSIBLE sample PDFs for demos and tests.
// "Inaccessible" = untagged (no structure tree), no document title, no language,
// headings are just big bold text, lists are typed bullets, tables are text placed
// at x-positions, images have no alt text, columns are written out of reading order.
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = (n) => path.join(root, 'samples', 'assets', n);
const OUT = (n) => path.join(root, 'samples', n);

function newDoc(file, size, margin = 54) {
  const doc = new PDFDocument({ size, margins: { top: margin, bottom: margin, left: margin, right: margin }, autoFirstPage: false, info: { Producer: 'AltPass sample generator', Creator: 'AltPass sample generator' } });
  doc.pipe(fs.createWriteStream(file));
  return doc;
}
const t = (doc, str, x, y, o = {}) => {
  doc.font(o.bold ? (o.italic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold') : (o.italic ? 'Helvetica-Oblique' : 'Helvetica'))
    .fontSize(o.size ?? 11).fillColor(o.color ?? '#222222');
  const opts = { width: o.width, lineGap: o.gap ?? 3, underline: o.underline, align: o.align, lineBreak: o.width !== undefined };
  doc.text(str, x, y, opts);
  return o.width !== undefined ? doc.y : y + (o.size ?? 11) * 1.3;
};
const bullets = (doc, items, x, y, o = {}) => {
  for (const it of items) {
    t(doc, '•', x, y, { size: o.size, color: o.color });
    y = t(doc, it, x + 16, y, { width: o.width - 16, size: o.size, color: o.color }) + (o.space ?? 5);
  }
  return y;
};
const numbered = (doc, items, x, y, o = {}) => {
  items.forEach((it, i) => {
    t(doc, `${i + 1}.`, x, y, { size: o.size });
    y = t(doc, it, x + 20, y, { width: o.width - 20, size: o.size }) + (o.space ?? 5);
  });
  return y;
};
const edge = (doc, fn) => { const b = doc.page.margins.bottom; doc.page.margins.bottom = 0; fn(); doc.page.margins.bottom = b; };

// ---------------------------------------------------------------- 1. council agenda
function councilAgenda() {
  const doc = newDoc(OUT('council-agenda.pdf'), 'LETTER');
  const W = 612 - 108;
  const pages = 3;
  const chrome = (n) => edge(doc, () => {
    t(doc, 'City of Brightwater  ·  Office of the City Clerk', 54, 26, { size: 9, color: '#777777' });
    t(doc, `Page ${n} of ${pages}`, 54, 756, { size: 9, color: '#777777', width: W, align: 'right' });
  });
  // page 1
  doc.addPage(); chrome(1);
  doc.image(A('seal.png'), 54, 56, { width: 60 });
  t(doc, 'Regular Council Meeting', 130, 62, { size: 26, bold: true, color: '#1f3a5f' });
  t(doc, 'Agenda  —  Tuesday, 3 November 2026, 6:30 pm, Council Chamber', 130, 98, { size: 12, color: '#444444' });
  doc.image(A('divider.png'), 54, 132, { width: W, height: 3 });
  let y = 156;
  y = t(doc, 'Welcome to the November meeting of the Brightwater City Council. Residents may attend in person or watch the live stream. This agenda lists every item the Council will consider and the order in which it will be taken.', 54, y, { width: W }) + 18;
  y = t(doc, '1. Call to order and roll call', 54, y, { size: 16, bold: true, color: '#1f3a5f' }) + 6;
  y = t(doc, 'The Mayor calls the meeting to order, the Clerk records attendance, and the Council confirms that a quorum is present before any business is conducted.', 54, y, { width: W }) + 18;
  y = t(doc, '2. Public comment', 54, y, { size: 16, bold: true, color: '#1f3a5f' }) + 6;
  y = t(doc, 'Members of the public may address the Council on any item not otherwise on the agenda. Please note the following rules:', 54, y, { width: W }) + 8;
  y = bullets(doc, ['Speakers have three minutes each.', 'Sign up at the Clerk’s desk by 6:15 pm.', 'Written comments received by 4:00 pm are read into the record.', 'Please state your name and ward before speaking.'], 62, y, { width: W - 8 }) + 12;
  y = t(doc, '3. Minutes of the previous meeting', 54, y, { size: 16, bold: true, color: '#1f3a5f' }) + 6;
  t(doc, 'The Council will consider approval of the minutes of the regular meeting held on 6 October 2026, as circulated to members.', 54, y, { width: W });
  // page 2
  doc.addPage(); chrome(2);
  y = 60;
  y = t(doc, '4. Proposed 2027 budget', 54, y, { size: 16, bold: true, color: '#1f3a5f' }) + 6;
  y = t(doc, 'The Finance Director will present the proposed 2027 operating budget. Public safety remains the largest line, followed by roads and transit. The chart below shows the proposal by department.', 54, y, { width: W }) + 12;
  doc.image(A('budget-chart.png'), 90, y, { width: 430 });
  y += 430 * 520 / 900 + 6;
  y = t(doc, 'Figure 1. Proposed 2027 budget by department, in millions of dollars.', 90, y, { size: 9, italic: true, color: '#555555' }) + 18;
  y = t(doc, 'Key changes from 2026', 54, y, { size: 13, bold: true }) + 6;
  y = numbered(doc, ['Public safety rises by $3M for fire station staffing.', 'Roads and transit adds $4M for the Elm Street bus corridor.', 'Housing receives a one-time $6M affordable-homes grant.', 'Administration is reduced by $1M through shared services.'], 54, y, { width: W }) + 10;
  const linkY = y;
  t(doc, 'Download the full agenda packet (PDF, 4 MB): ', 54, linkY, { width: 300 });
  t(doc, 'click here', 290, linkY, { color: '#0645ad', underline: true, width: 80 });
  doc.link(290, linkY - 1, 56, 14, 'https://example.org/brightwater/agenda-packet');
  // page 3
  doc.addPage(); chrome(3);
  y = 60;
  y = t(doc, '5. Consent calendar', 54, y, { size: 16, bold: true, color: '#1f3a5f' }) + 6;
  y = t(doc, 'The following routine items will be approved together by a single motion unless a member asks for one to be removed for separate discussion.', 54, y, { width: W }) + 8;
  y = bullets(doc, ['Resolution 26-118: Street closure for the Winter Lights parade.', 'Resolution 26-119: Contract renewal for library e-book licences.', 'Resolution 26-120: Appointment of two members to the Parks Board.'], 62, y, { width: W - 8 }) + 12;
  y = t(doc, '6. New business', 54, y, { size: 16, bold: true, color: '#1f3a5f' }) + 6;
  y = t(doc, 'Ordinance 26-14 (first reading): amendments to the short-term rental licence regime, including a cap on whole-home rentals in Wards 2 and 5.', 54, y, { width: W }) + 18;
  y = t(doc, '7. Adjournment', 54, y, { size: 16, bold: true, color: '#1f3a5f' }) + 6;
  y = t(doc, 'The meeting is expected to adjourn by 9:00 pm. Accommodation requests, including sign-language interpretation and large-print copies, can be made to the Clerk at least 48 hours in advance.', 54, y, { width: W }) + 10;
  t(doc, 'Contact: clerk@brightwater.example  ·  555-0142', 54, y, { width: W });
  doc.end();
}

// ---------------------------------------------------------------- 2. product launch deck (landscape slides)
function deck() {
  const doc = newDoc(OUT('product-launch-deck.pdf'), [960, 540], 0);
  const W = 960, H = 540;
  const slide = (n, bg = '#ffffff', fg = '#555555') => {
    doc.addPage(); doc.rect(0, 0, W, H).fill(bg);
    if (n > 1) { t(doc, 'Lumen Labs  ·  Q4 product launch', 48, 506, { size: 11, color: fg, width: 400 }); t(doc, String(n), 860, 506, { size: 11, color: fg, width: 52, align: 'right' }); }
  };
  // 1 title
  slide(1, '#2e1065');
  t(doc, 'Lumen 2.0', 72, 170, { size: 64, bold: true, color: '#ffffff' });
  t(doc, 'Focus, finally. Product launch briefing for the sales team', 74, 262, { size: 20, color: '#ddd6fe', width: 640 });
  t(doc, 'Lumen Labs  ·  October 2026', 74, 440, { size: 14, color: '#c4b5fd', width: 400 });
  // 2 why now
  slide(2);
  t(doc, 'Why now', 72, 64, { size: 38, bold: true, color: '#2e1065' });
  bullets(doc, ['Remote work doubled the time people spend switching between apps.', 'Teams report 40% less deep work than in 2023.', 'Competitors are shipping AI features, not focus features.', 'Customers told us: “just help me finish one thing”.'], 72, 160, { width: 760, size: 22, color: '#222222', space: 14 });
  // 3 growth: right column text is written FIRST (wrong reading order for the left chart)
  slide(3);
  t(doc, 'Weekly users doubled in six months', 72, 64, { size: 38, bold: true, color: '#2e1065', width: 820 });
  t(doc, 'What drove the growth', 540, 170, { size: 24, bold: true, color: '#2e1065', width: 360 });
  bullets(doc, ['Focus timer launched in March', 'Team plans launched in April', 'Calendar sync launched in May'], 540, 214, { width: 360, size: 18, color: '#222222', space: 12 });
  doc.image(A('growth-chart.png'), 72, 150, { width: 420 });
  // 4 two columns, right first
  slide(4);
  t(doc, 'How Lumen works', 72, 64, { size: 38, bold: true, color: '#2e1065' });
  t(doc, 'Plan', 540, 170, { size: 24, bold: true, color: '#2e1065', width: 360 });
  t(doc, 'Pick three tasks each morning. Lumen blocks the time on your calendar and mutes everything else.', 540, 208, { size: 18, width: 340, color: '#222222' });
  t(doc, 'Capture', 72, 170, { size: 24, bold: true, color: '#2e1065', width: 360 });
  t(doc, 'Send ideas to your inbox from any app, then triage them in a single five-minute review at the end of the day.', 72, 208, { size: 18, width: 340, color: '#222222' });
  // 5 screenshot
  slide(5);
  t(doc, 'The new Today screen', 72, 64, { size: 38, bold: true, color: '#2e1065' });
  doc.image(A('app-screenshot.png'), 72, 140, { width: 440 });
  t(doc, 'What is new', 560, 160, { size: 24, bold: true, color: '#2e1065', width: 340 });
  bullets(doc, ['Focus rings show progress at a glance', 'Dark mode on every platform', 'One-tap handoff to teammates'], 560, 204, { width: 340, size: 18, color: '#222222', space: 12 });
  // 6 next steps
  slide(6);
  t(doc, 'Next steps', 72, 64, { size: 38, bold: true, color: '#2e1065' });
  numbered(doc, ['Watch the launch demo before Thursday', 'Book your customer calls', 'Share feedback in #lumen-launch'], 72, 160, { width: 760, size: 22, space: 14 });
  t(doc, 'Launch materials: ', 72, 380, { size: 18, width: 200 });
  t(doc, 'lumen.example/launch', 222, 380, { size: 18, color: '#6d28d9', underline: true, width: 260 });
  doc.link(222, 378, 205, 24, 'https://lumen.example/launch');
  doc.end();
}

// ---------------------------------------------------------------- 3. price list with table
function priceList() {
  const doc = newDoc(OUT('spring-price-list.pdf'), 'LETTER');
  const W = 612 - 108;
  const chrome = (n) => edge(doc, () => {
    t(doc, 'Greenhouse & Garden Co.  —  Spring price list 2027', 54, 26, { size: 9, color: '#777777' });
    t(doc, `Prices include VAT.  Page ${n}`, 54, 756, { size: 9, color: '#777777', width: W, align: 'right' });
  });
  const table = (headers, rows, xs, y, rowH = 24) => {
    doc.save().rect(54, y - 5, W, rowH).fill('#dcfce7').restore();
    headers.forEach((h, i) => t(doc, h, xs[i], y, { size: 11, bold: true, color: '#14532d' }));
    y += rowH;
    rows.forEach((r, ri) => {
      r.forEach((c, i) => t(doc, c, xs[i], y, { size: 11 }));
      doc.save().moveTo(54, y + rowH - 9).lineTo(54 + W, y + rowH - 9).lineWidth(0.5).strokeColor('#cccccc').stroke().restore();
      y += rowH;
    });
    return y;
  };
  doc.addPage(); chrome(1);
  t(doc, 'Greenhouse & Garden Co.', 54, 56, { size: 30, bold: true, color: '#14532d' });
  t(doc, 'Spring price list 2027', 54, 96, { size: 14, color: '#444444' });
  // two columns, right column written first
  t(doc, 'Opening hours', 330, 140, { size: 13, bold: true, color: '#14532d', width: 228 });
  bullets(doc, ['Mon–Fri: 8 am – 6 pm', 'Saturday: 9 am – 5 pm', 'Sunday: 10 am – 2 pm'], 330, 162, { width: 228, space: 4 });
  t(doc, 'About us', 54, 140, { size: 13, bold: true, color: '#14532d', width: 228 });
  t(doc, 'We are a family-run nursery growing bouquets, seedlings and heirloom seeds on the edge of town. Everything on this list is grown without peat and delivered the day it is cut.', 54, 162, { width: 240 });
  doc.image(A('bouquet.png'), 54, 262, { width: 260 });
  t(doc, 'Spring bouquets', 54, 462, { size: 16, bold: true, color: '#14532d' });
  const xs = [54, 270, 360, 450];
  table(['Bouquet', 'Stems', 'Price', 'In stock'], [
    ['Tulip trio', '15', '€18.00', 'Yes'],
    ['Cottage garden', '24', '€29.50', 'Yes'],
    ['Peony blush', '9', '€34.00', 'Limited'],
    ['Wild meadow', '30', '€26.00', 'No'],
  ], xs, 494);
  doc.addPage(); chrome(2);
  t(doc, 'Seeds and starters', 54, 60, { size: 16, bold: true, color: '#14532d' });
  doc.image(A('seed-packets.png'), 54, 92, { width: 300 });
  t(doc, 'All seed packets contain at least 40 seeds and a planting calendar. Starter plants ship in recyclable pots.', 380, 100, { width: 178 });
  table(['Item', 'Pack', 'Price'], [
    ['Basil, Genovese', '40 seeds', '€2.80'],
    ['Tomato, Black Krim', '30 seeds', '€3.40'],
    ['Sunflower, Teddy Bear', '25 seeds', '€2.60'],
    ['Starter tray (12 plants)', 'Tray', '€14.00'],
  ], [54, 320, 450], 290);
  t(doc, 'Delivery', 54, 440, { size: 16, bold: true, color: '#14532d' });
  t(doc, 'Local delivery is free over €40 and takes one working day. Orders for other EU countries ship in two to four days; shipping is calculated at checkout.', 54, 468, { width: W });
  t(doc, 'To place an order, ', 54, 530, { width: 200 });
  t(doc, 'click here', 148, 530, { color: '#0645ad', underline: true, width: 80 });
  doc.link(148, 529, 56, 14, 'https://example.org/greenhouse/order');
  doc.end();
}

councilAgenda(); deck(); priceList();
console.log('samples written to samples/');
