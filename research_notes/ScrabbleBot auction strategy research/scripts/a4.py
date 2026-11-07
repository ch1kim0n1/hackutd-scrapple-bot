from load import *
P=pd.read_pickle('P2.pkl'); pl=pd.read_pickle('plays.pkl'); t=pd.read_pickle('tiles.pkl'); a=pd.read_pickle('aucs.pkl')
a=a[a.standard]; pl=pl[pl.standard]
NM={18:'LUCENT',114:'Bron',138:'Waupus',166:'Soap'}
act=P[P.nbuy>=6][['match','bot']]
pl['cls']=pl.bot.map(NM).fillna('other'); t['cls']=t.bot.map(NM).fillna('other')
pa=pl.merge(act,on=['match','bot'])
def q(s,p): return np.nanpercentile(s,p)
print('PLAYS (active bots)')
print(pa.groupby('cls').agg(n=('L','size'),L_med=('L','median'),L7share=('L',lambda s:(s>=7).mean()),L8share=('L',lambda s:(s>=8).mean()),short=('L',lambda s:(s<=4).mean()),rack_med=('rackBefore','median'),rack_p25=('rackBefore',lambda s:q(s,25)),rack_p75=('rackBefore',lambda s:q(s,75)),leftafter=('rackBefore',lambda s: (s-pa.loc[s.index,'L']).median()),bal_med=('balBefore','median'),since_med=('sincebuy','median'),since_lt02=('sincebuy',lambda s:(s<0.2).mean()),since_lt1=('sincebuy',lambda s:(s<1.05).mean()),t_med=('t','median')).round(2).to_string())
# timing of plays by phase
pa['ph']=pd.cut(pa.rem_after,[-1,0,16,33,50,68],labels=['end','16-1','33-17','50-34','67-51'])
print(pd.crosstab(pa.cls,pa.ph,normalize='index').round(2))
print('L by phase for leaders');print(pa[pa.cls.isin(['LUCENT','Bron'])].groupby(['cls','ph'],observed=True).L.agg(['mean','size']).round(2).unstack(0).to_string())
# purchases
t=t.merge(a[['match']].drop_duplicates(),on='match')
t['V']=t.letter.isin(list('AEIOU')); t['ph']=pd.cut(t.rem,[-1,0,16,33,50,68],labels=['last','16-1','33-17','50-34','67-51'])
a['V']=a.letter.isin(list('AEIOU')); a['ph']=pd.cut(a.rem,[-1,0,16,33,50,68],labels=['last','16-1','33-17','50-34','67-51'])
print('supply vowel share',a.V.mean().round(3))
print('vowel share of purchases by phase');print(t.groupby(['cls','ph'],observed=True).V.mean().unstack().round(2).to_string())
mpm=P.groupby('bot').size()
print('purchases per match by phase');print((t.groupby(['cls','ph'],observed=True).size().unstack()/t.groupby('cls').match.nunique().values[:,None]).round(2).to_string())
print('price paid by phase');print(t.groupby(['cls','ph'],observed=True).paid.mean().unstack().round(1).to_string())
# end-of-game
P['cls']=P.bot.map(NM).fillna('other')
Pa=P[P.nbuy>=6]
print(Pa.groupby('cls').agg(endbal_med=('balance','median'),endbal_mean=('balance','mean'),leftover=('leftover','mean'),minbal=('minbal','median'),bal34=('bal34','median')).round(1).to_string())
# rival-top method: for each auction and each leader present, R = top of others
rows=[]
for (mid),g in a.groupby('match'):
    pids=set(P[P.match==mid].bot)
    for b in [18,114,138,166]:
        if b not in pids: continue
        for r in g.itertuples():
            if r.rem==0 or r.top is None or np.isnan(r.top): continue
            won=(r.winner==b); R=r.paid if won else r.top
            rows.append(dict(bot=NM[b],match=mid,letter=r.letter,rem=r.rem,R=R,won=won,bid=r.top if won else np.nan,idx=r.idx))
B=pd.DataFrame(rows); B.to_pickle('bidobs.pkl')
print('bidobs',B.groupby('bot').size().to_dict())
