fetch('http://localhost:3000/api/command-center')
  .then(r => r.text())
  .then(t => console.log('Response body:', t))
  .catch(e => console.error(e));
