const handler = require('./virtual');
module.exports = (req, res) => { req.query = {...req.query, family: 'Real'}; return handler(req, res); };
