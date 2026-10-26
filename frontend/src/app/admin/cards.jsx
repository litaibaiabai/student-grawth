import React,{useState,useEffect,useCallback} from 'react';
import {Card,Table,Tag,Button,Space,message,Modal,Form,Input,InputNumber,Select,Typography,Alert,Tabs,DatePicker,Switch,Row,Col} from 'antd';
import {ReloadOutlined,PlusOutlined,PrinterOutlined} from '@ant-design/icons';
import dayjs from 'dayjs';
import {get,post,put,download} from '@/util/request';
import token from '@/util/token';
import * as urls from '@/constant/urls';
import {downloadCardPrintPack} from '@/util/cardPrintRecovery';
import {DIMENSIONS,DIM_NAMES,previewAllocation} from '@/util/cardAllocation';
const {Text,Title}=Typography;
const countsView=counts=><Space size={[4,6]} wrap>{DIMENSIONS.map(k=><Tag key={k}>{DIM_NAMES[k]} {counts?.[k]||0}</Tag>)}</Space>;
const reportError=e=>{if(!e.handled)message.error(e.message||'操作失败');};

export default function AdminCards(){
 const manager=token.loadUser()?.role==='manager';
 const [month,setMonth]=useState(dayjs().format('YYYY-MM'));
 const [subjects,setSubjects]=useState([]),[teachers,setTeachers]=useState([]),[policies,setPolicies]=useState([]),[allocations,setAllocations]=useState([]),[issues,setIssues]=useState([]);
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[editing,setEditing]=useState(null),[pack,setPack]=useState(null),[printing,setPrinting]=useState(false);
 const [form]=Form.useForm();
 const watched=Form.useWatch([],form)||{};
 const preview=previewAllocation(Number(watched.monthlyTotal),watched.ratios);
 const sum=DIMENSIONS.reduce((n,k)=>n+Number(watched.ratios?.[k]||0),0);
 const load=useCallback(async()=>{
   setLoading(true);
   try{
     const a=await get(urls.API_CARD_ALLOCATIONS,{monthKey:month});setAllocations(a.data||[]);
     if(manager){const [s,t,p,i]=await Promise.all([get(urls.API_CARD_SUBJECTS),get(urls.API_CARD_TEACHERS),get(urls.API_SUBJECT_CARD_POLICIES,{monthKey:month}),get(urls.API_CARD_GENERATION_ISSUES,{monthKey:month})]);setSubjects(s.data||[]);setTeachers(t.data||[]);setPolicies(p.data||[]);setIssues(i.data||[]);}
   }catch(e){reportError(e);}finally{setLoading(false);}
 },[manager,month]);
 useEffect(()=>{load();},[load]);
 useEffect(()=>{
   if(!pack||pack.status!=='PENDING')return;
   let active=true;
   const timer=setInterval(()=>get(`${urls.API_CARD_PRINT_PACKS}/${pack.id}`).then(r=>{if(active)setPack(current=>current?.id===pack.id?r.data:current);}).catch(reportError),2000);
   return()=>{active=false;clearInterval(timer);};
 },[pack?.id,pack?.status]);
 function open(kind,row){form.resetFields();setEditing({kind,row});}
 useEffect(()=>{
   if(!editing)return;
   const {kind,row}=editing;
   if(kind==='teacher')form.setFieldsValue({subjectIds:row.subjectIds,primarySubjectId:row.primarySubjectId});
   if(kind==='subject')form.setFieldsValue(row||{status:1});
   if(kind==='policy')form.setFieldsValue(row.latestPolicy||{monthlyTotal:100,enabled:true,ratios:{D:20,Z:70,T:0,M:0,L:10,G:0}});
 },[editing,form]);
 async function save(values){
   setSaving(true);
   try{
     const {kind,row}=editing;let result;
     if(kind==='teacher')result=await put(`${urls.API_CARD_TEACHERS}/${row.id}/subjects`,values);
     if(kind==='subject')result=await (row?put(`${urls.API_CARD_SUBJECTS}/${row.id}`,values):post(urls.API_CARD_SUBJECTS,values));
     if(kind==='policy'){
       if(!preview){message.warning('六育比例合计必须为100%，请检查总张数和比例');return;}
       result=await put(`${urls.API_SUBJECT_CARD_POLICIES}/${row.subjectId}`,values);
     }
     message.success(kind==='policy'?`策略已保存，${result.data.effectiveMonth}生效`:'已保存，系统将自动检查当月配卡');setEditing(null);await load();
   }catch(e){reportError(e);}finally{setSaving(false);}
 }
 async function preparePrint(){
   setPrinting(true);
   try{const r=await post(urls.API_CARD_PRINT_PACKS,{monthKey:month});setPack(r.data);}catch(e){reportError(e);}finally{setPrinting(false);}
 }
 async function downloadPack(){
   const selected=pack;
   try{await downloadCardPrintPack({id:selected.id,
     download:id=>download(`${urls.API_CARD_PRINT_PACKS}/${id}/download`,{},`评价卡-${selected.monthKey}.pdf`),
     getPack:async id=>(await get(`${urls.API_CARD_PRINT_PACKS}/${id}`)).data,
     onPack:value=>setPack(current=>current?.id===selected.id?value:current)
   });}catch(e){reportError(e);}
 }
 async function refresh(){await load();if(pack){try{const r=await get(`${urls.API_CARD_PRINT_PACKS}/${pack.id}`);setPack(current=>current?.id===pack.id?r.data:current);}catch(e){reportError(e);}}}
 const allocationColumns=[
   {title:'教师',dataIndex:'teacherName'}, {title:'主教学科',render:(_,r)=><Space direction="vertical" size={4}><span>{r.subjectName}</span>{r.subjectChanged&&<Text type="warning">{r.subjectChangeNotice}</Text>}</Space>},
   {title:'当月卡片',render:(_,r)=><div><Text strong>{r.monthlyTotal} 张</Text><div style={{marginTop:6}}>{countsView(r.counts)}</div></div>},
   {title:'使用进度',render:(_,r)=><Space direction="vertical" size={0}><span>未用 {r.unusedCount} · 待审 {r.pendingCount} · 已用 {r.usedCount}</span><Text type="secondary">已生成 {r.generatedCount} 张</Text></Space>},
   {title:'分配状态',render:(_,r)=><Space direction="vertical"><Tag color={r.status==='READY'?'green':r.status==='FAILED'?'red':'gold'}>{({READY:'已就绪',FAILED:'生成失败',GENERATING:'生成中'})[r.status]}</Tag>{r.errorMessage&&<Text type="danger">{r.errorMessage}</Text>}</Space>}
 ];
 const monthly=<>
   <Space wrap style={{marginBottom:20}}><DatePicker picker="month" allowClear={false} value={dayjs(month)} onChange={v=>{if(v){setMonth(v.format('YYYY-MM'));setPack(null);}}}/><Button icon={<ReloadOutlined/>} onClick={refresh}>刷新分配</Button>{manager&&<Button type="primary" icon={<PrinterOutlined/>} loading={printing} onClick={preparePrint} disabled={!allocations.some(a=>a.status==='READY')}>准备打印 PDF</Button>}</Space>
   <Table rowKey="id" dataSource={allocations} columns={allocationColumns} loading={loading} scroll={{x:850}} locale={{emptyText:'该月暂无卡片分配；系统仅在有效学期内自动发卡'}}/>
   {manager&&issues.length>0&&<Card size="small" title="需要处理的发卡事项" style={{marginTop:20}}><Table size="small" rowKey="id" dataSource={issues} pagination={false} columns={[{title:'教师',dataIndex:'teacherName',width:160},{title:'原因',dataIndex:'message'}]}/></Card>}
   {manager&&pack&&<Card size="small" title={`${pack.monthKey} 打印资料`} style={{marginTop:20}} extra={<Tag color={pack.status==='READY'?'green':pack.status==='FAILED'?'red':'gold'}>{({READY:'可以下载',PENDING:'正在准备',FAILED:'准备失败'})[pack.status]}</Tag>}>
      <Space direction="vertical" style={{width:'100%'}}><Text>包含 {pack.teacherCount} 位教师、{pack.cardCount} 张卡，按教师分组排版。请按实际大小单面打印。</Text>
      {pack.issues?.length>0&&<Alert type="warning" showIcon message={`有 ${pack.issues.length} 项未就绪事项，清单已列入PDF首页`} description={pack.issues.map((i,n)=><div key={n}>{i.teacherName||'校历'}：{i.message}</div>)}/>}
      {pack.errorMessage&&<Alert type="error" message={pack.errorMessage}/>}
      <Space><Button type="primary" disabled={pack.status!=='READY'} onClick={downloadPack}>下载打印 PDF</Button>{pack.status==='FAILED'&&<Button onClick={preparePrint}>重试准备</Button>}</Space></Space>
   </Card>}
 </>;
 const teacherTab=<><Alert showIcon type="info" message="每位教师每月只领取一份卡，兼课时按主教学科的策略分配。补齐学科后，系统会补生成当月尚未领取的一整份卡。" style={{marginBottom:20}}/>
   <Table rowKey="id" dataSource={teachers} loading={loading} columns={[
    {title:'教师',dataIndex:'realName'}, {title:'任教班级',render:(_,r)=>r.classes?.map(c=>`${c.grade}年级${c.class_no}班`).join('、')||'—'},
    {title:'任教学科',render:(_,r)=>r.subjectIds.map(id=>subjects.find(s=>s.id===id)?.subjectName||id).join('、')||<Text type="warning">未配置</Text>},
    {title:'主教学科',render:(_,r)=>r.primarySubjectName?<Tag color="green">{r.primarySubjectName}</Tag>:<Text type="warning">待指定</Text>},
    {title:'账号',render:(_,r)=>r.status===0?'正常':'已停用'}, {title:'操作',render:(_,r)=><Button type="link" onClick={()=>open('teacher',r)}>设置学科</Button>}
   ]}/></>;
 const policyTab=<><Space style={{marginBottom:20}}><Button icon={<PlusOutlined/>} onClick={()=>open('subject',null)}>新增学科</Button><Text type="secondary">填写月总张数与六育比例，比例合计100%。</Text></Space>
   <Table rowKey="subjectId" dataSource={policies} loading={loading} scroll={{x:850}} columns={[
     {title:'学科',render:(_,r)=><Space direction="vertical" size={0}><Text strong>{r.subjectName}</Text><Text type="secondary">{r.subjectCode}{r.status===0?' · 已停用':''}</Text></Space>},
     {title:'本月策略',render:(_,r)=>r.currentPolicy?<Space direction="vertical" size={6}><Text>{r.currentPolicy.enabled?`${r.currentPolicy.monthlyTotal} 张 / 月`:'暂停发卡'}</Text>{countsView(r.currentPolicy.counts)}</Space>:<Text type="warning">尚未生效</Text>},
     {title:'待生效调整',render:(_,r)=>r.scheduledPolicy?<Space direction="vertical" size={6}><Text>{r.scheduledPolicy.effectiveMonth} · {r.scheduledPolicy.enabled?`${r.scheduledPolicy.monthlyTotal} 张`:'暂停发卡'}</Text>{countsView(r.scheduledPolicy.counts)}</Space>:'—'},
     {title:'操作',render:(_,r)=><Space><Button type="link" onClick={()=>open('policy',r)}>设置策略</Button><Button type="link" onClick={()=>open('subject',subjects.find(s=>s.id===r.subjectId))}>编辑学科</Button></Space>}
   ]}/></>;
 return <div style={{maxWidth:1240,margin:'0 auto'}}>
  <div style={{padding:'24px 28px',background:'#173f32',color:'#fff',borderRadius:14,marginBottom:24}}><Text style={{color:'#bfd7c9'}}>六育评价卡</Text><Title level={3} style={{color:'#fff',margin:'8px 0'}}>{manager?'学科策略与月度发卡':'我的月度评价卡'}</Title><Text style={{color:'#d7e9dd'}}>有效学期内每月1日自动发卡；老师发卡后，由学生扫码、教师审核分类并加1分。</Text></div>
  <Card>{manager?<Tabs defaultActiveKey="monthly" items={[{key:'teachers',label:'教师学科',children:teacherTab},{key:'policies',label:'学科发卡策略',children:policyTab},{key:'monthly',label:'月度分配与打印',children:monthly}]}/>:monthly}</Card>
  <Modal forceRender title={editing?.kind==='teacher'?`设置学科 · ${editing.row.realName}`:editing?.kind==='subject'?'维护学科':`学科发卡策略 · ${editing?.row.subjectName||''}`} open={!!editing} onCancel={()=>setEditing(null)} onOk={()=>form.submit()} confirmLoading={saving} destroyOnClose width={640}>
   <Form form={form} layout="vertical" onFinish={save} style={{marginTop:20}}>
    {editing?.kind==='teacher'&&<><Form.Item name="subjectIds" label="任教学科" rules={[{required:true,message:'请选择任教学科'}]}><Select mode="multiple" options={subjects.filter(s=>s.status===1).map(s=>({value:s.id,label:s.subjectName}))} onChange={ids=>{if(!ids.includes(form.getFieldValue('primarySubjectId')))form.setFieldValue('primarySubjectId',null);}}/></Form.Item><Form.Item name="primarySubjectId" label="主教学科（按此学科领取一份卡）" rules={[{required:true,message:'请指定主教学科'}]}><Select options={subjects.filter(s=>s.status===1&&watched.subjectIds?.includes(s.id)).map(s=>({value:s.id,label:s.subjectName}))}/></Form.Item></>}
    {editing?.kind==='subject'&&<><Form.Item name="subjectCode" label="学科代码（创建后固定）" rules={[{required:true},{pattern:/^[A-Za-z][A-Za-z0-9_]{0,29}$/,message:'使用字母开头，支持数字与下划线'}]}><Input disabled={!!editing.row} placeholder="如 CHINESE" maxLength={30}/></Form.Item><Form.Item name="subjectName" label="学科名称" rules={[{required:true}]}><Input maxLength={60} placeholder="如 语文"/></Form.Item><Form.Item name="status" label="学科状态" extra="可恢复启用停用学科；已有策略的学科，请在策略中暂停发卡。"><Select options={[{value:1,label:'启用'},{value:0,label:'停用'}]}/></Form.Item></>}
    {editing?.kind==='policy'&&<><Alert style={{marginBottom:20}} type="info" showIcon message="当月已有分配时，修改从下月生效；当月尚未分配时，保存后自动补发。"/>
     <Row gutter={20}><Col span={12}><Form.Item name="monthlyTotal" label="每月总张数" rules={[{required:true}]}><InputNumber min={0} max={100000} precision={0} style={{width:'100%'}}/></Form.Item></Col><Col span={12}><Form.Item name="enabled" label="自动发卡" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="暂停"/></Form.Item></Col></Row>
     <Row gutter={16}>{DIMENSIONS.map(k=><Col span={8} key={k}><Form.Item name={['ratios',k]} label={`${DIM_NAMES[k]}比例`} rules={[{required:true}]}><InputNumber min={0} max={100} precision={2} addonAfter="%" style={{width:'100%'}}/></Form.Item></Col>)}</Row>
     <Alert type={preview?'success':'warning'} message={`比例合计 ${Number(sum.toFixed(2))}%`} description={preview?countsView(preview):'比例需合计100%，系统才能计算各方向卡片张数。'}/>
    </>}
   </Form>
  </Modal>
 </div>;
}
