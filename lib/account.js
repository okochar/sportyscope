'use strict';
const {config}=require('./supabase-config'),{hash}=require('./ticket-store');
function createAuth(env=process.env,fetcher=fetch){
  const c=config(env);
  async function user(req){
    const token=/^Bearer ([A-Za-z0-9._-]{20,8000})$/.exec(req.headers.authorization||'')?.[1];if(!token)return null;
    const r=await fetcher(c.url+'/auth/v1/user',{headers:{apikey:c.publicKey||c.key,Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000),redirect:'error'});
    if([401,403].includes(r.status))return null;if(!r.ok)throw Error('Account verification is temporarily unavailable. Your saved data is retained.');
    const u=await r.json();if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(u.id||''))return null;
    return {id:u.id,email:u.email||'',owner:hash('scope-account-v1:'+u.id)};
  }
  function publicConfig(){let safe=c.publicKey.startsWith('sb_publishable_');if(!safe){try{safe=JSON.parse(Buffer.from(c.publicKey.split('.')[1],'base64url').toString()).role==='anon';}catch{}}return safe&&c.url?{url:c.url,key:c.publicKey}:null;}
  return {user,publicConfig};
}
function sameOrigin(req){try{return !req.headers.origin||new URL(req.headers.origin).host===req.headers.host;}catch{return false;}}
module.exports={createAuth,auth:createAuth(),sameOrigin};
