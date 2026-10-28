(() => {
  'use strict';
  const $=id=>document.getElementById(id),tasks=new Map();let timer;
  function notify(message,tone='info'){
    if(!message)return;const box=$('feedbackToast');box.hidden=false;box.dataset.tone=tone;$('feedbackText').textContent=String(message);clearTimeout(timer);if(tone!=='error')timer=setTimeout(()=>{box.hidden=true;},7000);
  }
  function render(){const active=[...tasks.values()].at(-1),box=$('activityDock');box.hidden=!active;if(!active)return;$('activityText').textContent=active.message;const bar=$('activityProgress');if(active.total){bar.max=active.total;bar.value=active.done||0;}else bar.removeAttribute('value');}
  window.ScopeFeedback={notify,start(id,message,total=0){tasks.set(id,{message,total,done:0});render();},update(id,message,done,total){tasks.set(id,{message,done,total});render();},finish(id,message,tone='success'){tasks.delete(id);render();if(message)notify(message,tone);}};
  $('dismissFeedback').addEventListener('click',()=>{$('feedbackToast').hidden=true;});
  // Existing inline status messages stay in context; explicit actions also get
  // a small visible acknowledgement even when their results are below the fold.
  let actionUntil=0;document.addEventListener('click',e=>{if(e.target.closest('button'))actionUntil=Date.now()+80000;},true);document.addEventListener('submit',()=>{actionUntil=Date.now()+80000;},true);
  for(const id of ['slipFeedback','loadCodeFeedback','importFeedback','manualError','reviewBooking','cloudHistoryStatus']){const el=$(id);if(!el)continue;let previous=el.textContent;new MutationObserver(()=>{const text=el.textContent.trim();if(text&&text!==previous&&Date.now()<actionUntil&&!/^Saved|^Saving|^Up to/.test(text))notify(text,/failed|unavailable|cannot|not accepted|invalid|error/i.test(text)?'error':'info');previous=text;}).observe(el,{childList:true,subtree:true,characterData:true});}
})();
