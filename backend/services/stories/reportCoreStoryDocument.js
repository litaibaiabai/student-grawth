const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { fail } = require('../core/reportCorePolicy');

// Parsing runs outside the request thread, with bounded memory and execution time.
async function extractStoryFile(file) {
  if (!Buffer.isBuffer(file?.buffer) || !file.buffer.length) fail(422, '请选择有内容的故事文档');
  if (file.buffer.length > 10 * 1024 * 1024) fail(413, '故事文档不能超过10MB');
  const extension = file.originalname?.split('.').pop().toLowerCase();
  const signatures = {
    pdf: Buffer.from('%PDF-'),
    doc: Buffer.from('d0cf11e0a1b11ae1', 'hex'),
    docx: Buffer.from('504b0304', 'hex'),
  };
  const signature = signatures[extension];
  if (!signature || !file.buffer.subarray(0, signature.length).equals(signature))
    fail(415, '请选择真实的PDF或Word（.doc、.docx）故事文档');
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: { bytes: file.buffer, extension },
      resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Object.assign(new Error('文档解析超时，请缩小文件或粘贴正文后提交'), { code: 422 }));
    }, 30000);
    worker.once('message', result => {
      clearTimeout(timer);
      if (result.error) reject(Object.assign(new Error(result.error), { code: 422 }));
      else resolve(result.text);
    });
    worker.once('error', () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('文档无法解析，请检查文件或粘贴正文后提交'), { code: 422 }));
    });
    worker.once('exit', code => {
      clearTimeout(timer);
      if (code !== 0) reject(Object.assign(new Error('文档无法解析，请检查文件或粘贴正文后提交'), { code: 422 }));
    });
  });
}

if (!isMainThread) {
  (async () => {
    try {
      const buffer = Buffer.from(workerData.bytes);
      let text;
      if (workerData.extension === 'pdf') {
        const { PDFParse } = require('pdf-parse');
        const parser = new PDFParse({ data: new Uint8Array(buffer), isEvalSupported: false, verbosity: 0 });
        try {
          const result = await parser.getText();
          text = result.pages.map(page => page.text).join('\n');
        } finally { await parser.destroy(); }
      } else {
        const WordExtractor = require('word-extractor');
        text = (await new WordExtractor().extract(buffer)).getBody();
      }
      if ([...text].length > 20000) parentPort.postMessage({ error: '故事正文最多20000字，请精简后提交' });
      else parentPort.postMessage({ text });
    } catch {
      parentPort.postMessage({ error: '文档损坏、加密或无法读取，请检查文件或粘贴正文后提交' });
    }
  })();
}
module.exports = { extractStoryFile };
