# DM48 · Frontend

Panel interno para la operación courier USA → Perú. Una aplicación Angular organizada como monolito modular, con autenticación Keycloak y conexión a la API REST de DM48.

## Requisitos

- Node.js 24 y pnpm 11.
- Angular 21 LTS, resuelto mediante las dependencias del proyecto.
- API en `http://localhost:8080`.
- Keycloak en `http://localhost:8081`, realm `dm48`, cliente público `dm48-web`, Authorization Code con PKCE S256.

## Desarrollo

```bash
pnpm install
pnpm start
```

Abre `http://localhost:3000`. El servidor de desarrollo envía `/api/**` al backend mediante `proxy.conf.json`. Los callbacks y orígenes del cliente Keycloak deben admitir `http://localhost:3000/*`.

La primera instalación requiere acceso al registro npm y genera `pnpm-lock.yaml`. Versiona ese archivo y usa `pnpm install --frozen-lockfile` en las instalaciones siguientes. No es necesario instalar Angular globalmente.

## Configuración pública

Edita `public/app-config.json` antes de servir o desplegar:

```json
{
  "apiBaseUrl": "/api/v1",
  "oidcUrl": "http://localhost:8081",
  "oidcRealm": "dm48",
  "oidcClientId": "dm48-web"
}
```

Este archivo se descarga al iniciar. No coloques contraseñas, tokens, claves de proveedores ni un client secret: el cliente web es público. Los tokens de sesión se mantienen en memoria y se adjuntan únicamente a la API configurada.

## Organización

```text
src/app/
├── core/       # configuración, sesión, permisos y HTTP
├── shared/     # controles, iconos y formatos
├── layout/     # estructura visual y navegación
└── modules/
    ├── customers/
    ├── shipments/
    ├── billing/
    ├── quotes/
    └── overview/
```

Cada módulo reúne sus modelos, servicio, rutas, página y pruebas en archivos directos. Las rutas cargan módulos bajo demanda. Las dependencias entre módulos pasan por sus exportaciones públicas en `index.ts`; `core` y `shared` no dependen de módulos.

Solo está implementada el área `/internal`. El portal de clientes se añadirá posteriormente dentro de la misma aplicación.

## Funcionalidad

- Clientes: búsqueda por casillero o DNI/RUC, registro y actualización de contacto.
- Paquetes: consulta por cliente, prealertas, seguimiento y factura adjunta.
- Notas de salida: borradores, guías, cargos, destino, liquidación, pagos, revisión de vouchers y PDF.
- Cotizaciones: compra asistida para prospectos o clientes, desglose y PDF.
- Resumen: registros recientes y accesos a la operación; sin indicadores globales calculados a partir de muestras.

Las acciones de gestión requieren `admin` o `supervisor`; `seller` accede a las operaciones admitidas para personal. El backend sigue validando permisos, estados y reglas financieras. Los importes se envían como centavos enteros, el peso como gramos y los totales se toman de la API.

## Validación

```bash
pnpm test:core
pnpm check:boundaries
pnpm test
pnpm format:check
pnpm build
pnpm check:dist
pnpm exec playwright install chromium
pnpm test:e2e
```

`test:core` usa el ejecutor de Node y funciona sin instalar Angular. `test` ejecuta las pruebas Angular con Vitest. Las pruebas de acceso de Playwright simulan la indisponibilidad del proveedor de identidad y comprueban el acceso restringido, teclado y adaptación del inicio de sesión. No sustituyen una prueba de sesión y escrituras contra servicios de desarrollo reales.

## Compilación y despliegue

`pnpm build` produce `dist/dm48/browser/`. Sirve esa carpeta con HTTPS y configura el servidor para devolver `index.html` en las rutas de la SPA. Configura `/api` mediante un proxy del servidor de producción o establece una URL absoluta con CORS adecuado. El proxy de desarrollo no se incluye en la distribución.

En producción registra el dominio y callbacks HTTPS en Keycloak. No se configura un despliegue automático hasta definir el destino.

## Contribuciones

Rama principal: `main`. Usa identificadores en inglés, textos de interfaz en español y mensajes como `feat(shipments): añadir seguimiento de paquetes`. Incluye el archivo de bloqueo, ejecuta las validaciones relevantes y revisa las rutas preparadas antes de cada commit.
