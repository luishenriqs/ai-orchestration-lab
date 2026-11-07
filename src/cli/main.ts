import { runSimulation } from '../scenarios/p1.js';
if (process.argv.length !== 3 || process.argv[2] !== 'simulate') {
    console.error('Usage: node dist/src/cli/main.js simulate');
    process.exitCode = 2;
}
else {
    try {
        const report = await runSimulation();
        console.log(JSON.stringify({ run_id: report.run_id, passed: report.passed, failed: report.failed, blocked: report.blocked }));
        process.exitCode = report.failed || report.blocked ? 1 : 0;
    }
    catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}
