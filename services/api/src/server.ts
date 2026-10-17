import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './common/config.js';
import { firebaseApp, firestore } from './common/firebase.js';
import { ProviderCallLog } from './modules/astrology-provider/call-log.js';
import { createProvider } from './modules/astrology-provider/factory.js';
import { chartsModule } from './modules/charts/routes.js';
import { ChartsService } from './modules/charts/service.js';
import { dashaModule } from './modules/dasha/routes.js';
import { DashaService } from './modules/dasha/service.js';
import { predictionsModule } from './modules/predictions/routes.js';
import { PredictionsService } from './modules/predictions/service.js';
import { ReadingsCache } from './modules/readings/cache.js';
import { FirebaseTokenVerifier } from './modules/auth/verifier.js';
import { placesModule } from './modules/places/routes.js';
import { PlacesService } from './modules/places/service.js';
import { QuotaService } from './modules/quota/service.js';
import { ProfilesService } from './modules/birth-profiles/service.js';
import { profilesModule } from './modules/birth-profiles/routes.js';
import { AccountDeletionService, FirebaseAuthAdmin } from './modules/users/deletion.js';
import { createUsersService, usersModule } from './modules/users/routes.js';

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

  const db = firestore(config.firebaseProjectId);
  const callLog = new ProviderCallLog(db, (error: unknown) => {
    const reason = error instanceof Error ? error.message : 'unknown';
    process.stderr.write(`providerCalls write failed: ${reason}\n`);
  });
  const provider = createProvider(config, { onCall: callLog.record });
  const quota = new QuotaService({
    db,
    pepper: config.uidHashPepper,
    limitPerDay: config.quotaProviderCallsPerDay,
  });

  const pepper = config.uidHashPepper;
  const users = createUsersService({ db, pepper });
  const places = new PlacesService({ db, provider, quota });
  const profiles = new ProfilesService({ db, users, places, pepper });
  const cache = new ReadingsCache({ db, quota, source: provider.source });
  const charts = new ChartsService({ profiles, provider, cache });
  const dasha = new DashaService({ profiles, provider, cache });
  const predictions = new PredictionsService({ profiles, provider, cache });
  const deletion = new AccountDeletionService({
    db,
    pepper,
    authAdmin: new FirebaseAuthAdmin(firebaseApp(config.firebaseProjectId)),
  });

  const app = buildApp(config, {
    deps: { verifier: new FirebaseTokenVerifier(firebaseApp(config.firebaseProjectId)) },
    modules: [
      usersModule({ db, pepper, deletion }, users),
      placesModule(places),
      profilesModule(profiles),
      chartsModule(charts),
      dashaModule(dasha),
      predictionsModule(predictions),
    ],
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
