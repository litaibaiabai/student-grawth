import React,{useState,useEffect,useRef} from 'react';
import {Card,Input,Button,message,Alert,Tag,Space,Typography,Descriptions} from 'antd';
import {QrcodeOutlined} from '@ant-design/icons';
import {useNavigate} from 'react-router-dom';
import {post} from '@/util/request';
import auth from '@/util/token';
import {extractCardToken,pendingClaimToken,saveClaimToken,clearClaimIntent} from '@/util/claimIntent';
import * as urls from '@/constant/urls';
import {createCardClaimSession} from '@/util/cardClaimSession';
const {Title,Text}=Typography;
export default function StudentClaim(){
 const [input,setInput]=useState(pendingClaimToken),[preview,setPreview]=useState(null),[loading,setLoading]=useState(false),[result,setResult]=useState(null),[failure,setFailure]=useState('');
 const requestKey=useRef(null),sessionRef=useRef(null);const navigate=useNavigate();const student=auth.loadUser()?.role==='student';
 function invalid(e){setFailure(e.message||'读取失败');if([400,403,404,409,410,422].includes(e.response?.status)){sessionRef.current.invalidate();setPreview(null);clearClaimIntent();setInput('');requestKey.current=null;}}
 if(!sessionRef.current)sessionRef.current=createCardClaimSession({fetchPreview:async token=>(await post(urls.API_CARD_PREVIEW,{token})).data,onPreview:value=>setPreview(value.data),onError:invalid,onLoading:setLoading});
 const session=sessionRef.current;
 const instant=Boolean(preview?.categoryId);
 const approved=result?.status==='APPROVED';
 const credited=Number(result?.pointsCredited||0);
 async function read(value=input){
  const credential=extractCardToken(value);if(!credential)return message.warning('请扫描卡片二维码或粘贴扫码链接');
  saveClaimToken(credential);setInput(credential);setLoading(true);setPreview(null);setResult(null);setFailure('');requestKey.current=null;
  await session.read(credential);
 }
 useEffect(()=>{const update=()=>{const credential=pendingClaimToken();if(student&&credential)read(credential);};update();window.addEventListener('card-claim-intent',update);return()=>{window.removeEventListener('card-claim-intent',update);session.invalidate();};},[]);
 async function submit(){
  const confirmed=session.current();if(!confirmed)return;setLoading(true);setFailure('');
  if(!requestKey.current)requestKey.current=`CLAIM_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
  try{
   const r=await post(urls.API_CARD_CLAIM,{token:confirmed.token,requestKey:requestKey.current});
   if(!session.isCurrent(confirmed))return;
   session.invalidate();setResult(r.data);clearClaimIntent();setInput('');setPreview(null);requestKey.current=null;
  }catch(e){if(session.isCurrent(confirmed))invalid(e);}finally{if(session.isCurrent(confirmed))setLoading(false);}
 }
 function cancel(){session.invalidate();clearClaimIntent();setInput('');setPreview(null);setResult(null);setFailure('');requestKey.current=null;}
 if(!student)return <Alert type="warning" showIcon message="请使用学生账号领取评价卡" description="当前账号为教师或管理员，已保留本次扫码卡片。" action={<Button onClick={()=>{auth.clear();window.dispatchEvent(new CustomEvent('auth-change',{detail:{isAuthenticated:false}}));navigate('/login',{replace:true});}}>切换学生账号</Button>}/>;
 return <div style={{maxWidth:700,margin:'0 auto'}}>
  <Title level={3}>扫卡领取</Title><Text type="secondary">核对奖励分类、发卡教师和有效期，预分类卡确认后即刻入账。</Text>
  <Card style={{marginTop:20}} title={<Space><QrcodeOutlined/>评价卡</Space>}>
   <Space.Compact style={{width:'100%',marginBottom:20}}><Input.Password value={input} placeholder="扫描二维码后自动读取，也可粘贴扫码链接" onChange={e=>{session.invalidate();clearClaimIntent();setInput(e.target.value);setPreview(null);setResult(null);setFailure('');requestKey.current=null;}}/><Button type="primary" loading={loading} onClick={()=>read()}>读取卡片</Button></Space.Compact>
   {failure&&<Alert type="warning" showIcon message={failure} style={{marginBottom:20}}/>}
   {preview&&<><div style={{padding:24,background:'#f0f7f2',borderRadius:12,marginBottom:20}}><Tag color="green">{preview.dimensionName}</Tag><Title level={2} style={{margin:'16px 0'}}>{instant ? `确认领取后 +${preview.points ?? 1}分` : '旧卡：审核通过后 +1分'}</Title><Text>{instant ? preview.categoryName || '已预设奖励分类' : '此为未分类旧卡，需由教师选择分类并审核'}</Text></div>
    <Descriptions column={1} items={[{key:'teacher',label:'发卡教师',children:preview.teacherName},{key:'month',label:'所属月份',children:preview.monthKey},{key:'valid',label:'申领截止',children:preview.validUntil},{key:'review',label:'审核截止',children:preview.reviewDeadline},{key:'card',label:'卡片序号',children:preview.serialNo}]}/>
    <Button type="primary" block size="large" loading={loading} onClick={submit}>{instant ? '确认领取，立即入账' : '确认申领，提交教师审核'}</Button></>}
   {result&&<Alert className={approved&&!result.replayed?'student-claim-success':''} type="success" showIcon message={result.replayed ? '这张卡已领取，本次没有重复加分' : approved ? `领取成功，成长积分 +${credited}` : '申领已提交，等待教师审核'} description={approved ? `领取记录 #${result.claimId}。${result.replayed ? '已恢复原领取结果。' : '积分已经记入你的成长账本。'}` : `申领单 #${result.claimId}。审核通过后，按教师所选分类加1分。`}/> }
   {!preview&&!result&&!failure&&<Alert type="info" showIcon message="预分类奖励卡可即时领取；未分类旧卡会明确提示审核流程。"/>}
   <Button type="text" onClick={cancel} style={{marginTop:16}}>取消本次领取 / 清空卡片</Button>
  </Card>
 </div>;
}
