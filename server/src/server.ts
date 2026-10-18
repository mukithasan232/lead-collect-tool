import { createApp } from './app';
import { env } from './config/env';
import { connectDB, disconnectDB } from './config/db';
import './config/redis'; // initialise Upstash Redis + BullMQ connection
import './queues/leadQueue'; // boot the BullMQ Worker (starts listening for jobs)

process.on('unhandledRejection', (reason, promise) => {
  console.warn('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.warn('⚠️ Uncaught Exception:', error);
});

async function bootstrap() {
  const app = createApp();

  // Attempt DB connection gracefully — never blocks HTTP server startup
  try {
    await connectDB();
  } catch (err) {
    console.warn('⚠️ Non-fatal DB connection error during startup:', err);
  }

  const server = app.listen(env.PORT, () => {
    console.log('====================================================');
    console.log(`🚀 LeadPulse AI Backend Server Running!`);
    console.log(`📡 Environment: ${env.NODE_ENV}`);
    console.log(`🔗 API Base:    http://0.0.0.0:${env.PORT}${env.API_PREFIX}`);
    console.log(`🩺 Healthcheck: http://0.0.0.0:${env.PORT}${env.API_PREFIX}/health`);
    console.log(`🌐 CORS Allowed: All origins (origin: true, credentials: true)`);
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
      console.warn('⚠️ Could not close connections in time, forcefully shutting down');
      process.exit(0);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('⚠️ Startup encountered an error, attempting emergency server start:', err);
  try {
    const emergencyApp = createApp();
    emergencyApp.listen(env.PORT || 5001, () => {
      console.log(`🚀 Emergency fallback server listening on port ${env.PORT || 5001}`);
    });
  } catch (fatalErr) {
    console.error('💥 Fatal error starting emergency server:', fatalErr);
    process.exit(1);
  }
});
