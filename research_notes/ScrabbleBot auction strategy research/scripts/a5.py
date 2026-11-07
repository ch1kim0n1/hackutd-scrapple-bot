from load import *
B=pd.read_pickle('bidobs.pkl')
G={**{l:'vowel' for l in 'AEIOU'},**{l:'LNRST' for l in 'LNRST'},**{l:'DG' for l in 'DG'},**{l:'BCMP' for l in 'BCMP'},**{l:'FHVWY' for l in 'FHVWY'},'K':'K',**{l:'JQXZ' for l in 'JQXZ'}}
B['g']=B.letter.map(G)
from sklearn.isotonic import IsotonicRegression
def curve(sub):
    x=sub.R.values; y=sub.won.values.astype(float)
    ir=IsotonicRegression(increasing=False,out_of_bounds='clip').fit(x,y)
    grid=np.arange(0,61)
    p=ir.predict(grid)
    def thr(level):
        k=np.where(p<=level)[0]; return grid[k[0]] if len(k) else '>60'
    return dict(n=len(sub),winrate=y.mean(),p_win_at5=p[5],p_at8=p[8],p_at10=p[10],p_at12=p[12],p_at15=p[15],p_at20=p[20],x50=thr(0.5),x25=thr(0.25),x10=thr(0.10),bid_med=np.nanmedian(sub.bid),bid_p90=np.nanpercentile(sub.bid.dropna(),90) if sub.bid.notna().any() else np.nan)
rows=[]
for (b,g),sub in B.groupby(['bot','g']):
    rows.append(dict(bot=b,g=g,**curve(sub)))
print('P(win | rival top bid R) — isotonic; x50/x25/x10 = rival price where win prob falls to 50/25/10% (estimate of bid quantiles)')
print(pd.DataFrame(rows).round(2).to_string())
B['ph']=pd.cut(B.rem,[0,16,33,50,68],labels=['16-1','33-17','50-34','67-51'])
rows=[]
for (b,g),sub in B[B.bot.isin(['LUCENT','Bron'])].groupby(['bot','ph'],observed=True):
    rows.append(dict(bot=b,ph=g,**curve(sub)))
print(pd.DataFrame(rows).round(2).to_string())
# exact winning bids by letter for LUCENT and Bron
W=B[B.won]
tab=W.groupby(['letter','bot']).bid.agg(['median','size',lambda s:np.percentile(s,90)]).unstack('bot')
print(tab.round(1).to_string())
# 7+ words
pl=pd.read_pickle('plays.pkl'); pl=pl[pl.standard]
NM={18:'LUCENT',114:'Bron',138:'Waupus',166:'Soap'}
L7=pl[pl.L>=7]
print('7+ plays',len(L7),'share of all plays',round(len(L7)/len(pl),3),'share of all reward',round(L7.reward.sum()/pl.reward.sum(),3),'mean reward 7+',L7.reward.mean().round(1),'vs <7',pl[pl.L<7].reward.mean().round(1))
print('reward by length');print(pl.groupby('L').reward.agg(['size','mean']).round(1).T.to_string())
top=L7[L7.bot.isin([18,114,138])]
print('top bots 7+ words: unique',top.word.nunique(),'of',len(top)); print(top.word.value_counts().head(30).to_dict())
print('all bots 7+ top',L7.word.value_counts().head(20).to_dict())
cnt=collections.Counter(''.join(L7.word)); tot=sum(cnt.values())
bagt=sum(BAG.values())
enr={l:(cnt[l]/tot)/(BAG[l]/bagt) for l in BAG}
# ENABLE 7-letter bingo-ability Monte Carlo
words=[w.strip().upper() for w in open('/Users/pomoika/Documents/GitHub_repo/scrabble/data/enable.txt') if w.strip()]
K7=set(''.join(sorted(w)) for w in words if len(w)==7)
w7=[w for w in words if len(w)==7]; c7=collections.Counter(''.join(w7)); t7=sum(c7.values())
frac7={l:sum(l in w for w in w7)/len(w7) for l in BAG}
bag=[l for l in BAG for _ in range(BAG[l])]
rng=np.random.default_rng(1)
import itertools
def has7(rack):
    if len(rack)==7: return ''.join(sorted(rack)) in K7
    return any(''.join(sorted(c)) in K7 for c in itertools.combinations(rack,7))
N=6000
res={}
for l in list(BAG)+['base']:
    hit7=0;hit8=0
    for _ in range(N):
        if l=='base':
            r=list(rng.choice(bag,8,replace=False)); r7=r[:7]
        else:
            pool=bag.copy(); pool.remove(l); r=list(rng.choice(pool,7,replace=False))+[l]; r7=r[:6]+[l]
        hit7+=has7(r7); hit8+=has7(r)
    res[l]=(hit7/N,hit8/N)
print('base P(7-tile rack is a 7-letter word)',res['base'][0],'P(8-tile rack contains 7-letter word)',res['base'][1])
rows=[]
for l in BAG:
    rows.append(dict(letter=l,face=VAL[l],bag=BAG[l],played7_enrich=enr[l],enable7_freq_ratio=(c7[l]/t7)/(BAG[l]/bagt),pct_7words_with=frac7[l],P7_rack7=res[l][0],P7_rack8=res[l][1],lift8=res[l][1]/res['base'][1]))
T=pd.DataFrame(rows).sort_values('lift8',ascending=False); print(T.round(3).to_string()); T.to_pickle('bingo.pkl')
