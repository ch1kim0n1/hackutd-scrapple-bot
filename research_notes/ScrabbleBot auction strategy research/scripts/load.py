import json,glob,os,collections
import numpy as np,pandas as pd
R='/Users/pomoika/Documents/GitHub_repo/scrabble/data/learning/'
VAL=dict(zip('ABCDEFGHIJKLMNOPQRSTUVWXYZ',[1,3,3,2,1,4,2,4,1,8,5,1,3,1,1,3,10,1,1,1,1,4,4,8,4,10]))
BAG=dict(zip('ABCDEFGHIJKLMNOPQRSTUVWXYZ',[9,2,2,4,12,2,3,2,9,1,1,4,2,6,8,2,1,6,4,6,4,2,2,1,2,1]))
def mult(n): return 1 if n<=3 else 1.5 if n==4 else 2 if n==5 else 2.5 if n==6 else 3
def wscore(w): return int(sum(VAL[c] for c in w)*mult(len(w)))
def load():
    ms={}
    for f in glob.glob(R+'matches/*.json'):
        d=json.load(open(f)); d['_src']='arch'; ms[d['id']]=d
    selfs={}
    for f in glob.glob(R+'self/*.json'):
        d=json.load(open(f)); selfs[d['id']]=d
    return ms,selfs
