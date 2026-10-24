// Isolated real-football proxy endpoint for serverless deployment.
const virtual = require('./virtual');
module.exports = (req, res) => {
  req.query = { ...(req.query || {}), mode: 'real' };
  return virtual(req, res);
};
