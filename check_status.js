const http = require('http');
const key = process.env.RENDER_API_KEY;
const options = {
  hostname: 'api.render.com',
  path: '/v1/services/srv-d918ri19rddc73dcj6gg',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + key
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    // Render returns 301 redirect, need to follow it or use the redirect URL
    console.log('Status Code:', res.statusCode);
    // Try to parse anyway
    try {
      const parsed = JSON.parse(data);
      console.log('Service:', parsed.name);
      console.log('Status:', parsed.status);
      if (parsed.deploys && parsed.deploys.length > 0) {
        const d = parsed.deploys[0];
        console.log('Deploy status:', d.status);
        console.log('Hostname:', d.hostname || 'not yet live');
        if (d.hostname) {
          console.log('LIVE URL: https://' + d.hostname);
        }
      }
    } catch(e) {
      console.log('Raw response (first 500 chars):', data.substring(0, 500));
    }
  });
});

req.on('error', (e) => { console.error('Error:', e.message); });
req.end();