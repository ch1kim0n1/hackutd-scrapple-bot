from load import *
import itertools, math, pickle
ms,selfs=load()
h=json.load(open(R+'history.json'))
allm=dict(ms)
for k,v in selfs.items(): allm.setdefault(k,v)
for x in h['matches']: allm.setdefault(x['id'],x)
print('union',len(allm))
words=[w.strip().upper() for w in open('/Users/pomoika/Documents/GitHub_repo/scrabble/data/enable.txt') if w.strip()]
D=set(''.join(sorted(w)) for w in words)
LEAD={18:'LUCENT',114:'Bron',138:'Waupus',166:'Soap'}
# Shapley
cache={}
def shapley(word):
    key=''.join(sorted(word))
    if key in cache: return dict(zip(key,cache[key])) and cache[key], key
    n=len(key); N=1<<n
    v=[0]*N
    for mask in range(1,N):
        letters=''.join(key[i] for i in range(n) if mask>>i&1)
        best=wscore(letters) if (len(letters)>=2 and letters in D) else 0
        m=mask
        while m:
            b=m&-m; best=max(best,v[mask^b]); m^=b
        v[mask]=best
    phi=[0.0]*n
    fact=[math.factorial(i) for i in range(n+1)]
    pc=[bin(m).count('1') for m in range(N)]
    for i in range(n):
        bi=1<<i
        for S in range(N):
            if S&bi: continue
            s=pc[S]
            phi[i]+=fact[s]*fact[n-s-1]/fact[n]*(v[S|bi]-v[S])
    cache[key]=phi
    return phi,key
aucs=[];players=[];plays=[];tiles=[]
viol=collections.Counter()
for mid,m in allm.items():
    A=m['auctions']; P=m['plays']; nA=len(A)
    pids=[q['botId'] for q in m['participants']]
    t0=m['createdAt']
    standard=(len(pids)==6 and nA==68)
    start_ms=None
    if standard:
        c=collections.Counter(BAG); c.subtract(collections.Counter(a['letter'] for a in A)); start_ms=c
    nlead=sum(p in (18,114,138) for p in pids)
    for i,a in enumerate(A):
        aucs.append(dict(match=mid,idx=i,letter=a['letter'],winner=a.get('winner'),paid=a['paid'],top=a.get('topBid'),rem=a['remaining'],at=a['at'],nA=nA,standard=standard,nlead=nlead,created=t0))
    ev=[(a['at'],0,i,a) for i,a in enumerate(A)]+[(p['at'],1,i,p) for i,p in enumerate(P)]
    ev.sort(key=lambda e:(e[0],e[1]))
    st={b:dict(bal=100,rack=5,inv=[],spent=0,rew=0,startused=0,nbuy=0,lastbuy=None,startletters=collections.Counter(),traj={},firstplay=None,qspend=[0,0,0,0],plays=0) for b in pids}
    auc_idx=0
    for at,kind,i,e in ev:
        if kind==0:
            # balance snapshot before auction i
            for b in pids: st[b]['traj'][i]=st[b]['bal']
            w=e.get('winner')
            if w is None: continue
            s=st[w]
            if e.get('topBid') is not None and e['topBid']>s['bal']: viol['top>bal']+=1
            s['bal']-=e['paid']; s['spent']+=e['paid']; s['rack']+=1; s['nbuy']+=1; s['lastbuy']=at
            s['qspend'][min(3,i*4//nA)]+=e['paid']
            tile=dict(match=mid,bot=w,letter=e['letter'],paid=e['paid'],top=e.get('topBid'),rem=e['remaining'],idx=i,at=at,played=False,shap=0.0,eq=0.0,face=0.0,wordlen=0,playdelay=None,rackAtBuy=s['rack'],balAfter=s['bal'])
            s['inv'].append(tile); tiles.append(tile)
        else:
            b=e['botId']; s=st[b]; w=e['word']; L=len(w)
            phi,key=shapley(w)
            rackb=s['rack']; balb=s['bal']
            # attribute: bought tiles first (FIFO on unplayed inventory)
            fs=sum(VAL[c] for c in w)
            phil=collections.defaultdict(list)
            for c,ph in zip(key,phi): phil[c].append(ph)
            nstart=0
            for c in w:
                ph=phil[c].pop()
                cand=[t for t in s['inv'] if not t['played'] and t['letter']==c]
                if cand:
                    t=cand[0]; t['played']=True; t['shap']=ph; t['eq']=e['reward']/L; t['face']=e['reward']*VAL[c]/fs if fs else 0; t['wordlen']=L; t['playdelay']=(at-t['at'])/1000; t['playat']=at
                else:
                    nstart+=1; s['startletters'][c]+=1
            s['startused']+=nstart
            s['rack']-=L; s['bal']+=e['reward']; s['rew']+=e['reward']; s['plays']+=1
            if s['rack']<0: viol['rack<0']+=1
            if s['firstplay'] is None: s['firstplay']=(at-t0)/1000
            # auction index at play: number of auctions closed
            nclosed=sum(1 for a in A if a['at']<=at)
            plays.append(dict(match=mid,bot=b,word=w,L=L,reward=e['reward'],at=at,t=(at-t0)/1000,nclosed=nclosed,rem_after=nA-nclosed,rackBefore=rackb,balBefore=balb,nstart=nstart,sincebuy=(at-s['lastbuy'])/1000 if s['lastbuy'] else None,standard=standard))
    for b in pids:
        s=st[b]
        if s['startused']>5: viol['start>5']+=1
        if start_ms is not None and any(s['startletters'][c]>start_ms[c] for c in s['startletters']): viol['startletter>avail']+=1
    sc={q['botId']:q['score'] for q in m['participants']}
    order=sorted(sc.values(),reverse=True)
    for q in m['participants']:
        b=q['botId'];s=st[b]
        mp=[p for p in plays if p['match']==mid and p['bot']==b]
        players.append(dict(match=mid,bot=b,score=q['score'],balance=q['balance'],rank=1+sum(v>q['score'] for v in sc.values()),win=int(q['score']==order[0]),nwin=sum(v==order[0] for v in sc.values()),
            nbuy=s['nbuy'],spent=s['spent'],avgpaid=s['spent']/s['nbuy'] if s['nbuy'] else np.nan,qspend=s['qspend'],traj=s['traj'],firstplay=s['firstplay'],nplays=s['plays'],
            leftover=s['rack'],startused=s['startused'],meanL=np.mean([p['L'] for p in mp]) if mp else np.nan,
            share7=(sum(p['reward'] for p in mp if p['L']>=7)/max(1,q['score'])),n7=sum(p['L']>=7 for p in mp),nshort=sum(p['L']<=4 for p in mp),
            standard=standard,nlead=nlead,nA=nA,created=t0,inarch=mid in ms))
pd.DataFrame(aucs).to_pickle('aucs.pkl');pd.DataFrame(players).to_pickle('players.pkl');pd.DataFrame(plays).to_pickle('plays.pkl');pd.DataFrame(tiles).to_pickle('tiles.pkl')
pickle.dump(cache,open('shap.pkl','wb'))
print(viol, len(aucs),len(players),len(plays),len(tiles))
pl=pd.DataFrame(plays);print('minL',pl.L.min(),'maxL',pl.L.max(),'not in dict',sum(''.join(sorted(w)) not in D for w in pl.word))
