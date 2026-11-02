const PDF = require('pdfkit');
const { ZipFile } = require('yazl');
const path = require('node:path');
const fs = require('node:fs/promises');

const storyText = '校园里的小树\n放学后，我和同学一起给小树浇水。\n我们约好，明天再来看它。';
const escapeXml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
async function docx(text = storyText) {
  const zip = new ZipFile(), chunks = [];
  const done = new Promise((resolve, reject) => {
    zip.outputStream.on('data', chunk => chunks.push(chunk));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
  zip.addBuffer(Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'), '[Content_Types].xml');
  zip.addBuffer(Buffer.from('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'), '_rels/.rels');
  zip.addBuffer(Buffer.from(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text.split('\n').map(line => `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`), 'word/document.xml');
  zip.end();
  return done;
}
async function pdf(text = storyText) {
  return new Promise((resolve, reject) => {
    const doc = new PDF(), chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font(path.join(__dirname, '../../assets/fonts/NotoSansCJKsc-Regular.otf')).text(text);
    doc.end();
  });
}
const doc = () => fs.readFile(path.join(__dirname, '../fixtures/written-story.doc'));
module.exports = { storyText, docx, pdf, doc };
