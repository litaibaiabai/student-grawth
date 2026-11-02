export function decodeStoryBytes(bytes) {
 if(bytes.byteLength>65536)throw Error('TXT最大64KB');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 if(!text.trim()||[...text].length>20000)throw Error('每篇需1至20000字');
 return text;
}
