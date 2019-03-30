module.exports = {
  apps: [{
    name: 'MatchMaker',
    script: 'app.js',

    instances: 1,
    autorestart: true
  }]
};
