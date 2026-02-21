#!/usr/bin/env node
/**
 * privaseeAI CLI — interactive command runner
 * Usage: node cli.js
 */

const { execSync, spawn } = require('child_process');
const readline = require('readline');

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const CYAN   = '\x1b[36m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const DIM    = '\x1b[2m';

const GROUPS = [
  {
    label: 'Development',
    items: [
      { key: '1', label: 'Start dev server (Vite HMR)',            cmd: 'npm run dev' },
      { key: '2', label: 'Start production server (Express)',      cmd: 'npm run start',     killPort: true },
      { key: '3', label: 'Start dev + server (parallel)',          cmd: 'npx concurrently "npm run dev" "node server.js"' },
    ],
  },
  {
    label: 'Build',
    items: [
      { key: '4', label: 'Build (tsc + vite)',                     cmd: 'npm run build' },
      { key: '5', label: 'Type-check only (no emit)',              cmd: 'npm run type-check' },
      { key: '6', label: 'Preview production build',              cmd: 'npm run preview' },
    ],
  },
  {
    label: 'Quality',
    items: [
      { key: '7', label: 'Lint',                                   cmd: 'npm run lint' },
      { key: '8', label: 'Run tests (vitest)',                     cmd: 'npm run test' },
      { key: '9', label: 'Security audit (npm audit)',             cmd: 'npm run security:audit' },
    ],
  },
  {
    label: 'Server management',
    items: [
      { key: '10', label: 'Kill port 3000 & restart server',      cmd: null, action: 'restart' },
      { key: '11', label: 'Kill port 3000',                       cmd: null, action: 'kill3000' },
      { key: '12', label: 'Show what is on port 3000',            cmd: "lsof -ti :3000 | xargs -I{} ps -p {} -o pid,command || echo 'Nothing on port 3000'" },
    ],
  },
  {
    label: 'Azure',
    items: [
      { key: '13', label: 'Azure login',                          cmd: 'az login' },
      { key: '14', label: 'Set Azure subscription',              cmd: 'az account set --subscription 8609cf56-a75d-4067-b900-0f182d935103 && az account show --query "{name:name,id:id,tenantId:tenantId}" -o table' },
      { key: '15', label: 'List Azure Container Apps',           cmd: 'az containerapp list -g privaseeai-rg -o table' },
      { key: '16', label: 'Show ACR images',                     cmd: 'az acr repository list -n privaseeaiacr -o table' },
      { key: '17', label: 'Tail Container App logs',             cmd: 'az containerapp logs show -n privaseeai -g privaseeai-rg --follow' },
    ],
  },
  {
    label: 'Drone / Camera',
    items: [
      { key: '18', label: 'List active RTSP streams',            cmd: "curl -s http://localhost:3000/api/streams | node -e \"const d=JSON.parse(require('fs').readFileSync(0,'utf8'));if(!d.streams?.length){console.log('No active streams');}else{d.streams.forEach(s=>console.log(s.id,s.name,s.url))}\"" },
      { key: '19', label: 'Probe AGM thermal camera (auto)',     cmd: "curl -s -X POST http://localhost:3000/api/thermal/probe | node -e \"const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify(d,null,2))\"" },
      { key: '20', label: 'Show drone status',                   cmd: "curl -s http://localhost:3000/api/drone/status | node -e \"const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify(d,null,2))\"" },
      { key: '21', label: 'Show network interfaces (for drone)', cmd: "ifconfig | grep -E '^[a-z]|inet ' | grep -v '127.0.0.1'" },
    ],
  },
  {
    label: 'Git',
    items: [
      { key: '22', label: 'Git status',                          cmd: 'git status' },
      { key: '23', label: 'Git log (last 10)',                   cmd: 'git --no-pager log --oneline -10' },
      { key: '24', label: 'Git diff (staged)',                   cmd: 'git --no-pager diff --stat' },
      { key: '25', label: 'Push to main',                       cmd: 'git push origin main' },
    ],
  },
];

function printMenu() {
  console.clear();
  console.log(`${BOLD}${CYAN}╔══════════════════════════════════════╗`);
  console.log(`║       privaseeAI  ·  CLI Menu        ║`);
  console.log(`╚══════════════════════════════════════╝${RESET}\n`);

  for (const group of GROUPS) {
    console.log(`${BOLD}${YELLOW}  ${group.label}${RESET}`);
    for (const item of group.items) {
      const keyPad = item.key.padStart(2, ' ');
      console.log(`  ${DIM}[${RESET}${GREEN}${keyPad}${RESET}${DIM}]${RESET}  ${item.label}`);
    }
    console.log();
  }
  console.log(`  ${DIM}[${RESET}${RED} q${RESET}${DIM}]${RESET}  Quit\n`);
}

function run(cmd) {
  console.log(`\n${DIM}$ ${cmd}${RESET}\n`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: __dirname });
  } catch {
    // non-zero exit is fine (e.g. lsof when nothing on port)
  }
}

function killPort3000() {
  try {
    execSync('lsof -ti :3000 | xargs kill -9 2>/dev/null || true', { stdio: 'pipe' });
    console.log(`${GREEN}Port 3000 cleared.${RESET}`);
  } catch {
    console.log(`${YELLOW}Nothing was using port 3000.${RESET}`);
  }
}

async function prompt(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(msg, ans => { rl.close(); resolve(ans.trim()); }));
}

async function handleChoice(choice) {
  const all = GROUPS.flatMap(g => g.items);
  const item = all.find(i => i.key === choice);

  if (!item) {
    console.log(`${RED}Unknown option: ${choice}${RESET}`);
    return;
  }

  if (item.action === 'kill3000') {
    killPort3000();
    return;
  }

  if (item.action === 'restart') {
    killPort3000();
    console.log(`\n${DIM}Starting server...${RESET}\n`);
    const child = spawn('node', ['server.js'], {
      stdio: 'inherit',
      cwd: __dirname,
      detached: false,
    });
    console.log(`\n${GREEN}Server started (PID ${child.pid}). Press Ctrl+C to stop.${RESET}`);
    await new Promise(resolve => child.on('exit', resolve));
    return;
  }

  if (item.killPort) {
    killPort3000();
  }

  run(item.cmd);
}

async function main() {
  while (true) {
    printMenu();
    const choice = await prompt(`${BOLD}Enter number (or q to quit): ${RESET}`);
    if (choice === 'q' || choice === 'Q') {
      console.log(`\n${CYAN}Bye!${RESET}\n`);
      process.exit(0);
    }
    await handleChoice(choice);
    await prompt(`\n${DIM}Press Enter to return to menu...${RESET}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
