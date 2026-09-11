import { createApp } from './app';
import { env } from './config/env';
import { connectDB, disconnectDB } from './config/db';
import './config/redis'; // initialise Upstash Redis + BullMQ connection
import './queues/leadQueue'; // boot the BullMQ Worker (starts listening for jobs)

async function bootstrap() {
  const app = createApp();

  // Attempt DB connection
  await connectDB();

  const server = app.listen(env.PORT, () => {
    console.log('====================================================');
    console.log(`🚀 LeadPulse AI Backend Server Running!`);
    console.log(`📡 Environment: ${env.NODE_ENV}`);
    console.log(`🔗 API Base:    http://localhost:${env.PORT}${env.API_PREFIX}`);
    console.log(`🩺 Healthcheck: http://localhost:${env.PORT}${env.API_PREFIX}/health`);
    console.log(`🌐 CORS Origins: ${env.CORS_ORIGINS.join(', ')} (*.vercel.app)`);
    console.log('====================================================');
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      console.log('🔒 HTTP server closed.');
      await disconnectDB();
      console.log('👋 Process terminated gracefully.');
      process.exit(0);
    });

    // Force exit after 10 seconds if lingering connections exist
    setTimeout(() => {
      console.error('⚠️ Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('💥 Fatal error during server startup:', err);
  process.exit(1);
});
