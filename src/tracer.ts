import tracer from 'dd-trace';

// Inicializa o agente do Datadog para coletar métricas e correlacionar logs
tracer.init({
  logInjection: true,
  env: process.env.DD_ENV ?? process.env.NODE_ENV ?? 'production',
  service: process.env.DD_SERVICE ?? 'os-service',
  version: process.env.DD_VERSION,
});

export default tracer;