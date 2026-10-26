// A download may itself move a missing file from READY back into the rebuild queue.
export async function downloadCardPrintPack({id,download,getPack,onPack}) {
  try{return await download(id);}
  catch(error){
    try{onPack(await getPack(id));}catch{/* Preserve the original download failure. */}
    throw error;
  }
}
