const PEAK=21,SIGMA=22;
const C=d=>(d>110||d<-40)?0:0.05+0.95*Math.exp(-((d-PEAK)**2)/(2*SIGMA**2));
for(const d of [110,70,43,42,21,0,-21,-40]) console.log(`C(${d})=${C(d).toFixed(4)}`);
console.log(`S(21,P=30,H=20)=${((70*100*C(21)+40*30+30*20)/140).toFixed(2)}`);
console.log(`S(0,P=30,H=20)=${((70*100*C(0)+40*30+30*20)/140).toFixed(2)}`);
