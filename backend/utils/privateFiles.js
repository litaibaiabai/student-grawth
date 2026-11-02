const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { fail } = require("../services/reportCorePolicy");
function directory() {
  return path.resolve(
    process.env.REPORT_FILES_DIR ||
      path.join(__dirname, "../private/report-core"),
  );
}
async function pdfPages(buffer) {
  return new Promise((resolve,reject)=>{
    const child=require('node:child_process').spawn('pdfinfo',['-'],{env:{PATH:process.env.PATH,LANG:'C',LC_ALL:'C'}});
    let output='';const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
    child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.length>65536)child.kill('SIGKILL');});
    child.stderr.resume();child.stdin.on('error',()=>{});
    child.on('error',()=>{clearTimeout(timer);try{fail(503,'PDF校验工具不可用');}catch(error){reject(error);}});
    child.on('close',code=>{clearTimeout(timer);const pages=Number(output.match(/^Pages:\s*(\d+)/m)?.[1]);try{if(code!==0||!Number.isInteger(pages)||pages<1)fail(415,'PDF损坏、加密或无法解析');resolve(pages);}catch(error){reject(error);}});
    child.stdin.end(buffer);
  });
}
async function savePrivateFile(file,{maxBytes=5*1024*1024,allowPdf=false,maxPdfPages=10}={}) {
  if (!file?.buffer || file.buffer.length > maxBytes)
    fail(413, `奖状限${maxBytes/1024/1024}MiB`);
  const b = file.buffer;
  const png = b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
    jpg = b[0] === 255 && b[1] === 216 && b[2] === 255,
    pdf=allowPdf && b.subarray(0,5).toString()==='%PDF-' && file.mimetype==='application/pdf';
  if (
    !(
      (png && file.mimetype === "image/png") ||
      (jpg && file.mimetype === "image/jpeg") || pdf
    )
  )
    fail(415, "仅支持真实PNG/JPEG图片");
  if(pdf && await pdfPages(b)>maxPdfPages)fail(413,`奖状PDF最多${maxPdfPages}页`);
  const ref = crypto.randomUUID() + (pdf?'.pdf':png ? ".png" : ".jpg");
  await fs.mkdir(directory(), { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(directory(), ref), b, {
    flag: "wx",
    mode: 0o600,
  });
  return {
    fileRef: ref,
    fileHash: crypto.createHash("sha256").update(b).digest("hex"),
    mime: file.mimetype,
  };
}
function filePath(ref) {
  if (typeof ref !== "string" || !/^[-a-z0-9]+\.(png|jpg|pdf|txt|doc|docx|webm|mp4|wav|m4a|mp3|ogg|aac)$/.test(ref))
    fail(400, "非法文件引用");
  return path.join(directory(), ref);
}
const readPrivateFile = (ref) => fs.readFile(filePath(ref));
const removePrivateFile = (ref) => fs.unlink(filePath(ref)).catch(() => {});
module.exports = {
  savePrivateFile,
  readPrivateFile,
  removePrivateFile,
  filePath,
  pdfPages,
};
