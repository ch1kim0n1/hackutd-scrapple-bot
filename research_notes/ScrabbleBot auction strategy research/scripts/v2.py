from load import *
ms,selfs=load()
h=json.load(open(R+'history.json'))
print(h['queries'][:3] if isinstance(h['queries'],list) else h['queries'])
hm=h['matches']; print(type(hm), (hm[0].keys() if isinstance(hm,list) else list(hm)[:3]))
ids=set(x['id'] for x in hm); print('hist ids',len(ids),'not in ms',len(ids-set(ms)),'ms not in hist',len(set(ms)-ids),'self not in ms',len(set(selfs)-set(ms)),'self not in hist',len(set(selfs)-ids))
allm=dict(ms); allm.update({k:v for k,v in selfs.items() if k not in allm})
for x in hm:
    allm.setdefault(x['id'],x)
print('union',len(allm))
A=[a for m in ms.values() for a in m['auctions']]
print('topBid<paid',sum(a['topBid']<a['paid'] for a in A),'eq',sum(a['topBid']==a['paid'] for a in A),'paid0',sum(a['paid']==0 for a in A),'nowinner sample',[a for a in A if 'winner' not in a][:3])
print('nowinner remaining',collections.Counter(a['remaining'] for a in A if 'winner' not in a).most_common(8))
print('paid dist',collections.Counter(a['paid'] for a in A).most_common(12));print('topBid==paid+1',sum(a['topBid']==a['paid']+1 for a in A))
print('max paid',max(a['paid'] for a in A),'max top',max(a['topBid'] for a in A))
# start multiset check
bad=0
for m in ms.values():
    if len(m['auctions'])!=68: continue
    c=collections.Counter(a['letter'] for a in m['auctions'])
    if any(c[l]>BAG[l] for l in c): bad+=1
print('matches with letter count>bag',bad)
# timing
for m in list(ms.values())[:3]:
    print(m['id'],m['createdAt'],m['endedAt'],m['auctions'][-1]['at'],m['plays'][-1]['at'] if m['plays'] else None,(m['endedAt']-m['createdAt'])/1000)
late=sum(p['at']>m['auctions'][-1]['at'] for m in ms.values() for p in m['plays']);print('plays after last auction',late)
print('auction order sorted by remaining?',all([a['remaining'] for a in m['auctions']]==sorted([a['remaining'] for a in m['auctions']],reverse=True) for m in ms.values()))
print('rem final',collections.Counter(m['auctions'][-1]['remaining'] for m in ms.values()))
s=sorted(selfs.values(),key=lambda d:d['id'])
print(collections.Counter(d['policy'] for d in s), [(d['id'],d['rank'],d['score'],d['endingBalance'],d['tilesBought']) for d in s][:12])
# rank by score?
wr=[]
for d in s:
    sc=sorted(d['participants'],key=lambda q:-q['score'])
    wr.append(([q['score'] for q in sc].index(d['score'])+1)==d['rank'])
print('rank==score order',sum(wr),len(wr))
print(collections.Counter(tuple(d['flags']) for d in s).most_common(8))
# self bidTrace rack first row
d=[d for d in s if 'bidTrace' in d][-1]; print(d['id'],d['bidTrace'][0],d['bidTrace'][-1],len(d['bidTrace']))
print('participant ids at self tables',collections.Counter(q['botId'] for d in s for q in d['participants']).most_common(14))
