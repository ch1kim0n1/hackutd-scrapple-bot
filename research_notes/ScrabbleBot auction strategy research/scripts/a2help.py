from load import *
P=pd.read_pickle('P2.pkl'); P=P[P.nbuy>=6].copy()
P['rho']=P.score/P.spent
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
print('\nACTIVE players (nbuy>=6) within-match univariate, pts per SD')
rows=[]
for f in ['nbuy','avgpaid','rho','nbuy_h1','spend_h1','q1share','q4share','bal34','minbal','balance','firstplay','meanL','share7','nshort','leftover','rackAtPlay','balAtPlay']:
    b,se,r2,n,nm=fe_ols(P,[f]); rows.append(dict(f=f,sd=P[f].std(),beta=b[0],lo=b[0]-1.96*se[0],hi=b[0]+1.96*se[0],R2=r2,n=n,m=nm))
print(pd.DataFrame(rows).sort_values('R2',ascending=False).round(3).to_string())
for name,xs in [('buying only',['nbuy_h1','avgpaid','q1share','q4share']),('process',['nbuy','avgpaid','firstplay','meanL','leftover'])]:
    b,se,r2,n,nm=fe_ols(P,xs); print(name,'n',n,'m',nm,'R2',round(r2,3),'; '.join(f'{x} {bb:.1f} [{bb-1.96*s:.1f},{bb+1.96*s:.1f}]' for x,bb,s in zip(xs,b,se)))
# conditional logit win ~ features, among active, matches with unique winner among active
from scipy.optimize import minimize
Q=P[P.nwin==1].dropna(subset=['nbuy_h1','avgpaid','firstplay','meanL'])
Q=Q[Q.groupby('match').win.transform('sum')==1]
xs=['nbuy_h1','avgpaid','firstplay','q1share']
Q=Q.dropna(subset=xs)
Q=Q[Q.groupby('match').win.transform('sum')==1]
Z=((Q[xs]-Q[xs].mean())/Q[xs].std()).values; g=Q.match.values; y=Q.win.values
idx=pd.Series(range(len(Q))).groupby(g).indices
def nll(b):
    u=Z@b; s=0
    for ii in idx.values():
        uu=u[ii]; s-= (uu[y[ii]==1].sum()-np.log(np.exp(uu-uu.max()).sum())-uu.max())
    return s
r=minimize(nll,np.zeros(len(xs)),method='BFGS')
se=np.sqrt(np.diag(r.hess_inv))
print('conditional logit (win), n players',len(Q),'matches',len(idx)); 
for x,bb,s in zip(xs,r.x,se): print(f'  {x}: OR per SD {np.exp(bb):.2f} [{np.exp(bb-1.96*s):.2f},{np.exp(bb+1.96*s):.2f}]')
