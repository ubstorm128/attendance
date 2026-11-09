const cheerio = require('cheerio');
const fs = require('fs');

const html = fs.readFileSync('public/pages/teacher/dashboard.html', 'utf8');
const $ = cheerio.load(html);

console.log('Title:', $('title').text());
console.log('qrBox exists:', $('#qrBox').length);
console.log('projectorQrBox exists:', $('#projectorQrBox').length);
console.log('qrShell exists:', $('#qrShell').length);
console.log('qrLive exists:', $('#qrLive').length);
console.log('qrLive hidden attr:', $('#qrLive').attr('hidden'));
console.log('qrPlaceholder exists:', $('#qrPlaceholder').length);
console.log('qrStatusPill exists:', $('#qrStatusPill').length);
console.log('expandQrBtn exists:', $('#expandQrBtn').length);
console.log('scripts:', $('script').map((i, el) => $(el).attr('src') || 'inline').get());
