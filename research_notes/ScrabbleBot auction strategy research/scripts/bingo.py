import sys,random,itertools,collections
words=[w.strip().upper() for w in open(sys.argv[1]) if w.strip()]
DIST=dict(A=9,B=2,C=2,D=4,E=12,F=2,G=3,H=2,I=9,J=1,K=1,L=4,M=2,N=6,O=8,P=2,Q=1,R=6,S=4,T=6,U=4,V=2,W=2,X=1,Y=2,Z=1)
VAL=dict(A=1,B=3,C=3,D=2,E=1,F=4,G=2,H=4,I=1,J=8,K=5,L=1,M=3,N=1,O=1,P=3,Q=10,R=1,S=1,T=1,U=1,V=4,W=4,X=8,Y=4,Z=10)
assert sum(DIST.values())==98
def feasible(a):
    c=collections.Counter(a); return all(DIST[k]>=v for k,v in c.items())
A7=collections.Counter(); A8=set()
for w in words:
    if len(w)==7 and feasible(w): A7[''.join(sorted(w))]+=1
    if len(w)==8 and feasible(w): A8.add(''.join(sorted(w)))
print('ENABLE words',len(words),'7-letter alphagrams (bag-feasible)',len(A7),'7-letter words',sum(A7.values()),'8-letter alphagrams',len(A8))
# stems: 6-multisets -> completing letters
stems=collections.defaultdict(set)
for a in A7:
    for i in range(7):
        s=a[:i]+a[i+1:]; stems[s].add(a[i])
def p1(stem,lets):
    c=collections.Counter(stem); rem=98-6
    return sum(DIST[x]-c[x] for x in lets)/rem
rank=sorted(stems.items(), key=lambda kv:-p1(kv[0],kv[1]))
print('\nTop 25 six-letter stems by P(one random draw from full bag minus stem completes a 7):')
for s,l in rank[:25]:
    n7=sum(A7[''.join(sorted(s+x))] for x in l)
    print(f'{s} completers={len(l)} p1={p1(s,l):.3f} words7={n7} letters={"".join(sorted(l))}')
for s in ['AEIRST','AEINRT','AEINST','EINRST','ADEIRS','AEILRS','AEINRS','EIRSST','AEIRSS','DEINRS','AEILNS','AEILNT','AEERST','AEINRS']:
    l=stems.get(s,set()); print(s,len(l),round(p1(s,l),3),''.join(sorted(l)))
# bag sampling
bag=[k for k,v in DIST.items() for _ in range(v)]
A7set=set(A7)
def has7(rack):
    r=''.join(sorted(rack))
    if len(r)==7: return r in A7set
    for comb in set(itertools.combinations(r,7)):
        if ''.join(comb) in A7set: return True
    return False
def has8(rack):
    r=''.join(sorted(rack))
    if len(r)<8: return False
    for comb in set(itertools.combinations(r,8)):
        if ''.join(comb) in A8: return True
    return False
random.seed(1)
print('\nP(random n-tile rack from 98-tile bag contains a 7-letter word) [and 8-letter]:')
for n,N in [(7,200000),(8,60000),(9,30000),(10,15000),(11,8000),(12,5000)]:
    h=h8=0
    for _ in range(N):
        r=random.sample(bag,n)
        if has7(r): h+=1
        if n>=8 and has8(r): h8+=1
    print(f'n={n} N={N} P7={h/N:.4f} P8={h8/N:.4f}')
# marginal per-letter value: random 6-tile rack + letter X -> P(7-word)
random.seed(2)
N=200000; base=0; hits=collections.Counter(); valid=collections.Counter()
for _ in range(N):
    r=random.sample(bag,6); s=''.join(sorted(r)); c=collections.Counter(r)
    comp=stems.get(s,set())
    for x in DIST:
        if c[x]<DIST[x]:
            valid[x]+=1
            if x in comp: hits[x]+=1
print('\nP(6 random tiles + letter X form a 7-letter word), N=200000 six-tile racks:')
tot=sorted(((hits[x]/valid[x],x) for x in DIST),reverse=True)
print(' '.join(f'{x}:{p:.4f}' for p,x in tot))
