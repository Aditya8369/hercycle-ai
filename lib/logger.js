/**
 * HerCycle AI — Centralized Logger
 * Provides structured, environment-filtered, and sanitized logs.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

// Helper to sanitize log messages or objects, replacing sensitive keys/tokens/passwords
function sanitize(args) {
  const SENSITIVE_KEYS = [
    'key', 'token', 'secret', 'password', 'service_role', 'apikey', 'bearer', 
    'clerk_secret_key', 'gemini_api_key', 'groq_api_key', 'supabase_service_role_key',
    'symptoms', 'mood', 'flow' // Mask personal medical/health data from logs
  ];

  return args.map(arg => {
    if (typeof arg === 'string') {
      // Regex replace sensitive information if it looks like a URL or key
      let sanitized = arg;
      for (const key of SENSITIVE_KEYS) {
        const regex = new RegExp(`(${key}\\s*[:=]\\s*)[^\\s&",;]+`, 'gi');
        sanitized = sanitized.replace(regex, `$1[REDACTED]`);
      }
      return sanitized;
    }

    const isErrorObj = arg instanceof Error || (arg && typeof arg === 'object' && typeof arg.stack === 'string' && typeof arg.message === 'string');
    if (isErrorObj) {
      return arg;
    }

    if (arg && typeof arg === 'object') {
      try {
        const copy = JSON.parse(JSON.stringify(arg));
        const redactObject = (obj) => {
          for (const k in obj) {
            if (SENSITIVE_KEYS.some(sk => k.toLowerCase().includes(sk))) {
              obj[k] = '[REDACTED]';
            } else if (obj[k] && typeof obj[k] === 'object') {
              redactObject(obj[k]);
            }
          }
        };
        redactObject(copy);
        return copy;
      } catch {
        return '[Unserializable Object - REDACTED]';
      }
    }

    return arg;
  });
}

/**
 * Formats a log payload into a standardized JSON structure.
 */
function buildStructuredLog(level, args) {
  const timestamp = new Date().toISOString();
  const sanitizedArgs = sanitize(args);

  let route = null;
  let status = level === 'ERROR' ? 500 : 200;
  let stack = null;
  let messageParts = [];
  let metadata = {};

  for (const arg of sanitizedArgs) {
    const isErr = arg instanceof Error || (arg && typeof arg === 'object' && typeof arg.stack === 'string' && typeof arg.message === 'string');
    if (isErr) {
      if (arg.message) messageParts.push(arg.message);
      if (arg.stack) stack = arg.stack;
    } else if (typeof arg === 'string') {
      if (arg.includes('\n    at ') || (arg.startsWith('Error:') && arg.includes('\n'))) {
        stack = arg;
      } else {
        messageParts.push(arg);
      }
    } else if (arg && typeof arg === 'object') {
      if (arg.route || arg.path) route = arg.route || arg.path;
      if (arg.status || arg.statusCode) status = arg.status || arg.statusCode;
      if (arg.stack) stack = arg.stack;
      if (arg.message) messageParts.push(arg.message);
      if (arg.error && typeof arg.error === 'string') messageParts.push(arg.error);

      const { route: r, path: p, status: s, statusCode: sc, stack: st, message: m, error: err, ...rest } = arg;
      if (Object.keys(rest).length > 0) {
        Object.assign(metadata, rest);
      }
    } else if (arg !== undefined && arg !== null) {
      messageParts.push(String(arg));
    }
  }

  const message = messageParts.join(' ').trim() || (level === 'ERROR' ? 'An error occurred' : 'Log event');

  if (!route && typeof message === 'string') {
    const routeMatch = message.match(/(\/(?:api|auth)\/[^\s:]+)/);
    if (routeMatch) {
      route = routeMatch[1];
    }
  }

  const logPayload = {
    timestamp,
    level,
    route,
    status,
    message,
    stack,
  };

  if (Object.keys(metadata).length > 0) {
    logPayload.metadata = metadata;
  }

  return logPayload;
}

export const logger = {
  info(...args) {
    const logPayload = buildStructuredLog('INFO', args);
    console.log(JSON.stringify(logPayload));
  },

  warn(...args) {
    const logPayload = buildStructuredLog('WARN', args);
    console.warn(JSON.stringify(logPayload));
  },

  error(...args) {
    const logPayload = buildStructuredLog('ERROR', args);
    console.error(JSON.stringify(logPayload));
  },

  debug(...args) {
    if (!IS_PROD) {
      const logPayload = buildStructuredLog('DEBUG', args);
      console.log(JSON.stringify(logPayload));
    }
  },

  /**
   * Helper for logging structured API route errors.
   */
  logApiError(route, status, error, extra = {}) {
    const logPayload = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      route,
      status: status || 500,
      message: typeof error === 'string' ? error : (error?.message || 'API Route Error'),
      stack: error?.stack || (typeof error === 'object' && error?.stack ? error.stack : null),
      ...sanitize([extra])[0],
    };
    console.error(JSON.stringify(logPayload));
  }
};
