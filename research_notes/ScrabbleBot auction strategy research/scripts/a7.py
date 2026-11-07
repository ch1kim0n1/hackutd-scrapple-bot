from load import *
a=pd.read_pickle('aucs.pkl'); a=a[a.standard&(a.rem>0)&a.top.notna()]; mt=pd.read_pickle('mt.pkl')
a=a.join(mt[['nactive','soap','period']],on='match')
G={**{l:'vowel' for l in 'AEIOU'},**{l:'LNRST' for l in 'LNRST'},**{l:'DG' for l in 'DG'},**{l:'BCMP' for l in 'BCMP'},**{l:'FHVWY' for l in 'FHVWY'},'K':'K',**{l:'JQXZ' for l in 'JQXZ'}}
a['g']=a.letter.map(G); a['ph']=pd.cut(a.rem,[0,16,33,50,67],labels=['16-1','33-17','50-34','67-51'])
a['tab']=np.where(a.nactive>=5,'5-6 active','2-4 active')
def qs(s): return pd.Series({'n':len(s),'top_p25':s.quantile(.25),'top_p50':s.median(),'top_p75':s.quantile(.75),'top_p90':s.quantile(.9)})
print('Price to beat (rival top bid = topBid) by letter group x table activity')
print(a.groupby(['tab','g']).top.apply(qs).unstack().round(1).to_string())
print(a.groupby(['tab','ph'],observed=True).top.apply(qs).unstack().round(1).to_string())
print('Soap tables only'); print(a[a.soap].groupby('g').top.apply(qs).unstack().round(1).to_string())
# P(win) at bid b and avg cost
for b in [8,10,12,14,16,18,20]:
    w=a.top<b
    print(b,'P(win)',round(w.mean(),3),'avg cost if win',round(a.top[w].mean(),2),'P(win) 5-6 active',round((a[a.nactive>=5].top<b).mean(),3),'Soap tables',round((a[a.soap].top<b).mean(),3))
# per-letter win cost at soap tables & all
print(a.groupby('letter').top.median().to_dict())
