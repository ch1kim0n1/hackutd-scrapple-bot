from load import *
a=pd.read_pickle('aucs.pkl'); t=pd.read_pickle('tiles.pkl'); P=pd.read_pickle('players.pkl')
a=a[a.standard]; sold=a[a.winner.notna()]
print('standard matches',a.match.nunique(),'auctions',len(a),'sold',len(sold),'unsold',(a.winner.isna()).sum())
print('unsold by rem', a[a.winner.isna()].rem.value_counts().to_dict())
# phase
def ph(r): return '1:67-51' if r>=51 else '2:50-34' if r>=34 else '3:33-17' if r>=17 else '4:16-1' if r>=1 else '5:last'
a['phase']=a.rem.map(ph); sold=a[a.winner.notna()]
print(sold.groupby('phase').agg(n=('paid','size'),paid_mean=('paid','mean'),paid_med=('paid','median'),top_mean=('top','mean'),top_med=('top','median'),gap=('top',lambda x: (x-sold.loc[x.index,'paid']).mean())).round(2).to_string())
# by remaining fine: 10 bins regression
import scipy.stats as ss
s2=sold[sold.rem>0]
lr=ss.linregress(67-s2.rem,s2.paid); print('paid slope per auction',lr.slope,'+-',1.96*lr.stderr,'intercept',lr.intercept)
lr=ss.linregress(67-s2.rem,s2.top); print('top slope per auction',lr.slope,'+-',1.96*lr.stderr)
# match-level mean by octile
s2=s2.assign(oct=(67-s2.rem)//8)
print(s2.groupby('oct').paid.agg(['mean','median','size']).round(2).T.to_string())
# letter table
g=sold[sold.rem>0].groupby('letter')
L=pd.DataFrame(dict(n=g.size(),face=[VAL[l] for l in g.size().index],paid_mean=g.paid.mean(),paid_med=g.paid.median(),top_mean=g.top.mean(),p_early=sold[(sold.rem>=34)].groupby('letter').paid.mean(),p_late=sold[(sold.rem<34)&(sold.rem>0)].groupby('letter').paid.mean()))
# value from tiles (exclude last-tile purchases)
ts=t[t.rem>0].merge(a[['match']].drop_duplicates(),on='match')
gt=ts.groupby('letter')
L['bought_n']=gt.size(); L['p_played']=gt.played.mean(); L['shap']=gt.shap.mean(); L['eq']=gt.eq.mean(); L['facesh']=gt.face.mean()
#=ts[ts.played].groupby('letter').shap.mean()
L['net_shap']=L.shap-L.paid_mean; L['ratio']=L.shap/L.paid_mean
L['ci_net']=gt.apply(lambda x:1.96*(x.shap-x.paid).std()/np.sqrt(len(x)))
pd.set_option('display.width',250)

print('ALL tiles: n',len(ts),'p_played',ts.played.mean().round(3),'shap',ts.shap.mean().round(2),'paid',ts.paid.mean().round(2),'eq',ts['eq'].mean().round(2),'face',ts.face.mean().round(2))
# vowels vs consonants
ts['V']=ts.letter.isin(list('AEIOU'))
print(ts.groupby('V')[['played','shap','paid','eq']].mean().round(2))
# value by phase of purchase
ts['phase']=ts.rem.map(ph)
print(ts.groupby('phase').agg(n=('paid','size'),paid=('paid','mean'),pplayed=('played','mean'),shap=('shap','mean'),eq=('eq','mean')).round(2).to_string())
# last tile
last=sold[sold.rem==0]; print('last tile sold',len(last),'paid mean',last.paid.mean().round(2),'top mean',last.top.mean().round(2),'buyers',last.winner.value_counts().head(5).to_dict())
# by buyer class
LEAD={18:'LUCENT',114:'Bron',138:'Waupus',166:'Soap'}
ts['cls']=ts.bot.map(LEAD).fillna('other')
print(ts.groupby('cls').agg(n=('paid','size'),paid=('paid','mean'),pplayed=('played','mean'),shap=('shap','mean'),eq=('eq','mean')).round(2).to_string())
L.to_pickle('letters.pkl')
# time drift
a['day']=pd.to_datetime(a.created,unit='ms').dt.date
print(a[a.winner.notna()&(a.rem>0)].groupby('day').agg(n=('match','nunique'),paid=('paid','mean'),top=('top','mean')).round(2).to_string())
