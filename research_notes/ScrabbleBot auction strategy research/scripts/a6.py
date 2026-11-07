from load import *
P=pd.read_pickle('P2.pkl'); a=pd.read_pickle('aucs.pkl'); a=a[a.standard]
strong={18,114,138,88,62,107}
P['active']=P.nbuy>=6
mt=P.groupby('match').agg(nlead=('bot',lambda s:s.isin([18,114,138]).sum()),nstrong=('bot',lambda s:s.isin(strong).sum()),nactive=('active','sum'),winner=('score','max'),endbal=('balance','sum'),soap=('bot',lambda s:(s==166).any()),period=('period','first'))
am=a[(a.rem>0)].groupby('match').agg(paid=('paid','mean'),top=('top','mean'))
mt=mt.join(am)
for col in ['nlead','nstrong','nactive']:
    print(mt.groupby(col).agg(n=('paid','size'),paid=('paid','mean'),top=('top','mean'),winner=('winner','mean'),winner_sd=('winner','std'),unspent=('endbal','mean')).round(1).to_string())
# regression paid ~ nactive + nlead
import numpy.linalg as la
X=np.column_stack([np.ones(len(mt)),mt.nactive,mt.nlead,(mt.period=='Oct31-Nov7').astype(int)]); 
for y in ['paid','winner']:
    b=la.lstsq(X,mt[y].values,rcond=None)[0]; r=mt[y].values-X@b; s2=r@r/(len(r)-4); se=np.sqrt(np.diag(s2*la.inv(X.T@X)))
    print(y,'~ const,nactive,nlead,recent:',np.round(b,2),'±',np.round(1.96*se,2),'n',len(mt))
# leader score by strong opponents
for b,nm in [(18,'LUCENT'),(114,'Bron')]:
    q=P[P.bot==b].drop(columns=['nlead']).join(mt[['nactive','nlead']],on='match')
    print(nm,q.groupby('nactive').agg(n=('score','size'),score=('score','mean'),win=('win','mean')).round(2).to_string())
print('Soap tables vs other', mt.groupby('soap').agg(n=('paid','size'),paid=('paid','mean'),top=('top','mean'),winner=('winner','mean'),nactive=('nactive','mean'),nlead=('nlead','mean')).round(2).to_string())
mt.to_pickle('mt.pkl')
# ---- own matches
ms,selfs=load()
rows=[];tr=[]
for mid,d in selfs.items():
    if 'bidTrace' not in d or not d['bidTrace']: continue
    A={x['id']:x for x in d['auctions']}
    last={}
    for b in d['bidTrace']: last[b['auctionId']]=b
    for aid,b in last.items():
        x=A.get(aid)
        if not x or x.get('topBid') is None: continue
        won=x.get('winner')==166
        R=x['paid'] if won else x['topBid']
        tr.append(dict(match=mid,letter=b['letter'],bid=b['bid'],value=b['value'],cash=b['cashGain'],bal=b['balance'],rack=len(b['rack']),rem=b['remaining'],won=won,R=R,paid=x['paid'],policy=b['policy']))
T=pd.DataFrame(tr)
print('own bid-trace auctions',len(T),'matches',T.match.nunique(),'policies',T.policy.value_counts().to_dict())
print('bid==0 share',(T.bid==0).mean().round(3),'won share',T.won.mean().round(3))
T['gap']=T.R-T.bid
print('losses with bid>0: rival top minus our bid quantiles',np.percentile(T[(~T.won)&(T.bid>0)].gap,[10,25,50,75,90]))
for k in [1,2,3,5]:
    print(f'+{k} would win extra',((~T.won)&(T.bid>0)&(T.bid+k>T.R)).sum())
print('our bids by rem phase',T.assign(ph=pd.cut(T.rem,[-1,16,33,50,68])).groupby('ph',observed=True).agg(bid=('bid','mean'),bidpos=('bid',lambda s:(s>0).mean()),R=('R','mean'),won=('won','mean'),bal=('bal','mean'),rack=('rack','mean')).round(2).to_string())
S=pd.DataFrame([dict(id=k,policy=d['policy'],rank=d['rank'],score=d['score'],end=d['endingBalance'],tiles=d['tilesBought'],flags=','.join(d['flags'])) for k,d in selfs.items()]).sort_values('id')
print(S.groupby('policy').agg(n=('id','size'),score=('score','mean'),rank=('rank','mean'),end=('end','mean'),tiles=('tiles','mean'),wins=('rank',lambda s:(s==1).sum())).round(2))
