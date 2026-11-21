import{mkdirSync,readdirSync,readFileSync,writeFileSync}from"node:fs";
const I=process.env.MAKEFUN_INPUT_DIR??"/input",O=process.env.MAKEFUN_OUTPUT_DIR??"/output",C="udlr";
let D;
const P=t=>{const r=t.split("\n").filter(x=>x.length),h=r.length,w=Math.max(...r.map(x=>x.length)),n=w*h,W=new Uint8Array(n).fill(1),G=[],B=[];let p=-1;D=[-w,w,-1,1];
r.forEach((s,y)=>{for(let x=0;x<s.length;x++){const c=s[x],i=y*w+x;if(c!="#"){W[i]=0;if(".*+".includes(c))G.push(i);if("$*".includes(c))B.push(i);if("@+".includes(c))p=i}}});
for(let x=0;x<w;x++)W[x]=W[(h-1)*w+x]=1;
for(let y=0;y<h;y++)W[y*w]=W[y*w+w-1]=1;
return{w,W,G,B:B.sort((a,b)=>a-b),p}};
const V=(w,W,G)=>{const v=new Uint8Array(W.length),q=[];for(const g of G){v[g]=1;q.push(g)}
for(let i=0;i<q.length;i++){const x=q[i];for(const d of D){const y=x-d;if(!W[y]&&!W[y-d]&&!v[y]){v[y]=1;q.push(y)}}}return v};
const R=(w,W,K,f,s,m)=>{let l=f;const t=[f];s[f]=m;while(t.length){const p=t.pop();if(p<l)l=p;for(const o of D){const q=p+o;if(!W[q]&&!K[q]&&s[q]!=m){s[q]=m;t.push(q)}}}return l};
const F=(w,W,K,G,t)=>{for(const a of[t,t-1,t-w,t-w-1]){const b=a+1,c=a+w,d=c+1;if((W[a]||K[a])&&(W[b]||K[b])&&(W[c]||K[c])&&(W[d]||K[d])&&((K[a]&&!G[a])||(K[b]&&!G[b])||(K[c]&&!G[c])||(K[d]&&!G[d])))return 1}return 0};
const Wk=(w,W,K,f,t)=>{if(f==t)return"";const pv=new Int32Array(W.length).fill(-1),H=[],q=[f];pv[f]=f;
for(let i=0;i<q.length;i++){const p=q[i];if(p==t)break;for(let j=0;j<4;j++){const s=p+D[j];if(W[s]||K[s]||pv[s]!=-1)continue;pv[s]=p;H[s]=C[j];q.push(s)}}
let s="";for(let p=t;p!=f;p=pv[p])s=H[p]+s;return s};
const S=(w,W,G,B0,p0)=>{const n=W.length,g=new Uint8Array(n);for(const x of G)g[x]=1;
const v=V(w,W,G);if(B0.some(b=>!v[b]))return null;
const K=new Uint8Array(n),s=new Int32Array(n),k2=new Int32Array(n);let m=0;
const key=(b,l)=>String.fromCharCode(l,...b),dn=b=>b.every(x=>g[x]);
const B=[B0],Q=[p0],A=[-1],ix=new Map();
for(const b of B0)K[b]=1;ix.set(key(B0,R(w,W,K,p0,s,++m)),0);for(const b of B0)K[b]=0;
let f=dn(B0)?0:-1;
for(let h=0;f<0&&h<B.length;h++){const bs=B[h];for(const b of bs)K[b]=1;R(w,W,K,Q[h],s,++m);const hr=m;
for(let i=0;i<bs.length;i++){const b=bs[i];
for(let j=0;j<4;j++){if(f>=0)break;const d=D[j],t=b+d;
if(s[b-d]!=hr||W[t]||K[t]||!v[t])continue;
K[b]=0;K[t]=1;let nx=null,kk="";
if(!F(w,W,K,g,t)){nx=bs.slice();nx[i]=t;nx.sort((a,b)=>a-b);kk=key(nx,R(w,W,K,b,k2,++m))}
K[t]=0;K[b]=1;
if(!nx||ix.has(kk))continue;
ix.set(kk,B.length);B.push(nx);Q.push(b);A.push(h);
if(dn(nx))f=B.length-1}
if(f>=0)break}
for(const b of bs)K[b]=0}
if(f<0)return null;
const path=[];for(let x=f;x>0;x=A[x])path.push(x);path.reverse();
let mv="",pl=p0,bs=B0;
for(const x of path){const nb=B[x],fr=bs.find(b=>!nb.includes(b)),to=nb.find(b=>!bs.includes(b)),d=to-fr;
for(const b of bs)K[b]=1;mv+=Wk(w,W,K,pl,fr-d);for(const b of bs)K[b]=0;
mv+=C[D.indexOf(d)];pl=fr;bs=nb}
return{m:mv,p:pl}};
const RO=L=>{const{w,W,G,B,p}=L,n=W.length,v=V(w,W,G),row=(p/w)|0,cut=new Uint8Array(n);
for(let i=row*w;i<(row+1)*w;i++)if(!W[i]&&!v[i])cut[i]=1;
if(B.some(b=>cut[b]))return null;
const part=new Int32Array(n).fill(-1),cs=[];
for(let s=0;s<n;s++){if(W[s]||cut[s]||part[s]>=0)continue;
const cells=[s];part[s]=cs.length;
for(let i=0;i<cells.length;i++)for(let j=0;j<4;j++){const q=cells[i]+D[j];if(!W[q]&&!cut[q]&&part[q]<0){part[q]=cs.length;cells.push(q)}}
cs.push({B:[],G:[]})}
for(const b of B)cs[part[b]].B.push(b);
for(const g of G){if(part[g]<0)return null;cs[part[g]].G.push(g)}
if(cs.some(c=>c.B.length!=c.G.length))return null;
return cs.filter(c=>c.B.length)};
const SL=L=>{const rs=RO(L);if(!rs){const r=S(L.w,L.W,L.G,L.B,L.p);return r?r.m:""}
let pl=L.p,mv="";const dn=rs.map(()=>0);
for(let i=0;i<rs.length;i++){const W=L.W.slice();
rs.forEach((o,j)=>{if(j!=i)for(const b of dn[j]?o.G:o.B)W[b]=1});
const r=S(L.w,W,rs[i].G,rs[i].B,pl);if(!r)return"";mv+=r.m;pl=r.p;dn[i]=1}
return mv};
for(const id of readdirSync(I).sort()){const mv=SL(P(readFileSync(I+"/"+id+"/level.txt","utf8")));mkdirSync(O+"/"+id,{recursive:true});writeFileSync(O+"/"+id+"/solution.txt",mv+"\n")}
