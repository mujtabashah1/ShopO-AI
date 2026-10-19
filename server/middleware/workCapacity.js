// Hold a slot until the handler settles, even if its client disconnects.
// This bounds aggregate expensive work in a single API process.
function createWorkCapacity(maximum = 4) {
  let active = 0;
  return handler => async (req, res, next) => {
    if (active >= maximum) {
      res.setHeader('Retry-After', '10');
      return res.status(503).json({ message: 'Search and analysis are busy. Please try again shortly.' });
    }
    active += 1;
    try { await handler(req, res, next); }
    catch (error) { next(error); }
    finally { active -= 1; }
  };
}

module.exports = { withWorkCapacity: createWorkCapacity(), createWorkCapacity };
