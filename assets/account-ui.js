(() => {
  'use strict';
  const $=id=>document.getElementById(id);let client=null,user=null,configuration=null,resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  function showSession(session){
    const old=user?.id||'',next=session?.user||null;user=next;
    $('accountStatus').textContent=user?'Signed in as '+user.email+'. Saving automatically across devices.':'Sign in with the same email on each device to load your saved workspace.';
    $('accountSignIn').hidden=Boolean(user);$('accountSignOut').hidden=!user;
    $('accountNav').textContent=user?'My account':'Sign in';
    if(old!==(user?.id||''))document.dispatchEvent(new CustomEvent('scope:session',{detail:{user:user?{id:user.id,email:user.email}:null}}));
  }
  async function check(){
    const response=await fetch('/api/account',{cache:'no-store',signal:AbortSignal.timeout(15000)}),r=await response.json();if(!response.ok||!r.ok)throw Error(r.error||'Database status unavailable.');configuration=r;
    $('databaseStatus').textContent=r.database.connected?'Database connected. Server reads verified.':r.database.issues.join(' ');
    $('databaseStatus').className=r.database.connected?'connection-message good':'connection-message bad';$('accountSubmit').disabled=!r.auth||!r.database.connected;
    if(r.database.connected)fetch('/api/account?view=bootstrap',{cache:'no-store',signal:AbortSignal.timeout(60000)}).then(x=>x.json()).then(x=>{$('knowledgeStatus').textContent=x.ok?'Shared historical models and imported team profiles are available in Supabase.':'Historical archive setup will retry: '+(x.error||'database unavailable');}).catch(()=>{$('knowledgeStatus').textContent='Historical archive preparation will retry when this page reloads.';});
    return r;
  }
  window.ScopeAccount={ready,user:()=>user,storageKey:key=>user?'scope.user.'+user.id+'.'+key:key,
    async headers(){await ready;if(!client)return {};const {data,error}=await client.auth.getSession();if(error)throw error;return data.session?{Authorization:'Bearer '+data.session.access_token}:{};},check};
  $('checkDatabase').addEventListener('click',()=>check().catch(e=>{$('databaseStatus').textContent=e.message;}));
  $('accountSignIn').addEventListener('submit',async e=>{e.preventDefault();if(!client)return;$('accountSubmit').disabled=true;$('accountFeedback').textContent='Sending your sign-in link…';try{const {error}=await client.auth.signInWithOtp({email:$('accountEmail').value.trim(),options:{emailRedirectTo:location.origin+'/#settings'}});if(error)throw error;$('accountFeedback').textContent='Check your email and open the sign-in link on this device. You will stay signed in. Use the same email on other devices.';}catch(err){$('accountFeedback').textContent=err.message;}finally{$('accountSubmit').disabled=!configuration?.database?.connected;}});
  $('accountSignOut').addEventListener('click',async()=>{if(!client)return;const {error}=await client.auth.signOut({scope:'local'});if(error)$('accountFeedback').textContent=error.message;else{$('accountFeedback').textContent='Signed out on this device. Your saved account data stays in Supabase.';showSession(null);}});
  (async()=>{try{
    const r=await check();if(!r.auth){$('accountFeedback').textContent='The server needs its publishable Supabase key configured before sign-in can start.';return;}
    client=supabase.createClient(r.auth.url,r.auth.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'scope.auth.v1'}});
    client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>showSession(session),0);});
    const {data,error}=await client.auth.getSession();if(error)throw error;showSession(data.session);
  }catch(e){$('accountFeedback').textContent=e.message;}finally{resolveReady();}})();
})();
