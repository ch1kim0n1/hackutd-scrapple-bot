import sys,struct,collections
data=open(sys.argv[1],'rb').read()
i=0; L={}
def ch(b): return '?' if b==1 else chr(ord('A')+b-5)
while i < len(data):
    n=data[i]; i+=1
    if i+n+2>len(data): break
    lv=''.join(ch(b) for b in data[i:i+n]); i+=n
    frac,intp=data[i],data[i+1]; i+=2
    L[lv]=(intp*256+frac)/256.0-128.0
print('entries',len(L), collections.Counter(len(k) for k in L))
one=sorted(((v,k) for k,v in L.items() if len(k)==1),reverse=True)
print('1-tile:', ' '.join(f'{k}:{v:+.2f}' for v,k in one))
dup=[(k+k,L.get(k+k)) for v,k in one]
print('dup pairs:', ' '.join(f'{a}:{b:+.2f}' for a,b in dup if b is not None))
trip=[(k*3,L.get(k*3)) for v,k in one]
print('triples:', ' '.join(f'{a}:{b:+.2f}' for a,b in trip if b is not None))
for n in (2,3,4,5,6):
    s=sorted(((v,k) for k,v in L.items() if len(k)==n and '?' not in k),reverse=True)
    print(f'top {n} no-blank:', ' '.join(f'{k}:{v:+.1f}' for v,k in s[:20]))
    print(f'bottom {n}:', ' '.join(f'{k}:{v:+.1f}' for v,k in s[-6:]))
for q in ['QU','Q','U','QUA','QI','ER','EQZ','ERR','ERRR','EQYZ','AEIRST','AEINRT','AEINST','EINRST','AEIRS','AERST','EIRST','ERST','AEST','ADEIRS','AEILRS','AEINRS','AEIRT','AEINT','EINST','ADEERS','ADEIRT','AEIRT','AEINR','AEILST','EEINRS','AILNRS','AE','AI','EI','EE','III','IIU','UU','VV','VW','CHS','ING','EINGS','DEINGS','?','??','?S']:
    print(q, None if q not in L else round(L[q],2), end=' | ')
print()
# V/C balance: mean value of 6-tile no-blank leaves by vowel count
vow=set('AEIOU')
by=collections.defaultdict(list)
for k,v in L.items():
    if '?' in k: continue
    by[(len(k),sum(c in vow for c in k))].append(v)
for n in range(1,7):
    print(n, ' '.join(f'v{vc}:{sum(x)/len(x):+.1f}(n={len(x)})' for (m,vc),x in sorted(by.items()) if m==n))
