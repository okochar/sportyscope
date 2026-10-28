'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
async function harness(hash=''){
 const elements=new Map(),calls=[],storage=new Map();let onAuth;
 const el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',value:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){}},setAttribute(){},addEventListener(type,fn){this[type]=fn;},reportValidity(){return Boolean(this.value);}});return elements.get(id);};
 const auth={onAuthStateChange(fn){onAuth=fn;},async getSession(){return {data:{session:null},error:null};},async getUser(){return {data:{user:{id:'test-id',email:'test@example.invalid'}}};},async signInWithPassword(b){calls.push(['login',b]);return {data:{session:{user:{id:'test-id',email:b.email},access_token:'test'}},error:null};},async signUp(b){calls.push(['signup',b]);return {data:{session:null,user:{id:'test-id'}},error:null};},async resetPasswordForEmail(email,options){calls.push(['reset',email,options]);return {error:null};},async updateUser(b){calls.push(['password',b]);return {error:null};}};
 const context={window:{},document:{getElementById:el,querySelectorAll(){return [];},dispatchEvent(){}},supabase:{createClient(){return {auth};}},location:{hash,origin:'https://sportyscope.vercel.app',hostname:'sportyscope.vercel.app'},ScopeNavigation:{go:key=>calls.push(['navigate',key])},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},setInterval(){},setTimeout:fn=>{fn();},fetch:async url=>new Response(JSON.stringify(url.includes('bootstrap')?{ok:true,ready:true,archiveRecords:89706,nextCursor:null}:{ok:true,auth:{url:'https://test.supabase.co',key:'sb_publishable_test'},database:{connected:true,issues:[]}})),AbortSignal,URLSearchParams,CustomEvent:class{},Promise,Error,Boolean,String,Date};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../assets/account-ui.js'),'utf8'),context);await context.window.ScopeAccount.ready;await new Promise(setImmediate);return {el,calls,context,onAuth};
}
test('Password login establishes the account and does not mistake an email request for a session',async()=>{
 const h=await harness();assert.equal(h.el('accountSubmit').disabled,false);h.el('accountEmail').value='test@example.invalid';h.el('accountPassword').value='example-test-only';await h.el('accountSignIn').submit({preventDefault(){}});assert.equal(h.calls[0][0],'login');assert.equal(h.context.window.ScopeAccount.user().id,'test-id');assert.match(h.el('accountStatus').textContent,/Logged in/);assert.equal(h.el('accountPassword').value,'');
});
test('Expired-link callback shows a recovery action and opens the account screen',async()=>{
 const h=await harness('#error=access_denied&error_code=otp_expired');assert.match(h.el('accountFeedback').textContent,/expired or was already used/);assert.ok(h.calls.some(x=>x[0]==='navigate'&&x[1]==='settings'));assert.equal(h.context.window.ScopeAccount.user(),null);
});
test('Legacy email-link accounts can request password setup with the production redirect',async()=>{
 const h=await harness();h.el('accountEmail').value='test@example.invalid';await h.el('accountForgot').click();const reset=h.calls.find(x=>x[0]==='reset');assert.equal(reset[2].redirectTo,'https://sportyscope.vercel.app/#settings');assert.equal(h.context.window.ScopeAccount.user(),null);assert.match(h.el('accountFeedback').textContent,/newest reset email/);
});
