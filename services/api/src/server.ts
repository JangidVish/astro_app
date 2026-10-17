import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './common/config.js';
import { FirebaseTokenVerifier } from './modules/auth/verifier.js';

function start(): void {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      // Fail fast before serving traffic. The message lists variable names, never values.
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const app = buildApp(config, {
    deps: { verifier: new FirebaseTokenVerifier(config.firebaseProjectId) },
  });

  // Cloud Run sends SIGTERM before stopping an instance; finish in-flight requests first.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'shutting down');
      app.close().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
  }

  // Cloud Run requires listening on all interfaces; locally, stay on loopback so the dev server
  // is not reachable from the LAN.
  const host = config.env === 'staging' || config.env === 'prod' ? '0.0.0.0' : '127.0.0.1';
  app.listen({ host, port: config.port }).catch((error: unknown) => {
    app.log.fatal({ err: error }, 'failed to start');
    process.exit(1);
  });
}

start();
