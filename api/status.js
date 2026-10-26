const {json} = require('../lib/upstream');
module.exports = (req, res) => json(res, 200, {ok:true, service:'SportyScope', fetchedAt:new Date().toISOString(),knowledgeStore:require('../lib/knowledge-store').store.status()});
