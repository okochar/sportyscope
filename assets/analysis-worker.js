'use strict';
importScripts('/assets/analysis.js?v=5.3.1');
self.onmessage=e=>{const {id,family,snapshot,settings,now,reports,feedback}=e.data;try{self.postMessage({id,family,result:ScopeAnalysis.analyze(snapshot,family,settings,now,reports,feedback)});}catch(err){self.postMessage({id,family,error:err.message});}};
