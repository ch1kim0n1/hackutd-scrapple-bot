import sys,random,itertools,collections
words=[w.strip().upper() for w in open(sys.argv[1]) if w.strip()]
DIST=dict(A=9,B=2,C=2,D=4,E=12,F=2,G=3,H=2,I=9,J=1,K=1,L=4,M=2,N=6,O=8,P=2,Q=1,R=6,S=4,T=6,U=4,V=2,W=2,X=1,Y=2,Z=1)
VAL=dict(A=1,B=3,C=3,D=2,E=1,F=4,G=2,H=4,I=1,J=8,K=5,L=1,M=3,N=1,O=1,P=3,Q=10,R=1,S=1,T=1,U=1,V=4,W=4,X=8,Y=4,Z=10)
A7={}
for w in words:
    if len(w)==7:
        a=''.join(sorted(w)); c=collections.Counter(a)
        if all(DIST[k]>=v for k,v in c.items()): A7[a]=int(3*sum(VAL[ch] for ch in w))
bag=[k for k,v in DIST.items() for _ in range(v)]
# reward distribution of 7-letter words, weighted by draw probability (multivariate hypergeometric)
from math import comb
tot=0;wsum=0;rs=[]
for a,r in A7.items():
    c=collections.Counter(a); p=1
    for k,v in c.items(): p*=comb(DIST[k],v)
    tot+=p; wsum+=p*r; rs.append(r)
rs.sort()
print('7-letter alphagram reward: draw-weighted mean',round(wsum/tot,1),'unweighted median',rs[len(rs)//2],'p10',rs[len(rs)//10],'p90',rs[9*len(rs)//10])
random.seed(3); N=40000
hits=collections.Counter(); valid=collections.Counter(); base=0
for _ in range(N):
    r=random.sample(bag,7); c=collections.Counter(r)
    if ''.join(sorted(r)) in A7: base+=1
    for x in DIST:
        if c[x]>=DIST[x]: continue
        valid[x]+=1
        rr=sorted(r+[x])
        if any(''.join(rr[:i]+rr[i+1:]) in A7 for i in range(8)): hits[x]+=1
print('base P(7 random tiles form a 7-word)=',round(base/N,4))
print('P(7 random tiles + X contain a 7-letter word), N=40000:')
print(' '.join(f'{x}:{hits[x]/valid[x]:.3f}' for x in sorted(DIST,key=lambda x:-hits[x]/valid[x])))
