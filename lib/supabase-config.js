'use strict';
function config(env=process.env){
  const url=String(env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||'').trim(),key=String(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY||'').trim(),publicKey=String(env.SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY||'').trim(),issues=[];
  if(!url)issues.push('SUPABASE_URL is missing from this deployment.');
  else{try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||!u.hostname.endsWith('.supabase.co')||u.pathname!=='/')issues.push('SUPABASE_URL must be the project API URL, such as https://project.supabase.co.');}catch{issues.push('SUPABASE_URL is not a valid project API URL.');}}
  if(!key)issues.push('SUPABASE_SECRET_KEY is missing from this deployment. Add it to Vercel Production, then redeploy.');
  if(key.startsWith('sb_publishable_'))issues.push('SUPABASE_SECRET_KEY contains a publishable key. Use a server secret or service_role key.');
  return {url,key,publicKey,issues,configured:!issues.length};
}
module.exports={config};
