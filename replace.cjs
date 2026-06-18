const fs = require('fs');
const path = require('path');

const replacements = {
  'bg-slate-950': 'bg-[#e4ebd8]',
  'bg-slate-900': 'bg-[#eef2e6]',
  'bg-slate-800': 'bg-white',
  'bg-slate-700': 'bg-[#d2d9c8]',
  'bg-slate-600': 'bg-[#afb8a3]',
  
  'border-slate-800': 'border-[#d2d9c8]',
  'border-slate-700': 'border-[#d2d9c8]',
  
  'text-slate-500': 'text-[#84917a]',
  'text-slate-400': 'text-[#6b7863]',
  'text-slate-300': 'text-[#505c4a]',
  'text-slate-200': 'text-[#384232]',

  'text-white/70': 'text-[#2b3327]/70',
  'text-white/40': 'text-[#2b3327]/40',
  'text-white': 'text-[#2b3327]',
  
  'bg-cyan-500': 'bg-[#6b8555]',
  'hover:bg-cyan-400': 'hover:bg-[#556943]',
  
  'text-cyan-400': 'text-[#556943]',
  'hover:text-cyan-300': 'hover:text-[#455438]',
  
  'border-cyan-400': 'border-[#6b8555]',
  'hover:border-cyan-500': 'hover:border-[#6b8555]',
  
  'ring-cyan-400': 'ring-[#6b8555]',
  
  'shadow-cyan-500': 'shadow-[#6b8555]',
  
  'bg-black/95': 'bg-[#eef2e6]/95',
  'bg-black/80': 'bg-[#e4ebd8]/80',
  'bg-black/50': 'bg-white/90',
  'bg-black/40': 'bg-white/80',

  'text-slate-950': 'text-[#ffffff]',

  // Adding border-b border-white/10 -> border-[#2b3327]/10
  'border-white/10': 'border-[#2b3327]/10',
  'bg-white/10': 'bg-[#2b3327]/10',
  'bg-white/20': 'bg-[#2b3327]/20',
};

const keys = Object.keys(replacements).sort((a, b) => b.length - a.length);

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('src', function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    
    for (const key of keys) {
      const val = replacements[key];
      const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[\\s"\'`\\]}])', 'g');
      content = content.replace(regex, val);
    }
    
    // special fixes
    // border-slate-700/50 etc.
    content = content.replace(/border-\[#d2d9c8\]\/50/g, 'border-[#d2d9c8]');
    content = content.replace(/bg-white\/50/g, 'bg-white');

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Updated', filePath);
    }
  } else if (filePath.endsWith('.css')) {
     let content = fs.readFileSync(filePath, 'utf8');
     content = content.replace(/#0f172a/gi, '#eef2e6').replace(/#ffffff/gi, '#2b3327');
     fs.writeFileSync(filePath, content, 'utf8');
     console.log('Updated css', filePath);
  }
});
