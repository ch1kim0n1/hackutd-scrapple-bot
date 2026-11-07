from load import *
P=pd.read_pickle('players.pkl'); t=pd.read_pickle('tiles.pkl'); pl=pd.read_pickle('plays.pkl'); a=pd.read_pickle('aucs.pkl')
P=P[P.standard].copy()
P['period']=np.where(pd.to_datetime(P.created,unit='ms')<pd.Timestamp('2026-10-31'),'Oct24-30','Oct31-Nov7')
for i,q in enumerate(['q1','q2','q3','q4']): P[q+'share']=[x[i]/s if s else np.nan for x,s in zip(P.qspend,P.spent)]
P['bal17']=[d.get(17) for d in P.traj];P['bal34']=[d.get(34) for d in P.traj];P['bal51']=[d.get(51) for d in P.traj]
P['minbal']=[min(d.values()) for d in P.traj]
tb=t.assign(h=(t.idx<34)).groupby(['match','bot','h']).agg(n=('paid','size'),s=('paid','sum')).unstack(fill_value=0)
tb.columns=['nbuy_h2','nbuy_h1','spend_h2','spend_h1']
P=P.join(tb,on=['match','bot']).fillna({'nbuy_h1':0,'nbuy_h2':0,'spend_h1':0,'spend_h2':0})
pl2=pl.groupby(['match','bot']).agg(rackAtPlay=('rackBefore','mean'),balAtPlay=('balBefore','mean'))
P=P.join(pl2,on=['match','bot'])
P['firstplay']=P.firstplay.fillna(70)
P.to_pickle('P2.pkl')
feats=['nbuy','spent','avgpaid','nbuy_h1','spend_h1','q1share','q4share','bal34','minbal','balance','firstplay','nplays','meanL','share7','n7','nshort','leftover','rackAtPlay','balAtPlay']
rng=np.random.default_rng(0)
mids=P.match.unique()
def boot(fn,B=1000):
    vals=[]
    g=dict(tuple(P.groupby('match')))
    for _ in range(B):
        s=rng.choice(mids,len(mids)); vals.append(fn(pd.concat([g[m] for m in s])))
    return np.percentile(vals,[2.5,97.5])
# (a) winner vs others within match, using unique-winner matches
U=P[P.nwin==1]
rows=[]
W=U[U.win==1].set_index('match'); O=U[U.win==0].groupby('match')[feats].mean()
D=(W[feats]-O[feats])
for f in feats:
    d=D[f].dropna(); se=d.std()/np.sqrt(len(d))
    sd=U[f].std()
    rows.append(dict(f=f,winner=W[f].mean(),others=O[f].mean(),diff=d.mean(),lo=d.mean()-1.96*se,hi=d.mean()+1.96*se,d_sd=d.mean()/sd,n=len(d)))
print('Winner minus mean of others (within match), unique-winner matches');print(pd.DataFrame(rows).round(2).to_string())
# (b) within-match univariate standardized slope of score, cluster-robust
def fe_ols(df,xs,y='score'):
    df=df.dropna(subset=xs+[y])
    X=df[xs]; X=(X-X.mean())/X.std()
    Xd=X-X.groupby(df.match).transform('mean'); yd=df[y]-df.groupby('match')[y].transform('mean')
    Z=Xd.values; yv=yd.values
    b=np.linalg.lstsq(Z,yv,rcond=None)[0]; r=yv-Z@b
    XtXi=np.linalg.pinv(Z.T@Z); meat=np.zeros((len(xs),)*2)
    for idx in df.reset_index(drop=True).groupby('match').indices.values():
        s=Z[idx].T@r[idx]; meat+=np.outer(s,s)
    se=np.sqrt(np.diag(XtXi@meat@XtXi)); r2=1-(r@r)/(yv@yv)
    return b,se,r2,len(df),df.match.nunique()
rows=[]
for f in feats:
    b,se,r2,n,nm=fe_ols(P,[f]); rows.append(dict(f=f,beta_per_SD=b[0],lo=b[0]-1.96*se[0],hi=b[0]+1.96*se[0],withinR2=r2,n=n))
print('\nWithin-match OLS score ~ feature (pts per 1 SD)');print(pd.DataFrame(rows).sort_values('withinR2',ascending=False).round(3).to_string())
for name,xs in [('pre-play buying model',['nbuy','avgpaid','q1share','q4share']),('first-half only',['nbuy_h1','spend_h1']),('full',['nbuy','avgpaid','q1share','firstplay','meanL','leftover','balance'])]:
    b,se,r2,n,nm=fe_ols(P,xs); print('\n',name,'n',n,'matches',nm,'withinR2',round(r2,3))
    for x,bb,s in zip(xs,b,se): print(f'  {x}: {bb:.2f} [{bb-1.96*s:.2f},{bb+1.96*s:.2f}]')
# same for non-leaders only and by period
for lab,sub in [('non-leaders',P[~P.bot.isin([18,114,138])]),('Oct24-30',P[P.period=='Oct24-30']),('Oct31-Nov7',P[P.period=='Oct31-Nov7'])]:
    b,se,r2,n,nm=fe_ols(sub,['nbuy','avgpaid','q1share']); print(lab,'n',n,'R2',round(r2,3),[f'{x}:{bb:.1f}±{1.96*s:.1f}' for x,bb,s in zip(['nbuy','avgpaid','q1share'],b,se)])
# win rate by tiles bought bins
P['nb_bin']=pd.cut(P.nbuy,[-1,5,10,15,20,25,30,60])
print(P.groupby('nb_bin',observed=True).agg(n=('win','size'),winrate=('win','mean'),score=('score','mean')).round(3).to_string())
P['ap_bin']=pd.cut(P.avgpaid,[0,6,8,10,12,15,20,100])
print(P.groupby('ap_bin',observed=True).agg(n=('win','size'),winrate=('win','mean'),score=('score','mean'),nbuy=('nbuy','mean')).round(3).to_string())
print(P.groupby('period').agg(n=('match','nunique'),winner=('score',lambda s: P.loc[s.index][P.loc[s.index].win==1].score.mean()),score=('score','mean'),nbuy=('nbuy','mean'),avgpaid=('avgpaid','mean'),endbal=('balance','mean')).round(2))
