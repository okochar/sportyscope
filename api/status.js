const {json} = require('../lib/upstream');
module.exports = (req, res) => json(res, 200, {ok:true, service:'VirtualScope', fetchedAt:new Date().toISOString()});
