const {test}=require('node:test');
const assert=require('node:assert/strict');
const PDF=require('pdfkit');
async function pdf(pages){return new Promise((resolve,reject)=>{const doc=new PDF(),chunks=[];doc.on('data',c=>chunks.push(c));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));for(let i=1;i<pages;i++)doc.addPage();doc.end();});}
test('V2 accepts bounded real PDF certificates, rejects eleven pages, and private references remain confined',async()=>{
  const files=require('../utils/privateFiles');
  const saved=await files.savePrivateFile({buffer:await pdf(2),mimetype:'application/pdf'},{maxBytes:10*1024*1024,allowPdf:true,maxPdfPages:10});
  try {assert.equal(saved.mime,'application/pdf');assert.ok((await files.readPrivateFile(saved.fileRef)).length>0);}finally{await files.removePrivateFile(saved.fileRef);}
  await assert.rejects(files.savePrivateFile({buffer:await pdf(11),mimetype:'application/pdf'},{maxBytes:10*1024*1024,allowPdf:true,maxPdfPages:10}),{statusCode:413});
  assert.throws(()=>files.filePath('../secret.pdf'),{statusCode:400});
});
