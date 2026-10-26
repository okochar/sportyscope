/* Forty outcome conditions that can be observed from a final score alone. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ScopeConditions=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const definitions=[];const add=(id,label,test)=>definitions.push({id,label,test});
  add('win','Team win',(h,a)=>h>a);add('draw','Draw',(h,a)=>h===a);add('loss','Team loss',(h,a)=>h<a);add('no_loss','Team or draw',(h,a)=>h>=a);add('no_draw','Either team wins',(h,a)=>h!==a);add('no_win','Opponent or draw',(h,a)=>h<=a);
  for(const line of [.5,1.5,2.5,3.5,4.5,5.5]){add('total_over_'+line,'Total over '+line,(h,a)=>h+a>line);add('total_under_'+line,'Total under '+line,(h,a)=>h+a<line);}
  for(const line of [.5,1.5,2.5,3.5]){add('team_over_'+line,'Team goals over '+line,(h)=>h>line);add('opponent_over_'+line,'Opponent goals over '+line,(_,a)=>a>line);}
  add('btts','Both teams score',(h,a)=>h>0&&a>0);add('not_btts','At least one team does not score',(h,a)=>h===0||a===0);add('clean_sheet','Team clean sheet',(_,a)=>a===0);add('no_goal','Team fails to score',h=>h===0);add('odd_total','Odd total goals',(h,a)=>(h+a)%2===1);add('even_total','Even total goals',(h,a)=>(h+a)%2===0);
  for(const line of [-2,-1,1,2]){add('handicap_win_'+line,'Team European handicap '+(line>0?'+':'')+line+' win',(h,a)=>h+line>a);add('handicap_draw_'+line,'Team European handicap '+(line>0?'+':'')+line+' draw',(h,a)=>h+line===a);}
  function counts(hist){return definitions.map(d=>({id:d.id,label:d.label,met:hist.reduce((n,[h,a,c])=>n+(d.test(h,a)?c:0),0),samples:hist.reduce((n,r)=>n+r[2],0)}));}
  return {definitions,counts};
});
