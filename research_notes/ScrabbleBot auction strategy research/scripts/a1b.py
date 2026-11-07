from load import *
P=pd.read_pickle('players.pkl'); t=pd.read_pickle('tiles.pkl'); a=pd.read_pickle('aucs.pkl')
P=P[P.standard]
m=P.groupby('match').agg(rew=('score','sum'),spent=('spent','sum'),endbal=('balance','sum'),win=('score','max'))
print(m.describe().round(1).to_string())
# Shapley sanity
import pickle; c=pickle.load(open('shap.pkl','rb'))
for w in ['ZEBRA','QUIXOTE','ZOA','RETAINS','JUKEBOX']:
    k=''.join(sorted(w)); 
    if k in c: print(w,k,[round(x,1) for x in c[k]],wscore(w))
# within-match regression of score on letter group counts
t=t[t.rem>0]
grp={**{l:'vowel' for l in 'AEIOU'},**{l:'LNRST' for l in 'LNRST'},**{l:'DG' for l in 'DG'},**{l:'BCMP' for l in 'BCMP'},**{l:'FHVWY' for l in 'FHVWY'},'K':'K',**{l:'JQXZ' for l in 'JQXZ'}}
t['g']=t.letter.map(grp)
cnt=t.pivot_table(index=['match','bot'],columns='g',values='paid',aggfunc='size',fill_value=0)
pr=t.groupby('g').paid.mean()
X=P.set_index(['match','bot']).join(cnt).fillna(0)
cols=list(cnt.columns)
Y=X.score-X.groupby('match').score.transform('mean')
Z=X[cols]-X.groupby('match')[cols].transform('mean')
Zm=Z.values; yv=Y.values
b=np.linalg.lstsq(Zm,yv,rcond=None)[0]
# cluster robust
res=yv-Zm@b; XtXi=np.linalg.inv(Zm.T@Zm)
meat=np.zeros((len(cols),len(cols)))
for mid,idx in X.reset_index().groupby('match').indices.items():
    s=Zm[idx].T@res[idx]; meat+=np.outer(s,s)
se=np.sqrt(np.diag(XtXi@meat@XtXi))
print(pd.DataFrame(dict(beta=b,se=se,lo=b-1.96*se,hi=b+1.96*se,price=pr[cols].values,score_per_coin=b/pr[cols].values),index=cols).round(2).to_string())
print('n player-matches',len(X),'matches',X.reset_index().match.nunique())
