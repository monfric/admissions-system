<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Maps "METHOD /path/:param" to a handler, with middleware run first.
 * Handlers are [ClassName, 'method'] and receive the Request.
 */
final class Router
{
    private array $routes = [];
    private string $prefix = '';
    private array $groupMiddleware = [];

    /** Registers the routes added inside $define under a path prefix and middleware. */
    public function group(string $prefix, array $middleware, callable $define): void
    {
        [$oldPrefix, $oldMiddleware] = [$this->prefix, $this->groupMiddleware];
        $this->prefix .= $prefix;
        $this->groupMiddleware = array_merge($this->groupMiddleware, $middleware);
        $define($this);
        [$this->prefix, $this->groupMiddleware] = [$oldPrefix, $oldMiddleware];
    }

    public function get(string $path, array $handler, array $middleware = []): void
    {
        $this->add('GET', $path, $handler, $middleware);
    }

    public function post(string $path, array $handler, array $middleware = []): void
    {
        $this->add('POST', $path, $handler, $middleware);
    }

    public function put(string $path, array $handler, array $middleware = []): void
    {
        $this->add('PUT', $path, $handler, $middleware);
    }

    public function delete(string $path, array $handler, array $middleware = []): void
    {
        $this->add('DELETE', $path, $handler, $middleware);
    }

    private function add(string $method, string $path, array $handler, array $middleware): void
    {
        $full = rtrim($this->prefix . $path, '/') ?: '/';
        $regex = '#^' . preg_replace('#:([a-zA-Z_]+)#', '(?P<$1>[^/]+)', $full) . '$#';
        $this->routes[] = [
            'method'     => $method,
            'regex'      => $regex,
            'handler'    => $handler,
            'middleware' => array_merge($this->groupMiddleware, $middleware),
        ];
    }

    public function dispatch(Request $request): never
    {
        $pathMatched = false;
        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $request->path, $matches)) {
                continue;
            }
            $pathMatched = true;
            if ($route['method'] !== $request->method) {
                continue;
            }
            $request->params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
            foreach ($route['middleware'] as $middleware) {
                $middleware($request);
            }
            [$class, $method] = $route['handler'];
            (new $class())->$method($request);
            // Handlers always send a response; reaching here is a bug.
            Response::error(500, 'Handler sent no response');
        }
        Response::error($pathMatched ? 405 : 404, $pathMatched ? 'Method not allowed' : 'Route not found');
    }
}
