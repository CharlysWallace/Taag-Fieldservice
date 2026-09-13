// Contadores temporários, sem armazenar mensagens, senhas ou tokens.
module.exports = function rateLimit(max = 10, windowMs = 15 * 60 * 1000) {
  const entries = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of entries) if (value.until < now) entries.delete(key);
    const key = req.session?.userId || req.ip;
    const value = entries.get(key) || { count: 0, until: now + windowMs };
    if (entries.size >= 10000 && !entries.has(key)) return res.status(429).json({ erro: 'Tente novamente em alguns minutos.' });
    entries.set(key, value); value.count++;
    if (value.count > max) { res.set('Retry-After', String(Math.ceil((value.until - now) / 1000))); return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' }); }
    next();
  };
};
