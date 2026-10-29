(() => {
 'use strict';const previous=new WeakMap(),pending=new WeakMap();
 function html(element,value){
  if(previous.get(element)===value)return;
  const active=document.activeElement;
  if(element.contains(active)&&active?.matches('input,select,textarea')){pending.set(element,value);if(!element.dataset.deferredUpdate){element.dataset.deferredUpdate='1';element.addEventListener('focusout',()=>{delete element.dataset.deferredUpdate;const next=pending.get(element);pending.delete(element);if(next!==undefined)setTimeout(()=>html(element,next),0);},{once:true});}return;}
  const opened=new Map([...element.querySelectorAll('details')].map(d=>[d.dataset.uiKey||d.querySelector('summary')?.textContent,d.open]));
  const scroll=element.scrollTop;element.innerHTML=value;previous.set(element,value);
  for(const d of element.querySelectorAll('details')){const key=d.dataset.uiKey||d.querySelector('summary')?.textContent;if(opened.has(key))d.open=opened.get(key);}
  element.scrollTop=scroll;
 }
 window.ScopeDOM={html};
})();
