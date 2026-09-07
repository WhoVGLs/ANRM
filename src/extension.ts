import * as vscode from "vscode";
import { Monitor } from "./monitor";

let monitor: Monitor | undefined;

class MonitorViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private pendingMessages: unknown[] = [];
  private commandCallback?: (command: string) => void;

  onCommand(callback: (command: string) => void) {
    this.commandCallback = callback;
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = getWebviewHtml();
    view.webview.onDidReceiveMessage(message => this.commandCallback?.(message.type));
    for (const message of this.pendingMessages) void view.webview.postMessage(message);
    this.pendingMessages = [];
  }

  postMessage(message: unknown) {
    if (this.view) void this.view.webview.postMessage(message);
    else this.pendingMessages.push(message);
  }

  async reveal() {
    await vscode.commands.executeCommand("workbench.view.extension.cppRuntimeMonitor");
    this.view?.show(true);
  }
}

export function activate(context: vscode.ExtensionContext) {
  const monitorView = new MonitorViewProvider();
  monitorView.onCommand(command => {
    if (command === "start") void startMonitor(monitorView);
    if (command === "stop") {
      monitor?.stop();
      monitor = undefined;
      monitorView.postMessage({ type: "stopped" });
    }
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("cppRuntimeMonitor.view", monitorView)
  );

    context.subscriptions.push(
      vscode.commands.registerCommand("cppRuntimeMonitor.start", () => startMonitor(monitorView))
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("cppRuntimeMonitor.stop", () => {
            monitor?.stop();
            monitor = undefined;
          monitorView.postMessage({ type: "stopped" });
            vscode.window.setStatusBarMessage("ANRM monitoring stopped.", 2000);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("cppRuntimeMonitor.moveToActiveGroup", async () => {
          await monitorView.reveal();
        })
    );

      context.subscriptions.push({ dispose: () => monitor?.stop() });
}

async function startMonitor(monitorView: MonitorViewProvider) {
    const input = await vscode.window.showInputBox({
        prompt: "Enter the PID of the C++ program you want to monitor",
        placeHolder: "Example: 12345",
        validateInput: value => {
            const pid = Number(value);
            return Number.isInteger(pid) && pid > 0 ? undefined : "Enter a valid positive PID.";
        }
    });
    if (!input) return;

    const pid = Number(input);
    if (!Monitor.pidExists(pid)) {
        vscode.window.showErrorMessage(`Process ${pid} does not exist.`);
        return;
    }

    const cfg = vscode.workspace.getConfiguration("cppRuntimeMonitor");
    const refreshMs = cfg.get<number>("refreshMs", 1000);
    const historySeconds = cfg.get<number>("historySeconds", 60);

    monitor?.stop();
    monitorView.postMessage({ type:"config", refreshMs, historySeconds });

    monitor = new Monitor(pid, refreshMs);
    monitor.onSample(sample => monitorView.postMessage({ type:"sample", sample }));
    monitor.onExit(() => {
      monitorView.postMessage({ type:"processExit" });
        vscode.window.showInformationMessage(`Process ${pid} has exited.`);
    });
    monitor.start();
    await monitorView.reveal();
}

function getWebviewHtml(): string {
    const nonce = getNonce();

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
:root {
  color-scheme: light dark;
  --monitor-accent: #61d98b;
  --monitor-warning: #e5c07b;
  --monitor-danger: #e06c75;
  --monitor-surface: transparent;
}
body {
  font-family: var(--vscode-font-family);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  margin: 0;
  padding: 10px 10px 16px;
  min-width: 0;
}
h1 { margin:0; font-size:15px; line-height:18px; letter-spacing:.01em; }
.header { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:10px; }
.sub { color:var(--vscode-descriptionForeground); font-size:10px; margin:2px 0 0; }
#status { color:var(--vscode-descriptionForeground); font-size:10px; line-height:16px; white-space:nowrap; }
#status::before { content:""; display:inline-block; width:6px; height:6px; margin:0 5px 1px 0; border-radius:50%; background:var(--vscode-descriptionForeground); }
.running { color:var(--monitor-accent); }
.running::before { background:var(--monitor-accent) !important; box-shadow:0 0 0 3px color-mix(in srgb, var(--monitor-accent) 18%, transparent); }
.stopped { color:var(--monitor-danger); }
.stopped::before { background:var(--monitor-danger) !important; }
.idle::before { background:var(--monitor-warning) !important; }
.grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:5px;
}
.card {
  border:1px solid var(--vscode-panel-border);
  border-radius:4px;
  padding:8px 7px;
  min-width:0;
  background:transparent;
}
.label { color:var(--vscode-descriptionForeground); font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
.value { font-size:15px; font-weight:600; line-height:18px; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.peak { color:var(--vscode-descriptionForeground); font-size:10px; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.section { display:flex; align-items:center; gap:6px; font-weight:600; font-size:11px; margin:13px 0 6px; }
.section::after { content:""; height:1px; flex:1; background:var(--vscode-panel-border); }
.performance-panel {
  border:1px solid var(--vscode-panel-border);
  border-radius:5px;
  padding:0 8px;
  background:transparent;
}
.panel-caption { color:var(--vscode-descriptionForeground); font-size:10px; padding:8px 0 2px; }
.chart-wrap { min-width:0; padding:8px 0; }
.chart-wrap + .chart-wrap { border-top:1px solid color-mix(in srgb, var(--vscode-panel-border) 70%, transparent); }
.chart-title { display:flex; justify-content:space-between; color:var(--vscode-foreground); font-size:11px; font-weight:500; margin-bottom:4px; }
.chart-unit { color:var(--vscode-descriptionForeground); font-size:10px; font-weight:400; }
.chart-plot { display:grid; grid-template-columns:28px minmax(0,1fr); gap:5px; align-items:stretch; }
.axis-labels { display:flex; flex-direction:column; justify-content:space-between; padding:8px 0; color:var(--vscode-descriptionForeground); font-size:10px; line-height:12px; text-align:right; }
canvas{
  width:100%;
  height:104px;
  display:block;
  border:1px solid color-mix(in srgb, var(--vscode-panel-border) 80%, transparent);
  border-radius:4px;
  background:transparent;
}
#diagnostics{
  border:1px solid var(--vscode-panel-border);
  border-radius:4px;
  padding:8px;
  font-size:11px;
  line-height:1.5;
  background:transparent;
}
.ok { color:var(--vscode-foreground); }
.warn { color:var(--monitor-warning); }
</style>
</head>
<body>
<div class="header">
  <div><h1>ANRM</h1><div class="sub">Unix process monitor</div></div>
  <div id="status" class="idle">Ready</div>
</div>

<div class="grid">
<div class="card"><div class="label">CPU</div><div class="value" id="cpu">--</div><div class="peak" id="cpuPeak">Peak: --</div></div>
<div class="card"><div class="label">Memory</div><div class="value" id="ram">--</div><div class="peak" id="ramPeak">Peak: --</div></div>
<div class="card"><div class="label">GPU</div><div class="value" id="gpu">--</div><div class="peak" id="gpuPeak">Peak: --</div></div>
<div class="card"><div class="label">VRAM</div><div class="value" id="vram">--</div><div class="peak" id="vramPeak">Peak: --</div></div>
<div class="card"><div class="label">Runtime</div><div class="value" id="runtime">--</div></div>
<div class="card"><div class="label">PID</div><div class="value" id="pid">--</div></div>
</div>
<div class="section">Performance</div>
<div class="performance-panel">
  <div class="panel-caption">Recent activity · rolling history</div>
  <div class="chart-wrap"><div class="chart-title"><span>CPU usage</span><span class="chart-unit" id="cpuNow">--</span></div><div class="chart-plot"><div class="axis-labels"><span id="cpuMax">--</span><span id="cpuMin">--</span></div><canvas id="cpuChart"></canvas></div></div>
  <div class="chart-wrap"><div class="chart-title"><span>Memory usage</span><span class="chart-unit" id="ramNow">--</span></div><div class="chart-plot"><div class="axis-labels"><span id="ramMax">--</span><span id="ramMin">--</span></div><canvas id="ramChart"></canvas></div></div>
  <div class="chart-wrap"><div class="chart-title"><span>GPU usage</span><span class="chart-unit" id="gpuNow">--</span></div><div class="chart-plot"><div class="axis-labels"><span id="gpuMax">--</span><span id="gpuMin">--</span></div><canvas id="gpuChart"></canvas></div></div>
  <div class="chart-wrap"><div class="chart-title"><span>Video memory</span><span class="chart-unit" id="vramNow">--</span></div><div class="chart-plot"><div class="axis-labels"><span id="vramMax">--</span><span id="vramMin">--</span></div><canvas id="vramChart"></canvas></div></div>
</div>
<div class="section">Diagnostics</div>
<div id="diagnostics">Start a process monitor to see runtime diagnostics.</div>

<script nonce="${nonce}">
const history={cpu:[],ram:[],gpu:[],vram:[]};
let maxPoints=60;

window.addEventListener("message",event=>{
  const m=event.data;
  if(m.type==="config") maxPoints=Math.max(10,Math.round(m.historySeconds*1000/m.refreshMs));
  if(m.type==="sample") render(m.sample);
  if(m.type==="processExit") stopText("● Process exited");
  if(m.type==="stopped") stopText("● Monitoring stopped");
});

function render(s){
  setStatus("Monitoring", "running");
  setText("cpu",fmt(s.cpu)+" %"); setText("cpuPeak","Peak: "+fmt(s.cpuPeak)+" %");
  setText("ram",fmt(s.ramMb)+" MB"); setText("ramPeak","Peak: "+fmt(s.ramPeakMb)+" MB");
  setText("gpu",s.gpuPercent===null?"N/A":fmt(s.gpuPercent)+" %");
  setText("gpuPeak","Peak: "+(s.gpuPeakPercent===null?"N/A":fmt(s.gpuPeakPercent)+" %"));
  setText("vram",s.vramMb===null?"N/A":fmt(s.vramMb)+" MB");
  setText("vramPeak","Peak: "+(s.vramPeakMb===null?"N/A":fmt(s.vramPeakMb)+" MB"));
  setText("runtime",formatRuntime(s.runtimeSec)); setText("pid",String(s.pid));
  setText("cpuNow",fmt(s.cpu)+" %"); setText("ramNow",fmt(s.ramMb)+" MB");
  setText("gpuNow",s.gpuPercent===null?"N/A":fmt(s.gpuPercent)+" %");
  setText("vramNow",s.vramMb===null?"N/A":fmt(s.vramMb)+" MB");

  push("cpu",s.cpu); push("ram",s.ramMb); push("gpu",s.gpuPercent); push("vram",s.vramMb);
  draw("cpuChart",history.cpu,100); draw("ramChart",history.ram,null);
  draw("gpuChart",history.gpu,100); draw("vramChart",history.vram,null);

  document.getElementById("diagnostics").innerHTML=s.diagnostics.map(d=>
    '<div class="'+d.level+'">'+escapeHtml(d.text)+'</div>').join("");
}

function push(k,v){
  if(v===null||!Number.isFinite(Number(v))) return;
  history[k].push(Number(v)); while(history[k].length>maxPoints) history[k].shift();
}

function draw(id,values,fixedMax){
  const c=document.getElementById(id),ctx=c.getContext("2d"); if(!ctx)return;
  const dpr=devicePixelRatio||1,w=Math.max(1,c.clientWidth),h=104;
  c.width=Math.round(w*dpr); c.height=Math.round(h*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
  drawGrid(ctx,w,h); if(values.length<2)return;

  let min=Math.min(...values),max=fixedMax??Math.max(...values,1);
  if(fixedMax===null){const r=Math.max(1,max-min);min=Math.max(0,min-r*.1);max+=r*.1;} else min=0;

  const L=5,R=7,T=8,B=8,pw=w-L-R,ph=h-T-B;
  const axisName=id.replace("Chart","");
  setText(axisName+"Max",formatAxis(max));setText(axisName+"Min",formatAxis(min));

  ctx.beginPath();
  values.forEach((v,i)=>{
    const x=L+(i/(values.length-1))*pw;
    const y=T+(1-(v-min)/Math.max(.0001,max-min))*ph;
    i?ctx.lineTo(x,y):ctx.moveTo(x,y);
  });
  const lineColor=getCss("--monitor-accent");
  ctx.lineTo(L+pw,h-B);ctx.lineTo(L,h-B);ctx.closePath();
  ctx.fillStyle=lineColor;ctx.globalAlpha=.12;ctx.fill();ctx.globalAlpha=1;
  ctx.beginPath();
  values.forEach((v,i)=>{
    const x=L+(i/(values.length-1))*pw;
    const y=T+(1-(v-min)/Math.max(.0001,max-min))*ph;
    i?ctx.lineTo(x,y):ctx.moveTo(x,y);
  });
  ctx.strokeStyle=lineColor;ctx.lineWidth=1.5;ctx.stroke();

  const v=values[values.length-1],x=L+pw,y=T+(1-(v-min)/Math.max(.0001,max-min))*ph;
  ctx.fillStyle=lineColor;ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fill();
}

function drawGrid(ctx,w,h){
  const L=5,R=7,T=8,B=8,pw=w-L-R,ph=h-T-B;
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle=getCss("--vscode-panel-border");ctx.globalAlpha=.35;ctx.lineWidth=.55;
  for(let i=0;i<=12;i++){const x=L+pw*i/12;ctx.beginPath();ctx.moveTo(x,T);ctx.lineTo(x,h-B);ctx.stroke();}
  for(let i=0;i<=6;i++){const y=T+ph*i/6;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();}
  ctx.globalAlpha=1;
}

function formatAxis(value){
  if(Math.abs(value)>=1000)return (value/1000).toFixed(1)+"k";
  if(Math.abs(value)>=100)return Math.round(value).toString();
  return value.toFixed(1).replace(/\.0$/,"");
}

function getCss(n){return getComputedStyle(document.body).getPropertyValue(n).trim()||"currentColor"}
function setText(id,v){document.getElementById(id).textContent=v}
function setStatus(text,state){const e=document.getElementById("status");e.textContent=text;e.className=state}
function stopText(v){setStatus(v.replace("● ",""),"stopped")}
function fmt(v){return Number(v).toFixed(1)}
function formatRuntime(sec){sec=Math.max(0,Math.floor(sec));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")}
function escapeHtml(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
window.addEventListener("resize",()=>{draw("cpuChart",history.cpu,100);draw("ramChart",history.ram,null);draw("gpuChart",history.gpu,100);draw("vramChart",history.vram,null)});
</script>
</body>
</html>`;
}

function getNonce(): string {
    const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result="";
    for(let i=0;i<32;i++) result+=chars.charAt(Math.floor(Math.random()*chars.length));
    return result;
}

export function deactivate(){ monitor?.stop(); monitor=undefined; }
