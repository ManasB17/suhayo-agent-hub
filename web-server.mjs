import { startCoordinator } from './src/coordinator.mjs';

try {
  const server = await startCoordinator();
  const address = server.address();
  console.log(`Agent Hub is ready at http://127.0.0.1:${address.port}`);
} catch (error) {
  if (error.code === 'EADDRINUSE') {
    console.error('Agent Hub is already running.');
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
}
