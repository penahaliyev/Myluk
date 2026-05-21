const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(/JSON\.parse\(response\.text\)/g, 'parseGeminiResponse(response.text)');
fs.writeFileSync('server.ts', code);
