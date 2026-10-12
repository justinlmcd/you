'use strict';

// Public settings only: the Supabase connection and where each app lives. No secret leaves the server.
const APPS = ['body', 'money', 'gym', 'meal', 'write', 'read'];
module.exports = function config(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); response.statusCode = 405; return response.end(JSON.stringify({error: 'Method not allowed.'})); }
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    response.statusCode = 503;
    return response.end(JSON.stringify({error: 'Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Vercel, then redeploy YOU.'}));
  }
  const urls = {};
  // Accept the address with or without https://, with or without a trailing slash.
  for (const app of APPS) {
    let v = (process.env['URL_' + app.toUpperCase()] || '').trim().replace(/\/+$/, '');
    if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
    if (/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(v)) urls[app] = v;
  }
  response.statusCode = 200;
  response.end(JSON.stringify({url, key, urls}));
};
