import * as fs from "node:fs";
import { execFile } from "node:child_process";
import * as os from "node:os";

export interface Diagnostic { level:"ok"|"warn"; text:string; }

export interface MonitorSample {
    pid:number; cpu:number; cpuPeak:number; ramMb:number; ramPeakMb:number;
    gpuPercent:number|null; gpuPeakPercent:number|null;
    vramMb:number|null; vramPeakMb:number|null;
    runtimeSec:number; diagnostics:Diagnostic[];
}

interface GpuSample { percent:number; vramMb:number; }

export class Monitor {
    private timer?:NodeJS.Timeout;
    private previousProcCpu=0; private previousTotalCpu=0;
    private cpuPeak=0; private ramPeakMb=0;
    private gpuPeakPercent:number|null=null; private vramPeakMb:number|null=null;
    private sampleCallback?: (sample:MonitorSample)=>void;
    private exitCallback?: ()=>void;

    constructor(private readonly pid:number, private readonly refreshMs:number){}

    static pidExists(pid:number):boolean{
        try{fs.accessSync(`/proc/${pid}`);return true;}catch{return false;}
    }

    onSample(cb:(sample:MonitorSample)=>void){this.sampleCallback=cb;}
    onExit(cb:()=>void){this.exitCallback=cb;}

    start(){this.stop();this.tick();this.timer=setInterval(()=>this.tick(),this.refreshMs);}
    stop(){if(this.timer){clearInterval(this.timer);this.timer=undefined;}}

    private tick(){
        if(!Monitor.pidExists(this.pid)){this.stop();this.exitCallback?.();return;}
        try{
            const p=readProcessStats(this.pid), total=readTotalCpu();
            const cpu=calculateCpuPercent(p.totalTicks,total,this.previousProcCpu,this.previousTotalCpu,os.cpus().length);
            this.previousProcCpu=p.totalTicks; this.previousTotalCpu=total;
            const ramMb=p.rssBytes/1024/1024;
            this.cpuPeak=Math.max(this.cpuPeak,cpu); this.ramPeakMb=Math.max(this.ramPeakMb,ramMb);
            const runtimeSec=getRuntime(p.startTicks);

            readNvidiaGpu().then(gpu=>{
                if(gpu){
                    this.gpuPeakPercent=this.gpuPeakPercent===null?gpu.percent:Math.max(this.gpuPeakPercent,gpu.percent);
                    this.vramPeakMb=this.vramPeakMb===null?gpu.vramMb:Math.max(this.vramPeakMb,gpu.vramMb);
                }
                this.sampleCallback?.({
                    pid:this.pid,cpu,cpuPeak:this.cpuPeak,ramMb,ramPeakMb:this.ramPeakMb,
                    gpuPercent:gpu?.percent??null,gpuPeakPercent:this.gpuPeakPercent,
                    vramMb:gpu?.vramMb??null,vramPeakMb:this.vramPeakMb,runtimeSec,
                    diagnostics:makeDiagnostics(cpu,ramMb,gpu)
                });
            }).catch(()=>this.sampleCallback?.({
                pid:this.pid,cpu,cpuPeak:this.cpuPeak,ramMb,ramPeakMb:this.ramPeakMb,
                gpuPercent:null,gpuPeakPercent:this.gpuPeakPercent,vramMb:null,
                vramPeakMb:this.vramPeakMb,runtimeSec,diagnostics:makeDiagnostics(cpu,ramMb,null)
            }));
        }catch{this.stop();this.exitCallback?.();}
    }
}

function readProcessStats(pid:number){
    const stat=fs.readFileSync(`/proc/${pid}/stat`,"utf8"), close=stat.lastIndexOf(")");
    const f=stat.slice(close+2).trim().split(/\s+/);
    return {totalTicks:Number(f[11])+Number(f[12]),rssBytes:Number(f[21])*4096,startTicks:Number(f[19])};
}
function readTotalCpu(){
    const line=fs.readFileSync("/proc/stat","utf8").split("\n").find(x=>x.startsWith("cpu "));
    if(!line)throw new Error("Unable to read /proc/stat");
    return line.trim().split(/\s+/).slice(1).reduce((a,v)=>a+Number(v),0);
}
function calculateCpuPercent(now:number,total:number,prev:number,prevTotal:number,count:number){
    if(prev===0||prevTotal===0)return 0; const pd=now-prev,td=total-prevTotal;if(td<=0)return 0;
    return Math.max(0,Math.min((pd/td)*count*100,count*100));
}
function getRuntime(startTicks:number){
    const uptime=Number(fs.readFileSync("/proc/uptime","utf8").split(/\s+/)[0]);
    return Math.max(0,uptime-startTicks/100);
}
function readNvidiaGpu():Promise<GpuSample|null>{
    return new Promise(resolve=>{
        execFile("nvidia-smi",["--query-gpu=utilization.gpu,memory.used","--format=csv,noheader,nounits"],{timeout:700},(err,out)=>{
            if(err)return resolve(null); const line=out.trim().split("\n").find(Boolean); if(!line)return resolve(null);
            const [a,b]=line.split(",").map(v=>v.trim()),percent=Number(a),vramMb=Number(b);
            if(!Number.isFinite(percent)||!Number.isFinite(vramMb))return resolve(null);
            resolve({percent,vramMb});
        });
    });
}
function makeDiagnostics(cpu:number,ramMb:number,gpu:GpuSample|null):Diagnostic[]{
    const r:Diagnostic[]=[];
    r.push(cpu>=90?{level:"warn",text:`CPU is very high (${cpu.toFixed(1)}%).`}:{level:"ok",text:`CPU usage looks normal (${cpu.toFixed(1)}%).`});
    r.push(ramMb>=4096?{level:"warn",text:`RAM usage is high (${ramMb.toFixed(0)} MB).`}:{level:"ok",text:`RAM usage looks normal (${ramMb.toFixed(0)} MB).`});
    if(!gpu)r.push({level:"ok",text:"GPU: NVIDIA GPU not available through nvidia-smi."});
    else r.push(gpu.percent>=95?{level:"warn",text:`GPU utilization is very high (${gpu.percent.toFixed(1)}%).`}:{level:"ok",text:`GPU utilization: ${gpu.percent.toFixed(1)}%.`});
    return r;
}
