import { createServer } from 'vite';

const exportPlugin = {
  name: 'pitch-test-export',
  transform(code, id) {
    if (!id.endsWith('PitchCanvas2D.jsx')) return null;
    let out = code;
    if (process.env.NO_TRANSITION) out = out.replace('const CORNER_TRANSITION_SIM_MS = 11000;', 'const CORNER_TRANSITION_SIM_MS = 0;');
    if (process.env.REQ_BACK) out = out.replace(/const requiredBack = clamp\([^;]+;/, `const requiredBack = ${Number(process.env.REQ_BACK)};`);
    return {
      code: `${out}\nexport const __t = { createEngine, syncAgents, applyAction, updateBallAndMatchFlow, updatePlayerPositions, setupCornerKickPlay, distance };\n`,
      map: null,
    };
  },
};

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  plugins: [exportPlugin],
});
try {
  await server.ssrLoadModule('/tmp_corner_test.mjs');
} finally {
  await server.close();
}
