from load import *
import sys
words=[w.strip().upper() for w in open('/Users/pomoika/Documents/GitHub_repo/scrabble/data/enable.txt') if w.strip()]
W=np.zeros((len(words),26),np.int8); M=np.zeros(len(words),np.int64); S=np.zeros(len(words),np.int32); Ln=np.array([len(w) for w in words])
for i,w in enumerate(words):
    for c in w: W[i,ord(c)-65]+=1
    M[i]=sum(1<<(ord(c)-65) for c in set(w)); S[i]=wscore(w)
def best(rack,minlen):
    rm=0
    for i in range(26):
        if rack[i]: rm|=1<<i
    cand=np.where(((M & ~rm)==0)&(Ln>=minlen)&(Ln<=rack.sum()))[0]
    if not len(cand): return None
    ok=cand[(W[cand]<=rack).all(1)]
    if not len(ok): return None
    j=ok[np.argmax(S[ok])]; return j
a=pd.read_pickle('aucs.pkl'); a=a[a.standard&a.top.notna()]
G={**{l:'vowel' for l in 'AEIOU'},**{l:'LNRST' for l in 'LNRST'},**{l:'DG' for l in 'DG'},**{l:'BCMP' for l in 'BCMP'},**{l:'FHVWY' for l in 'FHVWY'},'K':'K',**{l:'JQXZ' for l in 'JQXZ'}}
def run(g,start,cap,price_col='top',reserve=0,hold=7,endgame=6,maxrack=12):
    rack=np.zeros(26,np.int8)
    for c in start: rack[ord(c)-65]+=1
    bal=100;score=0;nb=0;spent=0
    def liquidate(minlen):
        nonlocal bal,score
        while True:
            j=best(rack,minlen)
            if j is None: break
            rack[:]-=W[j]; bal+=S[j]; score+=S[j]
    for r in g.itertuples():
        if r.rem==0: break
        price=getattr(r,price_col)
        c=cap(r.letter,r.rem)
        win = (c>r.top) if price_col=='top' else (c>=r.paid)
        if win and bal-price>=reserve*r.rem/67 and rack.sum()<maxrack:
            rack[ord(r.letter)-65]+=1; bal-=price; spent+=price; nb+=1
            liquidate(hold if r.rem>endgame else 2)
        elif r.rem<=endgame: liquidate(2)
    return score,nb,spent,bal,int(rack.sum())
P=pd.read_pickle('players.pkl')
rules={
 'flat6':lambda l,rem:6,'flat8':lambda l,rem:8,'flat10':lambda l,rem:10,'flat12':lambda l,rem:12,'flat14':lambda l,rem:14,
 'group(v/LNRST 9,DG 11,BCMP/FHVWY 13,K 15,JQXZ 0)':lambda l,rem:{'vowel':9,'LNRST':9,'DG':11,'BCMP':13,'FHVWY':13,'K':15,'JQXZ':0}[G[l]],
 'flat16':lambda l,rem:16,'flat18':lambda l,rem:18,'flat20':lambda l,rem:20,
 'group x1.4 (v/LNRST 13,DG 15,BCMP/FHVWY 18,K 21,JQXZ 31)':lambda l,rem:{'vowel':13,'LNRST':13,'DG':15,'BCMP':18,'FHVWY':18,'K':21,'JQXZ':31}[G[l]],
 'group+JQXZ22':lambda l,rem:{'vowel':9,'LNRST':9,'DG':11,'BCMP':13,'FHVWY':13,'K':15,'JQXZ':22}[G[l]],
}
mode=sys.argv[1] if len(sys.argv)>1 else 'main'
rng=np.random.default_rng(7)
mids=sorted(a.match.unique())
if mode=='quick': mids=mids[::3]
out=[]
for mid in mids:
    g=a[a.match==mid].sort_values('idx')
    c=collections.Counter(BAG); c.subtract(collections.Counter(g.letter)); pool=[l for l in c for _ in range(max(0,c[l]))]
    start=''.join(rng.choice(pool,5,replace=False))
    sc=P[P.match==mid].score.values
    created=g.created.iloc[0]
    for name,cap in rules.items():
        for pcol in (['top','paid'] if name in ('flat8','flat10') else ['top']):
            for res,hold in ([(0,7)] if name not in ('flat10','flat12','flat16') else [(0,7),(40,7),(0,5)]):
                s,nb,sp,bal,left=run(g,start,cap,pcol,res,hold)
                out.append(dict(match=mid,rule=name,price=pcol,reserve=res,hold=hold,score=s,nbuy=nb,spent=sp,endbal=bal,left=left,rank=1+(sc>s).sum(),win=int(s>sc.max()),tablemax=sc.max(),created=created))
O=pd.DataFrame(out); O.to_pickle(f'cf_{mode}.pkl')
O['period']=np.where(pd.to_datetime(O.created,unit='ms')<pd.Timestamp('2026-10-31'),'Oct24-30','Oct31-Nov7')
print('matches',O.match.nunique())
print(O.groupby(['rule','price','reserve','hold']).agg(score=('score','mean'),sd=('score','std'),nbuy=('nbuy','mean'),avgp=('spent','sum'),endbal=('endbal','mean'),left=('left','mean'),rank=('rank','mean'),win=('win','mean')).assign(avgp=lambda d:d.avgp/O.groupby(['rule','price','reserve','hold']).nbuy.sum()).round(2).to_string())
print(O[O.price=='top'].groupby(['period','rule','reserve','hold']).agg(score=('score','mean'),win=('win','mean'),rank=('rank','mean'),tablemax=('tablemax','mean')).round(2).to_string())
