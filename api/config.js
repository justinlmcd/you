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
  for (const app of APPS) { const v = (process.env['URL_' + app.toUpperCase()] || '').trim(); if (/^https:\/\/[^\s]+$/.test(v)) urls[app] = v.replace(/\/$/, ''); }
  response.statusCode = 200;
  response.end(JSON.stringify({url, key, urls}));
};
