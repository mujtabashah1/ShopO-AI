module.exports = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE' ? 413
    : err.type === 'entity.parse.failed' || err.name === 'MulterError' ? 400
    : Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error('Server error:', err.message);
  res.status(status).json({ message: status === 413 ? 'Upload or request body is too large.'
    : status === 500 ? 'Internal server error' : status === 400 ? 'Invalid request. Check the submitted data.' : err.message });
};
