from load import *
P=pd.read_pickle('P2.pkl')
print('identity score==spent+balance-100:',(P.score==P.spent+P.balance-100).mean())
bs=P.groupby('bot').agg(n=('match','size'),nbuy=('nbuy','median'),score=('score','mean'),win=('win','mean'),avgpaid=('avgpaid','mean'),endbal=('balance','mean'))
print(bs[bs.n>=10].sort_values('score',ascending=False).round(2).to_string())
P['rho']=P.score/P.spent.replace(0,np.nan)
P['active']=P.nbuy>=6
print('inactive share by period',P.groupby('period').active.apply(lambda s:1-s.mean()).round(3).to_dict())
A=P[P.active]
A['cls']=A.bot.map({18:'LUCENT',114:'Bron',138:'Waupus',166:'Soap'}).fillna('other')
print(A.groupby(['cls']).agg(n=('score','size'),score=('score','mean'),win=('win','mean'),nbuy=('nbuy','mean'),avgpaid=('avgpaid','mean'),rho=('rho','median'),endbal=('balance','mean'),firstplay=('firstplay','median'),meanL=('meanL','mean'),rackAtPlay=('rackAtPlay','median'),balAtPlay=('balAtPlay','median')).round(2).to_string())
print(A.groupby('win').agg(rho=('rho','median'),rho_mean=('rho','mean'),endbal=('balance','mean')).round(3))
import a2help
