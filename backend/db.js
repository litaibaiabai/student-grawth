const path=require('node:path');require('dotenv').config({path:path.join(__dirname,'.env')});
const mysql=require('mysql2/promise');
function dbConfig(overrides={}) {return {host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD,database:process.env.REPORT_DB_NAME||process.env.DB_NAME,connectionLimit:10,charset:'utf8mb4',timezone:'Z',supportBigNumbers:true,bigNumberStrings:true,...overrides};}
function createDbPool(config={}){return mysql.createPool(dbConfig(config));}
// Legacy exports remain lazy for archived consumers; no initialization DDL or connection.
let legacyPool;const getPool=()=>legacyPool||(legacyPool=createDbPool());
module.exports={createDbPool,dbConfig,get pool(){return getPool()},execute:async(s,p=[])=> (await getPool().execute(s,p))[0],query:(s,p=[])=>getPool().query(s,p)};
