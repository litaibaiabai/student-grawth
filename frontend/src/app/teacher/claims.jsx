import React,{useState,useEffect,useRef} from 'react';
import {Card,Table,Button,Tag,Space,message,Popconfirm,Input,Typography,Alert,Tabs,Modal,Form,Select} from 'antd';
import {ReloadOutlined} from '@ant-design/icons';
import {get,post} from '@/util/request';
import * as urls from '@/constant/urls';
const {Text}=Typography;
const error=e=>{if(!e.handled)message.error(e.message||'操作失败');};
export default function TeacherClaims(){
 const [claims,setClaims]=useState([]),[loading,setLoading]=useState(false),[status,setStatus]=useState('PENDING'),[saving,setSaving]=useState(false),[selected,setSelected]=useState(null),[tree,setTree]=useState([]),[categoriesLoading,setCategoriesLoading]=useState(false);
 const [form]=Form.useForm();const primary=Form.useWatch('primary',form);const requestKeys=useRef({});
 async function load(){setLoading(true);try{const r=await get(urls.API_TEACHER_CLAIMS,{status});setClaims(r.data||[]);}catch(e){error(e);}finally{setLoading(false);}}
 useEffect(()=>{load();},[status]);
 async function openApproval(row){
  setSelected(row);form.resetFields();setTree([]);setCategoriesLoading(true);
  requestKeys.current[row.claim_id]=`REVIEW_${row.claim_id}_${Date.now()}`;
  try{const r=await get(urls.API_CATEGORIES,{dimensionCode:row.dimension_code,version:row.category_version});setTree(r.data?.[0]?.children||[]);}catch(e){error(e);}finally{setCategoriesLoading(false);}
 }
 async function decide(row,decision,values={}){
  setSaving(true);
  const key=requestKeys.current[row.claim_id]||(requestKeys.current[row.claim_id]=`REVIEW_${row.claim_id}_${Date.now()}`);
  try{
   await post(urls.API_DECIDE_CLAIM(row.claim_id),{decision,requestKey:key,categoryId:values.categoryId,remark:values.remark,rejectReason:decision==='REJECT'?'教师核实不符合本次奖励要求':undefined});
   message.success(decision==='APPROVE'?'已按所选分类加1分':'已驳回，卡片已作废');setSelected(null);delete requestKeys.current[row.claim_id];load();
  }catch(e){error(e);}finally{setSaving(false);}
 }
 return <Card title="评价卡申领审核" extra={<Button icon={<ReloadOutlined/>} onClick={load}>刷新</Button>}>
  <Alert type="info" showIcon style={{marginBottom:20}} message="审核通过前，请选择奖励的一级子类和二级子类。" description="卡片方向已确定，每张卡固定加1分。待审卡最晚可审核至次月3日23:59，且不晚于学期审核截止时间。"/>
  <Tabs activeKey={status} onChange={setStatus} items={[{key:'PENDING',label:'待审核'},{key:'APPROVED',label:'已通过'},{key:'REJECTED',label:'已驳回'},{key:'EXPIRED',label:'已过期'},{key:'',label:'全部'}]}/>
  <Table rowKey="claim_id" dataSource={claims} loading={loading} scroll={{x:850}} columns={[
   {title:'学生',render:(_,r)=><Space direction="vertical" size={0}><Text strong>{r.student_name}</Text><Text type="secondary">{r.grade}年级{r.class_no}班</Text></Space>},
   {title:'卡片方向',dataIndex:'dimension_name',render:n=><Tag color="green">{n}</Tag>},
   {title:'奖励分类',render:(_,r)=>r.categoryPath?.map(c=>c.name).join(' / ')||<Text type="secondary">审核时选择</Text>},
   {title:'月份 / 卡号',render:(_,r)=>`${r.month_key} / ${r.card_id}`},
   {title:'申领时间',dataIndex:'claim_time',render:t=>t?new Date(t).toLocaleString('zh-CN'):'—'},
   {title:'状态',dataIndex:'claim_status',render:s=><Tag color={s==='APPROVED'?'green':s==='PENDING'?'gold':'default'}>{({PENDING:'待审核',APPROVED:'已加1分',REJECTED:'已驳回',EXPIRED:'已过期'})[s]||s}</Tag>},
   {title:'操作',render:(_,r)=>r.claim_status==='PENDING'?<Space><Button type="primary" onClick={()=>openApproval(r)}>选择分类并审核</Button><Popconfirm title="驳回后该卡将作废，确认驳回？" onConfirm={()=>decide(r,'REJECT')}><Button danger loading={saving}>驳回</Button></Popconfirm></Space>:<Text type="secondary">已处理</Text>}
  ]}/>
  <Modal title={`审核奖励 · ${selected?.student_name||''}`} open={!!selected} onCancel={()=>setSelected(null)} onOk={()=>form.submit()} confirmLoading={saving} okText="审核通过并加1分" okButtonProps={{disabled:categoriesLoading}} destroyOnClose>
   <Alert type="success" showIcon message={`${selected?.dimension_name||''}评价卡 · 固定加1分`} style={{margin:'16px 0'}}/>
   <Form form={form} layout="vertical" onFinish={v=>decide(selected,'APPROVE',v)} preserve={false}>
    <Form.Item name="primary" label="一级子类" rules={[{required:true,message:'请选择一级子类'}]}><Select loading={categoriesLoading} placeholder="选择学生表现所属方面" options={tree.map(n=>({value:Number(n.id),label:n.name}))} onChange={()=>form.setFieldValue('categoryId',null)}/></Form.Item>
    <Form.Item name="categoryId" label="二级子类" rules={[{required:true,message:'请选择二级子类'}]}><Select disabled={!primary} placeholder="选择具体奖励行为" options={(tree.find(n=>Number(n.id)===primary)?.children||[]).filter(n=>Number(n.score)===1&&Number(n.level)===3).map(n=>({value:Number(n.id),label:n.name}))}/></Form.Item>
    <Form.Item name="remark" label="奖励说明（选填）"><Input.TextArea maxLength={500} rows={3} placeholder="记录这次值得鼓励的表现"/></Form.Item>
   </Form>
  </Modal>
 </Card>;
}
