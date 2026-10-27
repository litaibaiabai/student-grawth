const fs=require('fs'),path=require('path'),os=require('os'),net=require('net');
const {execFileSync}=require('child_process');const {createRequire}=require('module');
const root=path.resolve(__dirname,'../..'),bundled=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies');
const backendRequire=createRequire(path.join(root,'backend/package.json'));
const VALID_SCENARIOS = ['R20A', 'R01', 'R02', 'R04', 'R03', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15', 'R16', 'R17', 'R18A', 'R18B', 'R19', 'R20B', 'R20C'];
function parseOptions(args){const o={speed:1,headless:false,check:false,exit:false,scenario:null};for(let i=0;i<args.length;i++){if(args[i]==='--speed')o.speed=Number(args[++i]);else if(args[i]==='--check')o.check=true;else if(args[i]==='--exit')o.exit=true;else if(args[i]==='--headless')o.headless=true;else if(args[i]==='--scenario'){const sc=args[++i];if(!sc||!VALID_SCENARIOS.includes(sc))throw Error('未知的改造场景 '+(sc||''));o.scenario=sc;}else throw Error('未知参数 '+args[i]);}if(!Number.isFinite(o.speed)||o.speed<=0||o.speed>20)throw Error('--speed 必须为0到20之间的正数');return o;}
function assertIsolatedDatabase(dbName){if(!dbName||typeof dbName!=='string')throw Error('数据库名称无效');if(dbName==='student_growth'||dbName==='production'||dbName==='liuyu_production'||(!dbName.startsWith('liuyu_demo_')&&!dbName.startsWith('test_'))){throw Error('禁止在业务库或生产库运行演示或测试，必须使用隔离前缀测试库: '+dbName);}return true;}
function schoolTerm(date){const [y,m]=date.split('-').map(Number),ay=m>=9?y:y-1,semester=m>=9||m===1?1:2;return {academicYear:`${ay}-${ay+1}`,semester,startDate:semester===1?`${ay}-09-01`:`${ay+1}-02-01`,endDate:semester===1?`${ay+1}-01-31`:`${ay+1}-08-31`};}
async function free(port,host){return new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(port,host,()=>s.close(()=>resolve(true)));});}
async function findPort(start){for(let p=start;p<Math.min(start+200,65536);p++)if(await free(p,'127.0.0.1')&&await free(p,'::1'))return p;throw Error('未找到空闲演示端口');}
function findExecutable(name,candidates=[]){for(const x of candidates)if(fs.existsSync(x))return x;try{return execFileSync('/usr/bin/which',[name],{encoding:'utf8'}).trim()}catch{throw Error('缺少工具 '+name)}}
function playwright(){for(const from of [__filename,path.join(root,'frontend/package.json')])try{return createRequire(from)('playwright')}catch{}const p=process.env.PLAYWRIGHT_MODULE_PATH||path.join(bundled,'node/node_modules/playwright');try{return require(p)}catch{throw Error('缺少Playwright。请在scripts/full-system-demo目录安装playwright，或设置PLAYWRIGHT_MODULE_PATH。')}}
async function preflight(){
 if(Number(process.versions.node.split('.')[0])<20)throw Error('需要Node20以上；请使用run.cjs自动选择运行时');
 const python=findExecutable('python3',[process.env.DEMO_PYTHON||'',path.join(bundled,'python/bin/python3')].filter(Boolean));
 execFileSync(python,['-c','import xlsxwriter,openpyxl,PIL,reportlab'],{stdio:'pipe'});
 const renderer=findExecutable('pdftoppm',['/opt/homebrew/bin/pdftoppm']),extractor=findExecutable('pdftotext',['/opt/homebrew/bin/pdftotext']);
 const pw=playwright();let browserOptions;
 if(process.platform==='darwin'&&fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'))browserOptions={channel:'chrome'};
 else if(fs.existsSync(pw.chromium.executablePath()))browserOptions={};else throw Error('请安装Chrome，或运行playwright install chromium');
 backendRequire('dotenv').config({path:path.join(root,'backend/.env')});
 const mysql=backendRequire('mysql2/promise');const conn=await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD});try{await conn.query('SELECT 1')}finally{await conn.end()}
 for(const p of ['frontend/node_modules/vite','backend/assets/fonts/NotoSansCJKsc-Regular.otf','sql/00_full_schema.sql'])if(!fs.existsSync(path.join(root,p)))throw Error('缺少 '+p);
 backendRequire('jsqr');backendRequire('pngjs');
 const backendPort=await findPort(3088),frontendPort=await findPort(5188);
 return {python,renderer,extractor,browserOptions,backendPort,frontendPort};
}
async function inspect(manifest,sql,params=[]){
 if(!/^\s*SELECT\b/i.test(sql)||sql.includes(';'))throw Error('只允许单条SELECT核对');
 const mysql=backendRequire('mysql2/promise'),conn=await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD,database:manifest.dbName});
 try{return (await conn.query(sql,params))[0]}finally{await conn.end()}
}
module.exports={root,bundled,backendRequire,parseOptions,schoolTerm,findPort,preflight,playwright,inspect,assertIsolatedDatabase};
