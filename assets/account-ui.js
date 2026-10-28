(() => {
  'use strict';
  const $=id=>document.getElementById(id);let client=null,user=null,configuration=null,resolveReady,mode='login',busy=false,recovering=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery';
  const callback=new URLSearchParams(location.hash.slice(1)),callbackError=callback.get('error_code')||callback.get('error');
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  // The auth provider owns the callback fragment. Recovery routes to Account
  // after the SDK has consumed it, so a screen hash cannot corrupt the token.
  const redirect=()=>location.hostname==='localhost'||location.hostname==='127.0.0.1'?'https://sportyscope.vercel.app/':location.origin+'/';
  function feedback(message,tone='info'){ $('accountFeedback').textContent=message;$('accountFeedback').dataset.tone=tone;window.ScopeFeedback?.notify(message,tone); }
  function controls(){const usable=Boolean(client&&configuration?.database?.connected&&!busy);$('accountSubmit').disabled=!usable;$('accountForgot').disabled=!usable;$('accountSubmit').textContent=busy?'Please wait…':!client?'Connecting…':mode==='signup'?'Create account':'Log in';}
  function showSession(session){
    const old=user?.id||'';user=session?.user||null;
    $('accountStatus').textContent=user?'Logged in as '+user.email+'. Your workspace saves automatically.':'Log in to save your tickets, settings and history across devices.';
    $('accountSignIn').hidden=Boolean(user);$('accountModes').hidden=Boolean(user);$('accountSignOut').hidden=!user;$('accountPasswordSettings').hidden=!user;
    $('accountNav').textContent=user?'My account':'Log in';
    if(user&&recovering){$('passwordEditor').open=true;$('accountPasswordHint').textContent='Choose your password to finish account recovery.';ScopeNavigation.go('settings');}
    if(old!==(user?.id||''))document.dispatchEvent(new CustomEvent('scope:session',{detail:{user:user?{id:user.id,email:user.email}:null}}));
  }
  async function initializeClient(r){
    if(client||!r.auth)return;
    client=supabase.createClient(r.auth.url,r.auth.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:!callbackError,storageKey:'scope.auth.v1'}});
    client.auth.onAuthStateChange((event,session)=>{setTimeout(()=>{if(event==='PASSWORD_RECOVERY')recovering=true;showSession(session);if(event==='SIGNED_IN'&&session){feedback(recovering?'Recovery verified. Set your password below.':'Logged in. Loading your saved workspace…','success');}},0);});
    const {data,error}=await client.auth.getSession();if(error)throw error;
    if(data.session){const verified=await client.auth.getUser();if(verified.error)throw verified.error;showSession({...data.session,user:verified.data.user});}else showSession(null);
  }
  async function check(){
    const response=await fetch('/api/account',{cache:'no-store',signal:AbortSignal.timeout(15000)}),r=await response.json();if(!response.ok||!r.ok)throw Error(r.error||'Database status unavailable.');configuration=r;
    $('databaseStatus').textContent=r.database.connected?'Database connected. Automatic account storage is available.':r.database.issues.join(' ');$('databaseStatus').className=r.database.connected?'connection-message good':'connection-message bad';
    if(r.auth)await initializeClient(r);controls();
    if(r.database.connected)prepareArchive().catch(()=>{$('knowledgeStatus').textContent='Archive import paused. It will resume on the next visit; completed chunks stay in Supabase.';});
    return r;
  }
  let preparing=false;
  async function prepareArchive(){if(preparing)return;preparing=true;try{let cursor=0,seen=new Set();do{const response=await fetch('/api/account?view=bootstrap&cursor='+cursor,{cache:'no-store',signal:AbortSignal.timeout(65000)}),r=await response.json();if(!response.ok||!r.ok)throw Error(r.error||'Archive import unavailable');$('knowledgeStatus').textContent=r.ready?r.archiveRecords.toLocaleString()+' historical real-football results saved in Supabase. Recent provider results are retained as they arrive.':'Preparing historical database: '+r.savedChunks+'/'+r.chunks+' chunks saved.';if(r.nextCursor===null)break;if(seen.has(r.nextCursor))throw Error('Archive cursor repeated');seen.add(r.nextCursor);cursor=r.nextCursor;}while(true);}finally{preparing=false;}}
  window.ScopeAccount={ready,user:()=>user,storageKey:key=>user?'scope.user.'+user.id+'.'+key:key,async headers(){await ready;if(!client)return {};const {data,error}=await client.auth.getSession();if(error)throw error;return data.session?{Authorization:'Bearer '+data.session.access_token}:{};},check};
  function setMode(next){mode=next;for(const b of document.querySelectorAll('[data-auth-mode]')){b.classList.toggle('active',b.dataset.authMode===mode);b.setAttribute('aria-pressed',String(b.dataset.authMode===mode));}$('accountConfirmLabel').hidden=mode!=='signup';$('accountConfirm').required=mode==='signup';$('accountPassword').autocomplete=mode==='signup'?'new-password':'current-password';$('accountPassword').minLength=mode==='signup'?8:1;$('accountFormHint').textContent=mode==='signup'?'Create an account, confirm your email once, then use your password to log in.':'Previously used an email link? Use “Set or reset password” once for that same email.';controls();}
  document.querySelectorAll('[data-auth-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.authMode)));
  $('checkDatabase').addEventListener('click',()=>check().then(()=>feedback('Connection checked.')).catch(e=>feedback(e.message,'error')));
  $('accountSignIn').addEventListener('submit',async e=>{
    e.preventDefault();if(!client||busy)return;const email=$('accountEmail').value.trim(),password=$('accountPassword').value;
    if(mode==='signup'&&password!==$('accountConfirm').value){feedback('The two passwords do not match.','error');return;}
    busy=true;controls();feedback(mode==='signup'?'Creating your account…':'Logging in…');
    try{const result=mode==='signup'?await client.auth.signUp({email,password,options:{emailRedirectTo:redirect()}}):await client.auth.signInWithPassword({email,password});if(result.error)throw result.error;
      $('accountPassword').value='';$('accountConfirm').value='';
      if(result.data.session){showSession(result.data.session);feedback('Logged in. Your workspace will save automatically.','success');}
      else feedback('Check your email to confirm your account. Open the newest confirmation once, then log in here. If you already used email links, choose Set or reset password.','success');
    }catch(err){const message=/invalid login credentials/i.test(err.message)?'Email or password was not accepted. If you used email links before, choose Set or reset password.':/email not confirmed/i.test(err.message)?'Confirm your email before logging in. Use the newest confirmation email.':err.message;feedback(message,'error');}finally{busy=false;controls();}
  });
  $('accountForgot').addEventListener('click',async()=>{
    if(!client||busy)return;if(!$('accountEmail').reportValidity())return;busy=true;controls();feedback('Requesting a password setup email…');
    try{const {error}=await client.auth.resetPasswordForEmail($('accountEmail').value.trim(),{redirectTo:redirect()});if(error)throw error;feedback('Password setup requested. If this email has an account, open the newest reset email on this device and choose your password. Older links cannot be reused.','success');}catch(e){feedback(e.message,'error');}finally{busy=false;controls();}
  });
  $('accountSetPassword').addEventListener('submit',async e=>{
    e.preventDefault();if(!client||!user)return;const password=$('newAccountPassword').value;if(password!==$('newAccountConfirm').value){feedback('The two new passwords do not match.','error');return;}
    const button=$('saveAccountPassword');button.disabled=true;try{const {error}=await client.auth.updateUser({password});if(error)throw error;e.target.reset();recovering=false;$('passwordEditor').open=false;feedback('Password saved. Use your email and this password on any device.','success');}catch(err){feedback(err.message,'error');}finally{button.disabled=false;}
  });
  $('accountSignOut').addEventListener('click',async()=>{if(!client)return;const {error}=await client.auth.signOut({scope:'local'});if(error)feedback(error.message,'error');else{showSession(null);feedback('Logged out on this device. Your saved data remains in Supabase.');}});
  (async()=>{try{const r=await check();if(!r.auth)feedback('Account sign-in is unavailable: the server publishable key is missing.','error');}catch(e){feedback(e.message,'error');}finally{controls();resolveReady();if(callbackError){ScopeNavigation.go('settings');feedback(callbackError==='otp_expired'?'That email link has expired or was already used. Use Log in with your password, or request a fresh password setup email below.':'Sign-in could not finish. '+(callback.get('error_description')||callbackError),'error');}else if(recovering)ScopeNavigation.go('settings');}})();
  setMode('login');setInterval(()=>{if(!document.hidden&&(!client||!configuration?.database?.connected))check().catch(()=>{});},20000);
})();
