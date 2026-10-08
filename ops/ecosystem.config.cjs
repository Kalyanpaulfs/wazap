// Deployment template, matching the inspected process on 9 October 2026.
// Provision secrets separately; do not start this alongside an existing process.
module.exports = { apps: [{
  name: 'wazap',
  cwd: '/opt/wazap',
  script: '/usr/bin/bash',
  args: ['-c', 'cd /opt/wazap && exec npm start -- -H 127.0.0.1 -p 5000'],
}] };
