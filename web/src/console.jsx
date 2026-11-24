import React,{useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Activity,ArrowLeft,Check,Plus,RefreshCw,Settings2} from 'lucide-react';
import {hostSession} from './access.js';
import {request,loadSelfData} from './console-client.js';
import {ThemeSwitch} from './workspace.jsx';
import ResultViewer,{ResultBody} from './result-viewer.jsx';
import ResultAccess from './result-access.jsx';
import QuarantineAdmin,{QuarantinePolicy} from './quarantine-settings.jsx';
import {defaultQuarantine,policyForQuestions} from './quarantine-policy.js';
import {clock,verdict} from './inspection-view.js';
import Select from './select.jsx';
import './inspection.css';

const clone=value=>structuredClone(value);
const effortOptions=['none','minimal','low','medium','high','xhigh','max'].map(value=>({value,label:value}));
const attemptOptions=Array.from({length:10},(_,index)=>({value:index+1,label:`${index+1} 个`}));
const roundOptions=[1,2,3].map(value=>({value,label:`${value} 次`}));
const daytime={enabled:true,timezone:'Asia/Shanghai',regular_minutes:60,quiet_start:'22:00',quiet_end:'09:00',quiet_minutes:60,quiet_pause:true};
function Field({label,children}){return <label className="ir-field"><span>{label}</span>{children}</label>;}
function SelectField({label,...props}){
  return <div className="ir-field"><span>{label}</span><Select label={label} {...props}/></div>;
}

