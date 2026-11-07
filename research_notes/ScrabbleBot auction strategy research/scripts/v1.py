from load import *
ms,selfs=load()
print(len(ms),len(selfs),len(set(ms)&set(selfs)))
c=collections.Counter
print('rackSize',c(m['rackSize'] for m in ms.values()),'dur',c(m['durationMs'] for m in ms.values()),'type',c(m['auctionType'] for m in ms.values()))
print('np',c(len(m['participants']) for m in ms.values()),'nauc',c(len(m['auctions']) for m in ms.values()).most_common(10))
print('keys auction',c(tuple(sorted(a)) for m in ms.values() for a in m['auctions']))
print('top keys',c(tuple(sorted(m)) for m in ms.values()))
print('self keys',c(tuple(sorted(m)) for m in selfs.values()))
print('self in ms equal?',[ (i,len(ms[i]['auctions']),len(selfs[i]['auctions'])) for i in list(set(ms)&set(selfs))[:5]])
# time range
t=sorted(m['createdAt'] for m in ms.values()); print(pd.to_datetime(t[0],unit='ms'),pd.to_datetime(t[-1],unit='ms'))
# accounting
bad=0;badS=0;n=0;diffs=[]
for m in ms.values():
    sp=collections.Counter(); rw=collections.Counter()
    for a in m['auctions']:
        if a.get('winner') is not None: sp[a['winner']]+=a.get('paid') or 0
    for p in m['plays']: rw[p['botId']]+=p['reward']
    for q in m['participants']:
        n+=1;b=q['botId']
        if rw[b]!=q['score']: badS+=1
        d=q['balance']-(100-sp[b]+rw[b]); diffs.append(d)
        if d!=0: bad+=1
print('participants',n,'score mismatch',badS,'bal mismatch',bad,c(diffs).most_common(10))
# reward formula check
w=0;t=0
for m in ms.values():
    for p in m['plays']:
        t+=1
        if wscore(p['word'])!=p['reward']: w+=1
print('plays',t,'reward mismatch',w)
print('winner none',sum(a.get('winner') is None for m in ms.values() for a in m['auctions']),'of',sum(len(m['auctions']) for m in ms.values()))
print('topBid present',sum('topBid' in a and a['topBid'] is not None for m in ms.values() for a in m['auctions']))
# remaining range
rs=[a['remaining'] for m in ms.values() for a in m['auctions']]; print(min(rs),max(rs))
bots=c(q['botId'] for m in ms.values() for q in m['participants']); print(len(bots),bots.most_common(25))
p=json.load(open(R+'profiles.json')); print(p['asOf'],p['limitations']); print(len(p['profiles']));print([(x['botId'],x.get('name'),x.get('rating'),x['matches'],round(x['meanScore'],1),round(x['winShare'],3)) for x in p['profiles']][:30]);print({k:(v if not isinstance(v,(dict,list)) else type(v).__name__) for k,v in p['profiles'][0].items()})
h=json.load(open(R+'history.json')); print(h['fetchedAt'],h['leaders'],h['queries'] if not isinstance(h['queries'],list) or len(h['queries'])<8 else len(h['queries']),len(h['matches']),len(h['rejected']))
