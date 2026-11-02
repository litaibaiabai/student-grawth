// Credential creation/privacy now follows the unified registry import.
// Legacy reset and operation-record APIs are deliberately retired.
const {spawn}=require('node:child_process');
const path=require('node:path');
async function verifyDevelopmentPasswords(){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--test','__tests__/admin_simplification_registry.test.js'],{cwd:path.resolve(__dirname,'..'),stdio:'inherit'});child.on('error',reject);child.on('close',code=>code?reject(Error('Registry credential verification failed')):resolve());});}
if(require.main===module)verifyDevelopmentPasswords().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={verifyDevelopmentPasswords};