function KeyCheck({refreshRef}){
  const [keys,setKeys]=useState([]),[questions,setQuestions]=useState([]),[jobs,setJobs]=useState([]),[models,setModels]=useState([]),[keyId,setKeyId]=useState(''),[model,setModel]=useState(''),[effort,setEffort]=useState('high'),[topic,setTopic]=useState('drawing'),[shared,setShared]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[jobId,setJobId]=useState('');
  const jobsRequest=useRef(0);
  const pendingJobs=useRef(null);
  async function load(){
    if(!hostSession())return;
    const revision=++jobsRequest.current;
    const data=await loadSelfData();
    if(data.keys.status==='fulfilled'){
      const rows=data.keys.value.keys.filter(key=>key.status==='active');
      setKeys(rows);
      setKeyId(old=>rows.some(key=>String(key.id)===old)?old:rows[0]?String(rows[0].id):'');
    }
    if(data.questions.status==='fulfilled')setQuestions(data.questions.value.questions);
    if(revision===jobsRequest.current&&data.jobs.status==='fulfilled')setJobs(data.jobs.value.jobs);
    const results=[data.keys,data.questions,...(revision===jobsRequest.current?[data.jobs]:[])];
    const errors=results.filter(result=>result.status==='rejected');
    if(errors.length)setError([...new Set(errors.map(result=>result.reason.message))].join('；'));
  }
  function refreshJobs(){
    if(pendingJobs.current)return pendingJobs.current;
    const revision=++jobsRequest.current;
    pendingJobs.current=request('/api/user/jobs').then(value=>{
      if(revision===jobsRequest.current)setJobs(value.jobs);
    }).finally(()=>{pendingJobs.current=null;});
    return pendingJobs.current;
  }
  useImperativeHandle(refreshRef,()=>({refresh:refreshJobs}));
  useEffect(()=>{
    if(!hostSession())return;
    load().catch(error=>setError(error.message));
    const timer=setInterval(()=>refreshJobs().catch(error=>setError(error.message)),5000);
    return()=>clearInterval(timer);
  },[]);
  useEffect(()=>{let alive=true;setModels([]);setModel('');if(keyId)request('/api/user/keys/'+keyId+'/models','GET',undefined,'user').then(v=>{if(alive){setModels(v.models);setModel(v.models[0]?.id||'');}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[keyId]);
  const selected=jobs.find(job=>job.id===jobId)||jobs[0];
  async function run(){setBusy(true);setError('');try{const job=await request('/api/user/jobs','POST',{api_key_id:Number(keyId),model,effort,kinds:[topic],public:shared,share_content:shared},'user');setJobId(job.id);await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
  if(!hostSession())return <div className="ir-empty">请从 code1024 登录后进入此页面，选择自己的 API Key 检测。</div>;
  return <>
    <section className="ir-panel">
      <h2>使用自己的 Key 检测</h2>
      <p>通过 code1024 正常调用，遵循所选 Key 的分组、模型权限和计费规则。</p>
      {error&&<p className="ir-error" role="alert">{error}</p>}
      <div className="ir-form-grid">
        <SelectField label="我的 API Key" value={keyId} onChange={setKeyId}
          options={[{value:'',label:'请选择 Key'},...keys.map(item=>({
            value:String(item.id),label:`${item.name} · ${item.masked} · ${item.group_name}`
          }))]}/>
        <SelectField label="检测题目" value={topic} onChange={setTopic}
          options={questions.map(question=>({value:question.id,label:question.title}))}/>
        <SelectField label="模型" value={model} onChange={setModel} editable
          placeholder="选择或输入此 Key 可用的模型" options={models.map(item=>({value:item.id,label:item.id}))}/>
        <SelectField label="思考强度" value={effort} onChange={setEffort} options={effortOptions}/>
      </div>
      <label className="ir-check"><input type="checkbox" checked={shared} onChange={e=>setShared(e.target.checked)}/>公开回答和作品到 Key 所属分组</label>
      <div className="ir-actions"><button className="ir-primary" disabled={busy||!keyId||!model||!questions.some(q=>q.id===topic)} onClick={run}>{busy?'正在提交…':'开始 Key 检测'}</button><span>回答默认仅自己可见。</span></div>
    </section>
    <section className="ir-panel">
      <div className="ir-section-head">
        <h2>我的检测记录</h2>
        <Select label="选择我的记录" className="quality-select-record" value={selected?.id||''} onChange={setJobId}
          options={jobs.map(job=>({value:job.id,label:`${clock(job.created_at)} · ${job.model} · ${verdict(job)}`}))}/>
      </div>
      {selected?<><p>{selected.model} · {selected.key_name} · {verdict(selected)}{selected.message?' · '+selected.message:''}</p><label className="ir-check"><input type="checkbox" checked={Boolean(selected.public)} onChange={async e=>{try{await request('/api/user/jobs/'+selected.id+'/publication','PUT',{public:e.target.checked,share_content:e.target.checked},'user');await load();}catch(error){setError(error.message);}}}/>公开到 {selected.group_name||'所属分组'}</label>{selected.results.map(row=><section key={row.kind} className="ir-own-result"><h3>{row.title}</h3><SelfResult job={selected} row={row}/></section>)}</>:<div className="ir-empty">还没有检测记录。</div>}
    </section>
  </>;
}
function SelfResult({job,row}){
  const [links,setLinks]=useState([]),[error,setError]=useState('');
  useEffect(()=>{let alive=true;async function load(){if(row.question_type!=='drawing')return;try{const v=await request(`/api/user/jobs/${job.id}/render-links`,'GET',undefined,'user');if(alive){setLinks(v.links[row.kind]||[]);setError('');}}catch(e){if(alive)setError(e.message);}}load();const timer=setInterval(load,300000);return()=>{alive=false;clearInterval(timer);};},[job.id,row.kind,job.finished_at]);
  return <>{error&&<p className="ir-error" role="alert">{error}</p>}<ResultBody record={{...row,id:job.id+':'+row.kind,effort:job.effort}} detail={{...row,expected:row.expected??null,prompt:row.prompt||''}} renderUrls={links}/></>;
}

function AdminSettings({onChange}){
  const [data,setData]=useState(null),[selected,setSelected]=useState(null),[draft,setDraft]=useState(null),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  async function load(id){
    const value=await request('/api/admin/inspections');
    setData(value);
    setSelected(old=>id??(old===''||value.inspections.some(plan=>plan.id===old)?old:value.inspections[0]?.id??''));
    return value;
  }
  useEffect(()=>{load().catch(e=>setError(e.message));},[]);
  const activeJobs=data?.jobs.some(job=>['running','queued'].includes(job.status));
  useEffect(()=>{
    if(!activeJobs)return;
    const timer=setInterval(()=>request('/api/admin/inspections').then(value=>{
      setData(old=>old&&({...old,jobs:value.jobs}));
    }).catch(e=>setError(e.message)),3000);
    return()=>clearInterval(timer);
  },[activeJobs]);
  const record=data?.inspections.find(p=>p.id===selected);
  const availableGroups=data?.groups.filter(group=>!data.inspections.some(plan=>plan.group_id===group.id&&plan.id!==selected))||[];
  const groupOptions=availableGroups.map(group=>({value:group.id,label:group.name}));
  if (record&&!availableGroups.some(group=>group.id===record.group_id)) {
    groupOptions.unshift({value:record.group_id,label:record.group_name||`分组 #${record.group_id}`});
  }
  const selectedGroupReady=availableGroups.some(group=>group.id===draft?.group_id);
  useEffect(()=>{
    if(!data)return;
    const questions=clone(record?.questions.length?record.questions:[data.questions.value.find(q=>q.id==='drawing')||data.questions.value[0]]);
    setDraft({group_id:record?.group_id??availableGroups[0]?.id??0,enabled:record?.enabled??true,model:record?.model||'gpt-6.1-sol',effort:record?.effort||'low',max_account_attempts:record?.max_account_attempts??3,max_saved_rounds:record?(record.max_saved_rounds??''):20,question_ids:questions.map(q=>q.id),questions,quarantine:{...defaultQuarantine,...record?.quarantine},schedule:{...daytime,...record?.schedule,quiet_pause:true}});
  },[selected,record?.revision,Boolean(data)]);
  function selectInspection(id){
    if(id===selected)return;
    setSelected(id);
    setMessage('');
    setError('');
  }
  async function act(fn,success){setBusy(true);setError('');setMessage('');try{await fn();if(success)setMessage(success);await onChange();}catch(e){setError(e.message);}finally{setBusy(false);}}
  const set=(field,value)=>setDraft(old=>({...old,[field]:value}));
  const editQuestion=(id,field,value)=>setDraft(old=>({...old,questions:old.questions.map(q=>q.id===id?{...q,[field]:value}:q)}));
  function toggleQuestion(id,checked){
    const questions=checked?[...draft.questions,clone(data.questions.value.find(q=>q.id===id))]:draft.questions.filter(q=>q.id!==id);
    setDraft(old=>({...old,questions,question_ids:questions.map(q=>q.id),quarantine:policyForQuestions(old.quarantine,questions)}));
  }
  async function save(){await act(async()=>{
    const value=clone(draft);
    value.max_saved_rounds=value.max_saved_rounds===''?null:Number(value.max_saved_rounds);
    value.questions=value.questions.map(q=>q.kind==='json'&&typeof q.expected==='string'?{...q,expected:JSON.parse(q.expected)}:q);
    const response=await request('/api/admin/inspections'+(record?'/'+record.id:''),record?'PUT':'POST',{value,...(record?{revision:record.revision}:{})});
    await load(response.id);
  },'分组巡检已保存。');}
  return <><section className="ir-panel ir-settings"><div className="ir-section-head"><div><h2>定时巡检设置</h2><p>优先检测最近使用的账号。账号不可用时，按网关优先级在同分组内顺延。</p></div></div>
    {error&&<p className="ir-error" role="alert">{error}</p>}{message&&<p className="ir-message" role="status">{message}</p>}
    {!data||!draft?<div className="ir-empty">正在加载配置…</div>:<fieldset disabled={busy}>
      <div className="ir-inspection-toolbar">
        <div className="ir-groups" role="group" aria-label="巡检分组配置">
          {data.inspections.map(plan=><button key={plan.id} aria-pressed={selected===plan.id} className={selected===plan.id?'active':''} onClick={()=>selectInspection(plan.id)}>
            {data.groups.find(group=>group.id===plan.group_id)?.name||plan.group_name||`分组 #${plan.group_id}`}
          </button>)}
          <button className={selected===''?'ir-add-inspection active':'ir-add-inspection'} aria-pressed={selected===''} onClick={()=>selectInspection('')}><Plus size={16} aria-hidden="true"/>新建巡检分组</button>
        </div>
        <button onClick={()=>act(async()=>{await request('/api/admin/inventory/sync','POST',{});await load();},'分组已同步。')}><RefreshCw size={15} aria-hidden="true"/>同步分组</button>
      </div>
      <div className="ir-form-grid">
        <SelectField label="检测分组" value={draft.group_id} options={groupOptions} disabled={busy||!groupOptions.length}
          placeholder={availableGroups.length?'请选择检测分组':'暂无可新建的分组'} onChange={value=>set('group_id',value)}/>
        <Field label="检测模型"><input value={draft.model} onChange={e=>set('model',e.target.value)}/></Field>
        <SelectField label="思考强度" value={draft.effort} options={effortOptions} disabled={busy} onChange={value=>set('effort',value)}/>
        <Field label="最多保留巡检轮次"><input type="number" min="1" max="200" step="1" value={draft.max_saved_rounds} placeholder="留空，仅按时间保留" onChange={e=>set('max_saved_rounds',e.target.value)}/></Field>
      </div>
      <p className="ir-note">同一轮的多题一起保留。设定上限后，超过上限的旧结果和作品会清理。</p>
      <SelectField label="每轮最多尝试账号数" value={draft.max_account_attempts} options={attemptOptions} disabled={busy}
        onChange={value=>set('max_account_attempts',value)}/>
      <p className="ir-note">首次尝试和限额跳过都计入上限。没有最近使用记录时，从优先级数值最小的可调度账号开始。</p>
      <div className="ir-own-result"><h3>检测题目（可多选）</h3><p className="ir-note">同一账号依次检测所有选中题目。每题可单独配置内容、标准答案和请求次数；糖果测试默认只请求一次。</p>
        <div className="ir-actions">{data.questions.value.filter(q=>q.enabled).map(q=><label className="ir-check" key={q.id}><input type="checkbox" checked={draft.question_ids.includes(q.id)} disabled={draft.question_ids.length===1&&draft.question_ids[0]===q.id} onChange={e=>toggleQuestion(q.id,e.target.checked)}/>{q.title}</label>)}</div>
        {draft.questions.map(q=><details key={q.id} open><summary>{q.title} · {q.rounds} 次请求</summary>
          <Field label="题目内容（仅影响此分组的新检测）"><textarea rows="4" value={q.prompt} onChange={e=>editQuestion(q.id,'prompt',e.target.value)}/></Field>
          {['number','choice','json'].includes(q.kind)&&<Field label="标准答案"><textarea rows="2" value={typeof q.expected==='object'?JSON.stringify(q.expected):q.expected} onChange={e=>editQuestion(q.id,'expected',e.target.value)}/></Field>}
          <SelectField label="此题每轮请求次数" value={q.rounds} options={roundOptions} disabled={busy}
            onChange={value=>editQuestion(q.id,'rounds',value)}/>
        </details>)}
      </div>
      <div className="ir-form-grid"><Field label="白天间隔（分钟）"><input type="number" min="5" max="1440" value={draft.schedule.regular_minutes} onChange={e=>set('schedule',{...draft.schedule,regular_minutes:Number(e.target.value)})}/></Field><Field label="暂停时段开始（北京时间）"><input type="time" value={draft.schedule.quiet_start} onChange={e=>set('schedule',{...draft.schedule,quiet_start:e.target.value})}/></Field><Field label="恢复检测（北京时间）"><input type="time" value={draft.schedule.quiet_end} onChange={e=>set('schedule',{...draft.schedule,quiet_end:e.target.value})}/></Field></div>
      <label className="ir-check"><input type="checkbox" checked={draft.enabled&&draft.schedule.enabled} onChange={e=>setDraft(old=>({...old,enabled:e.target.checked,schedule:{...old.schedule,enabled:e.target.checked}}))}/>启用此分组的定时巡检</label>
      <QuarantinePolicy value={draft.quarantine} questions={draft.questions} keyReady={data.capabilities.quarantine_key_ready} onChange={value=>set('quarantine',value)}/>
      <p className="ir-note">结果展示到分组。鹈鹕作品供人工观察，有标准答案的题目自动判定。</p>
      <div className="ir-actions"><button className="ir-primary" disabled={!draft.questions.length||!selectedGroupReady} onClick={save}>保存巡检配置</button>{record&&<button onClick={()=>act(async()=>{await request('/api/admin/inspections/'+record.id+'/run','POST',{request_key:crypto.randomUUID()});await load();},'已提交一次巡检，请稍后刷新结果。')}>按已保存配置巡检一次</button>}</div>
      <details className="ir-credentials"><summary>巡检读取凭据 · {data.capabilities.machine_credential_ready?'已配置':'待配置'}</summary><p>定时巡检使用专用管理员机器 Key 读取授权分组。账号凭据通过受保护的服务器文件提供，Key 检测使用用户自己的 Key。</p><Field label="网关管理员 API Key"><input type="password" autoComplete="new-password" value={key} onChange={e=>setKey(e.target.value)} placeholder="验证成功后保存，不回显原文"/></Field><button disabled={!key} onClick={()=>act(async()=>{await request('/api/admin/automation','PUT',{key});setKey('');await load();},'服务凭据已验证并保存。')}>验证并保存</button></details>
      {data.jobs.length>0&&<details><summary>最近任务状态</summary>{data.jobs.slice(0,10).map(job=><div className="ir-own-result" key={job.id}>
        <p>{clock(job.created_at)} · {verdict(job)} · {job.message||job.name}</p>
        {job.attempts?.length>0&&<ol>{job.attempts.map(attempt=><li key={attempt.account_id}>
          #{attempt.account_id} {attempt.name} · 优先级 {attempt.priority??'—'} · {verdict(attempt)}{attempt.error_code?' · '+attempt.error_code:''}
        </li>)}</ol>}
      </div>)}</details>}
    </fieldset>}
  </section><QuarantineAdmin onCredentialChange={()=>load()}/></>;
}

export default function ConsoleApp(){
  const [data,setData]=useState(null),[admin,setAdmin]=useState(false),[adminChecked,setAdminChecked]=useState(!hostSession()),[tab,setTab]=useState('scheduled'),[settings,setSettings]=useState(()=>new URLSearchParams(location.search).get('view')==='admin'),[groupId,setGroupId]=useState(''),[error,setError]=useState('');
  const [refreshStatus,setRefreshStatus]=useState('');
  const [refreshError,setRefreshError]=useState('');
  const overviewRequest=useRef(null),scheduledViewer=useRef(null),keyViewer=useRef(null);
  function load(){
    if(overviewRequest.current)return overviewRequest.current;
    overviewRequest.current=request('/api/public/overview').then(value=>{
      setData(value);
      setError('');
    }).catch(error=>{
      if(error.status===401||error.status===403)setData(null);
      setError(error.message);
      throw error;
    }).finally(()=>{overviewRequest.current=null;});
    return overviewRequest.current;
  }
  async function refresh(){
    setRefreshStatus('refreshing');
    setRefreshError('');
    const requests=tab==='key'?[keyViewer.current?.refresh()]:[load(),...(scheduledViewer.current?.requests()??[])];
    const results=await Promise.allSettled(requests);
    const failed=results.find(result=>result.status==='rejected');
    if(failed)setRefreshError('刷新失败：'+failed.reason.message);
    setRefreshStatus(failed?'':'done');
  }
  function openSettings(){setSettings(true);setError('');history.replaceState(null,'','?view=admin');}
  function closeSettings(){setSettings(false);history.replaceState(null,'',location.pathname);}
  useEffect(()=>{if(!settings)load().catch(()=>{});if(hostSession()){setAdminChecked(false);request('/api/admin/me').then(()=>setAdmin(true)).catch(()=>setAdmin(false)).finally(()=>setAdminChecked(true));}const timer=settings?null:setInterval(()=>load().catch(()=>{}),30000);return()=>{if(timer)clearInterval(timer);};},[settings]);
  useEffect(()=>{
    if(refreshStatus!=='done')return;
    const timer=setTimeout(()=>setRefreshStatus(''),2000);
    return()=>clearTimeout(timer);
  },[refreshStatus]);
  const group=data?.groups.find(row=>row.id===groupId)||data?.groups[0];
  const refreshing=refreshStatus==='refreshing';
  const refreshLabel=refreshing?'正在刷新检测结果':refreshStatus==='done'?'检测结果已刷新':'刷新检测结果';
  if(settings)return <main className="ir-app"><header className="ir-header"><div><div className="ir-brand"><Settings2 size={25}/><h1>巡检设置</h1></div><p>管理员配置分组、题目、模型与巡检时间。</p></div><div className="ir-actions"><ThemeSwitch/><button onClick={closeSettings}><ArrowLeft size={16}/>返回公开页</button></div></header>{!admin?<div className="ir-empty">{!adminChecked?'正在验证管理员身份…':hostSession()?'当前账号没有巡检设置权限，请返回结果页或使用管理员账号登录。':'仅管理员可以查看巡检设置，请先登录管理员账号。'}</div>:<><ResultAccess/><AdminSettings onChange={load}/></>}</main>;
  return <main className={'ir-app ir-console'+(tab==='scheduled'?' ir-inspection-results':'')}>
    <header className="ir-header">
      <div className="ir-brand"><Activity size={23}/><h1>模型质量巡检</h1></div>
      <nav className="ir-nav" aria-label="检测入口"><button className={tab==='scheduled'?'active':''} onClick={()=>setTab('scheduled')}>定时巡检</button><button className={tab==='key'?'active':''} onClick={()=>setTab('key')}>Key 检测</button></nav>
      <div className="ir-actions">{admin&&<button onClick={openSettings}><Settings2 size={16}/>巡检设置</button>}<ThemeSwitch/>
        <button type="button" aria-label={refreshLabel} title={refreshLabel} aria-busy={refreshing}
          disabled={refreshing||(tab==='key'&&!hostSession())} onClick={refresh}>
          {refreshStatus==='done'?<Check size={17} aria-hidden="true"/>:<RefreshCw size={17} className={refreshing?'spin':undefined} aria-hidden="true"/>}
        </button>
        <span className="ir-refresh-status" role="status">{refreshStatus&&refreshLabel}</span>
      </div>
    </header>
    {(refreshError||(tab==='scheduled'&&error))&&<p role="alert" className="ir-error">{refreshError||error}</p>}
    <div className="ir-scheduled-pane" hidden={tab!=='scheduled'}>{data?(group?<ResultViewer key={group.id} group={group} refreshRef={scheduledViewer} admin={admin} historyHours={data.history_hours} groupControls={<div className="ir-groups" aria-label="检测分组">{data.groups.map(item=><button key={item.id} aria-pressed={group.id===item.id} className={group.id===item.id?'active':''} onClick={()=>setGroupId(item.id)}>{item.name}</button>)}</div>}/>:<div className="ir-empty">还没有已配置的分组巡检。</div>):<div className="ir-empty">{error?'暂时无法查看结果，请根据上方提示重新登录或重试。':'正在加载分组…'}</div>}</div>
    {tab==='key'&&<KeyCheck refreshRef={keyViewer}/>}
  </main>;
}
