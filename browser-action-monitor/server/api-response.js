export function readApiKey(request) {
  return request.header("X-API-Key") || request.header("Authorization")?.replace(/^Bearer\s+/i, "");
}

export function createApiAuthMiddleware(config = {}) {
  return (request, response, next) => {
    if (config.authMode !== "apiKey") {
      next();
      return;
    }

    const providedKey = readApiKey(request);
    if (!providedKey || providedKey !== config.apiKey) {
      sendApiError(response, 401, "unauthorized", "Unauthorized");
      return;
    }

    next();
  };
}

export function sendApiError(response, status, code, error, details = {}) {
  response.status(status).json({
    error,
    code,
    details
  });
}
