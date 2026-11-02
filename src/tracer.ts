import tracer from 'dd-trace';

// Inicializa o agente do Datadog para coletar métricas e correlacionar logs
tracer.init({
  logInjection: true,
  env: process.env.NODE_ENV || 'production',
  service: 'oficina-mecanica-api',
});

export default tracer;