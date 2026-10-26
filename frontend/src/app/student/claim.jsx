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
  <Title level={3}>扫卡领取</Title><Text type="secondary">确认方向、教师和有效期后提交，教师会在审核时选择具体奖励分类。</Text>
  <Card style={{marginTop:20}} title={<Space><QrcodeOutlined/>评价卡</Space>}>
   <Space.Compact style={{width:'100%',marginBottom:20}}><Input.Password value={input} placeholder="扫描二维码后自动读取，也可粘贴扫码链接" onChange={e=>{session.invalidate();clearClaimIntent();setInput(e.target.value);setPreview(null);setResult(null);setFailure('');requestKey.current=null;}}/><Button type="primary" loading={loading} onClick={()=>read()}>读取卡片</Button></Space.Compact>
   {failure&&<Alert type="warning" showIcon message={failure} style={{marginBottom:20}}/>}
   {preview&&<><div style={{padding:24,background:'#f0f7f2',borderRadius:12,marginBottom:20}}><Tag color="green">{preview.dimensionName}</Tag><Title level={2} style={{margin:'16px 0'}}>审核通过后 +1分</Title><Text>具体奖励分类由教师审核时选择</Text></div>
    <Descriptions column={1} items={[{key:'teacher',label:'发卡教师',children:preview.teacherName},{key:'month',label:'所属月份',children:preview.monthKey},{key:'valid',label:'申领截止',children:preview.validUntil},{key:'review',label:'审核截止',children:preview.reviewDeadline},{key:'card',label:'卡片序号',children:preview.serialNo}]}/>
    <Button type="primary" block size="large" loading={loading} onClick={submit}>确认申领，提交教师审核</Button></>}
   {result&&<Alert type="success" showIcon message="申领已提交，等待教师审核" description={`申领单 #${result.claimId}。审核通过后，按教师所选分类加1分。`}/>}
   {!preview&&!result&&!failure&&<Alert type="info" showIcon message="学生扫码只提交申领，教师审核通过后才会加分。"/>}
   <Button type="text" onClick={cancel} style={{marginTop:16}}>取消本次领取 / 清空卡片</Button>
  </Card>
 </div>;
}
