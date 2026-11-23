import React,{useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {ChevronDown,Code2,Copy,Expand,Info,Pause,Play,X} from 'lucide-react';
import {request} from './console-client.js';
import {endpoint} from './endpoints.js';
import {batches,clock,isDrawing,selectedRecord,sourceName,verdict} from './inspection-view.js';
import Select from './select.jsx';

const sourceOptions=[
  {value:'',label:'全部来源'},
  {value:'admin',label:'定时巡检'},
  {value:'user',label:'用户 Key 检测'}
];

function ArtworkFrame({url}) {
  const stage=useRef(null);
  const [scale,setScale]=useState(1);
  useLayoutEffect(()=>{
    const observer=new ResizeObserver(([entry])=>{
      const {width,height}=entry.contentRect;
      setScale(Math.min(width/1200,height/750));
    });
    observer.observe(stage.current);
    return()=>observer.disconnect();
  },[]);
  return <div className="ir-artwork-stage" ref={stage}><iframe className="ir-artwork" title="鹈鹕骑车检测作品" sandbox="allow-scripts" referrerPolicy="no-referrer" src={endpoint(url)} style={{width:1200,height:750,transform:`translate(-50%,-50%) scale(${scale})`}}/></div>;
}

export function ResultBody({record,detail,loading=false,renderUrls=null,compact=false}) {
  const [preview,setPreview]=useState(true),[code,setCode]=useState(false),[prompt,setPrompt]=useState(false),[expanded,setExpanded]=useState(false),[copied,setCopied]=useState(false),[copyError,setCopyError]=useState(''),[round,setRound]=useState(0);
  const textRef=useRef(null),dialog=useRef(null),contentPane=useRef(null),promptId=useId();
  useEffect(()=>{setPreview(true);setCode(false);setPrompt(false);setExpanded(false);setCopied(false);setCopyError('');setRound(0);dialog.current?.close();},[record?.id]);
  useLayoutEffect(()=>{if(expanded)dialog.current?.showModal();},[expanded]);
  useLayoutEffect(()=>{if(contentPane.current)contentPane.current.scrollTop=0;},[record?.id,round,code]);
  const rounds=detail?.rounds||[],selected=rounds[round]||rounds[0],text=selected?.response||'',drawing=isDrawing(record);
  const bytes=new TextEncoder().encode(text).length;
  const expected=detail?.expected;
  const renderUrl=renderUrls?.[round];
  async function copy(){try{await navigator.clipboard.writeText(text);setCopied(true);setCopyError('');}catch{setCode(true);setCopyError('浏览器未允许复制，请在源码区域选中后复制。');textRef.current?.focus();}}
  return <div className={'ir-result-body'+(compact?' ir-result-body-compact':'')}>
    <div className="ir-result-toolbar">
      <div className="ir-meta">{compact&&record.slot&&<time title={'开始 '+clock(record.slot,true)+(record.finished_at?' · 结束 '+clock(record.finished_at,true):'')}>{clock(record.slot)}</time>}<span>耗时 <b>{record.duration??'—'} s</b></span><span>思考强度 <b>{record.effort||'—'}</b></span>{drawing&&text&&<span className="ir-source-size">源码 <b>{(bytes/1024).toFixed(1)} KB</b></span>}{!compact&&<span className={'ir-status '+record.status}>{verdict(record)}</span>}</div>
      <div className="ir-tools">
        {compact&&detail?.prompt&&<button aria-expanded={prompt} aria-controls={promptId} onClick={()=>setPrompt(value=>!value)}>题目<ChevronDown size={14} className={prompt?'ir-chevron-open':''}/></button>}
        {text&&<>{drawing&&<button aria-label={preview?'停止预览':'播放预览'} title={preview?'停止预览':'播放预览'} onClick={()=>setPreview(value=>!value)}>{preview?<Pause size={15}/>:<Play size={15}/>}</button>}<button aria-pressed={code} onClick={()=>setCode(value=>!value)}><Code2 size={15}/>{code?'返回结果':drawing?'查看源码':'原始回答'}</button><button onClick={copy}><Copy size={15}/>{copied?'已复制':'复制'}</button>{drawing&&renderUrl&&<button onClick={()=>setExpanded(true)}><Expand size={15}/>放大查看</button>}</>}
      </div>
    </div>
    {detail?.prompt&&(compact?<div className="ir-prompt-panel" id={promptId} hidden={!prompt}><p className="ir-prompt">{detail.prompt}</p></div>:<p className="ir-prompt">题目：{detail.prompt}</p>)}
    {rounds.length>1&&<div className="ir-models" aria-label="独立回答次数">{rounds.map((item,i)=><button key={i} aria-pressed={round===i} onClick={()=>{setRound(i);setCopied(false);}} className={round===i?'active':''}>第 {i+1} 次 · {verdict({...record,status:item.status})}</button>)}</div>}
    {copyError&&<p role="status">{copyError}</p>}
    <div className={'ir-result-content'+(drawing&&!code?' ir-result-content-artwork':'')} ref={contentPane} role="region" aria-label={code?'原始回答':drawing?'作品预览':'模型回答'} tabIndex={0}>
    {loading?<div className="ir-empty" role="status">正在加载检测结果…</div>:record.status==='unavailable'?<div className="ir-empty">本轮可尝试的账号均不可用，未能完成检测。</div>:record.content_available===false?<div className="ir-empty">这条历史记录只公开了摘要。</div>:!text?<div className="ir-empty">{verdict(record)}，本次没有可展示的回答。请求失败不作能力判定。</div>:<>
      {code?<pre ref={textRef} tabIndex="0" className="ir-code">{text}</pre>:drawing?<>{preview?(!renderUrl?<p role="status">正在准备作品预览…</p>:<ArtworkFrame key={record.id+':'+round} url={renderUrl}/>):<div className="ir-preview-stopped">预览已停止，播放时会从头开始。</div>}</>:<><div className={'ir-verdict '+record.status}><strong>{verdict(record)}</strong>{expected!==null&&expected!==undefined&&<span>标准答案：{typeof expected==='object'?JSON.stringify(expected):String(expected)}</span>}{selected?.answer!==null&&selected?.answer!==undefined&&<span>识别答案：{String(selected.answer)}</span>}</div><pre tabIndex="0" className="ir-answer">{text}</pre></>}
    </>}
    </div>
    {drawing&&text&&<p className="ir-footnote">本轮模型生成 · 作品供人工比较，生成完成不代表质量通过。</p>}
    {drawing&&renderUrl&&<dialog className="ir-artwork-dialog" ref={dialog} aria-label="放大查看作品" onClose={()=>setExpanded(false)}><header><strong>{record.model} · {record.title||'鹈鹕骑车'}</strong><button aria-label="关闭放大预览" onClick={()=>dialog.current.close()}><X size={20}/></button></header>{expanded&&<ArtworkFrame url={renderUrl}/>}</dialog>}
  </div>;
}

export default function ResultViewer({group,stamp,admin=false,groupControls,historyHours}) {
  const [rows,setRows]=useState([]),[batchId,setBatchId]=useState(''),[model,setModel]=useState(''),[topic,setTopic]=useState(''),[source,setSource]=useState(''),[recordId,setRecordId]=useState(''),[detail,setDetail]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const detailPane=useRef(null);
  useEffect(()=>{setRows([]);setBatchId('');setDetail(null);setError('');setLoading(true);},[group.id,admin]);
  useEffect(()=>{let alive=true;request(`/api/${admin?'admin':'public'}/groups/${group.id}/history`,'GET',undefined,admin).then(value=>{if(alive){setRows(value.runs);setError('');setLoading(false);}}).catch(e=>{if(alive){setError(e.message);setLoading(false);}});return()=>{alive=false;};},[group.id,stamp,admin]);
  const rounds=batches(rows,topic,source),batch=rounds.find(row=>row.id===batchId)||rounds[0];
  const models=[...new Set(batch?.rows.map(row=>row.model)||[])],activeModel=models.includes(model)?model:models[0];
  const current=selectedRecord(batch,activeModel,'',recordId),samples=batch?.rows.filter(row=>row.model===activeModel)||[];
  useLayoutEffect(()=>{
    if(detailPane.current)detailPane.current.scrollTop=0;
  },[current?.id]);
  useEffect(()=>{let alive=true;async function load(){if(!current)return;try{const value=await request(`/api/${admin?'admin':'public'}/records/${current.id}`);if(alive){setDetail(value);setError('');}}catch(e){if(alive){setDetail(null);setError(e.message);}}}setDetail(null);load();const timer=setInterval(load,300000);return()=>{alive=false;clearInterval(timer);};},[current?.id,admin]);
  const topics=[...new Map(rows.map(row=>[row.kind,row.title||row.kind])).entries()];
  return <section className="ir-viewer" aria-label={group.name+'检测结果'}>
    <header className="ir-viewer-head">
      {groupControls}
      <div className="ir-filters">
        <Select label="题目筛选" className="quality-select-compact" value={topic} onChange={setTopic}
          options={[{value:'',label:'全部题目'},...topics.map(([value,label])=>({value,label}))]}/>
        <Select label="来源筛选" className="quality-select-compact" value={source} onChange={setSource} options={sourceOptions}/>
        <details className="ir-results-info"><summary aria-label="结果展示说明"><Info size={17}/></summary><p>保留 {historyHours} 小时内的结果，每 30 秒刷新。作品供人工比较；请求失败与答案错误分别记录。巡检账号仅管理员可见。</p></details>
      </div>
    </header>
    {error&&<p className="ir-error" role="alert">{error}</p>}
    {loading?<div className="ir-empty">正在加载检测记录…</div>:!rounds.length?<div className="ir-empty">{rows.length?'此筛选下没有记录。':'还没有检测结果，完成巡检后会在这里展示。'}</div>:<div className="ir-reader">
      <aside className="ir-timeline" aria-label="检测记录">
        <div className="ir-timeline-head"><strong>检测记录 <span>{rounds.length} 轮</span></strong><span>北京时间</span></div>
        <div className="ir-timeline-list" role="region" aria-label="检测记录列表" tabIndex={0}>
          {rounds.map((item,index)=><button key={item.id} aria-pressed={batch.id===item.id} className={'ir-round '+(batch.id===item.id?'active':'')} onClick={()=>{setBatchId(item.id);setRecordId('');}}>
            <div><time>{clock(item.slot)}</time><small>{index===0?'最新一轮':sourceName(item.source)}</small></div>
            {item.rows.map(row=><div className="ir-round-line" key={row.id}><span className={'ir-dot '+row.status}/><span>{row.model}</span><b>{verdict(row)}</b><small>{row.duration??'—'}s</small></div>)}
          </button>)}
        </div>
      </aside>
      <article className="ir-result" ref={detailPane} aria-label="检测详情" tabIndex={0}>
        <div className="ir-result-head">
          <div className="ir-result-title">{models.length===1?<strong className="ir-model-name">{activeModel}</strong>:<div className="ir-models" aria-label="检测模型">{models.map(value=><button key={value} aria-pressed={activeModel===value} className={activeModel===value?'active':''} onClick={()=>{setModel(value);setRecordId('');}}>{value}</button>)}</div>}<h2>{current?.title}</h2><span>{sourceName(current?.source)}</span></div>
          {current&&<span className={'ir-status '+current.status}>{verdict(current)}</span>}
        </div>
        {samples.length>1&&<Select label="选择检测结果" className="quality-select-record" value={current?.id||''} onChange={setRecordId}
          options={samples.map((row,index)=>({value:row.id,label:`${row.title} · 样本 ${index+1}`}))}/>}
        {current&&<>
          {admin&&current.account_id&&<div className="ir-origin"><strong>检测账号 #{current.account_id} {current.account_name}</strong></div>}
          {current.hidden_from_results&&<p className="ir-note">该账号本轮有明确答错，仅管理员可见，结果页已隐藏。</p>}
          <ResultBody key={current.id} record={current} detail={detail} loading={!detail&&!error} renderUrls={detail?.render_urls||[]} compact/>
        </>}
      </article>
    </div>}
  </section>;
}
