const {success}=require('../utils/response');
const service=require('../services/cardPrintService');
exports.create=async(req,res,next)=>{try{
  const pack=await service.createPrintPack({schoolId:req.user.schoolId,monthKey:req.body.monthKey,actorId:req.user.id});
  service.queuePrintPack(pack.id);success(res,pack,'打印资料已加入准备队列',202);
}catch(e){next(e);}};
exports.get=async(req,res,next)=>{try{success(res,await service.getPrintPack({schoolId:req.user.schoolId,id:req.params.id}));}catch(e){next(e);}};
exports.download=async(req,res,next)=>{try{
  const file=await service.downloadFile({schoolId:req.user.schoolId,id:req.params.id});
  res.set('Cache-Control','no-store');res.download(file.path,file.name,{dotfiles:"allow"},error=>{if(error&&!res.headersSent)next(error);});
}catch(e){next(e);}};
